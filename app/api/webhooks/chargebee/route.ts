import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookAuth } from "@/lib/billing/chargebee";
import type { BillingStatus } from "@prisma/client";

// Todo lo que pasa en Chargebee (alta, cambio de plan, cobro fallido,
// cancelación) llega aquí. Es la única fuente de verdad para el estado de
// facturación de una Org — la página de retorno del checkout no actualiza
// nada por sí sola, sólo este webhook lo hace, porque es lo único que
// Chargebee garantiza que se dispare pase lo que pase (el navegador del
// usuario puede cerrarse a mitad del checkout; el webhook llega igual).

export const dynamic = "force-dynamic";

type ChargebeeSubscription = {
  status?: "future" | "in_trial" | "active" | "non_renewing" | "paused" | "cancelled";
  trial_end?: number;
};

type ChargebeeCustomer = {
  id?: string;
  cf_org_id?: string;
};

type ChargebeeEvent = {
  event_type?: string;
  content?: {
    subscription?: ChargebeeSubscription;
    customer?: ChargebeeCustomer;
  };
};

function mapStatus(sub: ChargebeeSubscription | undefined): BillingStatus | null {
  switch (sub?.status) {
    case "in_trial":
    case "future":
      return "TRIALING";
    case "active":
    case "non_renewing":
      // non_renewing: se canceló para el final del período, pero hasta
      // entonces sigue teniendo acceso completo — sería un error tratarlo
      // como bloqueado antes de tiempo.
      return "ACTIVE";
    case "paused":
      return "PAST_DUE";
    case "cancelled":
      return "CANCELLED";
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  if (!verifyWebhookAuth(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let event: ChargebeeEvent;
  try {
    event = (await request.json()) as ChargebeeEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const customer = event.content?.customer;
  const subscription = event.content?.subscription;

  try {
    // Se busca primero por el id de cliente ya guardado; si es el primer
    // evento que llega para esta Org (recién salió del checkout), todavía no
    // hay chargebeeCustomerId guardado y hace falta el campo personalizado
    // cf_org_id para ubicarla.
    const org = customer?.id
      ? await prisma.org.findFirst({
          where: {
            OR: [
              { chargebeeCustomerId: customer.id },
              customer.cf_org_id ? { id: customer.cf_org_id } : undefined,
            ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause)),
          },
        })
      : null;

    if (!org) {
      // No es necesariamente un error: Chargebee manda eventos de tipos que
      // no nos interesan (facturas, créditos, etc.) sin nada que mapear.
      // Devolver 200 evita que reintente para siempre un evento que nunca
      // vamos a poder ubicar.
      return NextResponse.json({ ok: true, ignored: true });
    }

    const status = event.event_type === "payment_failed" ? "PAST_DUE" : mapStatus(subscription);
    if (!status) return NextResponse.json({ ok: true, ignored: true });

    await prisma.org.update({
      where: { id: org.id },
      data: {
        chargebeeCustomerId: customer?.id ?? org.chargebeeCustomerId,
        billingStatus: status,
        trialEndsAt:
          status === "TRIALING" && subscription?.trial_end
            ? new Date(subscription.trial_end * 1000)
            : org.trialEndsAt,
        // Se marca la fecha sólo al ENTRAR a PAST_DUE, no en cada evento
        // mientras siga así — si no, el período de gracia se reiniciaría
        // cada vez que Chargebee reintenta el cobro fallido.
        pastDueSince:
          status === "PAST_DUE"
            ? (org.pastDueSince ?? new Date())
            : status === "ACTIVE"
              ? null
              : org.pastDueSince,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhook chargebee]", error);
    // Un fallo nuestro sí debe reintentarse — a diferencia del webhook de
    // Evolution, aquí perder un evento significa una organización con el
    // estado de cobro desactualizado.
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
