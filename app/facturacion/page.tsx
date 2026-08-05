import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { chargebeeConfigured } from "@/lib/billing/chargebee";
import { PageHeader, Card, Badge, type BadgeTone } from "@/components/ui/misc";
import { PlanButton } from "@/components/billing/PlanButton";
import { PortalButton } from "@/components/billing/PortalButton";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Facturación — KR ChatBot" };
export const dynamic = "force-dynamic";

// Esta página se lee con getSession(), no con requireSession(): es a donde
// requireSession() manda a una organización bloqueada, así que no puede ella
// misma volver a redirigir hacia sí misma cuando el bloqueo aplica.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { estado } = await searchParams;

  const org = await prisma.org.findUniqueOrThrow({
    where: { id: session.orgId },
    select: { planId: true, billingStatus: true, trialEndsAt: true },
  });

  const configured = chargebeeConfigured();

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      {!session.billingBlocked ? (
        <Link href="/" className="text-sm text-primary hover:underline">
          ← Volver al panel
        </Link>
      ) : null}
      <PageHeader
        title="Facturación"
        description="El cobro lo procesa Chargebee — nunca vemos ni guardamos tu tarjeta."
      />

      {estado === "exito" ? (
        <p className="rounded-md bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-3 py-2 text-sm text-[var(--success)]">
          Pago confirmado por Chargebee. Puede tardar unos segundos en
          reflejarse aquí — actualiza la página si no cambia enseguida.
        </p>
      ) : null}
      {estado === "cancelado" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Cerraste el pago sin completarlo. Puedes intentarlo de nuevo cuando quieras.
        </p>
      ) : null}

      {!configured ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            La facturación automática todavía no está conectada en este despliegue. Mientras
            tanto, esta organización tiene acceso completo sin límite — nadie queda bloqueado
            por un paso que ni siquiera le hemos pedido cumplir.
          </p>
        </Card>
      ) : org.planId ? (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Estado de la suscripción</p>
              <p className="text-lg font-medium">{statusLabel[org.billingStatus]}</p>
            </div>
            <Badge tone={statusTone[org.billingStatus]}>{org.billingStatus}</Badge>
          </div>
          {org.trialEndsAt ? (
            <p className="text-sm text-muted-foreground">
              {org.billingStatus === "TRIALING"
                ? `Tu prueba gratuita termina el ${formatDate(org.trialEndsAt)}.`
                : `Prueba gratuita hasta el ${formatDate(org.trialEndsAt)}.`}
            </p>
          ) : null}
          <PortalButton />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <PlanCard
            title="Basic"
            price="$30/mes"
            bullets={["1 número de WhatsApp", "3 agentes", "IA incluida"]}
          >
            <PlanButton plan="basic" label="Elegir Basic" />
          </PlanCard>
          <PlanCard
            title="Premium"
            price="$75/mes"
            bullets={["5 números", "Agentes ilimitados", "Automatizaciones y envíos masivos"]}
          >
            <PlanButton plan="premium" label="Elegir Premium" />
          </PlanCard>
          <PlanCard
            title="Pro"
            price="$150/mes"
            bullets={["Números ilimitados", "Clave de IA propia", "Soporte prioritario"]}
          >
            <PlanButton plan="pro" label="Elegir Pro" />
          </PlanCard>
        </div>
      )}
    </div>
  );
}

const statusLabel: Record<string, string> = {
  TRIALING: "En período de prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Cobro pendiente",
  CANCELLED: "Cancelada",
};

const statusTone: Record<string, BadgeTone> = {
  TRIALING: "primary",
  ACTIVE: "success",
  PAST_DUE: "warning",
  CANCELLED: "danger",
};

function PlanCard({
  title,
  price,
  bullets,
  children,
}: {
  title: string;
  price: string;
  bullets: string[];
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{price}</p>
      </div>
      <ul className="flex-1 space-y-1 text-sm text-muted-foreground">
        {bullets.map((bullet) => (
          <li key={bullet}>· {bullet}</li>
        ))}
      </ul>
      {children}
    </Card>
  );
}
