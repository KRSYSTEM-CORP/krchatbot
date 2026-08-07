"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Sube el sufijo (v1 -> v2) si el contenido cambia lo suficiente como para
// que valga la pena que un usuario que ya lo vio lo vea de nuevo — si no,
// esto sólo aparece una vez por navegador, la primera vez que alguien entra
// a la pantalla de login.
const DISMISS_KEY = "kr-chatbot-welcome-dismissed-v1";

const STEPS = [
  "Crea tu cuenta y conecta tu primer número de WhatsApp.",
  "Configura tu agente de IA: personalidad, base de conocimiento y qué puede hacer.",
  "Decide si responde solo a los clientes o sólo analiza y crea tickets en modo pasivo.",
  "Gestiona todo desde la Bandeja: chats, tickets, etiquetas y tu equipo.",
];

export function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Lee localStorage (sólo existe en el navegador) una vez al montar — no
    // hay forma de calcular esto durante el render en un componente que
    // también se prerenderiza en el servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!localStorage.getItem(DISMISS_KEY)) setOpen(true);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-md rounded-xl bg-card p-6 shadow-lg ring-1 ring-foreground/10">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-5" />
        </button>

        <h2 className="text-lg font-semibold mb-2">¿Qué es KR ChatBot?</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Bandeja compartida de WhatsApp con IA — responde, etiqueta y crea tickets sola o en
          modo pasivo junto a tu equipo, con automatizaciones y envíos masivos.
        </p>

        <p className="text-sm font-medium mb-2">Para empezar:</p>
        <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1.5">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <Button className="mt-5 w-full" onClick={dismiss}>
          Entendido
        </Button>
      </div>
    </div>
  );
}
