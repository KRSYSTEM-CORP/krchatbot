import { requireSuperAdmin } from "@/lib/session";
import { PageHeader, Card, Stat } from "@/components/ui/misc";
import { OrgTable } from "@/components/admin/OrgTable";
import { PlatformSettingsForm, PendingReportsTable } from "@/components/admin/PaymentReportsPanel";
import { listOrgsForAdmin, listPendingPaymentReports, getPlatformSettings } from "@/lib/actions/admin";
import { isOrgBlocked } from "@/lib/billing";

export const metadata = { title: "Admin — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireSuperAdmin();

  const [orgs, pendingReports, platformSettings] = await Promise.all([
    listOrgsForAdmin(),
    listPendingPaymentReports(),
    getPlatformSettings(),
  ]);

  const blocked = orgs.filter((o) => isOrgBlocked(o)).length;
  const exempt = orgs.filter((o) => o.isExempt).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Administración de KR System"
        description="Cobro de mantenimiento y control de acceso de cada organización registrada en la plataforma."
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Organizaciones" value={String(orgs.length)} />
        <Stat label="Bloqueadas" value={String(blocked)} tone={blocked > 0 ? "danger" : undefined} />
        <Stat label="Exoneradas" value={String(exempt)} />
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Cobro de suscripción mensual</h2>
        <PlatformSettingsForm
          initialInstructions={platformSettings.paymentInstructions}
          initialBinanceQrDataUrl={platformSettings.binanceQrDataUrl}
          initialBinanceId={platformSettings.binanceId}
          initialBillingExchangeRate={platformSettings.billingExchangeRate}
          initialDefaultMonthlyFeeUsdCents={platformSettings.defaultMonthlyFeeUsdCents}
        />
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Reportes de pago pendientes ({pendingReports.length})</h2>
        <PendingReportsTable reports={pendingReports} />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Organizaciones</h2>
        <OrgTable orgs={orgs} />
      </div>
    </div>
  );
}
