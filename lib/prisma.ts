import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL ?? "";

// Cloudflare Workers no tiene sockets TCP normales, así que Neon en
// producción usa su driver HTTP/WebSocket (adapter-neon). En local seguimos
// contra el Postgres embebido de esta Mac por TCP normal (adapter-pg), donde
// sí corre bajo Node de verdad (`next dev`/`next start`), nunca en el Worker.
const adapter = connectionString.includes("neon.tech")
  ? new PrismaNeon({ connectionString })
  : new PrismaPg({ connectionString });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
