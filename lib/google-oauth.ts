import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

// OAuth de Google, código de autorización, sin ningún SDK pesado — sólo
// `fetch` contra los endpoints públicos de Google y `jose` para verificar la
// firma del id_token contra sus claves públicas (JWKS). Encaja con el resto
// del sistema de sesión propio (lib/session.ts, HMAC en cookie) en vez de
// traer next-auth y duplicar un segundo modelo de sesión en paralelo.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("Falta GOOGLE_CLIENT_ID (ver .env.example)");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("Falta GOOGLE_CLIENT_SECRET (ver .env.example)");
  return secret;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/auth/google/callback`;
}

// El "state" no es solo protección CSRF: también carga el modo (signup vs
// login normal no distinguen nada hoy, pero sí importa poder extender esto
// sin cambiar el contrato de la URL). Va firmado en la propia cookie de
// state, no en el valor — el valor es aleatorio y no se puede falsificar
// porque hay que conocerlo para que la cookie y el parámetro coincidan.
export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Pide siempre el consentimiento de cuenta más simple; sin esto Google a
    // veces auto-selecciona la última cuenta usada, lo cual sorprende a
    // alguien que tiene varias cuentas de Google abiertas en el navegador.
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google rechazó el código de autorización: ${await response.text()}`);
  }

  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Google no devolvió id_token");

  // Verificar la firma (y el emisor/audiencia) es lo que impide que un
  // id_token cualquiera, armado a mano, se haga pasar por una respuesta real
  // de Google.
  const { payload } = await jwtVerify(tokens.id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId(),
  });

  const profile = payload as unknown as GoogleProfile;
  if (!profile.email || !profile.email_verified) {
    throw new Error("La cuenta de Google no tiene un correo verificado");
  }
  return profile;
}
