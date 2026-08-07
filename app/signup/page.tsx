import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignupForm } from "@/components/auth/AuthForms";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WHATSAPP_URL } from "@/lib/legal";
import { googleOAuthConfigured } from "@/lib/google-oauth";

export const metadata = { title: "Crear cuenta — KR ChatBot" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] p-2 shadow-lg shadow-primary/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="size-12 rounded-xl" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Crea tu espacio</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Conecta tus números y arma tu bandeja compartida en minutos.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <SignupForm googleConfigured={googleOAuthConfigured()} authError={error} />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          ¿Quieres este sistema para tu negocio o más información?{" "}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Escríbenos por WhatsApp
          </a>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
