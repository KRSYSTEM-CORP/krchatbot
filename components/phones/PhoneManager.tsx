"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, RefreshCw, RotateCcw, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, Badge, FormMessage, EmptyState, type BadgeTone } from "@/components/ui/misc";
import {
  connectPhone,
  refreshQr,
  syncPhoneState,
  restartPhone,
  resetPhone,
  deletePhone,
} from "@/lib/actions/phones";
import type { FormState } from "@/lib/validations";

type Phone = {
  id: string;
  label: string;
  number: string | null;
  status: "DISCONNECTED" | "QR_PENDING" | "CONNECTING" | "CONNECTED";
  qrCode: string | null;
  chats: number;
  messages: number;
};

const initial: FormState = { ok: true };

const tone: Record<Phone["status"], BadgeTone> = {
  CONNECTED: "success",
  QR_PENDING: "warning",
  CONNECTING: "warning",
  DISCONNECTED: "danger",
};

const label: Record<Phone["status"], string> = {
  CONNECTED: "Conectado",
  QR_PENDING: "Esperando escaneo",
  CONNECTING: "Conectando",
  DISCONNECTED: "Desconectado",
};

export function PhoneManager({ phones }: { phones: Phone[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(phones.length === 0);
  const [notice, setNotice] = useState<FormState>(initial);
  const [pending, startTransition] = useTransition();
  const [state, action, connecting] = useActionState(connectPhone, initial);

  const waiting = phones.some((phone) => phone.status !== "CONNECTED");

  // Mientras haya un número esperando el escaneo, la página se refresca sola:
  // el QR llega por webhook y nadie debería tener que pulsar "actualizar"
  // mientras sostiene el teléfono con la cámara abierta.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  const run = (fn: () => Promise<FormState>) => {
    startTransition(async () => {
      const result = await fn();
      setNotice(result);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <FormMessage state={notice} />
        <Button onClick={() => setShowForm((value) => !value)}>
          <Plus className="h-4 w-4" />
          Conectar número
        </Button>
      </div>

      {showForm ? (
        <Card>
          <form action={action} className="flex flex-wrap items-end gap-3">
            <Field
              label="Nombre del número"
              hint="Cómo lo verá el equipo: 'Ventas', 'Soporte', 'Despachos'."
              className="min-w-56 flex-1"
            >
              <Input name="label" required placeholder="Ventas" />
            </Field>
            <Button type="submit" disabled={connecting}>
              {connecting ? "Creando…" : "Generar QR"}
            </Button>
          </form>
          <div className="mt-3">
            <FormMessage state={state} />
          </div>
        </Card>
      ) : null}

      {phones.length === 0 ? (
        <EmptyState
          title="Ningún número conectado"
          description="Conecta el primero y escanea el QR desde WhatsApp › Dispositivos vinculados. La sincronización de chats tarda unos minutos."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {phones.map((phone) => (
            <Card key={phone.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{phone.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {phone.number ? `+${phone.number}` : "Sin vincular"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {phone.chats} chats · {phone.messages} mensajes
                  </p>
                </div>
                <Badge tone={tone[phone.status]}>{label[phone.status]}</Badge>
              </div>

              {phone.qrCode && phone.status !== "CONNECTED" ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-4">
                  {/* Evolution devuelve el QR como data URI ya renderizado. */}
                  <Image
                    src={phone.qrCode}
                    alt="Código QR para vincular el número"
                    width={220}
                    height={220}
                    unoptimized
                    className="rounded-md"
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    WhatsApp › Ajustes › Dispositivos vinculados › Vincular dispositivo.
                    <br />
                    El código caduca en menos de un minuto; si expira, pide otro.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => syncPhoneState(phone.id))}
                >
                  <RefreshCw className="h-4 w-4" />
                  Estado
                </Button>

                {phone.status !== "CONNECTED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => refreshQr(phone.id))}
                  >
                    QR nuevo
                  </Button>
                ) : null}

                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => restartPhone(phone.id))}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reiniciar
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Cerrar la sesión de "${phone.label}"? Los chats se conservan.`)) {
                      return;
                    }
                    run(() => resetPhone(phone.id));
                  }}
                >
                  <Power className="h-4 w-4" />
                  Cerrar sesión
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        `Eliminar "${phone.label}"? Se borran sus ${phone.chats} chats y ${phone.messages} mensajes. No se puede deshacer.`,
                      )
                    ) {
                      return;
                    }
                    run(() => deletePhone(phone.id));
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
