import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KR ChatBot — By KR System",
  description:
    "Bandeja compartida de WhatsApp con agente de inteligencia artificial, tickets y automatizaciones.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KR ChatBot",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f3ddb",
  // La bandeja se usa desde el teléfono: sin esto, tocar la caja de escritura
  // en iOS hace zoom y descoloca toda la conversación.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
