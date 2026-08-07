"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { PLATFORM_SETTINGS_ID, isOrgBlocked } from "@/lib/billing";
import { paymentReportSchema, fail, firstIssue, type FormState } from "@/lib/validations";

export type BillingInfo = {
  orgName: string;
  isExempt: boolean;
  monthlyFeeUsdCents: number | null;
  nextPaymentDueDate: Date | null;
  blocked: boolean;
  paymentInstructions: string | null;
  binanceQrDataUrl: string | null;
  binanceId: string | null;
  billingExchangeRate: number | null;
  isAdmin: boolean;
};

// Se lee con getSession(), no requireSession(): esta página tiene que poder
// mostrarse a una org bloqueada (es a donde requireSession() la manda), así
// que no puede depender de la misma función que la bloquearía.
export async function getBillingInfo(): Promise<BillingInfo> {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, settings] = await Promise.all([
    prisma.org.findUniqueOrThrow({
      where: { id: session.orgId },
      select: { isExempt: true, monthlyFeeUsdCents: true, nextPaymentDueDate: true },
    }),
    prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } }),
  ]);

  return {
    orgName: session.orgName,
    isExempt: org.isExempt,
    monthlyFeeUsdCents: org.monthlyFeeUsdCents,
    nextPaymentDueDate: org.nextPaymentDueDate,
    blocked: isOrgBlocked(org),
    paymentInstructions: settings?.paymentInstructions ?? null,
    binanceQrDataUrl: settings?.binanceQrDataUrl ?? null,
    binanceId: settings?.binanceId ?? null,
    billingExchangeRate: settings?.billingExchangeRate != null ? Number(settings.billingExchangeRate) : null,
    isAdmin: session.role === "ADMIN",
  };
}

export async function listMyPaymentReports() {
  const session = await getSession();
  if (!session) redirect("/login");
  return prisma.paymentReport.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
  });
}

// El reclamo de un ADMIN de haber pagado el mantenimiento por fuera de la
// app, con comprobante obligatorio. Queda PENDING hasta que un super admin
// lo revise desde /admin — esto solo NUNCA cambia el estado de cobro por sí
// mismo (ver approvePaymentReport en lib/actions/admin.ts). Es la única vía
// de reportar un pago del lado de la org — no hay checkout automático.
export async function submitPaymentReport(input: unknown): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") return fail("Sólo un administrador puede reportar pagos.");

  const parsed = paymentReportSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  await prisma.paymentReport.create({
    data: {
      orgId: session.orgId,
      reportedById: session.userId,
      proofImageDataUrl: parsed.data.proofImageDataUrl,
      note: parsed.data.note,
      lines: {
        create: parsed.data.lines.map((line) => ({
          paymentMethod: line.paymentMethod,
          amountUsdCents: line.amount,
          reference: line.reference,
        })),
      },
    },
  });

  return { ok: true, message: "Reporte enviado. El super admin lo revisará pronto." };
}
