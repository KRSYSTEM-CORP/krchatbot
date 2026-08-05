"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, RotateCcw, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select } from "@/components/ui/field";
import { Card, Badge, FormMessage, EmptyState, type BadgeTone } from "@/components/ui/misc";
import {
  createBroadcast,
  startBroadcast,
  stopBroadcast,
  retryFailed,
  deleteBroadcast,
} from "@/lib/actions/broadcast";
import type { FormState } from "@/lib/validations";

type Broadcast = {
  id: string;
  name: string;
  body: string;
  status: string;
  repeat: string;
  phoneLabel: string;
  total: number;
  sent: number;
  failed: number;
  throttleSeconds: number;
  scheduledAt: string | null;
};

const initial: FormState = { ok: true };

const statusTone: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  SCHEDULED: "primary",
  RUNNING: "warning",
  PAUSED: "warning",
  DONE: "success",
  FAILED: "danger",
};

const statusLabel: Record<string, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programado",
  RUNNING: "En curso",
  PAUSED: "Detenido",
  DONE: "Completado",
  FAILED: "Falló",
};

export function BroadcastManager({
  broadcasts,
  phones,
  lists,
}: {
  broadcasts: Broadcast[];
  phones: { id: string; label: string; status: string }[];
  lists: { id: string; name: string; entries: { jid: string; name: string }[] }[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<FormState>(initial);
  const [recipients, setRecipients] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, action, creating] = useActionState(createBroadcast, initial);

  const run = (fn: () => Promise<FormState>) => {
    startTransition(async () => {
      const result = await fn();
      setNotice(result);
      router.refresh();
    });
  };

  const connected = phones.filter((phone) => phone.status === "CONNECTED");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <FormMessage state={notice} />
        <Button onClick={() => setShowForm((value) => !value)} disabled={connected.length === 0}>
          <Plus className="h-4 w-4" />
          Nuevo envío
        </Button>
      </div>

      {connected.length === 0 ? (
        <p className="rounded-md bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3 py-2 text-sm text-[var(--warning)]">
          No hay ningún número conectado. Conecta uno antes de preparar un envío.
        </p>
      ) : null}

      {showForm ? (
        <Card>
          <form action={action} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre del envío" hint="Para identificarlo en el historial.">
                <Input name="name" required placeholder="Promo de fin de mes" />
              </Field>
              <Field label="Número desde el que sale">
                <Select name="phoneId" required>
                  {connected.map((phone) => (
                    <option key={phone.id} value={phone.id}>
                      {phone.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Mensaje"
              hint='Puedes usar variables: {{ nombre || "cliente" }}. El respaldo tras || evita mensajes con huecos cuando falta un dato.'
            >
              <Textarea
                name="body"
                rows={5}
                required
                placeholder={`Hola {{ nombre || "" }}, te escribimos de la tienda para avisarte que...`}
              />
            </Field>

            <Field
              label="Destinatarios"
              hint="Un destinatario por línea: número o JID de grupo, luego el nombre, y después variables como clave=valor."
            >
              <Textarea
                name="recipients"
                rows={7}
                required
                className="font-mono text-xs"
                value={recipients}
                onChange={(event) => setRecipients(event.target.value)}
                placeholder={`584121234567, Ana, pedido=A-1042\n584149876543, Luis\n120363012345678901@g.us, Grupo mayoristas`}
              />
            </Field>

            {lists.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Cargar lista guardada:</span>
                {lists.map((list) => (
                  <Button
                    key={list.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRecipients((current) =>
                        [
                          current.trim(),
                          ...list.entries.map((entry) => `${entry.jid}, ${entry.name}`),
                        ]
                          .filter(Boolean)
                          .join("\n"),
                      )
                    }
                  >
                    {list.name} ({list.entries.length})
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Programar para" hint="Vacío = se envía cuando lo arranques a mano.">
                <Input name="scheduledAt" type="datetime-local" />
              </Field>

              <Field label="Repetir">
                <Select name="repeat" defaultValue="NONE">
                  <option value="NONE">No repetir</option>
                  <option value="DAILY">Cada día</option>
                  <option value="WEEKLY">Cada semana</option>
                  <option value="MONTHLY">Cada mes</option>
                </Select>
              </Field>

              <Field
                label="Segundos entre mensajes"
                hint="No lo bajes de 8 en listas grandes: un número normal que dispara cientos de mensajes seguidos es un número reportado."
              >
                <Input name="throttleSeconds" type="number" min={3} max={120} defaultValue={8} />
              </Field>
            </div>

            <Field label="Archivo adjunto (URL)" hint="Opcional. Imagen, video o documento accesible por HTTPS.">
              <Input name="mediaUrl" type="url" placeholder="https://…" />
            </Field>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={creating}>
                {creating ? "Creando…" : "Crear envío"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <FormMessage state={state} />
            </div>
          </form>
        </Card>
      ) : null}

      {broadcasts.length === 0 ? (
        <EmptyState
          title="Sin envíos"
          description="Prepara el primero para mandar el mismo mensaje a muchos chats o grupos, con el nombre de cada quien."
        />
      ) : (
        <div className="space-y-3">
          {broadcasts.map((broadcast) => {
            const progress =
              broadcast.total > 0 ? Math.round((broadcast.sent / broadcast.total) * 100) : 0;

            return (
              <Card key={broadcast.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-medium">{broadcast.name}</p>
                      <Badge tone={statusTone[broadcast.status]}>
                        {statusLabel[broadcast.status]}
                      </Badge>
                      {broadcast.repeat !== "NONE" ? <Badge>Recurrente</Badge> : null}
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{broadcast.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      vía {broadcast.phoneLabel} · uno cada {broadcast.throttleSeconds}s
                      {broadcast.scheduledAt ? ` · programado ${broadcast.scheduledAt}` : ""}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {["DRAFT", "PAUSED", "SCHEDULED"].includes(broadcast.status) ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => startBroadcast(broadcast.id))}
                      >
                        <Play className="h-4 w-4" />
                        Enviar
                      </Button>
                    ) : null}

                    {broadcast.status === "RUNNING" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm("Detener el envío? Lo ya enviado no se puede recuperar."))
                            return;
                          run(() => stopBroadcast(broadcast.id));
                        }}
                      >
                        <Square className="h-4 w-4" />
                        Detener
                      </Button>
                    ) : null}

                    {broadcast.failed > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => retryFailed(broadcast.id))}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Reintentar {broadcast.failed}
                      </Button>
                    ) : null}

                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Eliminar "${broadcast.name}"?`)) return;
                        run(() => deleteBroadcast(broadcast.id));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {broadcast.sent} de {broadcast.total} enviados
                    {broadcast.failed > 0 ? ` · ${broadcast.failed} fallidos` : ""}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
