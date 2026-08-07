import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata = { title: "Recuperar contraseña — KR ChatBot" };

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect("/");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] p-2 shadow-lg shadow-primary/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="size-12 rounded-xl" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Recupera tu contraseña</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Escribe tu correo y te mandamos un enlace para crear una nueva.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <ForgotPasswordForm />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
