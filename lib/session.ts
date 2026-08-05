import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { BillingStatus, Role } from "@prisma/client";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session-token";

export async function setSessionCookie(payload: Omit<SessionPayload, "exp">) {
  const token = signSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

// Días de gracia tras un cobro fallido antes de cortar el acceso — un
// problema pasajero con la tarjeta (fondos, vencimiento) no debe tirar a un
// negocio fuera de su propia bandeja en el acto.
const PAST_DUE_GRACE_DAYS = 7;

export function isBillingBlocked(org: {
  billingStatus: BillingStatus;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
}): boolean {
  if (org.billingStatus === "ACTIVE") return false;

  if (org.billingStatus === "TRIALING") {
    // Sin trialEndsAt todavía no pasó por el checkout de Chargebee — no se
    // bloquea a nadie por un paso que ni siquiera le hemos pedido cumplir.
    if (!org.trialEndsAt) return false;
    return org.trialEndsAt.getTime() < Date.now();
  }

  if (org.billingStatus === "PAST_DUE") {
    if (!org.pastDueSince) return false;
    const graceEndsAt = org.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * 86400000;
    return Date.now() > graceEndsAt;
  }

  // CANCELLED
  return true;
}

export type Session = {
  userId: string;
  userName: string;
  orgId: string;
  orgName: string;
  role: Role;
  maskNumbers: boolean;
  // Ids de etiqueta que delimitan lo que este usuario puede ver. Null para
  // ADMIN, que ve la organización entera.
  labelIds: string[] | null;
  billingStatus: BillingStatus;
  billingBlocked: boolean;
  chargebeeCustomerId: string | null;
};

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  // Se revalida contra la base en cada llamada para que un usuario suspendido
  // o eliminado pierda el acceso de inmediato, sin esperar a que expire una
  // cookie que sigue estando bien firmada.
  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    include: {
      org: {
        select: {
          maskNumbers: true,
          name: true,
          billingStatus: true,
          trialEndsAt: true,
          pastDueSince: true,
          chargebeeCustomerId: true,
        },
      },
      labelAccess: { select: { labelId: true } },
    },
  });
  if (!user || user.orgId !== payload.oid || user.status !== "ACTIVE") return null;

  return {
    userId: user.id,
    userName: user.name,
    orgId: user.orgId,
    orgName: user.org.name,
    role: user.role,
    // El enmascaramiento protege al cliente del agente, no del dueño: un
    // ADMIN necesita ver el número para auditar y para configurar envíos.
    maskNumbers: user.org.maskNumbers && user.role !== "ADMIN",
    labelIds: user.role === "ADMIN" ? null : user.labelAccess.map((l) => l.labelId),
    billingStatus: user.org.billingStatus,
    billingBlocked: isBillingBlocked(user.org),
    chargebeeCustomerId: user.org.chargebeeCustomerId,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  // /facturacion necesita poder mostrarse a una organización bloqueada —
  // por eso esa página lee la sesión con getSession() directamente en vez de
  // pasar por aquí, y no por esta función (evita el loop de redirect).
  if (session.billingBlocked) redirect("/facturacion");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/inbox");
  return session;
}

// Filtro de chats reutilizable: un MEMBER sólo alcanza los chats que llevan
// alguna de sus etiquetas. Sin etiquetas asignadas su bandeja está vacía —
// eso es intencional, es el estado seguro por defecto.
export function chatScope(session: Session) {
  if (session.labelIds === null) return { orgId: session.orgId };
  return {
    orgId: session.orgId,
    labels: { some: { labelId: { in: session.labelIds } } },
  };
}
