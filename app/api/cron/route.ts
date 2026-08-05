import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { drainQueue, enqueueMessage } from "@/lib/queue";
import { runWeeklyTraining } from "@/lib/ai/training";
import { runRules } from "@/lib/automation/engine";
import { renderVariables } from "@/lib/template";

// Un único punto de entrada para todo lo que corre por reloj. Se llama cada
// minuto desde el scheduler del despliegue (Vercel Cron, un cron de sistema,
// lo que sea) con el secreto en la cabecera.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date();
  const result: Record<string, number> = {};

  // 1. Vaciar la cola de salida. Es lo primero: lo demás puede esperar un
  //    minuto, un mensaje al cliente no.
  result.sent = await drainQueue(60);

  // 2. Reactivar los chats cuyo silencio ya venció.
  const woken = await prisma.chat.updateMany({
    where: { agentState: "SNOOZED", snoozedUntil: { lte: now } },
    data: { agentState: "INACTIVE", snoozedUntil: null },
  });
  result.despertados = woken.count;

  // 3. Arrancar los envíos programados que ya tocan.
  const due = await prisma.broadcast.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    include: { recipients: { where: { ack: "PENDING" } } },
  });

  for (const broadcast of due) {
    for (const [index, recipient] of broadcast.recipients.entries()) {
      await enqueueMessage({
        orgId: broadcast.orgId,
        phoneId: broadcast.phoneId,
        chatJid: recipient.chatJid,
        body: renderVariables(
          broadcast.body,
          (recipient.variables as Record<string, string>) ?? {},
          recipient.name,
        ),
        mediaUrl: broadcast.mediaUrl,
        broadcastId: broadcast.id,
        recipientId: recipient.id,
        delaySeconds: index * broadcast.throttleSeconds,
      });
    }

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: {
        status: "RUNNING",
        startedAt: now,
        // Un envío recurrente se reprograma en cuanto arranca, no cuando
        // termina: así la cadencia la marca la fecha prevista y no lo que
        // haya tardado la tanda anterior.
        scheduledAt: nextOccurrence(broadcast.scheduledAt, broadcast.repeat),
      },
    });
  }
  result.enviosIniciados = due.length;

  // 4. Cerrar los envíos que ya no tienen nada pendiente.
  const running = await prisma.broadcast.findMany({
    where: { status: "RUNNING" },
    select: { id: true, repeat: true, scheduledAt: true },
  });
  for (const broadcast of running) {
    const pending = await prisma.queueJob.count({
      where: { broadcastId: broadcast.id, status: { in: ["QUEUED", "SENDING"] } },
    });
    if (pending > 0) continue;

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: {
        status: broadcast.repeat === "NONE" ? "DONE" : "SCHEDULED",
        finishedAt: now,
      },
    });
  }

  // 5. Tickets con el SLA vencido.
  const breached = await prisma.ticket.findMany({
    where: {
      dueAt: { lte: now },
      status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] },
    },
    include: { chat: { select: { id: true, phoneId: true, chatId: true, name: true, type: true } } },
    take: 50,
  });

  for (const ticket of breached) {
    if (!ticket.chat) continue;
    await runRules({
      trigger: "SLA_BREACHED",
      orgId: ticket.orgId,
      chatId: ticket.chat.id,
      phoneId: ticket.chat.phoneId,
      context: {
        messageBody: ticket.title,
        fromMe: false,
        chatType: ticket.chat.type,
        chatName: ticket.chat.name,
        chatJid: ticket.chat.chatId,
        chatLabelIds: [],
        isAssigned: Boolean(ticket.assigneeId),
        isInternalContact: false,
      },
    });
    // Se limpia la fecha para no volver a disparar la misma alerta cada minuto
    // hasta que alguien atienda el ticket.
    await prisma.ticket.update({ where: { id: ticket.id }, data: { dueAt: null } });
  }
  result.slaVencidos = breached.length;

  // 6. Auto-entrenamiento: los domingos temprano.
  if (now.getDay() === 0 && now.getHours() === 3 && now.getMinutes() < 5) {
    result.faqsAprendidas = await runWeeklyTraining();
  }

  return NextResponse.json({ ok: true, ...result });
}

function nextOccurrence(from: Date | null, repeat: string): Date | null {
  if (!from || repeat === "NONE") return null;
  const next = new Date(from);
  if (repeat === "DAILY") next.setDate(next.getDate() + 1);
  else if (repeat === "WEEKLY") next.setDate(next.getDate() + 7);
  else if (repeat === "MONTHLY") next.setMonth(next.getMonth() + 1);
  return next;
}
