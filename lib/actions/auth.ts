"use server";

import { randomBytes, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";
import { createOrgWithOwner } from "@/lib/org-provisioning";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  signupSchema,
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  fail,
  firstIssue,
  type FormState,
} from "@/lib/validations";

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const { orgName, name, email, password } = parsed.data;

  const taken = await prisma.user.findFirst({ where: { email } });
  if (taken) return fail("Ya existe una cuenta con ese correo");

  const org = await createOrgWithOwner(orgName, {
    name,
    email,
    passwordHash: hashPassword(password),
  });

  const user = org.users[0];
  await setSessionCookie({ uid: user.id, oid: org.id, orgName: org.name });
  redirect("/");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email },
    include: { org: { select: { name: true } } },
  });

  // Mismo mensaje para correo inexistente y clave errada: distinguirlos le
  // confirma a quien prueba credenciales cuáles son cuentas reales.
  // user.passwordHash es null en cuentas que sólo entran por Google — un
  // intento de clave contra esa cuenta debe fallar igual que un correo que no
  // existe, no reventar contra verifyPassword.
  if (!user || !user.passwordHash || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return fail("Correo o contraseña incorrectos");
  }
  if (user.status !== "ACTIVE") return fail("Tu acceso está suspendido");

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  });

  await setSessionCookie({ uid: user.id, oid: user.orgId, orgName: user.org.name });
  redirect("/");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Siempre responde "listo" sin importar si el correo existe, para que este
// formulario no sirva para averiguar qué correos tienen cuenta.
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = requestPasswordResetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const user = await prisma.user.findFirst({ where: { email: parsed.data.email } });
  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await sendPasswordResetEmail(parsed.data.email, rawToken);
  }

  return { ok: true, message: "Si ese correo tiene una cuenta, te enviamos un enlace para recuperarla." };
}

export async function resetPassword(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const genericError = "Este enlace no es válido o ya venció. Solicita uno nuevo.";
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return fail(genericError);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hashPassword(parsed.data.password) },
    }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  return { ok: true, message: "Contraseña actualizada." };
}
