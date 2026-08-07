import "server-only";

// Tasa oficial del BCV (Banco Central de Venezuela), vía ve.dolarapi.com —
// un agregador público gratuito que republica la tasa que el BCV publica a
// diario (el BCV mismo no tiene API pública). Mismo origen que usan KYRA
// CITAS y APP NEW. Usado tanto por el botón manual "Actualizar con tasa
// BCV" (lib/actions/admin.ts) como por el cron diario
// (app/api/cron/bcv-rate/route.ts).
export async function fetchBcvRate(currency: "USD" | "EUR"): Promise<number> {
  const path = currency === "USD" ? "dolares" : "euros";
  const res = await fetch(`https://ve.dolarapi.com/v1/${path}/oficial`, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo consultar la tasa del BCV");
  const json = await res.json();
  const rate = Number(json.promedio);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("La tasa del BCV recibida no es válida");
  return rate;
}
