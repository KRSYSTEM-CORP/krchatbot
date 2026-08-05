import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt del propio Node en vez de bcrypt: una dependencia nativa menos que
// compilar en el despliegue, y los parámetros por defecto de Node ya son
// razonables para contraseñas de un panel interno.
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, derived] = stored.split(":");
  if (!salt || !derived) return false;
  const candidate = scryptSync(plain, salt, KEY_LENGTH);
  const expected = Buffer.from(derived, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
