// Mismo modelo de facturación manual que KYRA CITAS y APP NEW (ver esos
// repos, lib/billing.ts) — sin pasarela de pago: un ADMIN reporta su
// comprobante, un super admin de KR System lo aprueba desde /admin, y eso
// adelanta nextPaymentDueDate. Puerto directo, sólo Business → Org.

const GRACE_DAYS = 5;

// Free trial otorgado automáticamente al crear la org (ver
// createOrgWithOwner en lib/org-provisioning.ts) — a diferencia de KYRA
// CITAS/APP NEW, aquí no hay aprobación manual de alta: el alta con Google
// es "completamente automatizada" por diseño, así que el trial arranca de
// una vez, no cuando un super admin apruebe nada.
export const TRIAL_DAYS = 14;

// Sólo se usa si nunca se configuró PlatformSettings.defaultMonthlyFeeUsdCents.
export const FALLBACK_MONTHLY_FEE_USD_CENTS = 3000; // $30.00 — precio del plan Basic

// Id fijo de la única fila de PlatformSettings (config global, no por org).
export const PLATFORM_SETTINGS_ID = "platform";

export type BillingOrg = {
  isExempt: boolean;
  nextPaymentDueDate: Date | null;
};

// Calculado en vivo desde la fecha de vencimiento — sin cron ni job en
// segundo plano. Una org sin ciclo configurado todavía (nextPaymentDueDate
// null) nunca bloquea — no debería pasar en la práctica ya que el trial se
// arranca al crear la org, pero cubre el caso de una org creada antes de
// este cambio.
export function isOrgBlocked(org: BillingOrg): boolean {
  if (org.isExempt || !org.nextPaymentDueDate) return false;
  const graceDeadline = new Date(org.nextPaymentDueDate);
  graceDeadline.setDate(graceDeadline.getDate() + GRACE_DAYS);
  return new Date() > graceDeadline;
}

// Un pago que cubre un múltiplo exacto de 12 meses de la cuota gana 2 meses
// de regalo por cada año completo prepagado (pagar 11 o 13 meses no da
// bono — sólo un múltiplo limpio de 12/24/36...). Devuelve el total de
// meses a extender, bono incluido.
export function monthsCoveredWithBonus(paidUsdCents: number, monthlyFeeUsdCents: number): number {
  if (!monthlyFeeUsdCents || monthlyFeeUsdCents <= 0) return 0;
  const months = Math.round(paidUsdCents / monthlyFeeUsdCents);
  const bonusMonths = months > 0 && months % 12 === 0 ? (months / 12) * 2 : 0;
  return months + bonusMonths;
}

// Cada ciclo (trial, gracia, un mes pagado) se expresa como un conteo fijo
// de días, no meses calendario: extender "por N meses" es N × 30 días desde
// la fecha de vencimiento actual (o desde hoy si todavía no hay ninguna).
export function extendDueDateByMonths(from: Date | null, months: number): Date {
  const base = new Date(from ?? new Date());
  base.setDate(base.getDate() + months * 30);
  return base;
}
