"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, signup } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/misc";
import type { FormState } from "@/lib/validations";

const initial: FormState = { ok: true };

const GOOGLE_ERRORS: Record<string, string> = {
  google_no_configurado: "El inicio de sesión con Google no está configurado todavía.",
  google_cancelado: "Cancelaste el inicio de sesión con Google.",
  google_estado_invalido: "El enlace de Google expiró o no es válido. Intenta de nuevo.",
  google_fallo: "Google no pudo confirmar tu cuenta. Intenta de nuevo.",
  cuenta_suspendida: "Tu acceso está suspendido.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.61l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}

function GoogleButton({ label }: { label: string }) {
  return (
    <a
      href="/api/auth/google/start"
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-card text-sm font-medium transition-colors hover:bg-accent"
    >
      <GoogleIcon />
      {label}
    </a>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      o
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function LoginForm({
  googleConfigured,
  authError,
}: {
  googleConfigured: boolean;
  authError?: string;
}) {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <div className="space-y-4">
      {authError && GOOGLE_ERRORS[authError] ? (
        <p className="rounded-md bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-3 py-2 text-sm text-[var(--destructive)]">
          {GOOGLE_ERRORS[authError]}
        </p>
      ) : null}

      {googleConfigured ? (
        <>
          <GoogleButton label="Continuar con Google" />
          <Divider />
        </>
      ) : null}

      <form action={action} className="space-y-4">
        <Field label="Correo">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Contraseña">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>

        <FormMessage state={state} />

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Crear una
        </Link>
      </p>
    </div>
  );
}

export function SignupForm({
  googleConfigured,
  authError,
}: {
  googleConfigured: boolean;
  authError?: string;
}) {
  const [state, action, pending] = useActionState(signup, initial);

  return (
    <div className="space-y-4">
      {authError && GOOGLE_ERRORS[authError] ? (
        <p className="rounded-md bg-[color-mix(in_srgb,var(--destructive)_12%,transparent)] px-3 py-2 text-sm text-[var(--destructive)]">
          {GOOGLE_ERRORS[authError]}
        </p>
      ) : null}

      {googleConfigured ? (
        <>
          {/* Con Google no hace falta pedir nombre de negocio ni clave: la
              organización se crea sola con un nombre provisional que se
              cambia después. Es justo lo que hace que el alta sea "de un
              clic" en vez de un formulario más. */}
          <GoogleButton label="Crear cuenta con Google" />
          <Divider />
        </>
      ) : null}

      <form action={action} className="space-y-4">
        <Field label="Nombre del negocio">
          <Input name="orgName" required placeholder="Distribuidora El Sol" />
        </Field>
        <Field label="Tu nombre">
          <Input name="name" required autoComplete="name" />
        </Field>
        <Field label="Correo">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres.">
          <Input name="password" type="password" required autoComplete="new-password" />
        </Field>

        <FormMessage state={state} />

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creando…" : "Crear cuenta"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
