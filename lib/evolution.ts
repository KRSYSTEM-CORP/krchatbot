import "server-only";

// Cliente de Evolution API — la pieza que mantiene viva una sesión de WhatsApp
// Web por cada número conectado. No es la API oficial de Meta: por eso podemos
// trabajar con grupos, sin ventana de 24 h, sin plantillas aprobadas y sin
// costo por mensaje; a cambio, el riesgo de baneo lo asume quien opera los
// números (ver docs/operacion.md sobre calentamiento y throttling).

const BASE_URL = () => (process.env.EVOLUTION_URL ?? "").replace(/\/$/, "");
const API_KEY = () => process.env.EVOLUTION_API_KEY ?? "";

export class EvolutionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EvolutionError";
  }
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (!BASE_URL()) throw new EvolutionError("EVOLUTION_URL no está configurada", 0);

  const response = await fetch(`${BASE_URL()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY(),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new EvolutionError(
      `Evolution ${init.method ?? "GET"} ${path} → ${response.status}: ${text.slice(0, 300)}`,
      response.status,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ── Instancias (un número conectado = una instancia) ─────────────────────────

export type InstanceState = "open" | "connecting" | "close";

// Los eventos que necesitamos escuchar. Pedir menos de los que se usan hace
// que el sistema pierda mensajes en silencio; pedir todos llena el log de
// ruido que después hay que filtrar en cada request.
//
// *_SET (MESSAGES_SET/CONTACTS_SET/CHATS_SET) son de "alto volumen" — Evolution
// los desaconseja en producción salvo que se necesite el historial, que es
// justo lo que hace falta aquí: son los que traen la sincronización de chats
// viejos al conectar por QR (equivalente al historial que trae WhatsApp Web).
// Sólo disparan una vez, justo después de escanear — no en operación normal.
const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "MESSAGES_SET",
  "SEND_MESSAGE",
  "CONTACTS_UPSERT",
  "CONTACTS_SET",
  "CHATS_UPSERT",
  "CHATS_UPDATE",
  "CHATS_SET",
  "GROUPS_UPSERT",
  "GROUP_PARTICIPANTS_UPDATE",
];

export async function createInstance(instanceName: string) {
  const webhookUrl = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/webhooks/evolution`;

  return call<{ qrcode?: { base64?: string }; instance?: { instanceName: string } }>(
    "/instance/create",
    {
      method: "POST",
      body: {
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: true,
          headers: {
            "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET ?? "",
          },
          events: WEBHOOK_EVENTS,
        },
      },
    },
  );
}

export async function connectInstance(instanceName: string) {
  return call<{ base64?: string; code?: string }>(`/instance/connect/${instanceName}`);
}

export async function instanceState(instanceName: string) {
  return call<{ instance?: { state?: InstanceState } }>(
    `/instance/connectionState/${instanceName}`,
  );
}

export async function logoutInstance(instanceName: string) {
  return call(`/instance/logout/${instanceName}`, { method: "DELETE" });
}

export async function restartInstance(instanceName: string) {
  return call(`/instance/restart/${instanceName}`, { method: "POST" });
}

export async function deleteInstance(instanceName: string) {
  return call(`/instance/delete/${instanceName}`, { method: "DELETE" });
}

// ── Envío ───────────────────────────────────────────────────────────────────

export async function sendText(
  instanceName: string,
  jid: string,
  text: string,
  options: { quotedId?: string; delayMs?: number } = {},
) {
  return call<{ key?: { id?: string } }>(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: {
      number: jid,
      text,
      // El delay hace que Evolution muestre "escribiendo…" antes de soltar el
      // mensaje. Es cosmético, pero un bot que responde en 0 ms se nota.
      delay: options.delayMs ?? 1200,
      ...(options.quotedId ? { quoted: { key: { id: options.quotedId } } } : {}),
    },
  });
}

export type MediaKind = "image" | "video" | "document" | "audio";

export async function sendMedia(
  instanceName: string,
  jid: string,
  media: { url: string; kind: MediaKind; caption?: string; fileName?: string },
) {
  return call<{ key?: { id?: string } }>(`/message/sendMedia/${instanceName}`, {
    method: "POST",
    body: {
      number: jid,
      mediatype: media.kind,
      media: media.url,
      caption: media.caption ?? "",
      fileName: media.fileName,
    },
  });
}

export async function sendLocation(
  instanceName: string,
  jid: string,
  location: { latitude: number; longitude: number; name?: string; address?: string },
) {
  return call<{ key?: { id?: string } }>(`/message/sendLocation/${instanceName}`, {
    method: "POST",
    body: {
      number: jid,
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name ?? "",
      address: location.address ?? "",
    },
  });
}

export async function markAsRead(instanceName: string, jid: string, messageId: string) {
  return call(`/chat/markMessageAsRead/${instanceName}`, {
    method: "POST",
    body: { readMessages: [{ remoteJid: jid, id: messageId, fromMe: false }] },
  });
}

export async function reactToMessage(
  instanceName: string,
  jid: string,
  messageId: string,
  emoji: string,
) {
  return call(`/message/sendReaction/${instanceName}`, {
    method: "POST",
    body: { key: { remoteJid: jid, id: messageId, fromMe: false }, reaction: emoji },
  });
}

// ── Consultas ───────────────────────────────────────────────────────────────

export async function checkNumbers(instanceName: string, numbers: string[]) {
  return call<{ exists: boolean; jid: string; number: string }[]>(
    `/chat/whatsappNumbers/${instanceName}`,
    { method: "POST", body: { numbers } },
  );
}

export async function fetchGroups(instanceName: string) {
  return call<{ id: string; subject: string; size?: number; pictureUrl?: string }[]>(
    `/group/fetchAllGroups/${instanceName}?getParticipants=false`,
  );
}

export async function fetchProfilePicture(instanceName: string, jid: string) {
  return call<{ profilePictureUrl?: string }>(
    `/chat/fetchProfilePictureUrl/${instanceName}`,
    { method: "POST", body: { number: jid } },
  );
}

// Respaldo para cuando el webhook no trae el media inline (base64:true en el
// webhook no siempre alcanza — ver createInstance): se pide el archivo aparte
// por el id del mensaje.
export async function fetchMediaBase64(instanceName: string, messageId: string) {
  return call<{ base64?: string; mimetype?: string }>(
    `/chat/getBase64FromMediaMessage/${instanceName}`,
    { method: "POST", body: { message: { key: { id: messageId } } } },
  );
}

// ── Grupos ──────────────────────────────────────────────────────────────────

export async function createGroup(
  instanceName: string,
  subject: string,
  participants: string[],
) {
  return call<{ id: string }>(`/group/create/${instanceName}`, {
    method: "POST",
    body: { subject, participants },
  });
}

export async function updateParticipants(
  instanceName: string,
  groupJid: string,
  action: "add" | "remove" | "promote" | "demote",
  participants: string[],
) {
  return call(`/group/updateParticipant/${instanceName}?groupJid=${groupJid}`, {
    method: "POST",
    body: { action, participants },
  });
}

export async function groupInviteCode(instanceName: string, groupJid: string) {
  return call<{ inviteUrl?: string }>(
    `/group/inviteCode/${instanceName}?groupJid=${groupJid}`,
  );
}
