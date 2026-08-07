"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/session";
import { fetchBcvRate } from "@/lib/bcv-rate";
import { PLATFORM_SETTINGS_ID, monthsCoveredWithBonus, extendDueDateByMonths } from "@/lib/billing";
import {
  maintenancePaymentSchema,
  rejectPaymentReportSchema,
  platformSettingsSchema,
  fail,
  firstIssue,
  type FormState,
} from "@/lib/validations";

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  adminEmail: string;
  isExempt: boolean;
  monthlyFeeUsdCents: number | null;
  nextPaymentDueDate: Date | null;
};

// Una fila por org, con el correo de su primer ADMIN (el que creó la
// cuenta) como referencia de contacto — no filtra super admins porque estos
// no tienen su propia org "de negocio" a listar aquí.
export async function listOrgsForAdmin(): Promise<AdminOrgRow[]> {
  await requireSuperAdmin();

  const orgs = await prisma.org.findMany({
    orderBy: { createdAt: "desc" },
    include: { users: { where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, take: 1 } },
  });

  return orgs
    .filter((org) => !org.users[0]?.isSuperAdmin)
    .map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt,
      adminEmail: org.users[0]?.email ?? "—",
      isExempt: org.isExempt,
      monthlyFeeUsdCents: org.monthlyFeeUsdCents,
      nextPaymentDueDate: org.nextPaymentDueDate,
    }));
}

export async function setOrgExempt(orgId: string, exempt: boolean): Promise<FormState> {
  await requireSuperAdmin();
  await prisma.org.update({ where: { id: orgId }, data: { isExempt: exempt } });
  revalidatePath("/admin");
  revalidatePath("/facturacion");
  return { ok: true };
}

// Un super admin registrando a mano un pago cobrado por fuera de la app (o
// corrigiendo el ciclo de una org) — periodEnd es lo que el admin escriba
// directo, así que esto también sirve para un arreglo puntual fuera de la
// matemática automática de mensual/anual.
export async function recordMaintenancePayment(orgId: string, input: unknown): Promise<FormState> {
  const session = await requireSuperAdmin();
  const parsed = maintenancePaymentSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const settings = await prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  if (settings?.billingExchangeRate == null) {
    return fail("Configura la tasa de cambio de la plataforma primero.");
  }

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        orgId,
        amountUsdCents: parsed.data.amount,
        exchangeRate: settings.billingExchangeRate,
        periodEnd: parsed.data.periodEnd,
        note: parsed.data.note,
        verifiedById: session.userId,
      },
    }),
    prisma.org.update({
      where: { id: orgId },
      data: { monthlyFeeUsdCents: parsed.data.amount, nextPaymentDueDate: parsed.data.periodEnd },
    }),
  ]);

  revalidatePath("/admin");
  revalidatePath("/facturacion");
  return { ok: true };
}

export async function listPendingPaymentReports() {
  await requireSuperAdmin();
  return prisma.paymentReport.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { org: { select: { name: true } }, lines: true },
  });
}

// Aprobar suma las líneas de método de pago que el ADMIN reportó (su
// reclamo de lo que pagó de verdad) en vez de asumir que coincide con la
// cuota configurada — crea el mismo tipo de Payment que
// recordMaintenancePayment, con la tasa de la plataforma, y adelanta la
// fecha de vencimiento lo que ese monto cubra (un año prepagado de una vez
// gana 2 meses de regalo, ver monthsCoveredWithBonus). Si la org no tiene
// monthlyFeeUsdCents configurado, cae a un mes plano.
export async function approvePaymentReport(reportId: string): Promise<FormState> {
  const session = await requireSuperAdmin();

  const report = await prisma.paymentReport.findUnique({ where: { id: reportId }, include: { lines: true } });
  if (!report || report.status !== "PENDING") return fail("Reporte no encontrado o ya fue procesado.");
  if (report.lines.length === 0) return fail("El reporte no tiene métodos de pago.");

  const settings = await prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  if (settings?.billingExchangeRate == null) {
    return fail("Configura la tasa de cambio de la plataforma primero.");
  }

  const org = await prisma.org.findUnique({ where: { id: report.orgId } });
  if (!org) return fail("Organización no encontrada.");

  const totalUsdCents = report.lines.reduce((sum, line) => sum + line.amountUsdCents, 0);
  const months = org.monthlyFeeUsdCents ? monthsCoveredWithBonus(totalUsdCents, org.monthlyFeeUsdCents) : 1;
  const periodEnd = extendDueDateByMonths(org.nextPaymentDueDate, months || 1);

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        orgId: report.orgId,
        amountUsdCents: totalUsdCents,
        exchangeRate: settings.billingExchangeRate,
        periodEnd,
        note: report.note ? `Reportado por el usuario: ${report.note}` : "Reportado por el usuario",
        verifiedById: session.userId,
      },
    }),
    prisma.org.update({ where: { id: report.orgId }, data: { nextPaymentDueDate: periodEnd } }),
    prisma.paymentReport.update({
      where: { id: reportId },
      data: { status: "APPROVED", reviewedById: session.userId, reviewedAt: new Date() },
    }),
  ]);

  revalidatePath("/admin");
  revalidatePath("/facturacion");
  return { ok: true };
}

export async function rejectPaymentReport(reportId: string, input: unknown): Promise<FormState> {
  const session = await requireSuperAdmin();
  const parsed = rejectPaymentReportSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const result = await prisma.paymentReport.updateMany({
    where: { id: reportId, status: "PENDING" },
    data: { status: "REJECTED", reviewedById: session.userId, reviewedAt: new Date(), reviewNote: parsed.data.reviewNote },
  });
  if (result.count === 0) return fail("Reporte no encontrado o ya fue procesado.");

  revalidatePath("/admin");
  revalidatePath("/facturacion");
  return { ok: true };
}

export async function getPlatformSettings(): Promise<{
  paymentInstructions: string | null;
  binanceQrDataUrl: string | null;
  binanceId: string | null;
  billingExchangeRate: number | null;
  defaultMonthlyFeeUsdCents: number | null;
}> {
  await requireSuperAdmin();
  const settings = await prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return {
    paymentInstructions: settings?.paymentInstructions ?? null,
    binanceQrDataUrl: settings?.binanceQrDataUrl ?? null,
    binanceId: settings?.binanceId ?? null,
    billingExchangeRate: settings?.billingExchangeRate != null ? Number(settings.billingExchangeRate) : null,
    defaultMonthlyFeeUsdCents: settings?.defaultMonthlyFeeUsdCents ?? null,
  };
}

export async function updatePlatformSettings(input: unknown): Promise<FormState> {
  await requireSuperAdmin();
  const parsed = platformSettingsSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: {
      id: PLATFORM_SETTINGS_ID,
      paymentInstructions: parsed.data.paymentInstructions,
      binanceQrDataUrl: parsed.data.binanceQrDataUrl,
      binanceId: parsed.data.binanceId,
      billingExchangeRate: parsed.data.billingExchangeRate,
      defaultMonthlyFeeUsdCents: parsed.data.defaultMonthlyFee,
    },
    update: {
      paymentInstructions: parsed.data.paymentInstructions,
      binanceQrDataUrl: parsed.data.binanceQrDataUrl,
      binanceId: parsed.data.binanceId,
      billingExchangeRate: parsed.data.billingExchangeRate,
      defaultMonthlyFeeUsdCents: parsed.data.defaultMonthlyFee,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/facturacion");
  return { ok: true };
}

export type FetchBcvRateResult = { ok: true; rate: number } | { ok: false; error: string };

// Mismo origen que el cron diario (app/api/cron/bcv-rate/route.ts) — este es
// el botón para no tener que esperar hasta el próximo disparo.
export async function fetchAndUpdatePlatformBcvRate(): Promise<FetchBcvRateResult> {
  await requireSuperAdmin();

  let rate: number;
  try {
    rate = await fetchBcvRate("USD");
  } catch {
    return { ok: false, error: "No se pudo consultar la tasa del BCV. Intenta de nuevo." };
  }

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, billingExchangeRate: rate },
    update: { billingExchangeRate: rate },
  });

  revalidatePath("/admin");
  revalidatePath("/facturacion");
  return { ok: true, rate };
}
