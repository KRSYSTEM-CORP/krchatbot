import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

// PostgreSQL local para desarrollo, sin instalar nada en el sistema. Usa los
// binarios oficiales de Postgres que trae `embedded-postgres` y guarda los
// datos en .postgres/ dentro del proyecto (ignorado por git).
//
//   npm run db:local        arranca y deja corriendo
//   npm run db:local:stop   apaga
//
// Para producción se usa un Postgres de verdad: esto es sólo para levantar el
// entorno en un portátil sin pelearse con Homebrew ni con Docker.

const DATA_DIR = resolve(process.cwd(), ".postgres");
const PORT = 5433;
const USER = "postgres";
const PASSWORD = "postgres";
const DATABASE = "kr_chatbot";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

async function main() {
  const stopping = process.argv.includes("--stop");

  if (stopping) {
    await pg.stop();
    console.log("Postgres detenido.");
    return;
  }

  // initialise() sobre un directorio ya poblado falla, así que sólo se corre
  // la primera vez.
  if (!existsSync(DATA_DIR)) {
    console.log("Inicializando el cluster por primera vez…");
    await pg.initialise();
  }

  await pg.start();

  try {
    await pg.createDatabase(DATABASE);
    console.log(`Base "${DATABASE}" creada.`);
  } catch {
    // Ya existía: es lo normal a partir del segundo arranque.
  }

  const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;
  console.log(`\nPostgres escuchando en el puerto ${PORT}.`);
  console.log(`Pon esto en tu .env:\n`);
  console.log(`  DATABASE_URL="${url}"`);
  console.log(`  DIRECT_URL="${url}"\n`);
  console.log("Ctrl+C para detenerlo.");

  // El proceso se queda vivo para que el cluster siga en pie mientras se
  // trabaja; al salir se cierra ordenadamente.
  const shutdown = async () => {
    console.log("\nDeteniendo Postgres…");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
