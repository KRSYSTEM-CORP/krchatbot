"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { enqueueMessage } from "@/lib/queue";
import { toUserJid } from "@/lib/jid";
import { renderVariables } from "@/lib/template";
import { broadcastSchema, fail, firstIssue, OK, type FormState } from "@/lib/validations";

// Cada línea es un destinatario: "número, nombre, var1=valor, var2=valor".
function parseRecipients(raw: string) {
  const rows: { chatJid: string; name: string; variables: Record<string, string> }[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(",").map((part) => part.trim());
    const target = parts[0];
    if (!target) continue;

    const variables: Record<string, string> = {};
    let name = "";

    for (const part of parts.slice(1)) {
      const eq = part.indexOf("=");
      if (eq > 0) variables[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
      else if (!name) name = part;
    }

    // Un JID de grupo se usa tal cual; un número se normaliza a JID de usuario.
    rows.push({
      chatJid: target.includes("@") ? target : toUserJid(target),
      name,
      variables,
    });
  }

  return rows;
}

export async function createBroadcast(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = broadcastSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const data = parsed.data;

  const phone = await prisma.phone.findFirst({
    where: { id: data.phoneId, orgId: session.orgId },
  });
  if (!phone) return fail("Número no encontrado");

  const recipients = parseRecipients(data.recipients);
  if (recipients.length === 0) return fail("No se reconoció ningún destinatario");

  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return fail("Fecha inválida");

  await prisma.broadcast.create({
    data: {
      orgId: session.orgId,
      phoneId: phone.id,
      name: data.name,
      body: data.body,
      mediaUrl: data.mediaUrl || null,
      repeat: data.repeat,
      throttleSeconds: data.throttleSeconds,
      scheduledAt,
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
      recipients: {
        create: recipients.map((row) => ({
          chatJid: row.chatJid,
          name: row.name,
          variables: row.variables,
        })),
      },
    },
  });

  revalidatePath("/envios");
  return {
    ok: true,
    message: `Envío creado con ${recipients.length} destinatarios${
      scheduledAt ? " y programado" : ""
    }`,
  };
}

// Encola el envío completo. El throttle se aplica escalonando el runAt de cada
// trabajo: es lo único que separa un envío legítimo de un patrón de spam a
// ojos de WhatsApp.
export async function startBroadcast(broadcastId: string): Promise<FormState> {
  const session = await requireAdmin();
  const broadcast = await prisma.broadcast.findFirst({
    where: { id: broadcastId, orgId: session.orgId },
    include: { recipients: { where: { ack: "PENDING" } } },
  });
  if (!broadcast) return fail("Envío no encontrado");
  if (broadcast.status === "RUNNING") return fail("Ese envío ya está en curso");

  const phone = await prisma.phone.findUnique({ where: { id: broadcast.phoneId } });
  if (!phone || phone.status !== "CONNECTED") return fail("El número no está conectado");

  for (const [index, recipient] of broadcast.recipients.entries()) {
    await enqueueMessage({
      orgId: session.orgId,
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
    data: { status: "RUNNING", startedAt: new Date() },
  });

  revalidatePath("/envios");
  return {
    ok: true,
    message: `${broadcast.recipients.length} mensajes encolados (uno cada ${broadcast.throttleSeconds}s)`,
  };
}

// Detiene un envío en curso: borra de la cola lo que todavía no salió. Lo ya
// enviado no se puede recuperar, y eso se dice explícitamente.
export async function stopBroadcast(broadcastId: string): Promise<FormState> {
  const session = await requireAdmin();
  const broadcast = await prisma.broadcast.findFirst({
    where: { id: broadcastId, orgId: session.orgId },
  });
  if (!broadcast) return fail("Envío no encontrado");

  const { count } = await prisma.queueJob.deleteMany({
    where: { broadcastId, status: "QUEUED" },
  });

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: "PAUSED" },
  });

  revalidatePath("/envios");
  return {
    ok: true,
    message: `Envío detenido. ${count} mensajes cancelados; los ya enviados no se pueden recuperar.`,
  };
}

export async function retryFailed(broadcastId: string): Promise<FormState> {
  const session = await requireAdmin();
  const broadcast = await prisma.broadcast.findFirst({
    where: { id: broadcastId, orgId: session.orgId },
    include: { recipients: { where: { ack: "FAILED" } } },
  });
  if (!broadcast) return fail("Envío no encontrado");
  if (broadcast.recipients.length === 0) return fail("No hay envíos fallidos");

  for (const [index, recipient] of broadcast.recipients.entries()) {
    await prisma.broadcastRecipient.update({
      where: { id: recipient.id },
      data: { ack: "PENDING", error: null },
    });
    await enqueueMessage({
      orgId: session.orgId,
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
    where: { id: broadcastId },
    data: { status: "RUNNING", failedCount: 0 },
  });

  revalidatePath("/envios");
  return { ok: true, message: `${broadcast.recipients.length} reintentos encolados` };
}

export async function saveChatList(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const raw = String(formData.get("entries") ?? "").trim();
  if (!name) return fail("Ponle un nombre a la lista");

  const entries = parseRecipients(raw).map((row) => ({ jid: row.chatJid, name: row.name }));
  if (entries.length === 0) return fail("La lista está vacía");

  await prisma.savedChatList.upsert({
    where: { orgId_name: { orgId: session.orgId, name } },
    create: { orgId: session.orgId, name, entries },
    update: { entries },
  });

  revalidatePath("/envios");
  return { ok: true, message: `Lista "${name}" guardada con ${entries.length} destinatarios` };
}

export async function deleteBroadcast(broadcastId: string): Promise<FormState> {
  const session = await requireAdmin();
  const broadcast = await prisma.broadcast.findFirst({
    where: { id: broadcastId, orgId: session.orgId },
  });
  if (!broadcast) return fail("Envío no encontrado");

  await prisma.queueJob.deleteMany({ where: { broadcastId, status: "QUEUED" } });
  await prisma.broadcast.delete({ where: { id: broadcastId } });

  revalidatePath("/envios");
  return OK;
}
