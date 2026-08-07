"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import { FormMessage, EmptyState } from "@/components/ui/misc";
import { formatDate, formatMoney, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image-utils";
import {
  approvePaymentReport,
  rejectPaymentReport,
  updatePlatformSettings,
  fetchAndUpdatePlatformBcvRate,
} from "@/lib/actions/admin";
import type { FormState } from "@/lib/validations";

type PendingReportLine = { paymentMethod: PaymentMethod; amountUsdCents: number; reference: string | null };

type PendingReport = {
  id: string;
  orgId: string;
  proofImageDataUrl: string | null;
  note: string | null;
  createdAt: Date;
  org: { name: string };
  lines: PendingReportLine[];
};

export function PlatformSettingsForm({
  initialInstructions,
  initialBinanceQrDataUrl,
  initialBinanceId,
  initialBillingExchangeRate,
  initialDefaultMonthlyFeeUsdCents,
}: {
  initialInstructions: string | null;
  initialBinanceQrDataUrl: string | null;
  initialBinanceId: string | null;
  initialBillingExchangeRate: number | null;
  initialDefaultMonthlyFeeUsdCents: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [instructions, setInstructions] = useState(initialInstructions ?? "");
  const [binanceQrDataUrl, setBinanceQrDataUrl] = useState(initialBinanceQrDataUrl ?? "");
  const [binanceId, setBinanceId] = useState(initialBinanceId ?? "");
  const [rate, setRate] = useState(initialBillingExchangeRate != null ? String(initialBillingExchangeRate) : "");
  const [defaultFee, setDefaultFee] = useState(
    initialDefaultMonthlyFeeUsdCents != null ? String(initialDefaultMonthlyFeeUsdCents / 100) : "",
  );
  const [state, setState] = useState<FormState | null>(null);
  const [isFetchingBcv, startBcvFetch] = useTransition();
  const [bcvError, setBcvError] = useState<string | null>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  async function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, { maxDimension: 600, format: "image/png" });
      setBinanceQrDataUrl(dataUrl);
      setState(null);
    } catch {
      setState({ ok: false, error: "No se pudo procesar la imagen. Intenta con otro archivo." });
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updatePlatformSettings({
        paymentInstructions: instructions,
        binanceQrDataUrl,
        binanceId,
        billingExchangeRate: rate,
        defaultMonthlyFee: defaultFee,
      });
      setState(result);
      if (result.ok) router.refresh();
    });
  }

  function handleFetchBcv() {
    setBcvError(null);
    setState(null);
    startBcvFetch(async () => {
      const result = await fetchAndUpdatePlatformBcvRate();
      if (!result.ok) {
        setBcvError(result.error);
        return;
      }
      setRate(String(result.rate));
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSave} className="flex max-w-lg flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform-default-fee">Precio mensual estándar (USD)</Label>
        <Input
          id="platform-default-fee"
          type="number"
          step="0.01"
          min="0"
          value={defaultFee}
          onChange={(e) => {
            setDefaultFee(e.target.value);
            setState(null);
          }}
          placeholder="Ej. 30.00"
        />
        <p className="text-xs text-muted-foreground">
          Se aplica automáticamente a toda org nueva al registrarse, salvo que le pongas un precio
          distinto después.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform-rate">Tasa de cambio de la plataforma (Bs/USD)</Label>
        <div className="flex gap-2">
          <Input
            id="platform-rate"
            type="number"
            step="0.0001"
            min="0"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setState(null);
            }}
            placeholder="Ej. 45.0000"
          />
          <Button type="button" variant="outline" className="shrink-0" onClick={handleFetchBcv} disabled={isFetchingBcv}>
            {isFetchingBcv ? "Consultando BCV..." : "Actualizar con tasa BCV"}
          </Button>
        </div>
        {bcvError ? <p className="text-sm text-[var(--destructive)]">{bcvError}</p> : null}
        <p className="text-xs text-muted-foreground">
          Se actualiza sola todos los días con la tasa oficial del BCV. Se usa sólo para registrar
          pagos hechos en bolívares — el cobro en sí siempre es en USD.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>QR de Binance Pay</Label>
        <div className="flex items-center gap-3">
          {binanceQrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={binanceQrDataUrl}
              alt="QR de Binance Pay"
              className="h-20 w-20 rounded object-cover border border-border"
            />
          ) : (
            <div className="h-20 w-20 rounded border border-border flex items-center justify-center text-xs text-muted-foreground text-center">
              Sin QR
            </div>
          )}
          <input
            ref={qrInputRef}
            type="file"
            accept="image/*"
            onChange={handleQrFileChange}
            className="text-sm"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform-binance-id">ID de la cuenta de Binance</Label>
        <Input
          id="platform-binance-id"
          value={binanceId}
          onChange={(e) => {
            setBinanceId(e.target.value);
            setState(null);
          }}
          placeholder="Ej. 123456789"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform-instructions">Notas adicionales (opcional)</Label>
        <Textarea
          id="platform-instructions"
          value={instructions}
          onChange={(e) => {
            setInstructions(e.target.value);
            setState(null);
          }}
          rows={4}
          placeholder="Ej. Solo en horario laboral, confirma por WhatsApp antes de enviar"
        />
      </div>
      {state ? <FormMessage state={state} /> : null}
      <Button type="submit" size="sm" disabled={isPending} className="self-start">
        Guardar
      </Button>
    </form>
  );
}

export function PendingReportsTable({ reports }: { reports: PendingReport[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleApprove(reportId: string) {
    startTransition(async () => {
      await approvePaymentReport(reportId);
      router.refresh();
    });
  }

  if (reports.length === 0) {
    return (
      <EmptyState title="Sin reportes pendientes" description="Todos los reportes de pago ya fueron revisados." />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-2 font-medium">Organización</th>
            <th className="px-4 py-2 font-medium">Métodos de pago</th>
            <th className="px-4 py-2 font-medium">Total</th>
            <th className="px-4 py-2 font-medium">Nota</th>
            <th className="px-4 py-2 font-medium">Comprobante</th>
            <th className="px-4 py-2 font-medium">Fecha</th>
            <th className="px-4 py-2 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <PendingReportRow key={r.id} report={r} isPending={isPending} onApprove={handleApprove} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingReportRow({
  report: r,
  isPending,
  onApprove,
}: {
  report: PendingReport;
  isPending: boolean;
  onApprove: (reportId: string) => void;
}) {
  const [isRejecting, startTransition] = useTransition();
  const router = useRouter();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [state, setState] = useState<FormState | null>(null);

  const totalUsdCents = r.lines.reduce((sum, l) => sum + l.amountUsdCents, 0);

  function handleReject(e: React.MouseEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await rejectPaymentReport(r.id, { reviewNote });
      setState(result);
      if (!result.ok) return;
      setRejectOpen(false);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-2 font-medium">{r.org.name}</td>
      <td className="px-4 py-2">
        {r.lines.map((line, i) => (
          <div key={i}>
            {PAYMENT_METHOD_LABELS[line.paymentMethod]}: {formatMoney(line.amountUsdCents)}
            {line.reference ? ` (${line.reference})` : ""}
          </div>
        ))}
      </td>
      <td className="px-4 py-2 font-medium">{formatMoney(totalUsdCents)}</td>
      <td className="max-w-[200px] truncate px-4 py-2 text-muted-foreground">{r.note ?? "—"}</td>
      <td className="px-4 py-2">
        {r.proofImageDataUrl ? (
          <a href={r.proofImageDataUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            Ver
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
      <td className="px-4 py-2">
        <div className="flex flex-col items-end gap-2">
          <div className="flex justify-end gap-2">
            <Button size="sm" disabled={isPending} onClick={() => onApprove(r.id)}>
              Aprobar
            </Button>
            <Button size="sm" variant="outline" disabled={isRejecting} onClick={() => setRejectOpen((v) => !v)}>
              Rechazar
            </Button>
          </div>
          {rejectOpen ? (
            <div className="flex w-48 flex-col gap-2">
              <Input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Motivo (opcional)" />
              {state ? <FormMessage state={state} /> : null}
              <Button size="sm" variant="destructive" disabled={isRejecting} onClick={handleReject}>
                Confirmar rechazo
              </Button>
            </div>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
