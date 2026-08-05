import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignupForm } from "@/components/auth/AuthForms";
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
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Crea tu espacio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecta tus números y arma tu bandeja compartida en minutos.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <SignupForm googleConfigured={googleOAuthConfigured()} authError={error} />
        </div>
      </div>
    </div>
  );
}
