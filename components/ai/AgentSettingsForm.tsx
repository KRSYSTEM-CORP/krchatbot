"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Switch, Select } from "@/components/ui/field";
import { Card, FormMessage } from "@/components/ui/misc";
import { saveAgentSettings } from "@/lib/actions/ai";
import type { FormState } from "@/lib/validations";

const initial: FormState = { ok: true };

export function AgentSettingsForm({
  settings,
  phones,
}: {
  settings: {
    enabled: boolean;
    nickname: string;
    activation: "AUTO" | "MANUAL";
    canSendMessages: boolean;
    canCreateTickets: boolean;
    canCreatePrivateNotes: boolean;
    responseDelaySeconds: number;
    snoozeMinutes: number;
    allowedPhoneIds: string[];
  };
  phones: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveAgentSettings, initial);
  const [canSend, setCanSend] = useState(settings.canSendMessages);

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 lg:col-span-2">
        <h2 className="font-medium">Interruptor maestro</h2>
        <Switch
          name="enabled"
          defaultChecked={settings.enabled}
          label="Agente de IA encendido"
          hint="Apagado, la IA no interviene en ninguna conversación."
        />
        <Field
          label="Nombre visible para el cliente"
          hint="Aparece encabezando cada mensaje de la IA. Que el cliente sepa que habla con un asistente no es un requisito legal en todos lados, pero sí es lo que evita conversaciones incómodas."
        >
          <Input name="nickname" defaultValue={settings.nickname} required maxLength={40} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Activación</h2>

        <Field
          label="Cómo entra en los chats"
          hint="Empieza en manual mientras afinas el conocimiento; pasa a automático cuando confíes en las respuestas."
        >
          <Select name="activation" defaultValue={settings.activation}>
            <option value="MANUAL">Manual — sólo donde yo la encienda</option>
            <option value="AUTO">Automático — en todos los chats</option>
          </Select>
        </Field>

        <Field
          label="Espera antes de responder (segundos)"
          hint="Le da margen a una persona del equipo para adelantarse. Además, un bot que contesta en cero segundos se nota."
        >
          <Input
            name="responseDelaySeconds"
            type="number"
            min={0}
            max={600}
            defaultValue={settings.responseDelaySeconds}
          />
        </Field>

        <Field
          label="Pausa tras la intervención de un humano (minutos)"
          hint="Cuando alguien del equipo escribe, la IA se calla este tiempo. Es lo que evita que ambos le respondan a la vez al mismo cliente."
        >
          <Input
            name="snoozeMinutes"
            type="number"
            min={1}
            max={1440}
            defaultValue={settings.snoozeMinutes}
          />
        </Field>

        {phones.length > 0 ? (
          <Field
            label="Limitar a ciertos números"
            hint="Sin seleccionar nada, la IA trabaja en todos los números conectados."
          >
            <div className="space-y-1.5">
              {phones.map((phone) => (
                <label key={phone.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="allowedPhoneIds"
                    value={phone.id}
                    defaultChecked={settings.allowedPhoneIds.includes(phone.id)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {phone.label}
                </label>
              ))}
            </div>
          </Field>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Qué puede hacer</h2>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            name="canSendMessages"
            defaultChecked={settings.canSendMessages}
            onChange={(event) => setCanSend(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span>
            <span className="block text-sm font-medium">Escribirle al cliente</span>
            <span className="block text-xs text-muted-foreground">
              Apagado, la IA queda en modo pasivo.
            </span>
          </span>
        </label>

        {!canSend ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            <strong>Modo pasivo.</strong> La IA lee cada conversación, abre tickets y deja notas
            internas para el equipo, pero no envía nada. Es la forma de estrenarla en producción
            sin arriesgar ninguna relación mientras compruebas que sus decisiones son buenas.
          </p>
        ) : null}

        <Switch
          name="canCreateTickets"
          defaultChecked={settings.canCreateTickets}
          label="Abrir tickets"
          hint="Los criterios se escriben en lenguaje natural, en Personalización."
        />

        <Switch
          name="canCreatePrivateNotes"
          defaultChecked={settings.canCreatePrivateNotes}
          label="Dejar notas internas"
          hint="Para avisar a la persona correcta sin que el cliente lo vea."
        />
      </Card>

      <div className="flex items-center gap-3 lg:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ajustes"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
