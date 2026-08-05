"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { X, Crosshair, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

// Selector de ubicación con Leaflet + teselas de OpenStreetMap — gratis, sin
// clave de API. Se usa Leaflet directo (sin react-leaflet) para no depender
// de que esa librería ya soporte esta versión de React; un par de efectos
// bastan para lo que hace falta aquí: mostrar un mapa y soltar un pin.

const DEFAULT_CENTER: [number, number] = [10.4806, -66.9036]; // Caracas

export function LocationPicker({
  onCancel,
  onSend,
}: {
  onCancel: () => void;
  onSend: (point: { latitude: number; longitude: number; label: string }) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  // `any` deliberado: el tipo real es el módulo de Leaflet, que sólo existe
  // en el navegador — tiparlo obligaría a importar sus tipos también en el
  // servidor, donde nunca se ejecuta este componente.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMap = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marker = useRef<any>(null);

  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [label, setLabel] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || leafletMap.current) return;

      // Los íconos por defecto de Leaflet apuntan a rutas relativas que se
      // rompen al empaquetar con Next — se reemplazan por SVG en línea.
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#4f3ddb;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      });

      const map = L.map(mapRef.current).setView(DEFAULT_CENTER, 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = event.latlng;
        setPoint({ latitude: lat, longitude: lng });
        if (marker.current) marker.current.setLatLng([lat, lng]);
        else marker.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);

        marker.current.on("dragend", () => {
          const pos = marker.current.getLatLng();
          setPoint({ latitude: pos.lat, longitude: pos.lng });
        });
      });

      leafletMap.current = map;
    });

    return () => {
      cancelled = true;
      leafletMap.current?.remove();
      leafletMap.current = null;
    };
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setPoint({ latitude, longitude });
        setLocating(false);
        if (leafletMap.current) {
          leafletMap.current.setView([latitude, longitude], 15);
          import("leaflet").then((L) => {
            if (marker.current) marker.current.setLatLng([latitude, longitude]);
            else marker.current = L.marker([latitude, longitude]).addTo(leafletMap.current);
          });
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="flex h-full w-full flex-col overflow-hidden bg-card sm:h-[520px] sm:max-w-lg sm:rounded-xl sm:border sm:border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-medium">Compartir ubicación</p>
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={mapRef} className="min-h-0 flex-1" />

        <div className="space-y-2 border-t border-border p-3">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex items-center gap-2 text-sm text-primary hover:underline disabled:opacity-50"
          >
            <Crosshair className="h-4 w-4" />
            {locating ? "Buscando tu ubicación…" : "Usar mi ubicación actual"}
          </button>

          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Nombre del lugar (opcional)"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />

          <p className="text-xs text-muted-foreground">
            {point
              ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
              : "Toca el mapa para soltar un pin, o usa tu ubicación actual."}
          </p>

          <Button
            type="button"
            className="w-full"
            disabled={!point}
            onClick={() => point && onSend({ ...point, label })}
          >
            <Send className="h-4 w-4" />
            Enviar ubicación
          </Button>
        </div>
      </div>
    </div>
  );
}
