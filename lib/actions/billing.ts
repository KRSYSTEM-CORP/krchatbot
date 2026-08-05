"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSession } from "@/lib/session";
import { createCheckoutUrl, createPortalSessionUrl, chargebeeConfigured } from "@/lib/billing/chargebee";
import { fail, type FormState } from "@/lib/validations";

export type PlanKey = "basic" | "premium" | "pro";

const PLAN_ENV: Record<PlanKey, string | undefined> = {
  basic: process.env.CHARGEBEE_PLAN_BASIC,
  premium: process.env.CHARGEBEE_PLAN_PREMIUM,
  pro: process.env.CHARGEBEE_PLAN_PRO,
};

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// Sin campos que juntar de un <form>, no hay razón para forzar estas dos en
// el molde (prevState, formData) de useActionState — se llaman directas
// desde un botón con startTransition, igual que assignChat o toggleRule.
// Sólo un ADMIN decide de qué plan sale el dinero.
export async function startCheckout(plan: PlanKey): Promise<FormState> {
  const session = await requireAdmin();

  if (!chargebeeConfigured()) return fail("La facturación todavía no está configurada.");
  const planId = PLAN_ENV[plan];
  if (!planId) return fail(`Falta configurar el plan "${plan}" en el servidor.`);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

  let url: string;
  try {
    url = await createCheckoutUrl({
      orgId: session.orgId,
      planId,
      email: user.email,
      name: user.name,
      successUrl: `${appUrl()}/facturacion?estado=exito`,
      cancelUrl: `${appUrl()}/facturacion?estado=cancelado`,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Chargebee no respondió");
  }

  redirect(url);
}

export async function openBillingPortal(): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!chargebeeConfigured()) return fail("La facturación todavía no está configurada.");
  if (!session.chargebeeCustomerId) {
    return fail("Todavía no tienes una suscripción activa — elige un plan primero.");
  }

  let url: string;
  try {
    url = await createPortalSessionUrl(session.chargebeeCustomerId, `${appUrl()}/facturacion`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Chargebee no respondió");
  }

  redirect(url);
}
