"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Grabador de notas de voz. No replica el gesto exacto de WhatsApp (mantener
// presionado y deslizar para cancelar) — eso exige manejar arrastre táctil y
// distinguir un clic corto de un gesto de cancelación, complejidad que no
// paga por sí sola cuando "tocar para empezar, tocar para terminar" graba
// exactamente el mismo audio con exactamente los mismos controles (enviar o
// descartar) al terminar.

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({
  onSend,
}: {
  onSend: (blob: Blob, durationSeconds: number) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      intervalRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
    } catch {
      setError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  }

  function stop(send: boolean) {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    recorder.addEventListener(
      "stop",
      () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        if (send && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          onSend(blob, Math.max(1, durationSeconds));
        }
      },
      { once: true },
    );

    recorder.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  if (error) {
    return <p className="text-xs text-[var(--destructive)]">{error}</p>;
  }

  if (!recording) {
    return (
      <button
        type="button"
        onClick={start}
        title="Grabar nota de voz"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Mic className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
      <span className={cn("h-2 w-2 rounded-full bg-[var(--destructive)]", "animate-pulse")} />
      <span className="min-w-9 text-xs tabular-nums text-muted-foreground">
        {formatDuration(elapsedMs)}
      </span>
      <button
        type="button"
        onClick={() => stop(false)}
        title="Descartar"
        className="text-muted-foreground hover:text-[var(--destructive)]"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => stop(true)}
        title="Enviar nota de voz"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <Square className="h-3 w-3" />
      </button>
    </div>
  );
}
