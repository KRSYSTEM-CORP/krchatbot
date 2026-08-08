import { NextResponse, type NextRequest } from "next/server";
import { aiIsConfigured, getAiProvider } from "@/lib/ai/client";

// Endpoint temporal para confirmar si la clave de IA de producción ya salió
// del nivel gratuito. No toca clientes reales ni la base de datos — sólo
// hace una llamada mínima a la IA. Se borra apenas se confirme el resultado
// (ver docs/infraestructura.md si aparece de nuevo y no se sabe por qué).

const SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
} as const;

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-diag-secret");
  if (!secret || secret !== process.env.DIAG_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!aiIsConfigured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const provider = await getAiProvider();
    const result = await provider.classify<{ ok?: boolean }>({
      system: 'Responde exactamente {"ok": true} sin importar el mensaje.',
      message: "prueba de diagnóstico",
      schema: SCHEMA,
      effort: "low",
    });
    return NextResponse.json({ configured: true, provider: provider.name, result });
  } catch (error) {
    return NextResponse.json(
      { configured: true, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
