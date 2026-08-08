import "server-only";
import { prisma } from "@/lib/prisma";
import { isGroupJid, digitsOf } from "@/lib/jid";
import { runRules } from "@/lib/automation/engine";
import { shouldActivate, runAgent, flagMessage } from "@/lib/ai/agent";
import { aiIsConfigured } from "@/lib/ai/client";
import { isWithinBusinessHours } from "@/lib/ai/business-hours";
import { enqueueMessage } from "@/lib/queue";
import { getStorage, MAX_UPLOAD_BYTES } from "@/lib/storage";
import * as evolution from "@/lib/evolution";
import type { MessageKind, Prisma } from "@prisma/client";

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

// El objeto Baileys de cada tipo de media trae su propio mimetype/nombre —
// documentMessage es el único que suele traer un nombre de archivo real
// (fileName o title); el resto se nombra por extensión al vuelo.
const MEDIA_KEYS = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage"] as const;

function mediaInfoOf(
  message: Record<string, unknown> | undefined,
): { node: Record<string, unknown>; mimeType: string; fileName: string } | null {
  if (!message) return null;
  for (const key of MEDIA_KEYS) {
    const node = message[key] as Record<string, unknown> | undefined;
    if (!node) continue;
    const mimeType = typeof node.mimetype === "string" ? node.mimetype : "application/octet-stream";
    const fileName =
      (typeof node.fileName === "string" && node.fileName) ||
      (typeof node.title === "string" && node.title) ||
      `${key.replace("Message", "")}-${Date.now()}.${extensionFor(mimeType)}`;
    return { node, mimeType, fileName };
  }
  return null;
}

function extensionFor(mimeType: string): string {
  const sub = mimeType.split("/")[1]?.split(";")[0];
  return sub || "bin";
}

// El base64 puede venir embebido en el propio webhook (base64:true en
// createInstance) o no — Evolution no siempre lo cumple según el tipo de
// media y la versión. Cuando no viene inline, se pide aparte por el id del
// mensaje. Cualquier fallo aquí no debe tumbar el guardado del mensaje: es
// mejor un mensaje sin adjunto que perder el webhook entero.
async function captureMedia(
  instanceName: string,
  key: EvolutionKey,
  message: Record<string, unknown> | undefined,
  orgId: string,
): Promise<{ mediaUrl: string; mimeType: string; fileName: string } | null> {
  const info = mediaInfoOf(message);
  if (!info || !key.id) return null;

  try {
    const inlineBase64 =
      (typeof info.node.base64 === "string" && info.node.base64) ||
      (typeof (message as Record<string, unknown>).base64 === "string"
        ? ((message as Record<string, unknown>).base64 as string)
        : "");

    const base64 = inlineBase64 || (await evolution.fetchMediaBase64(instanceName, key.id)).base64;
    if (!base64) return null;

    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES) return null;

    const storage = await getStorage();
    const uploaded = await storage.upload({
      buffer,
      fileName: info.fileName,
      mimeType: info.mimeType,
      orgId,
    });

    return { mediaUrl: uploaded.url, mimeType: uploaded.mimeType, fileName: uploaded.fileName };
  } catch {
    return null;
  }
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

    // El historial que trae WhatsApp justo después de escanear el QR llega
    // por este evento en vez de MESSAGES_UPSERT — mismo procesamiento,
    // mensaje por mensaje, sólo que en lote.
    case "messages.set":
    case "MESSAGES_SET":
      await handleMessagesSet(phone, payload.data);
      return;

    case "messages.update":
    case "MESSAGES_UPDATE":
      await handleAck(phone.orgId, payload.data);
      return;

    case "contacts.upsert":
    case "CONTACTS_UPSERT":
    case "contacts.set":
    case "CONTACTS_SET":
      await handleContacts(phone, payload.data);
      return;

    case "chats.upsert":
    case "CHATS_UPSERT":
    case "chats.update":
    case "CHATS_UPDATE":
    case "chats.set":
    case "CHATS_SET":
      await handleChats(phone.orgId, payload.data);
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

// El historial de una cuenta real puede traer decenas de miles de mensajes
// de golpe (confirmado en producción: un solo reconexión llegó a mandar
// ~20,000 mensajes y ~3,000 contactos en un mismo webhook) — procesarlo
// entero de un tirón siempre se pasa del límite de tiempo de una función
// serverless, Evolution nunca recibe el 200 a tiempo, reintenta 10 veces
// durante media hora y al final se da por vencido sin haber completado nada.
// El tope no es una limitación de este código: es que un webhook síncrono
// nunca es el lugar correcto para un historial de ese tamaño. Se procesan
// los más recientes (los últimos del arreglo) y el resto se deja fuera —
// es la parte que de verdad importa para dar contexto a una conversación.
const MAX_SET_MESSAGES = 200;
const MAX_SET_CONTACTS = 300;
const MAX_SET_CHATS = 300;

function capToRecent<T>(items: T[], max: number): T[] {
  return items.length > max ? items.slice(items.length - max) : items;
}

async function handleMessagesSet(
  phone: { id: string; orgId: string; instanceName: string },
  data: unknown,
) {
  const raw = data as { messages?: EvolutionMessage[] } | EvolutionMessage[] | undefined;
  const messages = Array.isArray(raw) ? raw : raw?.messages;
  if (!messages) return;

  for (const message of capToRecent(messages, MAX_SET_MESSAGES)) {
    await handleMessage(phone, message);
  }
}

async function handleContacts(phone: { orgId: string; instanceName: string }, data: unknown) {
  const raw = data as
    | { id?: string; remoteJid?: string; pushName?: string; notify?: string; name?: string }[]
    | { id?: string; remoteJid?: string; pushName?: string; notify?: string; name?: string }
    | undefined;
  const all = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const contacts = capToRecent(all, MAX_SET_CONTACTS);

  for (const contact of contacts) {
    const jid = contact.id ?? contact.remoteJid;
    if (!jid || isGroupJid(jid)) continue;
    const pushName = contact.pushName || contact.notify || contact.name;
    // Sin foto aquí: un sync trae cientos/miles de contactos de golpe y cada
    // foto es un viaje aparte a la API de Evolution — eso es lo que de verdad
    // volvía impagable el tiempo de esta función. La foto igual se completa
    // sola en cuanto ese contacto escriba un mensaje real (ver handleMessage
    // → upsertContact), que es un ritmo natural, no una ráfaga de miles.
    await upsertContact(phone.orgId, jid, pushName, undefined);
  }
}

// Para chats 1:1 sólo importa refrescar el nombre si Evolution trae uno
// mejor que el provisional ("+58…") — no se crea el chat aquí: eso lo hace
// upsertChat en cuanto llega el primer mensaje real. Los grupos ya tienen su
// propio evento (GROUPS_UPSERT) que además trae la foto.
async function handleChats(orgId: string, data: unknown) {
  const raw = data as
    | { id?: string; remoteJid?: string; name?: string }[]
    | { id?: string; remoteJid?: string; name?: string }
    | undefined;
  const all = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const chats = capToRecent(all, MAX_SET_CHATS);

  for (const chat of chats) {
    const jid = chat.id ?? chat.remoteJid;
    if (!jid || isGroupJid(jid) || !chat.name) continue;
    await prisma.chat.updateMany({ where: { orgId, chatId: jid }, data: { name: chat.name } });
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
  phone: { id: string; orgId: string; instanceName: string },
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
  if (!fromMe) await upsertContact(phone.orgId, authorJid, data.pushName, phone.instanceName);

  // Upsert por waId: cuando enviamos nosotros, la cola ya dejó una fila y el
  // eco de WhatsApp llega después. Sin esto el mensaje saldría dos veces en
  // el hilo.
  const existing = await prisma.message.findUnique({
    where: { orgId_waId: { orgId: phone.orgId, waId: key.id } },
  });

  const media =
    !existing && kind !== "TEXT" && kind !== "LOCATION" && kind !== "CONTACT"
      ? await captureMedia(phone.instanceName, key, data.message, phone.orgId)
      : null;

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
          mediaUrl: media?.mediaUrl,
          mimeType: media?.mimeType,
          fileName: media?.fileName,
        },
      });

  const settings = await prisma.agentSettings.findUnique({
    where: { orgId: phone.orgId },
    include: { org: { select: { timezone: true } } },
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

type AgentSettingsWithOrg = Prisma.AgentSettingsGetPayload<{ include: { org: { select: { timezone: true } } } }>;

// Ventana de espera antes de generar: suficiente para que un cliente termine
// de mandar un pensamiento partido en varios globos, corta para que no se
// sienta lenta.
const DEBOUNCE_MS = 6000;

async function maybeRunAi(
  settings: AgentSettingsWithOrg | null,
  chatId: string,
  messageId: string,
  body: string,
) {
  if (!settings) return;

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      orgId: true,
      chatId: true,
      phoneId: true,
      aiEnabled: true,
      aiFlagging: true,
      agentState: true,
      snoozedUntil: true,
      customProps: true,
    },
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

  if (
    !isWithinBusinessHours(
      {
        enabled: settings.businessHoursEnabled,
        start: settings.businessHoursStart,
        end: settings.businessHoursEnd,
        days: settings.businessHoursDays,
      },
      settings.org.timezone,
    )
  ) {
    await maybeSendAwayMessage(chat, settings.businessHoursAwayMessage);
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

  // En AUTO la promesa es "responde sola, sin que nadie tenga que darle a
  // Responder" — por eso aquí NO se filtra con shouldActivate() (esa
  // clasificación extra es exactamente lo que hacía que a veces, en
  // silencio, no contestara nada y un humano tuviera que intervenir sin
  // saber por qué). El botón manual (triggerAiReply, lib/actions/inbox.ts)
  // nunca pasó por ese filtro; ahora el disparo automático hace lo mismo.
  // MANUAL sigue siendo más conservador a propósito: sólo entra si el
  // mensaje realmente parece necesitar respuesta.
  if (settings.activation === "MANUAL" && !(await shouldActivate(body, settings.activationPrompt))) {
    return;
  }

  // Nadie escribe su pregunta en un solo mensaje — manda "Buenas tardes" y
  // el motivo real dos globos después. Sin esto, cada mensaje del mismo
  // arrebato dispara su propia corrida completa del agente (confirmado en
  // conversaciones reales: el cliente saluda y pregunta en dos mensajes
  // seguidos, y la IA contesta dos veces, una por cada uno, pisándose). Se
  // espera un respiro y, si mientras tanto llegó un mensaje más nuevo de
  // este mismo cliente, esta corrida se cede a la que ese mensaje disparó
  // — que a su vez repite el mismo chequeo, así que sólo sobrevive la del
  // último mensaje del arrebato, y esa ve todo el arrebato como contexto
  // (runAgent arma el historial fresco al momento de correr, no antes).
  await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
  const latestInbound = await prisma.message.findFirst({
    where: { chatId, fromMe: false },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latestInbound && latestInbound.id !== messageId) return;

  await prisma.chat.update({ where: { id: chatId }, data: { agentState: "ACTIVE", snoozedUntil: null } });
  await runAgent(chatId);
}

// Fuera de horario, un solo aviso basta: repetirlo en cada mensaje que llegue
// mientras el negocio está cerrado sería spam. El último envío se guarda en
// customProps (no hace falta una columna aparte) y se deja pasar un margen
// antes de volver a avisar en la misma franja de cierre.
const AWAY_MESSAGE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

async function maybeSendAwayMessage(
  chat: { id: string; orgId: string; chatId: string; phoneId: string; customProps: unknown },
  message: string,
) {
  if (!message.trim()) return;

  const props = (chat.customProps as Record<string, unknown>) ?? {};
  const lastAt = typeof props.awayMessageAt === "string" ? new Date(props.awayMessageAt) : null;
  if (lastAt && Date.now() - lastAt.getTime() < AWAY_MESSAGE_COOLDOWN_MS) return;

  await enqueueMessage({
    orgId: chat.orgId,
    phoneId: chat.phoneId,
    chatJid: chat.chatId,
    body: message,
    authorKind: "AI",
  });

  await prisma.chat.update({
    where: { id: chat.id },
    data: { customProps: { ...props, awayMessageAt: new Date().toISOString() } },
  });
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

async function upsertContact(
  orgId: string,
  jid: string,
  pushName?: string,
  instanceName?: string,
) {
  const existing = await prisma.contact.findUnique({
    where: { orgId_jid: { orgId, jid } },
    select: { imageUrl: true },
  });

  // La foto se pide una sola vez por contacto (mientras no tengamos una ya
  // guardada) — pedirla en cada mensaje sería un round-trip a Evolution por
  // nada, y un contacto sin foto de perfil pública fallaría en cada intento.
  let imageUrl: string | null = null;
  if (!existing?.imageUrl && instanceName) {
    try {
      const result = await evolution.fetchProfilePicture(instanceName, jid);
      imageUrl = result.profilePictureUrl ?? null;
    } catch {
      // Sin foto (privacidad del contacto, número no está en WhatsApp, etc.)
      // no debe romper el guardado del contacto ni del mensaje que lo trajo.
    }
  }

  await prisma.contact.upsert({
    where: { orgId_jid: { orgId, jid } },
    create: {
      orgId,
      jid,
      pushName: pushName ?? null,
      number: digitsOf(jid),
      imageUrl,
    },
    // El nombre sólo se refresca si WhatsApp trae uno: sobrescribir con vacío
    // borraría el que un agente escribió a mano en la ficha.
    update: {
      ...(pushName ? { pushName } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    },
  });
}
