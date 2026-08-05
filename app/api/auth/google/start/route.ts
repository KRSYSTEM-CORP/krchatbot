import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { googleAuthUrl, googleOAuthConfigured } from "@/lib/google-oauth";

// Punto de entrada de "Continuar con Google". El state va en una cookie
// httpOnly de corta vida y, al volver, el callback exige que el parámetro
// `state` de la URL coincida con ella — es la defensa estándar contra que
// alguien arme un enlace de callback falso y lo mande a otra persona.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!googleOAuthConfigured()) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "google_no_configurado");
    return NextResponse.redirect(url);
  }

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(googleAuthUrl(state));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
