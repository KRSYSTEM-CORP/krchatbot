"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/misc";
import { startCheckout, type PlanKey } from "@/lib/actions/billing";
import type { FormState } from "@/lib/validations";

export function PlanButton({ plan, label }: { plan: PlanKey; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({ ok: true });

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startCheckout(plan);
            setState(result);
            // Si startCheckout tuvo éxito, ya redirigió del lado del
            // servidor y esta línea nunca se alcanza; sólo llega aquí en el
            // camino de error.
            router.refresh();
          })
        }
      >
        {pending ? "Abriendo pago…" : label}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}
