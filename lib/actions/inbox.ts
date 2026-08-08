"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, chatScope } from "@/lib/session";
import { enqueueMessage, drainQueue } from "@/lib/queue";
import { runAgent } from "@/lib/ai/agent";
import { getAiProvider, REPLY_EFFORT } from "@/lib/ai/client";
import { retrieveKnowledge, renderKnowledge } from "@/lib/ai/knowledge";
import { reactToMessage as sendReactionToWhatsApp } from "@/lib/evolution";
import { sendMessageSchema, noteSchema, fail, firstIssue, OK, type FormState } from "@/lib/validations";
import type { MessageKind } from "@prisma/client";

// Comprueba que el chat exista y que este usuario pueda verlo. Un MEMBER sólo
// alcanza los chats con sus etiquetas; sin esta verificación, cualquiera podría
// operar sobre un chat ajeno pasando su id a mano.
async function authorizeChat(chatId: string) {
  const session = await requireSession();
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, ...chatScope(session) },
    include: { phone: { select: { id: true, instanceName: true, status: true } } },
  });
  return { session, chat };
}

export async function sendChatMessage(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = sendMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const { session, chat } = await authorizeChat(parsed.data.chatId);
  if (!chat) return fail("No tienes acceso a este chat");
  if (chat.phone.status !== "CONNECTED") return fail("El número no está conectado");

  await enqueueMessage({
    orgId: session.orgId,
    phoneId: chat.phoneId,
    chatJid: chat.chatId,
    body: parsed.data.body,
    authorKind: "AGENT",
  });

  await snoozeAiAfterHumanSend(session.orgId, chat.id);
  await drainQueue(5);
  revalidatePath(`/inbox/${chat.id}`);
  return OK;
}

// Snooze compartido entre todo lo que envía un humano al chat — mensaje de
// texto, adjunto o ubicación reciben el mismo trato: un mensaje saliente
// manual es la señal más clara de que alguien tomó la conversación.
async function snoozeAiAfterHumanSend(orgId: string, chatId: string) {
  const settings = await prisma.agentSettings.findUnique({ where: { orgId } });
  await prisma.chat.update({
    where: { id: chatId },
    data: {
      agentState: "SNOOZED",
      snoozedUntil: new Date(Date.now() + (settings?.snoozeMinutes ?? 60) * 60 * 1000),
      unreadCount: 0,
    },
  });
}

// Envía una foto, video, documento o nota de voz ya subida (ver
// /api/uploads) al chat. El adjunto en sí no pasa por aquí — sólo su URL.
export async function sendChatAttachment(input: {
  chatId: string;
  kind: Extract<MessageKind, "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT">;
  mediaUrl: string;
  mimeType: string;
  fileName?: string;
  caption?: string;
  durationSeconds?: number;
}): Promise<FormState> {
  const { session, chat } = await authorizeChat(input.chatId);
  if (!chat) return fail("No tienes acceso a este chat");
  if (chat.phone.status !== "CONNECTED") return fail("El número no está conectado");

  await enqueueMessage({
    orgId: session.orgId,
    phoneId: chat.phoneId,
    chatJid: chat.chatId,
    body: input.caption ?? "",
    kind: input.kind,
    mediaUrl: input.mediaUrl,
    mimeType: input.mimeType,
    fileName: input.fileName ?? null,
    durationSeconds: input.durationSeconds ?? null,
    authorKind: "AGENT",
  });

  await snoozeAiAfterHumanSend(session.orgId, chat.id);
  await drainQueue(5);
  revalidatePath(`/inbox/${chat.id}`);
  return OK;
}

// Comparte una ubicación, igual que el pin de WhatsApp. `label` es el nombre
// del lugar que se muestra junto al mapa (opcional, como en WhatsApp).
export async function sendChatLocation(input: {
  chatId: string;
  latitude: number;
  longitude: number;
  label?: string;
}): Promise<FormState> {
  const { session, chat } = await authorizeChat(input.chatId);
  if (!chat) return fail("No tienes acceso a este chat");
  if (chat.phone.status !== "CONNECTED") return fail("El número no está conectado");

  await enqueueMessage({
    orgId: session.orgId,
    phoneId: chat.phoneId,
    chatJid: chat.chatId,
    body: input.label ?? "",
    kind: "LOCATION",
    latitude: input.latitude,
    longitude: input.longitude,
    authorKind: "AGENT",
  });

  await snoozeAiAfterHumanSend(session.orgId, chat.id);
  await drainQueue(5);
  revalidatePath(`/inbox/${chat.id}`);
  return OK;
}

export async function addPrivateNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData);
  const parsed = noteSchema.safeParse({
    ...raw,
    mentions: formData.getAll("mentions").map(String),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const { session, chat } = await authorizeChat(parsed.data.chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  await prisma.privateNote.create({
    data: {
      chatId: chat.id,
      authorId: session.userId,
      body: parsed.data.body,
      mentions: parsed.data.mentions,
    },
  });

  revalidatePath(`/inbox/${chat.id}`);
  return OK;
}

export async function assignChat(chatId: string, userId: string | null): Promise<FormState> {
  const { chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  await prisma.chat.update({ where: { id: chat.id }, data: { assigneeId: userId } });
  revalidatePath(`/inbox/${chatId}`);
  return OK;
}

export async function toggleChatLabel(chatId: string, labelId: string): Promise<FormState> {
  const { session, chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  const label = await prisma.label.findFirst({
    where: { id: labelId, orgId: session.orgId },
  });
  if (!label) return fail("Etiqueta no encontrada");

  const existing = await prisma.chatLabel.findUnique({
    where: { chatId_labelId: { chatId, labelId } },
  });

  if (existing) {
    await prisma.chatLabel.delete({ where: { chatId_labelId: { chatId, labelId } } });
  } else {
    await prisma.chatLabel.create({ data: { chatId, labelId } });
  }

  revalidatePath(`/inbox/${chatId}`);
  revalidatePath("/inbox");
  return OK;
}

// Interruptores de IA por chat. Son independientes del maestro de la
// organización: apagar la IA aquí no la apaga en los demás chats.
export async function setChatAi(
  chatId: string,
  field: "aiEnabled" | "aiFlagging",
  value: boolean,
): Promise<FormState> {
  const { chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  await prisma.chat.update({
    where: { id: chat.id },
    data: {
      [field]: value,
      ...(field === "aiEnabled" && !value ? { agentState: "INACTIVE" as const } : {}),
    },
  });

  revalidatePath(`/inbox/${chatId}`);
  return OK;
}

// "Tomar el control": el humano interrumpe a la IA en mitad de la conversación.
export async function takeOver(chatId: string): Promise<FormState> {
  const { session, chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  const settings = await prisma.agentSettings.findUnique({ where: { orgId: session.orgId } });
  await prisma.chat.update({
    where: { id: chat.id },
    data: {
      agentState: "SNOOZED",
      snoozedUntil: new Date(Date.now() + (settings?.snoozeMinutes ?? 60) * 60 * 1000),
      assigneeId: chat.assigneeId ?? session.userId,
    },
  });

  revalidatePath(`/inbox/${chatId}`);
  return { ok: true, message: "Tomaste el control de la conversación" };
}

// Devuelve la conversación a la IA antes de que expire el snooze.
export async function handBackToAi(chatId: string): Promise<FormState> {
  const { chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  await prisma.chat.update({
    where: { id: chat.id },
    data: { agentState: "INACTIVE", snoozedUntil: null, aiEnabled: true },
  });

  revalidatePath(`/inbox/${chatId}`);
  return OK;
}

// Pide a la IA que responda ahora mismo, aunque no se hubiera activado sola.
export async function triggerAiReply(chatId: string): Promise<FormState> {
  const { chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  await prisma.chat.update({
    where: { id: chat.id },
    data: { agentState: "ACTIVE", snoozedUntil: null },
  });

  const result = await runAgent(chat.id);
  await drainQueue(5);
  revalidatePath(`/inbox/${chatId}`);

  if (result.escalated) return { ok: true, message: "La IA escaló la conversación al equipo" };
  if (!result.replied && result.reply) {
    return { ok: true, message: "La IA analizó el chat en modo pasivo (no envía mensajes)" };
  }
  if (!result.replied) return fail("La IA no generó una respuesta");
  return { ok: true, message: "Respuesta enviada" };
}

export async function markChatRead(chatId: string): Promise<FormState> {
  const { chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  await prisma.chat.update({ where: { id: chat.id }, data: { unreadCount: 0 } });
  revalidatePath("/inbox");
  return OK;
}

// Reaccionar a un mensaje con un emoji. Se guarda de inmediato en nuestro
// registro (es lo que importa para el equipo) y, si el mensaje tiene id de
// WhatsApp y el número está conectado, se intenta reflejar también allá —
// sin bloquear ni revertir la reacción local si esa segunda parte falla.
export async function reactToMessage(
  chatId: string,
  messageId: string,
  emoji: string,
): Promise<FormState> {
  const { chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  const message = await prisma.message.findFirst({ where: { id: messageId, chatId: chat.id } });
  if (!message) return fail("Mensaje no encontrado");

  const current = (message.reactions as { emoji: string }[] | null) ?? [];
  // Un solo emoji activo por mensaje de nuestro lado: tocar el mismo lo
  // quita, tocar otro lo reemplaza — así se comporta la reacción propia en
  // WhatsApp.
  const alreadyReacted = current.some((r) => r.emoji === emoji);
  const next = alreadyReacted ? [] : [{ emoji }];

  await prisma.message.update({ where: { id: messageId }, data: { reactions: next } });

  if (message.waId && chat.phone.status === "CONNECTED") {
    try {
      await sendReactionToWhatsApp(
        chat.phone.instanceName,
        chat.chatId,
        message.waId,
        alreadyReacted ? "" : emoji,
      );
    } catch {
      // La reacción local ya quedó guardada; que WhatsApp no la reciba no
      // debería deshacer lo que el equipo ya ve en pantalla.
    }
  }

  revalidatePath(`/inbox/${chatId}`);
  return OK;
}

// Marcar/desmarcar a mano desde el menú del mensaje — independiente del
// marcado automático que hace la IA (ver flagMessage en lib/ai/agent.ts).
export async function toggleMessageFlag(chatId: string, messageId: string): Promise<FormState> {
  const { chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  const message = await prisma.message.findFirst({ where: { id: messageId, chatId: chat.id } });
  if (!message) return fail("Mensaje no encontrado");

  await prisma.message.update({
    where: { id: messageId },
    data: { isFlagged: !message.isFlagged, flagReason: message.isFlagged ? null : "Marcado a mano" },
  });

  revalidatePath(`/inbox/${chatId}`);
  return OK;
}

// ── Asistencia al agente humano ─────────────────────────────────────────────

// Resume el hilo y propone una respuesta. No la envía: la revisa una persona.
export async function draftReply(chatId: string): Promise<FormState & { draft?: string }> {
  const { session, chat } = await authorizeChat(chatId);
  if (!chat) return fail("No tienes acceso a este chat");

  const messages = await prisma.message.findMany({
    where: { chatId: chat.id },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
  if (messages.length === 0) return fail("No hay mensajes que resumir");

  const transcript = [...messages]
    .reverse()
    .map((m) => `${m.fromMe ? "Equipo" : "Cliente"}: ${m.body}`)
    .join("\n");

  const lastInbound = messages.find((m) => !m.fromMe);
  const knowledge = await retrieveKnowledge(session.orgId, lastInbound?.body ?? "");

  try {
    const provider = await getAiProvider();
    const text = await provider.respond({
      system: `Eres el copiloto de un agente de atención al cliente de ${session.orgName}.
Devuelve exactamente dos bloques, sin encabezados de markdown:

RESUMEN: dos líneas con el estado de la conversación y lo que el cliente necesita.
BORRADOR: el mensaje que el agente debería enviar, listo para copiar y pegar, en el tono de WhatsApp.

Apóyate sólo en la base de conocimiento; si algo no está ahí, no lo inventes: escríbelo entre corchetes para que el agente lo complete.

Base de conocimiento aplicable:
${renderKnowledge(knowledge)}`,
      message: transcript,
      effort: REPLY_EFFORT,
    });

    return { ok: true, draft: text };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "La IA no respondió");
  }
}

// Pule o traduce un texto que el agente ya escribió.
export async function polishText(
  text: string,
  mode: "polish" | "translate",
  language = "inglés",
): Promise<FormState & { result?: string }> {
  await requireSession();
  if (!text.trim()) return fail("No hay texto que procesar");

  const instruction =
    mode === "polish"
      ? "Reescribe este mensaje de WhatsApp para que sea claro, cordial y profesional. Conserva el idioma original, el significado y los datos exactos. Devuelve sólo el mensaje."
      : `Traduce este mensaje de WhatsApp al ${language}. Conserva el tono y los datos exactos. Devuelve sólo la traducción.`;

  try {
    const provider = await getAiProvider();
    const result = await provider.respond({
      system: instruction,
      message: text,
      effort: "low",
    });

    return { ok: true, result };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "La IA no respondió");
  }
}
