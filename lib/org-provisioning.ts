import "server-only";
import { prisma } from "@/lib/prisma";

// Alta de una organización nueva con su primer usuario (ADMIN). La usan tanto
// el signup manual (lib/actions/auth.ts) como el callback de Google
// (app/api/auth/google/callback/route.ts) — es la misma organización con la
// misma configuración de IA por defecto sin importar cómo entró el dueño.
//
// No lleva "use server": un archivo con esa directiva sólo puede exportar
// funciones async que se vuelven, cada una, un endpoint de acción invocable
// — este helper es una pieza interna, no algo que el cliente deba poder
// llamar directamente.

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function uniqueSlugFor(orgName: string): Promise<string> {
  let slug = slugify(orgName) || "negocio";
  if (await prisma.org.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return slug;
}

export type NewOwner = {
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  avatarUrl?: string;
};

export async function createOrgWithOwner(orgName: string, owner: NewOwner) {
  const slug = await uniqueSlugFor(orgName);

  return prisma.org.create({
    data: {
      name: orgName,
      slug,
      // El agente nace apagado y en modo pasivo. Encenderlo es una decisión
      // explícita que se toma después de cargar la base de conocimiento.
      agentSettings: {
        create: {
          nickname: "Asistente",
          rolePrompt: `Eres el asistente de ${orgName}. Atiendes a los clientes por WhatsApp con amabilidad y precisión.`,
        },
      },
      users: {
        create: {
          name: owner.name,
          email: owner.email,
          passwordHash: owner.passwordHash,
          googleId: owner.googleId,
          avatarUrl: owner.avatarUrl,
          role: "ADMIN",
        },
      },
    },
    include: { users: true },
  });
}
