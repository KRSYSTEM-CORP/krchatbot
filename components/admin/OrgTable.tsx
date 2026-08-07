"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/misc";
import { setOrgExempt, recordMaintenancePayment, type AdminOrgRow } from "@/lib/actions/admin";
import { isOrgBlocked } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import type { FormState } from "@/lib/validations";

function addDaysISO(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function BillingBadge({ org }: { org: AdminOrgRow }) {
  if (org.isExempt) return <Badge tone="neutral">Exonerada</Badge>;
  if (isOrgBlocked(org)) return <Badge tone="danger">Bloqueada por pago</Badge>;
  if (org.nextPaymentDueDate) return <Badge tone="neutral">Vence el {formatDate(org.nextPaymentDueDate)}</Badge>;
  return <Badge tone="neutral">Sin ciclo configurado</Badge>;
}

export function OrgTable({ orgs }: { orgs: AdminOrgRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  if (orgs.length === 0) {
    return <EmptyState title="Sin organizaciones" description="Todavía no se ha registrado ninguna." />;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-2 font-medium">Organización</th>
            <th className="px-4 py-2 font-medium">Admin</th>
            <th className="px-4 py-2 font-medium">Registrada</th>
            <th className="px-4 py-2 font-medium">Cobro</th>
            <th className="px-4 py-2 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <OrgRow key={org.id} org={org} isPending={isPending} run={run} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrgRow({
  org,
  isPending,
  run,
}: {
  org: AdminOrgRow;
  isPending: boolean;
  run: (action: () => Promise<unknown>) => void;
}) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(org.monthlyFeeUsdCents != null ? String(org.monthlyFeeUsdCents / 100) : "");
  const [payPeriodEnd, setPayPeriodEnd] = useState(() => addDaysISO(org.nextPaymentDueDate ?? new Date(), 30));
  const [payNote, setPayNote] = useState("");
  const [state, setState] = useState<FormState | null>(null);
  const [isPaying, startPaying] = useTransition();

  function handleRecordPayment() {
    startPaying(async () => {
      const result = await recordMaintenancePayment(org.id, { amount: payAmount, periodEnd: payPeriodEnd, note: payNote });
      setState(result);
      if (!result.ok) return;
      setPayOpen(false);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-2 font-medium">{org.name}</td>
      <td className="px-4 py-2 text-muted-foreground">{org.adminEmail}</td>
      <td className="px-4 py-2 text-muted-foreground">{formatDate(org.createdAt)}</td>
      <td className="px-4 py-2">
        <BillingBadge org={org} />
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setPayOpen((v) => !v)}>
              Registrar pago
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => setOrgExempt(org.id, !org.isExempt))}>
              {org.isExempt ? "Quitar exoneración" : "Exonerar"}
            </Button>
          </div>
          {payOpen ? (
            <div className="flex w-56 flex-col gap-2 text-left">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`pay-amount-${org.id}`}>Monto (USD)</Label>
                <Input
                  id={`pay-amount-${org.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`pay-period-${org.id}`}>Nueva fecha de vencimiento</Label>
                <Input
                  id={`pay-period-${org.id}`}
                  type="date"
                  value={payPeriodEnd}
                  onChange={(e) => setPayPeriodEnd(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`pay-note-${org.id}`}>Nota (opcional)</Label>
                <Input
                  id={`pay-note-${org.id}`}
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Ej. Transferencia ref. 001234567"
                />
              </div>
              {state && !state.ok ? <p className="text-xs text-[var(--destructive)]">{state.error}</p> : null}
              <Button size="sm" disabled={isPaying} onClick={handleRecordPayment}>
                Confirmar pago
              </Button>
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
