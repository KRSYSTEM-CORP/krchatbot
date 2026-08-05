import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider, UploadResult } from "./types";

// Guarda en public/uploads/<orgId>/ dentro del propio proyecto. Sirve para
// probar el flujo completo de adjuntos en esta máquina (Next.js sirve
// public/ directamente cuando se escribe ahí en caliente, en `next dev` y en
// `next start` sobre un servidor de verdad).
//
// NO sirve para producción de verdad: en un despliegue serverless (Vercel y
// similares) el directorio public/ es una foto fija tomada en el build, no
// se puede escribir en caliente — y aunque se pudiera, cada instancia tendría
// sus propios archivos, así que una foto subida en una instancia sería
// invisible en las demás. Por eso lib/storage.ts elige R2 automáticamente en
// cuanto sus variables de entorno están puestas (ver Fase 2 del plan).

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "archivo";
}

export const localStorage: StorageProvider = {
  name: "local",

  async upload(input): Promise<UploadResult> {
    const dir = path.join(UPLOAD_DIR, input.orgId);
    await mkdir(dir, { recursive: true });

    const key = `${randomBytes(8).toString("hex")}-${safeFileName(input.fileName)}`;
    await writeFile(path.join(dir, key), input.buffer);

    return {
      url: `/uploads/${input.orgId}/${key}`,
      mimeType: input.mimeType,
      fileName: input.fileName,
      size: input.buffer.byteLength,
    };
  },
};
