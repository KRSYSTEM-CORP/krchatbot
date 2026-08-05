"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, Badge, FormMessage, Stat, type BadgeTone } from "@/components/ui/misc";
import { setSelfTraining, runTrainingNow } from "@/lib/actions/ai";
import { isoDaysAgo } from "@/lib/format";
import type { FormState } from "@/lib/validations";

type Run = {
  id: string;
  week: string;
  status: string;
  learned: number;
  isManual: boolean;
  error: string | null;
  finishedAt: string | null;
};

const statusTone: Record<string, BadgeTone> = {
  QUEUED: "neutral",
  RUNNING: "primary",
  COMPLETE: "success",
  FAILED: "danger",
};

const statusLabel: Record<string, string> = {
  QUEUED: "En cola",
  RUNNING: "Corriendo",
  COMPLETE: "Completa",
  FAILED: "Falló",
};

export function TrainingPanel({
  enabled,
  requiresReview,
  pendingReview,
  runs,
}: {
  enabled: boolean;
  requiresReview: boolean;
  pendingReview: number;
  runs: Run[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<FormState>({ ok: true });
  const [on, setOn] = useState(enabled);
  const [review, setReview] = useState(requiresReview);

  const lastWeek = isoDaysAgo(7);

  const save = (nextOn: boolean, nextReview: boolean) => {
    startTransition(async () => {
      const result = await setSelfTraining(nextOn, nextReview);
      setNotice(result);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="font-medium">Cómo funciona</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Cada domingo la IA revisa las conversaciones que tu equipo resolvió durante la semana,
            extrae las respuestas que dieron las personas y redacta nuevas entradas para la base de
            conocimiento. Es el ciclo que cierra el sistema: lo que un agente contestó el lunes es
            base de conocimiento el lunes siguiente, sin que nadie tenga que sentarse a
            documentarlo. Sólo aprende de respuestas humanas — aprender de las suyas propias
            amplificaría cualquier error que ya tuviera.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            checked={on}
            disabled={pending}
            onChange={(event) => {
              setOn(event.target.checked);
              save(event.target.checked, review);
            }}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span>
            <span className="block text-sm font-medium">Auto-entrenamiento semanal</span>
            <span className="block text-xs text-muted-foreground">
              Corre los domingos de madrugada.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            checked={review}
            disabled={pending}
            onChange={(event) => {
              setReview(event.target.checked);
              save(on, event.target.checked);
            }}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
          <span>
            <span className="block text-sm font-medium">Requiere aprobación</span>
            <span className="block text-xs text-muted-foreground">
              Recomendado. Sin esto, lo que aprenda se activa solo y empieza a responderle a
              clientes reales sin que nadie lo haya leído.
            </span>
          </span>
        </label>

        <FormMessage state={notice} />
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Pendientes de revisar"
          value={pendingReview}
          tone={pendingReview > 0 ? "warning" : undefined}
          hint={pendingReview > 0 ? "Están inactivas hasta que las apruebes" : undefined}
        />
        <Stat label="Corridas registradas" value={runs.length} />
        <Stat
          label="Total aprendido"
          value={runs.reduce((sum, run) => sum + run.learned, 0)}
        />
      </div>

      {pendingReview > 0 ? (
        <Link href="/ia/conocimiento">
          <Button variant="outline">Revisar las {pendingReview} entradas pendientes</Button>
        </Link>
      ) : null}

      <Card className="space-y-4">
        <h2 className="font-medium">Entrenar una semana concreta</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          action={(formData: FormData) => {
            startTransition(async () => {
              const result = await runTrainingNow(String(formData.get("weekStart") ?? ""));
              setNotice(result);
              router.refresh();
            });
          }}
        >
          <Field
            label="Semana que empieza el"
            hint="Procesa los 7 días a partir de esa fecha."
            className="w-56"
          >
            <Input type="date" name="weekStart" defaultValue={lastWeek} />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Entrenando…" : "Entrenar ahora"}
          </Button>
        </form>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Semana</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Aprendidas</th>
              <th className="px-4 py-3 font-medium">Disparo</th>
              <th className="px-4 py-3 font-medium">Terminó</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Todavía no se ha entrenado nada.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3">{run.week}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone[run.status]}>{statusLabel[run.status]}</Badge>
                    {run.error ? (
                      <p className="mt-1 text-xs text-[var(--destructive)]">{run.error}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{run.learned}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.isManual ? "Manual" : "Programado"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{run.finishedAt ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
