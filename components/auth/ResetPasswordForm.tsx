"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/misc";
import { resetPassword } from "@/lib/actions/auth";
import type { FormState } from "@/lib/validations";

const initial: FormState = { ok: true };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword.bind(null, token), initial);

  if (state.message) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-3 text-center">
        <h2 className="text-lg font-semibold">Contraseña actualizada</h2>
        <p className="text-sm text-muted-foreground">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <Link href="/login" className="text-sm text-primary underline underline-offset-4">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mx-auto flex max-w-sm flex-col gap-4">
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirma la contraseña">
        <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </Field>

      <FormMessage state={state} />

      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Guardando…" : "Guardar nueva contraseña"}
      </Button>
    </form>
  );
}
