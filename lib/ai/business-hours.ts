import "server-only";

// Evalúa si "ahora" cae dentro del horario configurado, en la zona horaria de
// la organización (Org.timezone) — no en la del servidor, que en Vercel es UTC
// y no significa nada para el negocio que lo configuró.

export type BusinessHours = {
  enabled: boolean;
  start: string; // "HH:MM", 24h
  end: string;
  days: number[]; // 0 = domingo … 6 = sábado
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function isWithinBusinessHours(
  hours: BusinessHours,
  timezone: string,
  at: Date = new Date(),
): boolean {
  if (!hours.enabled) return true;
  if (hours.days.length === 0) return false;

  let weekday = "Sun";
  let hour = "00";
  let minute = "00";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    }).formatToParts(at);
    weekday = parts.find((p) => p.type === "weekday")?.value ?? weekday;
    hour = parts.find((p) => p.type === "hour")?.value ?? hour;
    minute = parts.find((p) => p.type === "minute")?.value ?? minute;
  } catch {
    // Zona horaria inválida en la config: no bloquear al agente por un typo.
    return true;
  }

  const dayIndex = WEEKDAY_INDEX[weekday] ?? at.getUTCDay();
  if (!hours.days.includes(dayIndex)) return false;

  const nowMinutes = Number(hour) * 60 + Number(minute);
  const [startH, startM] = hours.start.split(":").map(Number);
  const [endH, endM] = hours.end.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // Horario que cruza medianoche (ej. 20:00–02:00).
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}
