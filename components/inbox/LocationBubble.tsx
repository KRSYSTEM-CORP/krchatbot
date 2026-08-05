import { MapPin, ExternalLink } from "lucide-react";

// Vista previa de una burbuja de ubicación: una sola tesela de OpenStreetMap
// (una imagen <img>, sin JavaScript de mapas) con un pin superpuesto en la
// posición exacta dentro de esa tesela. Cargar un Leaflet completo por cada
// burbuja de un hilo largo sería carísimo; una tesela estática cuesta lo
// mismo que cualquier otra imagen.

const ZOOM = 15;
const TILE_SIZE = 256;

function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

export function LocationBubble({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label?: string | null;
}) {
  const xFloat = lonToTileX(longitude, ZOOM);
  const yFloat = latToTileY(latitude, ZOOM);
  const tileX = Math.floor(xFloat);
  const tileY = Math.floor(yFloat);
  const pinLeft = (xFloat - tileX) * TILE_SIZE;
  const pinTop = (yFloat - tileY) * TILE_SIZE;

  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noreferrer"
      className="block w-56 overflow-hidden rounded-lg border border-border"
    >
      <div className="relative h-40 w-56 overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- una sola tesela remota de OSM, no vale la pena el pipeline de next/image para esto */}
        <img
          src={`https://tile.openstreetmap.org/${ZOOM}/${tileX}/${tileY}.png`}
          alt="Mapa de la ubicación"
          width={TILE_SIZE}
          height={TILE_SIZE}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
        <MapPin
          className="absolute h-7 w-7 -translate-x-1/2 -translate-y-full fill-[var(--destructive)] text-[var(--destructive)] drop-shadow"
          style={{
            left: `calc(50% - ${TILE_SIZE / 2 - pinLeft}px)`,
            top: `calc(50% - ${TILE_SIZE / 2 - pinTop}px)`,
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 bg-card px-2.5 py-1.5">
        <span className="truncate text-xs font-medium">{label || "Ubicación"}</span>
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
      </div>
    </a>
  );
}
