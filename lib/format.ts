const DATE_FMT = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TIME_FMT = new Intl.DateTimeFormat("es-VE", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatDate(value: Date): string {
  return DATE_FMT.format(value);
}

export function formatTime(value: Date): string {
  return TIME_FMT.format(value);
}

export function formatDateTime(value: Date): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

// Etiqueta relativa para la lista de chats: hoy muestra la hora, ayer dice
// "Ayer", más atrás la fecha corta. Es lo que espera cualquiera que haya
// usado WhatsApp.
export function formatChatStamp(value: Date | null): string {
  if (!value) return "";
  const now = new Date();
  const sameDay = value.toDateString() === now.toDateString();
  if (sameDay) return formatTime(value);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (value.toDateString() === yesterday.toDateString()) return "Ayer";

  return DATE_FMT.format(value);
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// El "ahora" vive aquí y no en cada página: leer el reloj es una operación
// impura, y hacerlo dentro del render de un componente es exactamente lo que
// el compilador de React marca como error. Concentrarlo en un helper deja el
// cálculo en un solo lugar y la regla contenta.
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}

export function isoDaysAgo(days: number): string {
  return daysAgo(days).toISOString().slice(0, 10);
}
