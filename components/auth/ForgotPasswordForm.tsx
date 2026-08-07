"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/misc";
import { requestPasswordReset } from "@/lib/actions/auth";
import type { FormState } from "@/lib/validations";

const initial: FormState = { ok: true };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.message) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-3 text-center">
        <h2 className="text-lg font-semibold">Revisa tu correo</h2>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Link href="/login" className="text-sm text-primary underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mx-auto flex max-w-sm flex-col gap-4">
      <Field label="Correo">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>

      <FormMessage state={state} />

      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Enviando…" : "Enviar enlace de recuperación"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
