import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { aiIsConfigured, aiProviderName } from "@/lib/ai/client";

const tabs = [
  { href: "/ia", label: "Ajustes" },
  { href: "/ia/personalizacion", label: "Personalización" },
  { href: "/ia/conocimiento", label: "Conocimiento" },
  { href: "/ia/herramientas", label: "Herramientas" },
  { href: "/ia/entrenamiento", label: "Auto-entrenamiento" },
];

export default async function AiLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const configured = aiIsConfigured();
  const provider = aiProviderName();

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agente de IA</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Se configura con instrucciones en lenguaje natural, no con formularios rígidos: lo que
          escribas aquí es lo que el modelo lee antes de responderle a un cliente.
        </p>
      </div>

      {!configured ? (
        <p className="rounded-md bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3 py-2 text-sm text-[var(--warning)]">
          Falta una clave de IA en el entorno: pon <code>ANTHROPIC_API_KEY</code> o{" "}
          <code>GEMINI_API_KEY</code> (esta última es gratis, sin tarjeta). Puedes configurar todo,
          pero la IA no responderá hasta que una de las dos esté puesta.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Motor de IA activo: <strong>{provider === "anthropic" ? "Claude" : "Gemini"}</strong>
        </p>
      )}

      {/* Se usan enlaces normales en vez de un estado activo calculado en el
          cliente: son cinco pestañas y no vale la pena volver todo interactivo
          por resaltar una. */}
      <nav className="flex flex-wrap gap-1 border-b border-border pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
