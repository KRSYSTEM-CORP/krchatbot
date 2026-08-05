// Sólo se usa desde componentes cliente (compositor del chat), pero no
// necesita la directiva "use client": es una función de utilidad, no un
// componente — sólo los componentes montan un límite cliente/servidor.

export type UploadedFile = {
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
};

export async function uploadFile(file: File | Blob, fileName?: string): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file, fileName ?? (file instanceof File ? file.name : "archivo"));

  const response = await fetch("/api/uploads", { method: "POST", body: form });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `No se pudo subir el archivo (${response.status})`);
  }
  return (await response.json()) as UploadedFile;
}
