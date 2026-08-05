import "server-only";
import { randomBytes } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { StorageProvider, UploadResult } from "./types";

// Cloudflare R2 habla la misma API que S3, así que el SDK oficial de AWS
// sirve tal cual — sólo cambia el endpoint. R2 no cobra por sacar datos
// (a diferencia de S3), que es el costo que más pesa cuando mucha gente ve
// las mismas fotos y videos.

function client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error("Falta R2_ACCOUNT_ID (ver .env.example)");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
}

function bucket(): string {
  const value = process.env.R2_BUCKET;
  if (!value) throw new Error("Falta R2_BUCKET (ver .env.example)");
  return value;
}

function publicBase(): string {
  const value = process.env.R2_PUBLIC_URL;
  if (!value) throw new Error("Falta R2_PUBLIC_URL (ver .env.example)");
  return value.replace(/\/$/, "");
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "archivo";
}

export const r2Storage: StorageProvider = {
  name: "r2",

  async upload(input): Promise<UploadResult> {
    const key = `${input.orgId}/${randomBytes(8).toString("hex")}-${safeFileName(input.fileName)}`;

    await client().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );

    return {
      url: `${publicBase()}/${key}`,
      mimeType: input.mimeType,
      fileName: input.fileName,
      size: input.buffer.byteLength,
    };
  },
};
