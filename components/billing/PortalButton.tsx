"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/misc";
import { openBillingPortal } from "@/lib/actions/billing";
import type { FormState } from "@/lib/validations";

export function PortalButton() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({ ok: true });

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setState(await openBillingPortal());
          })
        }
      >
        {pending ? "Abriendo…" : "Gestionar mi suscripción"}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}
