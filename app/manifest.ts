import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KR ChatBot - By KR System",
    short_name: "KR ChatBot",
    description:
      "Bandeja compartida de WhatsApp con agente de inteligencia artificial — KR ChatBot",
    start_url: "/inbox",
    display: "standalone",
    background_color: "#f7f8fb",
    theme_color: "#4f3ddb",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Accesos directos desde el ícono de la app: en el teléfono, lo que se
    // quiere abrir es una bandeja o un ticket, no el panel de configuración.
    shortcuts: [
      { name: "Bandeja", url: "/inbox" },
      { name: "Tickets", url: "/tickets" },
    ],
  };
}
