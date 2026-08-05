import "server-only";
import type { StorageProvider } from "./storage/types";

export type { UploadResult } from "./storage/types";

// Igual que lib/ai/client.ts elige Claude o Gemini según qué clave exista,
// esto elige R2 o el almacenamiento local de prueba según si las variables
// de Cloudflare están puestas. Nadie más en el código pregunta cuál es —
// piden `getStorage()` y suben.

export function storageProviderName(): "local" | "r2" {
  return process.env.R2_ACCOUNT_ID ? "r2" : "local";
}

export async function getStorage(): Promise<StorageProvider> {
  if (storageProviderName() === "r2") {
    const { r2Storage } = await import("./storage/r2");
    return r2Storage;
  }
  const { localStorage } = await import("./storage/local");
  return localStorage;
}

// Límites de subida. 25 MB cubre fotos y notas de voz con margen; un video
// largo puede superarlo — es una limitación deliberada de esta fase, no un
// olvido: subir videos pesados por el propio servidor (en vez de directo al
// bucket) no escala, y ese camino directo es trabajo de la Fase 3.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];
export const ALLOWED_DOCUMENT_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

export function isAllowedUpload(mimeType: string): boolean {
  return (
    ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) ||
    ALLOWED_DOCUMENT_MIMES.includes(mimeType)
  );
}
