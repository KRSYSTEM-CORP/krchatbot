import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getBillingInfo, listMyPaymentReports } from "@/lib/actions/billing";
import { PaymentReportForm } from "@/components/billing/PaymentReportForm";
import { PageHeader, Card, Badge, type BadgeTone } from "@/components/ui/misc";
import { formatDate, formatMoney, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { WHATSAPP_PHONE } from "@/lib/legal";
import type { PaymentReportStatus } from "@prisma/client";

export const metadata = { title: "Facturación — KR ChatBot" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<PaymentReportStatus, string> = {
  PENDING: "Pendiente de revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

const STATUS_TONE: Record<PaymentReportStatus, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

// Esta página se lee con getSession(), no con requireSession(): es a donde
// requireSession() manda a una organización bloqueada, así que no puede ella
// misma volver a redirigir hacia sí misma cuando el bloqueo aplica.
export default async function BillingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [info, reports] = await Promise.all([getBillingInfo(), listMyPaymentReports()]);

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      {!session.billingBlocked ? (
        <Link href="/" className="text-sm text-primary hover:underline">
          ← Volver al panel
        </Link>
      ) : null}
      <PageHeader
        title="Facturación"
        description="Mantenimiento mensual de la plataforma — reportas tu pago y un administrador de KR System lo confirma."
      />

      {info.isExempt ? (
        <Card>
          <Badge tone="neutral">Exonerada</Badge>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta organización está exonerada de todo cobro de mantenimiento. No necesitas reportar
            pagos.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-2">
            <h2 className="text-sm font-semibold">Costo mensual</h2>
            {info.monthlyFeeUsdCents != null ? (
              <p className="text-2xl font-semibold">{formatMoney(info.monthlyFeeUsdCents)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no tienes un ciclo de cobro configurado.</p>
            )}
            {info.nextPaymentDueDate ? (
              <p className="text-sm text-muted-foreground">Vence el {formatDate(info.nextPaymentDueDate)}</p>
            ) : null}
            {info.blocked ? <Badge tone="danger">Cuenta bloqueada por pago</Badge> : null}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Cómo pagar — Binance (USDT)</h2>
            {info.binanceQrDataUrl || info.binanceId ? (
              <>
                {info.binanceQrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={info.binanceQrDataUrl}
                    alt="QR de Binance Pay"
                    className="h-40 w-40 rounded-lg border border-border object-cover"
                  />
                ) : null}
                {info.binanceId ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">ID de Binance: </span>
                    <span className="font-medium">{info.binanceId}</span>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                KR System todavía no ha configurado los datos de Binance.
              </p>
            )}
            {info.paymentInstructions ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{info.paymentInstructions}</p>
            ) : null}
          </Card>
        </div>
      )}

      {!info.isExempt && info.isAdmin ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Reportar pago</h2>
          <div className="flex flex-col gap-2 rounded-md border border-[color-mix(in_srgb,var(--destructive)_40%,transparent)] bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)] p-3">
            <p className="text-sm font-medium">Pasos obligatorios para activar tu suscripción:</p>
            <ol className="list-inside list-decimal text-sm text-muted-foreground">
              <li>Paga por Binance (USDT), escaneando el QR o con el ID de arriba.</li>
              <li>Sube tu comprobante de pago aquí abajo (obligatorio).</li>
              <li>Envía el mismo comprobante también por WhatsApp — así te confirmamos más rápido.</li>
            </ol>
            <a
              href={`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(
                `Hola, les envío el comprobante de pago de la suscripción de ${info.orgName}.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm font-medium text-primary underline underline-offset-4"
            >
              Enviar comprobante por WhatsApp →
            </a>
          </div>
          <PaymentReportForm />
        </Card>
      ) : null}

      {!info.isExempt && !info.isAdmin ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Sólo un administrador de {info.orgName} puede reportar pagos. Si la cuenta está
            bloqueada, pídele a tu administrador que entre a esta página.
          </p>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Historial de reportes</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Métodos de pago</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const totalUsdCents = r.lines.reduce((sum, l) => sum + l.amountUsdCents, 0);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-2">
                      {r.lines.map((line, i) => (
                        <div key={i}>
                          {PAYMENT_METHOD_LABELS[line.paymentMethod]}: {formatMoney(line.amountUsdCents)}
                          {line.reference ? ` (${line.reference})` : ""}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-2 font-medium">{formatMoney(totalUsdCents)}</td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.reviewNote ?? "—"}</td>
                  </tr>
                );
              })}
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Todavía no se ha reportado ningún pago.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
