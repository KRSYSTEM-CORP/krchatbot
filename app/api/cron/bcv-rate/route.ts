import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBcvRate } from "@/lib/bcv-rate";
import { PLATFORM_SETTINGS_ID } from "@/lib/billing";

// Corre una vez al día (ver vercel.json — a diferencia de /api/cron, que
// necesita cada minuto y por eso lo dispara un Worker aparte en Cloudflare,
// esto sí cabe en el cron nativo de Vercel incluso en plan Hobby, que sólo
// prohíbe más de un disparo diario). Refresca
// PlatformSettings.billingExchangeRate — la tasa Bs/USD que usa /facturacion
// para mostrar el equivalente en bolívares. La suscripción en sí siempre se
// cobra en USD; esto es sólo para esa vista previa.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rate: number;
  try {
    rate = await fetchBcvRate("USD");
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 502 },
    );
  }

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, billingExchangeRate: rate },
    update: { billingExchangeRate: rate },
  });

  return NextResponse.json({ ok: true, rate });
}
