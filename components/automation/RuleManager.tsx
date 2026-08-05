"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, Switch } from "@/components/ui/field";
import { Card, Badge, FormMessage, EmptyState } from "@/components/ui/misc";
import { saveRule, toggleRule, deleteRule } from "@/lib/actions/automation";
import type { FormState } from "@/lib/validations";

type Rule = {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
  phoneIds: string[];
  runCount: number;
  conditions: string;
  actions: string;
};

const initial: FormState = { ok: true };

const triggers = [
  { value: "MESSAGE_RECEIVED", label: "Llega un mensaje" },
  { value: "CHAT_CREATED", label: "Se crea un chat o grupo" },
  { value: "LABEL_ADDED", label: "Se agrega una etiqueta" },
  { value: "LABEL_REMOVED", label: "Se quita una etiqueta" },
  { value: "MESSAGE_FLAGGED", label: "Se marca un mensaje como importante" },
  { value: "REACTION_ADDED", label: "Alguien reacciona a un mensaje" },
  { value: "TICKET_CREATED", label: "Se crea un ticket" },
  { value: "SLA_BREACHED", label: "Se vence el plazo de un ticket" },
];

// Recetas listas para copiar. Escribir un árbol de condiciones desde cero es
// la parte que frena a la gente; partir de una que ya funciona no.
const RECIPES = [
  {
    name: "Respuesta fuera de horario",
    trigger: "MESSAGE_RECEIVED",
    conditions: {
      op: "AND",
      items: [{ field: "message.fromMe", op: "isFalse" }],
    },
    actions: [
      {
        type: "SEND_MESSAGE",
        body: 'Hola {{ chat.nombre || "" }}, gracias por escribir. Nuestro horario es de lunes a sábado, de 8:00 a 6:00. Te respondemos apenas abramos.',
        debounceMinutes: 720,
      },
    ],
  },
  {
    name: "Ticket por palabra clave",
    trigger: "MESSAGE_RECEIVED",
    conditions: {
      op: "OR",
      items: [
        { field: "message.body", op: "contains", value: "reclamo" },
        { field: "message.body", op: "contains", value: "devolver" },
        { field: "message.body", op: "contains", value: "cancelar" },
      ],
    },
    actions: [
      { type: "FLAG_MESSAGE" },
      { type: "CREATE_TICKET", title: "Reclamo detectado en {{ chat.nombre }}", priority: "HIGH" },
    ],
  },
  {
    name: "Aviso al equipo cuando pasa el plazo",
    trigger: "SLA_BREACHED",
    conditions: { op: "AND", items: [] },
    actions: [
      {
        type: "PRIVATE_NOTE",
        body: "Se venció el plazo de este ticket sin respuesta.",
      },
    ],
  },
];

export function RuleManager({
  rules,
  phones,
  labels,
  members,
}: {
  rules: Rule[];
  phones: { id: string; label: string }[];
  labels: { id: string; name: string }[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<{ conditions: string; actions: string } | null>(null);
  const [notice, setNotice] = useState<FormState>(initial);
  const [pending, startTransition] = useTransition();
  const [state, action, saving] = useActionState(saveRule, initial);

  const run = (fn: () => Promise<FormState>) => {
    startTransition(async () => {
      const result = await fn();
      setNotice(result);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <FormMessage state={notice} />
        <Button
          onClick={() => {
            setEditing(null);
            setDraft(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nueva regla
        </Button>
      </div>

      {showForm ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Empezar desde una receta:</span>
            {RECIPES.map((recipe) => (
              <Button
                key={recipe.name}
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    conditions: JSON.stringify(recipe.conditions, null, 2),
                    actions: JSON.stringify(recipe.actions, null, 2),
                  })
                }
              >
                {recipe.name}
              </Button>
            ))}
          </div>

          <form action={action} className="space-y-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre">
                <Input name="name" defaultValue={editing?.name ?? ""} required />
              </Field>
              <Field label="Disparador">
                <Select name="trigger" defaultValue={editing?.trigger ?? "MESSAGE_RECEIVED"}>
                  {triggers.map((trigger) => (
                    <option key={trigger.value} value={trigger.value}>
                      {trigger.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {phones.length > 0 ? (
              <Field label="Limitar a ciertos números" hint="Sin marcar nada, aplica a todos.">
                <div className="flex flex-wrap gap-3">
                  {phones.map((phone) => (
                    <label key={phone.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        name="phoneIds"
                        value={phone.id}
                        defaultChecked={editing?.phoneIds.includes(phone.id)}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      {phone.label}
                    </label>
                  ))}
                </div>
              </Field>
            ) : null}

            <Field
              label="Condiciones"
              hint='Árbol AND/OR, hasta dos niveles. Campos: message.body, message.fromMe, chat.type, chat.name, chat.label, chat.assigned, contact.internal. Operadores: contains, notContains, equals, startsWith, isTrue, isFalse.'
            >
              <Textarea
                name="conditions"
                rows={9}
                className="font-mono text-xs"
                key={draft?.conditions ?? editing?.id ?? "new-conditions"}
                defaultValue={
                  draft?.conditions ?? editing?.conditions ?? '{\n  "op": "AND",\n  "items": []\n}'
                }
              />
            </Field>

            <Field
              label="Acciones"
              hint="Lista de acciones, cada una con delaySeconds opcional. Tipos: SEND_MESSAGE, ADD_CHAT_LABEL, ASSIGN_CHAT, CREATE_TICKET, FLAG_MESSAGE, PRIVATE_NOTE, DISABLE_AI."
            >
              <Textarea
                name="actions"
                rows={9}
                className="font-mono text-xs"
                key={draft?.actions ?? editing?.id ?? "new-actions"}
                defaultValue={draft?.actions ?? editing?.actions ?? "[]"}
              />
            </Field>

            <details className="rounded-lg border border-border p-3 text-xs">
              <summary className="cursor-pointer font-medium">Ids disponibles</summary>
              <div className="mt-2 space-y-2 text-muted-foreground">
                <p>
                  <strong>Etiquetas</strong> (para ADD_CHAT_LABEL y chat.label):{" "}
                  {labels.length === 0
                    ? "ninguna creada"
                    : labels.map((label) => `${label.name} = ${label.id}`).join(" · ")}
                </p>
                <p>
                  <strong>Miembros</strong> (para ASSIGN_CHAT):{" "}
                  {members.map((member) => `${member.name} = ${member.id}`).join(" · ")}
                </p>
              </div>
            </details>

            <Switch
              name="isActive"
              defaultChecked={editing?.isActive ?? true}
              label="Regla activa"
            />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar regla"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                  setDraft(null);
                }}
              >
                Cancelar
              </Button>
              <FormMessage state={state} />
            </div>
          </form>
        </Card>
      ) : null}

      {rules.length === 0 ? (
        <EmptyState
          title="Sin reglas"
          description="Las reglas cubren lo que no debe quedar a criterio: respuesta fuera de horario, ticket por palabra clave, aviso cuando se vence un plazo."
        />
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id} className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <p className="font-medium">{rule.name}</p>
                  <Badge tone={rule.isActive ? "success" : "neutral"}>
                    {rule.isActive ? "Activa" : "Pausada"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {triggers.find((trigger) => trigger.value === rule.trigger)?.label ?? rule.trigger}
                  {rule.runCount > 0 ? ` · se ejecutó ${rule.runCount} veces` : ""}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => toggleRule(rule.id))}
                >
                  {rule.isActive ? "Pausar" : "Activar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(rule);
                    setDraft(null);
                    setShowForm(true);
                  }}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Eliminar la regla "${rule.name}"?`)) return;
                    run(() => deleteRule(rule.id));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
