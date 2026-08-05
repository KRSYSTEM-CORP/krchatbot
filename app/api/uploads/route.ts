import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/session";
import { getStorage, isAllowedUpload, MAX_UPLOAD_BYTES } from "@/lib/storage";

// Recibe lo que adjunta el compositor (foto, video, documento, nota de voz)
// y lo sube al proveedor de almacenamiento que corresponda. El archivo pasa
// por este servidor en vez de subir directo al bucket desde el navegador —
// simple y suficiente al volumen de esta fase; subir directo (con URLs
// firmadas) es optimización de Fase 3, no algo que haga falta hoy.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const session = await requireSession();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera el límite de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const mimeType = file.type || "application/octet-stream";
  if (!isAllowedUpload(mimeType)) {
    return NextResponse.json({ error: `Tipo de archivo no permitido: ${mimeType}` }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = await getStorage();

  try {
    const result = await storage.upload({
      buffer,
      fileName: file.name || "archivo",
      mimeType,
      orgId: session.orgId,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[uploads]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo subir el archivo" },
      { status: 500 },
    );
  }
}
