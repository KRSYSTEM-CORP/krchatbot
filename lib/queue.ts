import "server-only";
import { prisma } from "@/lib/prisma";
import { sendText, sendMedia, sendLocation, type MediaKind } from "@/lib/evolution";
import type { MessageAuthorKind, MessageKind } from "@prisma/client";

// Cola de salida. Nada sale directo a WhatsApp: todo se encola y un único
// proceso la drena. Eso da tres cosas que un `await sendText()` suelto no da —
// reintentos ante una caída de Evolution, ritmo controlado entre mensajes (un
// número normal que dispara 300 mensajes seguidos es un número reportado), y
// un registro de qué se envió aunque el proceso web muera a mitad de camino.

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 25;

export type EnqueueInput = {
  orgId: string;
  phoneId: string;
  chatJid: string;
  body: string;
  kind?: MessageKind;
  mediaUrl?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  durationSeconds?: number | null;
  authorKind?: MessageAuthorKind;
  delaySeconds?: number;
  broadcastId?: string;
  recipientId?: string;
};

export async function enqueueMessage(input: EnqueueInput) {
  return prisma.queueJob.create({
    data: {
      orgId: input.orgId,
      phoneId: input.phoneId,
      chatJid: input.chatJid,
      body: input.body,
      kind: input.kind ?? "TEXT",
      mediaUrl: input.mediaUrl ?? null,
      mimeType: input.mimeType ?? null,
      fileName: input.fileName ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      durationSeconds: input.durationSeconds ?? null,
      authorKind: input.authorKind ?? "AGENT",
      runAt: new Date(Date.now() + (input.delaySeconds ?? 0) * 1000),
      broadcastId: input.broadcastId,
      recipientId: input.recipientId,
    },
  });
}

// Respaldo para trabajos viejos de broadcast, que sólo traen mediaUrl y
// nunca llegaron a tener `kind` (se crearon antes de que existiera la
// columna, o la siguen sin usar porque no les hace falta más que la URL).
function mediaKindFromUrl(url: string): MediaKind {
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/.test(clean)) return "image";
  if (/\.(mp4|mov|3gp)$/.test(clean)) return "video";
  if (/\.(mp3|ogg|opus|m4a|wav)$/.test(clean)) return "audio";
  return "document";
}

function toEvolutionMediaKind(kind: MessageKind): MediaKind {
  switch (kind) {
    case "IMAGE":
      return "image";
    case "VIDEO":
      return "video";
    case "AUDIO":
      return "audio";
    default:
      return "document";
  }
}

// Toma los trabajos vencidos y los envía. Devuelve cuántos salieron para que
// quien la llame (el cron o la acción que acaba de encolar) sepa si vale la
// pena volver a pasar enseguida.
export async function drainQueue(limit = BATCH_SIZE): Promise<number> {
  const jobs = await prisma.queueJob.findMany({
    where: { status: "QUEUED", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: limit,
  });
  if (jobs.length === 0) return 0;

  const phones = await prisma.phone.findMany({
    where: { id: { in: Array.from(new Set(jobs.map((j) => j.phoneId))) } },
    select: { id: true, instanceName: true, status: true },
  });
  const phoneById = new Map(phones.map((p) => [p.id, p]));

  let sent = 0;

  for (const job of jobs) {
    const phone = phoneById.get(job.phoneId);

    // Si el número está caído, el trabajo se reprograma en vez de fallar: la
    // sesión suele volver sola tras un reinicio y el mensaje sigue siendo
    // válido dentro de unos minutos.
    if (!phone || phone.status !== "CONNECTED") {
      await prisma.queueJob.update({
        where: { id: job.id },
        data: {
          runAt: new Date(Date.now() + 5 * 60 * 1000),
          lastError: "El número no está conectado",
        },
      });
      continue;
    }

    await prisma.queueJob.update({
      where: { id: job.id },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });

    try {
      let result: { key?: { id?: string } };

      if (job.kind === "LOCATION" && job.latitude != null && job.longitude != null) {
        result = await sendLocation(phone.instanceName, job.chatJid, {
          latitude: job.latitude,
          longitude: job.longitude,
          name: job.body || undefined,
        });
      } else if (job.mediaUrl) {
        result = await sendMedia(phone.instanceName, job.chatJid, {
          url: job.mediaUrl,
          kind: job.kind !== "TEXT" ? toEvolutionMediaKind(job.kind) : mediaKindFromUrl(job.mediaUrl),
          caption: job.body,
          fileName: job.fileName ?? undefined,
        });
      } else {
        result = await sendText(phone.instanceName, job.chatJid, job.body);
      }

      await prisma.queueJob.update({
        where: { id: job.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      sent++;

      // A partir de aquí el mensaje YA salió a WhatsApp y no hay vuelta atrás.
      // La contabilidad va en su propio try: si falla al anotar el envío en el
      // hilo, el trabajo debe quedarse en SENT igual. Que un fallo de registro
      // devolviera el trabajo a la cola significaría reenviarle el mismo
      // mensaje al cliente — el peor error posible en un sistema de mensajería.
      try {
        if (job.recipientId) {
          await prisma.broadcastRecipient.update({
            where: { id: job.recipientId },
            data: { ack: "SENT", sentAt: new Date() },
          });
        }
        if (job.broadcastId) {
          await prisma.broadcast.update({
            where: { id: job.broadcastId },
            data: { sentCount: { increment: 1 } },
          });
        }

        // El eco del mensaje vuelve por webhook con su waId; aquí se anota ya
        // para que el hilo lo muestre de inmediato y con su autoría (equipo o
        // IA), que el eco por sí solo no distingue.
        await recordOutbound(job.orgId, job.chatJid, job, result?.key?.id);
      } catch (bookkeeping) {
        await prisma.queueJob.update({
          where: { id: job.id },
          data: {
            lastError: `Enviado, pero no se pudo registrar: ${
              bookkeeping instanceof Error ? bookkeeping.message : "error desconocido"
            }`,
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "error desconocido";
      const exhausted = job.attempts + 1 >= MAX_ATTEMPTS;

      await prisma.queueJob.update({
        where: { id: job.id },
        data: exhausted
          ? { status: "FAILED", lastError: message }
          : {
              status: "QUEUED",
              lastError: message,
              // Espera creciente: 1 min, 4 min. Reintentar de inmediato contra
              // un servicio caído sólo consume los intentos disponibles.
              runAt: new Date(Date.now() + (job.attempts + 1) ** 2 * 60 * 1000),
            },
      });

      if (exhausted && job.recipientId) {
        await prisma.broadcastRecipient.update({
          where: { id: job.recipientId },
          data: { ack: "FAILED", error: message },
        });
        if (job.broadcastId) {
          await prisma.broadcast.update({
            where: { id: job.broadcastId },
            data: { failedCount: { increment: 1 } },
          });
        }
      }
    }
  }

  return sent;
}

async function recordOutbound(
  orgId: string,
  chatJid: string,
  job: {
    body: string;
    authorKind: MessageAuthorKind;
    kind: MessageKind;
    mediaUrl: string | null;
    mimeType: string | null;
    fileName: string | null;
    latitude: number | null;
    longitude: number | null;
    durationSeconds: number | null;
  },
  waId?: string,
) {
  const chat = await prisma.chat.findUnique({
    where: { orgId_chatId: { orgId, chatId: chatJid } },
    select: { id: true, phoneId: true },
  });
  if (!chat) return;

  await prisma.message.create({
    data: {
      orgId,
      chatId: chat.id,
      phoneId: chat.phoneId,
      waId: waId ?? null,
      fromJid: chatJid,
      fromMe: true,
      authorKind: job.authorKind,
      kind: job.kind,
      body: job.body,
      mediaUrl: job.mediaUrl,
      mimeType: job.mimeType,
      fileName: job.fileName,
      latitude: job.latitude,
      longitude: job.longitude,
      durationSeconds: job.durationSeconds,
      ack: "SENT",
      timestamp: new Date(),
    },
  });

  await prisma.chat.update({
    where: { id: chat.id },
    data: { lastMessageAt: new Date() },
  });
}
