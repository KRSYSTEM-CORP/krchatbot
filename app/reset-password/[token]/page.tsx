import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata = { title: "Crear nueva contraseña — KR ChatBot" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (await getSession()) redirect("/");
  const { token } = await params;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] p-2 shadow-lg shadow-primary/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="size-12 rounded-xl" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Crea tu nueva contraseña</h1>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <ResetPasswordForm token={token} />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
