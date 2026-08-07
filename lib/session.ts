import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { isOrgBlocked } from "@/lib/billing";
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
  billingBlocked: boolean;
  isSuperAdmin: boolean;
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
          isExempt: true,
          nextPaymentDueDate: true,
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
    // Un super admin necesita poder entrar a cualquier org (incluida la
    // suya propia, si tiene una) para gestionar facturación desde /admin sin
    // quedar bloqueado él mismo.
    billingBlocked: user.isSuperAdmin ? false : isOrgBlocked(user.org),
    isSuperAdmin: user.isSuperAdmin,
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

export async function requireSuperAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!session.isSuperAdmin) redirect("/");
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
