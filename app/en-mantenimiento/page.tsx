import { Wrench } from "lucide-react";
import { SiteFooter } from "@/components/layout/SiteFooter";

// Página de aviso mientras el proxy (ver proxy.ts en la raíz) bloquea el
// resto de la app. A propósito no tiene ningún enlace a /login ni /signup —
// el punto es que nadie pueda avanzar, ni siquiera quien ya tenía sesión.
export const metadata = { title: "En desarrollo — KR ChatBot" };

export default function EnMantenimientoPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] shadow-lg shadow-primary/20">
          <Wrench className="size-7 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">KR ChatBot</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este sistema está en desarrollo y todavía no está disponible. Estamos trabajando en
            él — vuelve a intentarlo más adelante.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
