"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/misc";
import { submitPaymentReport } from "@/lib/actions/billing";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { PAYMENT_METHODS_REQUIRING_REFERENCE } from "@/lib/validations";
import { resizeImageToDataUrl } from "@/lib/image-utils";
import type { PaymentMethod } from "@prisma/client";
import type { FormState } from "@/lib/validations";

// Sólo esta vía para pagarle a KR System — no todo PaymentMethod que exista
// tiene sentido para una suscripción cobrada a distancia.
const BILLING_PAYMENT_METHODS: PaymentMethod[] = ["BINANCE"];

type ReportLine = { paymentMethod: PaymentMethod; amount: string; reference: string };

const MAX_DIMENSION = 1400;

export function PaymentReportForm() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [lines, setLines] = useState<ReportLine[]>([{ paymentMethod: "BINANCE", amount: "", reference: "" }]);
  const [proofImageDataUrl, setProofImageDataUrl] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<FormState | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateLine(i: number, patch: Partial<ReportLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setState(null);
  }

  function addLine() {
    setLines((prev) => [...prev, { paymentMethod: "BINANCE", amount: "", reference: "" }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, { maxDimension: MAX_DIMENSION, format: "image/jpeg", quality: 0.7 });
      setProofImageDataUrl(dataUrl);
      setImageError(null);
      setState(null);
    } catch {
      setImageError("No se pudo procesar la imagen. Intenta con otra foto.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitPaymentReport({
        lines: lines.map((l) => ({ paymentMethod: l.paymentMethod, amount: l.amount, reference: l.reference })),
        proofImageDataUrl,
        note,
      });
      setState(result);
      if (!result.ok) return;
      setLines([{ paymentMethod: "BINANCE", amount: "", reference: "" }]);
      setProofImageDataUrl("");
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
      {lines.map((line, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-2">
            {BILLING_PAYMENT_METHODS.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={line.paymentMethod === m ? "default" : "outline"}
                onClick={() => updateLine(i, { paymentMethod: m })}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </Button>
            ))}
            {lines.length > 1 ? (
              <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => removeLine(i)}>
                ✕
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`report-amount-${i}`}>Monto (USD)</Label>
              <Input
                id={`report-amount-${i}`}
                type="number"
                step="0.01"
                min="0"
                value={line.amount}
                onChange={(e) => updateLine(i, { amount: e.target.value })}
              />
            </div>
            {(PAYMENT_METHODS_REQUIRING_REFERENCE as readonly string[]).includes(line.paymentMethod) ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`report-reference-${i}`}>Nº de referencia</Label>
                <Input
                  id={`report-reference-${i}`}
                  value={line.reference}
                  onChange={(e) => updateLine(i, { reference: e.target.value })}
                  placeholder="Ej. 001234567"
                />
              </div>
            ) : null}
          </div>
        </div>
      ))}

      <Button type="button" size="sm" variant="outline" onClick={addLine}>
        + Agregar otro pago
      </Button>

      <div className="flex flex-col gap-1.5">
        <Label>Comprobante de pago (obligatorio)</Label>
        <div className="flex items-center gap-3">
          {proofImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proofImageDataUrl} alt="Comprobante" className="h-16 w-16 rounded border border-border object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded border border-border text-center text-xs text-muted-foreground">
              Sin foto
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} required className="text-sm" />
        </div>
        {imageError ? <p className="text-sm text-[var(--destructive)]">{imageError}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-note">Nota (opcional)</Label>
        <Input
          id="report-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setState(null);
          }}
          placeholder="Ej. Pagué el 15 por Binance"
        />
      </div>

      {state ? <FormMessage state={state} /> : null}
      <Button type="submit" disabled={isPending}>
        Reportar pago
      </Button>
    </form>
  );
}
