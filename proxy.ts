import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Interruptor general: la app entera queda apagada al público (incluyendo
// sesiones ya iniciadas — el punto no es "que nadie entre de nuevo", es que
// nadie pueda operar el sistema mientras está en desarrollo). Se redirige
// todo a /en-mantenimiento, que no tiene ningún enlace hacia el resto de la
// app. Las rutas de /api quedan afuera a propósito: el webhook de Evolution y
// el cron de la cola siguen corriendo por dentro aunque nadie pueda usar la
// interfaz — apagarlos no aporta nada y sólo generaría reintentos fallidos
// del lado de Evolution.
//
// Para reactivar la app: borrar este archivo (o el bloque `if` de abajo).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/en-mantenimiento") return NextResponse.next();

  return NextResponse.redirect(new URL("/en-mantenimiento", request.url));
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icon-192.png|manifest.webmanifest).*)",
  ],
};
