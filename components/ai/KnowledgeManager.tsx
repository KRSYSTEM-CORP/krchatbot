"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select } from "@/components/ui/field";
import { Card, Badge, FormMessage, EmptyState } from "@/components/ui/misc";
import {
  saveKnowledgeItem,
  setKnowledgeStatus,
  deleteKnowledgeItems,
  bulkImportFaqs,
  importKnowledgeFromPdf,
} from "@/lib/actions/ai";
import type { FormState } from "@/lib/validations";

type Item = {
  id: string;
  question: string;
  answer: string;
  instructions: string;
  status: "ACTIVE" | "INACTIVE" | "NEEDS_REVIEW";
  source: "FAQ" | "SELF_LEARNED" | "DOCUMENT";
  usageCount: number;
};

const initial: FormState = { ok: true };

const sourceLabel = {
  FAQ: "FAQ",
  SELF_LEARNED: "Aprendida",
  DOCUMENT: "Documento",
} as const;

const statusLabel = {
  ACTIVE: "Activa",
  INACTIVE: "Inactiva",
  NEEDS_REVIEW: "Por revisar",
} as const;

export function KnowledgeManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"ALL" | "FAQ" | "SELF_LEARNED" | "NEEDS_REVIEW">("ALL");
  const [editing, setEditing] = useState<Item | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const [saveState, saveAction, saving] = useActionState(saveKnowledgeItem, initial);
  const [importState, importAction, importing] = useActionState(bulkImportFaqs, initial);
  const [pdfState, pdfAction, importingPdf] = useActionState(importKnowledgeFromPdf, initial);

  const visible = useMemo(() => {
    if (tab === "ALL") return items;
    if (tab === "NEEDS_REVIEW") return items.filter((item) => item.status === "NEEDS_REVIEW");
    return items.filter((item) => item.source === tab);
  }, [items, tab]);

  const pendingReview = items.filter((item) => item.status === "NEEDS_REVIEW").length;

  const bulk = (fn: () => Promise<FormState>) => {
    startTransition(async () => {
      await fn();
      setSelected([]);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["ALL", `Todas · ${items.length}`],
            ["FAQ", "FAQ"],
            ["SELF_LEARNED", "Aprendidas"],
            ["NEEDS_REVIEW", `Por revisar · ${pendingReview}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}

        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowImport((v) => !v)}>
            <Upload className="h-4 w-4" />
            Importar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nueva entrada
          </Button>
        </div>
      </div>

      {showImport ? (
        <Card className="space-y-3">
          <form action={importAction} className="space-y-3">
            <Field
              label="Pegar preguntas y respuestas"
              hint='Un bloque por entrada, separados por una línea en blanco. Formato: "P: pregunta" en una línea y "R: respuesta" en la siguiente.'
            >
              <Textarea
                name="bulk"
                rows={10}
                className="font-mono text-xs"
                placeholder={`P: ¿Cuál es el horario?\n¿A qué hora abren?\nR: Atendemos de lunes a sábado, de 8:00 a 6:00.\n\nP: ¿Hacen envíos?\nR: Sí, despachamos a todo el país. El envío tarda de 2 a 4 días hábiles.`}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={importing}>
                {importing ? "Importando…" : "Importar"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowImport(false)}>
                Cerrar
              </Button>
              <FormMessage state={importState} />
            </div>
          </form>

          <div className="border-t border-border pt-3">
            <form action={pdfAction} className="space-y-3">
              <Field
                label="O subir un PDF"
                hint="Manual, catálogo, lista de precios, etc. Se parte en fragmentos que entran como 'Por revisar' — revísalos y actívalos desde esa pestaña."
              >
                <input
                  type="file"
                  name="pdf"
                  accept="application/pdf"
                  required
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
              </Field>
              <div className="flex items-center gap-3">
                <Button type="submit" size="sm" disabled={importingPdf}>
                  {importingPdf ? "Leyendo PDF…" : "Importar PDF"}
                </Button>
                <FormMessage state={pdfState} />
              </div>
            </form>
          </div>
        </Card>
      ) : null}

      {showForm ? (
        <Card>
          <form action={saveAction} className="space-y-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <Field
              label="Pregunta"
              hint="Escribe varias formas de preguntar lo mismo, una por línea. Cuantas más variantes, más fiable es el acierto."
            >
              <Textarea
                name="question"
                rows={4}
                defaultValue={editing?.question ?? ""}
                required
                placeholder={`¿Cuánto cuesta el envío?\n¿El delivery tiene costo?\n¿Cobran por llevarlo a mi casa?`}
              />
            </Field>

            <Field label="Respuesta">
              <Textarea
                name="answer"
                rows={5}
                defaultValue={editing?.answer ?? ""}
                required
                placeholder="El envío dentro de la ciudad cuesta 3 $. A otras ciudades, el costo lo calcula la agencia y se paga al recibir."
              />
            </Field>

            <Field
              label="Instrucción específica (opcional)"
              hint="Comportamiento particular de esta entrada. Por ejemplo: 'pregunta primero en qué ciudad está'."
            >
              <Textarea name="instructions" rows={2} defaultValue={editing?.instructions ?? ""} />
            </Field>

            <Field label="Estado">
              <Select name="status" defaultValue={editing?.status ?? "ACTIVE"}>
                <option value="ACTIVE">Activa — la IA la usa</option>
                <option value="INACTIVE">Inactiva — guardada pero sin usar</option>
                <option value="NEEDS_REVIEW">Por revisar</option>
              </Select>
            </Field>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                Cancelar
              </Button>
              <FormMessage state={saveState} />
            </div>
          </form>
        </Card>
      ) : null}

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} seleccionadas</span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => bulk(() => setKnowledgeStatus(selected, "ACTIVE"))}
          >
            Activar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => bulk(() => setKnowledgeStatus(selected, "INACTIVE"))}
          >
            Desactivar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => bulk(() => deleteKnowledgeItems(selected))}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="La base de conocimiento está vacía"
          description="Sin entradas, la IA no tiene de dónde sacar respuestas y sólo podrá escalar al equipo. Empieza por las diez preguntas que más te repiten."
        />
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <Card key={item.id} className="flex gap-3 p-4">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, item.id]
                      : current.filter((id) => id !== item.id),
                  )
                }
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
              />

              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setEditing(item);
                  setShowForm(true);
                }}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      item.status === "ACTIVE"
                        ? "success"
                        : item.status === "NEEDS_REVIEW"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {statusLabel[item.status]}
                  </Badge>
                  <Badge>{sourceLabel[item.source]}</Badge>
                  {item.usageCount > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      usada {item.usageCount} veces
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm font-medium">{item.question}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.answer}</p>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
