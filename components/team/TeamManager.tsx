"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import { Card, Badge, FormMessage } from "@/components/ui/misc";
import {
  inviteMembers,
  createLabel,
  deleteLabel,
  setMemberAccess,
  setMemberStatus,
} from "@/lib/actions/work";
import type { FormState } from "@/lib/validations";

type Member = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  status: "ACTIVE" | "SUSPENDED";
  labelIds: string[];
};

type Label = { id: string; name: string; color: string; chats: number };

const initial: FormState = { ok: true };

export function TeamManager({
  members,
  labels,
  currentUserId,
}: {
  members: Member[];
  labels: Label[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<FormState>(initial);
  const [pending, startTransition] = useTransition();
  const [inviteState, inviteAction, inviting] = useActionState(inviteMembers, initial);
  const [labelState, labelAction, savingLabel] = useActionState(createLabel, initial);

  const run = (fn: () => Promise<FormState>) => {
    startTransition(async () => {
      const result = await fn();
      setNotice(result);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <FormMessage state={notice} />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="space-y-4">
          <h2 className="font-medium">Miembros</h2>

          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li key={member.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name}
                      {member.id === currentUserId ? (
                        <span className="text-muted-foreground"> (tú)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone={member.role === "ADMIN" ? "primary" : "neutral"}>
                      {member.role === "ADMIN" ? "Admin" : "Miembro"}
                    </Badge>
                    <Badge tone={member.status === "ACTIVE" ? "success" : "danger"}>
                      {member.status === "ACTIVE" ? "Activo" : "Suspendido"}
                    </Badge>
                    {member.id !== currentUserId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            setMemberStatus(
                              member.id,
                              member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                            ),
                          )
                        }
                      >
                        {member.status === "ACTIVE" ? "Suspender" : "Reactivar"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {member.role === "MEMBER" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {labels.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Sin etiquetas creadas, este miembro no ve ningún chat.
                      </p>
                    ) : (
                      labels.map((label) => {
                        const active = member.labelIds.includes(label.id);
                        return (
                          <button
                            key={label.id}
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                setMemberAccess(
                                  member.id,
                                  active
                                    ? member.labelIds.filter((id) => id !== label.id)
                                    : [...member.labelIds, label.id],
                                ),
                              )
                            }
                            className="rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity"
                            style={{
                              borderColor: label.color,
                              color: label.color,
                              backgroundColor: active ? `${label.color}22` : "transparent",
                              opacity: active ? 1 : 0.45,
                            }}
                          >
                            {label.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Acceso completo a todos los chats de la organización.
                  </p>
                )}
              </li>
            ))}
          </ul>

          <form action={inviteAction} className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">
              <UserPlus className="mr-1 inline h-4 w-4" />
              Agregar miembros
            </p>

            <Field
              label="Correos"
              hint="Separados por coma para dar de alta a varios de una vez."
            >
              <Input name="emails" required placeholder="ana@empresa.com, luis@empresa.com" />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" hint="Opcional; se usa para todos los correos de esta tanda.">
                <Input name="name" placeholder="Equipo de ventas" />
              </Field>
              <Field label="Rol">
                <Select name="role" defaultValue="MEMBER">
                  <option value="MEMBER">Miembro — acceso por etiqueta</option>
                  <option value="ADMIN">Admin — acceso total</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Contraseña temporal"
              hint="Compártela por un canal seguro y pídeles que la cambien al entrar."
            >
              <Input name="password" type="text" required minLength={8} />
            </Field>

            {labels.length > 0 ? (
              <Field label="Etiquetas de acceso" hint="Sólo aplica a los miembros.">
                <div className="flex flex-wrap gap-2">
                  {labels.map((label) => (
                    <label key={label.id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        name="labelIds"
                        value={label.id}
                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                      />
                      {label.name}
                    </label>
                  ))}
                </div>
              </Field>
            ) : null}

            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={inviting}>
                {inviting ? "Creando…" : "Agregar"}
              </Button>
              <FormMessage state={inviteState} />
            </div>
          </form>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-medium">Etiquetas</h2>

          {labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay etiquetas. Crea al menos una para poder dar acceso limitado.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {labels.map((label) => (
                <li
                  key={label.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="truncate text-sm">{label.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{label.chats}</span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Eliminar la etiqueta "${label.name}"?`)) return;
                      run(() => deleteLabel(label.id));
                    }}
                    className="text-muted-foreground hover:text-[var(--destructive)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form action={labelAction} className="space-y-2">
            <div className="flex gap-2">
              <Input name="name" placeholder="Nueva etiqueta" required className="flex-1" />
              <input
                type="color"
                name="color"
                defaultValue="#4f3ddb"
                className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-card"
              />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={savingLabel} className="w-full">
              Crear etiqueta
            </Button>
            <FormMessage state={labelState} />
          </form>
        </Card>
      </div>
    </div>
  );
}
