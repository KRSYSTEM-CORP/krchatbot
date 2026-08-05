// WhatsApp identifica todo por JID. Un contacto es "584121234567@s.whatsapp.net"
// y un grupo "120363012345678901@g.us". Todo el sistema se ancla a ese
// identificador nativo en lugar de inventar ids propios, igual que hace
// WhatsApp Web — así un mensaje entrante siempre encuentra su chat.

export const USER_SUFFIX = "@s.whatsapp.net";
export const GROUP_SUFFIX = "@g.us";

export function isGroupJid(jid: string): boolean {
  return jid.endsWith(GROUP_SUFFIX);
}

export function digitsOf(jid: string): string {
  return jid.split("@")[0].split(":")[0].replace(/\D/g, "");
}

// Convierte lo que escriba un humano ("+58 412-123 4567") en un JID de usuario.
// Asume que el número trae código de país: sin él WhatsApp no resuelve nada, y
// adivinarlo produciría envíos al país equivocado.
export function toUserJid(input: string): string {
  if (input.includes("@")) return input;
  const digits = input.replace(/\D/g, "");
  return `${digits}${USER_SUFFIX}`;
}

// Deja visibles el código de país y los últimos dos dígitos: suficiente para
// que el agente distinga un chat de otro sin conocer el número del cliente.
export function maskJid(jid: string): string {
  const digits = digitsOf(jid);
  if (digits.length < 6) return "•••";
  return `+${digits.slice(0, 3)}••••••${digits.slice(-2)}`;
}

export function formatJid(jid: string, mask: boolean): string {
  if (isGroupJid(jid)) return "Grupo";
  return mask ? maskJid(jid) : `+${digitsOf(jid)}`;
}
