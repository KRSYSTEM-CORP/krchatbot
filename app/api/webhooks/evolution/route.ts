import { NextResponse, type NextRequest } from "next/server";
import { handleEvolutionEvent, type EvolutionEvent } from "@/lib/inbound";

// Evolution entrega aquí cada evento de WhatsApp. Esta ruta es pública por
// necesidad (el contenedor tiene que alcanzarla), así que la única defensa es
// el secreto compartido que se configura al crear cada instancia.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (expected && request.headers.get("x-webhook-secret") !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: EvolutionEvent;
  try {
    payload = (await request.json()) as EvolutionEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    await handleEvolutionEvent(payload);
  } catch (error) {
    // Se responde 200 igualmente: si devolvemos un error, Evolution reintenta
    // el mismo evento en bucle y un fallo puntual (por ejemplo, la IA sin
    // clave) se convierte en una tormenta de reintentos.
    console.error("[webhook evolution]", error);
  }

  return NextResponse.json({ ok: true });
}

// Evolution comprueba la URL con un GET antes de empezar a mandar eventos.
export async function GET() {
  return NextResponse.json({ ok: true, service: "KR ChatBot" });
}
