// Contrato común entre el almacenamiento local de prueba y Cloudflare R2 —
// mismo patrón que lib/ai/providers/types.ts: el resto del código pide
// "sube este archivo" sin saber cuál de los dos responde.

export type UploadResult = {
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
};

export interface StorageProvider {
  readonly name: "local" | "r2";
  upload(input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    orgId: string;
  }): Promise<UploadResult>;
}
