import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deja a Prisma Client fuera del bundle de las funciones serverless: es un
  // paquete pensado para resolverse como dependencia real en tiempo de
  // ejecución, no para que el trazador de Next lo inline.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
