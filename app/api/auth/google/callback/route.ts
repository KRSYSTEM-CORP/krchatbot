import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForProfile } from "@/lib/google-oauth";
import { setSessionCookie } from "@/lib/session";
import { createOrgWithOwner } from "@/lib/org-provisioning";

// El otro extremo de /api/auth/google/start. Tres casos, en orden:
//
//  1. Ya existe un usuario con este googleId → es alguien que ya entró antes
//     por Google. Se actualiza el avatar por si cambió y se firma sesión.
//  2. Existe un usuario con este correo pero sin googleId → se creó por
//     correo/clave. Se vincula la cuenta de Google a ese mismo usuario en vez
//     de crear un duplicado — es la misma persona con el mismo correo.
//  3. No existe nadie → alta completamente nueva: se crea la organización y
//     el usuario ADMIN en el mismo gesto, sin pedir contraseña ni nada más.
//     Esto es lo que hace que el registro sea "completamente automatizado".

export const dynamic = "force-dynamic";

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  const response = NextResponse.redirect(url);
  response.cookies.delete("google_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;

  if (params.get("error")) {
    // El usuario canceló el consentimiento en la pantalla de Google — no es
    // un error del sistema, sólo se vuelve al login sin romper nada.
    return redirectWithError(request, "google_cancelado");
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, "google_estado_invalido");
  }

  let profile: Awaited<ReturnType<typeof exchangeCodeForProfile>>;
  try {
    profile = await exchangeCodeForProfile(code);
  } catch (error) {
    console.error("[google oauth]", error);
    return redirectWithError(request, "google_fallo");
  }

  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: profile.sub },
    include: { org: { select: { name: true } } },
  });

  const target =
    byGoogleId ??
    (await prisma.user.findFirst({
      where: { email: profile.email },
      include: { org: { select: { name: true } } },
    }));

  if (target) {
    if (target.status !== "ACTIVE") return redirectWithError(request, "cuenta_suspendida");

    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        googleId: profile.sub,
        avatarUrl: profile.picture ?? target.avatarUrl,
        lastSeenAt: new Date(),
      },
      include: { org: { select: { name: true } } },
    });

    await setSessionCookie({ uid: user.id, oid: user.orgId, orgName: user.org.name });
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("google_oauth_state");
    return response;
  }

  // Alta nueva. El nombre de la organización se puede cambiar después desde
  // Equipo — lo que importa aquí es no interponer un formulario más entre el
  // clic en "Continuar con Google" y quedar adentro.
  const displayName = profile.name?.trim() || profile.email.split("@")[0];
  const org = await createOrgWithOwner(`Negocio de ${displayName}`, {
    name: displayName,
    email: profile.email,
    googleId: profile.sub,
    avatarUrl: profile.picture,
  });

  const user = org.users[0];
  await setSessionCookie({ uid: user.id, oid: org.id, orgName: org.name });
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("google_oauth_state");
  return response;
}
