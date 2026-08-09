"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getPhoneStatus } from "@/lib/actions/phones";

const POLL_MS = 20000;

// Aviso global, no por chat: si el número (o todos, con varios) se cae, todo
// el equipo debe verlo apenas entra a la app, no descubrirlo cuando un
// cliente se queja de que nadie contesta.
export function PhoneStatusBanner({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<{ hasPhones: boolean; allDisconnected: boolean } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const result = await getPhoneStatus();
        if (!cancelled) setStatus(result);
      } catch {
        // Un fallo puntual de red no debe hacer parpadear el aviso.
      }
    };
    void check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status?.hasPhones || !status.allDisconnected) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-sm font-medium text-white">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>¡Todos los números están desconectados! Vuelve a escanear el código QR.</span>
      {isAdmin ? (
        <Link
          href="/numeros"
          className="rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25"
        >
          Reconectar números
        </Link>
      ) : null}
    </div>
  );
}
