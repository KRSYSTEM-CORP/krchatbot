import "server-only";
import { prisma } from "@/lib/prisma";
import { isGroupJid, digitsOf } from "@/lib/jid";
import { runRules } from "@/lib/automation/engine";
import { shouldActivate, runAgent, flagMessage } from "@/lib/ai/agent";
import { aiIsConfigured } from "@/lib/ai/client";
import type { MessageKind } from "@prisma/client";

// Todo lo que WhatsApp le cuenta a Evolution entra por aquí. El orden importa:
// primero se persiste (para no perder nada si algo falla después), luego
// corren las reglas deterministas, y sólo al final se despierta la IA.

type EvolutionKey = { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string };

type EvolutionMessage = {
  key?: EvolutionKey;
  pushName?: string;
  messageTimestamp?: number | string;
  message?: Record<string, unknown>;
  messageType?: string;
};

export type EvolutionEvent = {
  event?: string;
  instance?: string;
  data?: unknown;
};

// ── Extracción del cuerpo ───────────────────────────────────────────────────

function textOf(message: Record<string, unknown> | undefined): string {
  if (!message) return "";
  const conversation = message.conversation;
  if (typeof conversation === "string") return conversation;

  const extended = message.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text) return extended.text;

  for (const key of ["imageMessage", "videoMessage", "documentMessage"] as const) {
    const media = message[key] as { caption?: string } | undefined;
    if (media?.caption) return media.caption;
  }

  const buttons = message.buttonsResponseMessage as { selectedDisplayText?: string } | undefined;
  if (buttons?.selectedDisplayText) return buttons.selectedDisplayText;

  const list = message.listResponseMessage as { title?: string } | undefined;
  if (list?.title) return list.title;

  return "";
}

function kindOf(message: Record<string, unknown> | undefined): MessageKind {
  if (!message) return "TEXT";
  if (message.imageMessage) return "IMAGE";
  if (message.videoMessage) return "VIDEO";
  if (message.audioMessage) return "AUDIO";
  if (message.documentMessage) return "DOCUMENT";
  if (message.stickerMessage) return "STICKER";
  if (message.locationMessage) return "LOCATION";
  if (message.contactMessage) return "CONTACT";
  return "TEXT";
}

// ── Entrada principal ───────────────────────────────────────────────────────

export async function handleEvolutionEvent(payload: EvolutionEvent): Promise<void> {
  const instanceName = payload.instance;
  if (!instanceName) return;

  const phone = await prisma.phone.findUnique({ where: { instanceName } });
  if (!phone) return;

  switch (payload.event) {
    case "qrcode.updated":
    case "QRCODE_UPDATED":
      await handleQr(phone.id, payload.data);
      return;

    case "connection.update":
    case "CONNECTION_UPDATE":
      await handleConnection(phone.id, payload.data);
      return;

    case "messages.upsert":
    case "MESSAGES_UPSERT":
      await handleMessage(phone, payload.data as EvolutionMessage);
      return;

    case "messages.update":
    case "MESSAGES_UPDATE":
      await handleAck(phone.orgId, payload.data);
      return;

    case "groups.upsert":
    case "GROUPS_UPSERT":
    case "groups.update":
    case "GROUPS_UPDATE":
      await handleGroups(phone.orgId, payload.data);
      return;

    default:
      return;
  }
}

async function handleQr(phoneId: string, data: unknown) {
  const qr = (data as { qrcode?: { base64?: string }; base64?: string } | undefined);
  const base64 = qr?.qrcode?.base64 ?? qr?.base64;
  if (!base64) return;

  await prisma.phone.update({
    where: { id: phoneId },
    data: { qrCode: base64, status: "QR_PENDING", lastQrAt: new Date() },
  });
}

async function handleConnection(phoneId: string, data: unknown) {
  const state = (data as { state?: string; statusReason?: number } | undefined)?.state;

  if (state === "open") {
    await prisma.phone.update({
      where: { id: phoneId },
      data: { status: "CONNECTED", qrCode: null, connectedAt: new Date() },
    });
  } else if (state === "connecting") {
    await prisma.phone.update({ where: { id: phoneId }, data: { status: "CONNECTING" } });
  } else if (state === "close") {
    await prisma.phone.update({
      where: { id: phoneId },
      data: { status: "DISCONNECTED", qrCode: null },
    });
  }
}

// El asunto de un grupo llega por su propio evento, no con los mensajes. Sin
// esto los grupos se quedarían con el nombre provisional que se les pone al
// verlos por primera vez.
async function handleGroups(orgId: string, data: unknown) {
  const groups = (Array.isArray(data) ? data : [data]) as
    | { id?: string; subject?: string; pictureUrl?: string }[]
    | undefined;
  if (!groups) return;

  for (const group of groups) {
    if (!group?.id || !group.subject) continue;
    await prisma.chat.updateMany({
      where: { orgId, chatId: group.id },
      data: {
        name: group.subject,
        ...(group.pictureUrl ? { imageUrl: group.pictureUrl } : {}),
      },
    });
  }
}

async function handleAck(orgId: string, data: unknown) {
  const update = data as { keyId?: string; key?: EvolutionKey; status?: string } | undefined;
  const waId = update?.keyId ?? update?.key?.id;
  if (!waId) return;

  const map: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = {
    SERVER_ACK: "SENT",
    DELIVERY_ACK: "DELIVERED",
    READ: "READ",
    PLAYED: "READ",
    ERROR: "FAILED",
  };
  const ack = map[update?.status ?? ""];
  if (!ack) return;

  await prisma.message.updateMany({ where: { orgId, waId }, data: { ack } });
}

// ── Mensaje entrante ────────────────────────────────────────────────────────

async function handleMessage(
  phone: { id: string; orgId: string },
  data: EvolutionMessage | undefined,
) {
  const key = data?.key;
  const remoteJid = key?.remoteJid;
  if (!data || !remoteJid || !key?.id) return;
  // Los estados ("stories") no son conversaciones y llenarían la bandeja.
  if (remoteJid === "status@broadcast") return;

  const fromMe = Boolean(key.fromMe);
  const isGroup = isGroupJid(remoteJid);
  const authorJid = isGroup ? (key.participant ?? remoteJid) : remoteJid;
  const body = textOf(data.message);
  const kind = kindOf(data.message);

  const timestampRaw = Number(data.messageTimestamp ?? 0);
  const timestamp = timestampRaw > 0 ? new Date(timestampRaw * 1000) : new Date();

  const chat = await upsertChat(phone, remoteJid, isGroup, data.pushName);
  if (!fromMe) await upsertContact(phone.orgId, authorJid, data.pushName);

  // Upsert por waId: cuando enviamos nosotros, la cola ya dejó una fila y el
  // eco de WhatsApp llega después. Sin esto el mensaje saldría dos veces en
  // el hilo.
  const existing = await prisma.message.findUnique({
    where: { orgId_waId: { orgId: phone.orgId, waId: key.id } },
  });

  const message = existing
    ? existing
    : await prisma.message.create({
        data: {
          orgId: phone.orgId,
          chatId: chat.id,
          phoneId: phone.id,
          waId: key.id,
          fromJid: authorJid,
          fromMe,
          authorKind: fromMe ? "AGENT" : "CONTACT",
          kind,
          body,
          timestamp,
          ack: fromMe ? "SENT" : "DELIVERED",
        },
      });

  const settings = await prisma.agentSettings.findUnique({
    where: { orgId: phone.orgId },
  });

  await prisma.chat.update({
    where: { id: chat.id },
    data: {
      lastMessageAt: timestamp,
      unreadCount: fromMe ? 0 : { increment: 1 },
      // Cuando escribe una persona del equipo desde su propio teléfono, la IA
      // se aparta: es la señal más clara de que alguien tomó la conversación.
      // Los mensajes que la propia IA envió vuelven por este mismo webhook,
      // así que se excluyen — si no, se dormiría a sí misma al responder.
      ...(fromMe && existing?.authorKind !== "AI"
        ? {
            agentState: "SNOOZED" as const,
            snoozedUntil: new Date(Date.now() + (settings?.snoozeMinutes ?? 60) * 60 * 1000),
          }
        : {}),
    },
  });

  const labels = await prisma.chatLabel.findMany({
    where: { chatId: chat.id },
    select: { labelId: true },
  });
  const contact = await prisma.contact.findUnique({
    where: { orgId_jid: { orgId: phone.orgId, jid: authorJid } },
    select: { isInternal: true },
  });

  await runRules({
    trigger: "MESSAGE_RECEIVED",
    orgId: phone.orgId,
    chatId: chat.id,
    phoneId: phone.id,
    messageId: message.id,
    context: {
      messageBody: body,
      fromMe,
      chatType: isGroup ? "GROUP" : "USER",
      chatName: chat.name,
      chatJid: remoteJid,
      chatLabelIds: labels.map((l) => l.labelId),
      isAssigned: Boolean(chat.assigneeId),
      isInternalContact: Boolean(contact?.isInternal),
    },
  });

  if (fromMe || existing) return;
  if (contact?.isInternal) return;
  if (!aiIsConfigured()) return;

  await maybeRunAi(settings, chat.id, message.id, body);
}

async function maybeRunAi(
  settings: Awaited<ReturnType<typeof prisma.agentSettings.findUnique>>,
  chatId: string,
  messageId: string,
  body: string,
) {
  if (!settings) return;

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { aiEnabled: true, aiFlagging: true, agentState: true, snoozedUntil: true, phoneId: true },
  });
  if (!chat) return;

  // El marcado de importantes es independiente del agente: sirve para medir
  // tiempos de respuesta aunque nadie quiera respuestas automáticas.
  if (chat.aiFlagging && body.trim()) {
    await flagMessage(messageId, body, settings.flaggingPrompt);
  }

  if (!settings.enabled) return;
  if (settings.allowedPhoneIds.length > 0 && !settings.allowedPhoneIds.includes(chat.phoneId)) {
    return;
  }

  // En modo MANUAL la IA sólo actúa donde la encendieron a mano; en AUTO actúa
  // salvo donde la apagaron.
  if (settings.activation === "MANUAL" && !chat.aiEnabled) return;
  if (!chat.aiEnabled) return;

  if (chat.agentState === "SNOOZED") {
    const stillSnoozed = chat.snoozedUntil ? chat.snoozedUntil > new Date() : true;
    if (stillSnoozed) return;
  }

  if (!body.trim()) return;
  if (!(await shouldActivate(body, settings.activationPrompt))) return;

  await prisma.chat.update({ where: { id: chatId }, data: { agentState: "ACTIVE" } });
  await runAgent(chatId);
}

// ── Alta perezosa de chats y contactos ──────────────────────────────────────

async function upsertChat(
  phone: { id: string; orgId: string },
  jid: string,
  isGroup: boolean,
  pushName?: string,
) {
  const existing = await prisma.chat.findUnique({
    where: { orgId_chatId: { orgId: phone.orgId, chatId: jid } },
  });
  if (existing) return existing;

  const chat = await prisma.chat.create({
    data: {
      orgId: phone.orgId,
      phoneId: phone.id,
      chatId: jid,
      type: isGroup ? "GROUP" : "USER",
      // En un grupo, `pushName` es el nombre de QUIEN escribió, no el del
      // grupo: usarlo aquí bautizaría el grupo con el nombre del primero que
      // habló. El asunto real llega por el evento GROUPS_UPSERT o al
      // sincronizar; hasta entonces se muestra un provisional.
      name: isGroup ? "Grupo sin nombre" : pushName || `+${digitsOf(jid)}`,
    },
  });

  await runRules({
    trigger: "CHAT_CREATED",
    orgId: phone.orgId,
    chatId: chat.id,
    phoneId: phone.id,
    context: {
      messageBody: "",
      fromMe: false,
      chatType: isGroup ? "GROUP" : "USER",
      chatName: chat.name,
      chatJid: jid,
      chatLabelIds: [],
      isAssigned: false,
      isInternalContact: false,
    },
  });

  return chat;
}

async function upsertContact(orgId: string, jid: string, pushName?: string) {
  await prisma.contact.upsert({
    where: { orgId_jid: { orgId, jid } },
    create: {
      orgId,
      jid,
      pushName: pushName ?? null,
      number: digitsOf(jid),
    },
    // El nombre sólo se refresca si WhatsApp trae uno: sobrescribir con vacío
    // borraría el que un agente escribió a mano en la ficha.
    update: pushName ? { pushName } : {},
  });
}
