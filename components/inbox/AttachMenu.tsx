"use client";

import { useRef, useState } from "react";
import { Paperclip, Image as ImageIcon, FileText, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttachKind = "IMAGE" | "VIDEO" | "DOCUMENT";

// Hoja de opciones del clip: foto/video, documento, ubicación. Los dos
// primeros abren el selector de archivos nativo del sistema operativo (nada
// que construir ahí); el de ubicación abre el LocationPicker desde ChatView.
export function AttachMenu({
  onPickFile,
  onPickLocation,
}: {
  onPickFile: (file: File, kind: AttachKind) => void;
  onPickLocation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  function handleMediaChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    onPickFile(file, file.type.startsWith("video/") ? "VIDEO" : "IMAGE");
    setOpen(false);
  }

  function handleDocumentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    onPickFile(file, "DOCUMENT");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Adjuntar"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Paperclip className="h-5 w-5" />
      </button>

      {open ? (
        <>
          {/* Capa invisible para cerrar el menú al tocar afuera. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "absolute bottom-full left-0 z-20 mb-2 w-48 space-y-1 rounded-lg border border-border bg-card p-1.5 shadow-lg",
            )}
          >
            <button
              type="button"
              onClick={() => mediaInput.current?.click()}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
            >
              <ImageIcon className="h-4 w-4 text-[var(--primary)]" />
              Foto o video
            </button>
            <button
              type="button"
              onClick={() => documentInput.current?.click()}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
            >
              <FileText className="h-4 w-4 text-[var(--warning)]" />
              Documento
            </button>
            <button
              type="button"
              onClick={() => {
                onPickLocation();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
            >
              <MapPin className="h-4 w-4 text-[var(--destructive)]" />
              Ubicación
            </button>
          </div>
        </>
      ) : null}

      <input
        ref={mediaInput}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleMediaChange}
      />
      <input ref={documentInput} type="file" className="hidden" onChange={handleDocumentChange} />
    </div>
  );
}
