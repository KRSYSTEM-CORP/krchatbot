import "server-only";
import { Resend } from "resend";

// Sin RESEND_API_KEY (por ejemplo en desarrollo local) esto no falla: sólo
// deja el correo en consola, para poder probar el flujo completo de
// recuperación de contraseña sin cuenta de Resend. Mismo patrón que KYRA
// CITAS y APP NEW.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL || "KR ChatBot <noreply@krsystem-corp.com>";
const APP_URL = (process.env.APP_URL || "https://krchatbot.krsystem-corp.com").replace(/\/$/, "");

async function send(to: string, subject: string, html: string): Promise<boolean> {
  if (!resend) {
    console.log(`[email] RESEND_API_KEY no configurada — se enviaría a ${to}: ${subject}\n${html}`);
    return true;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    return true;
  } catch (error) {
    console.error(`[email] falló el envío a ${to}:`, error);
    return false;
  }
}

function wrapper(inner: string): string {
  return `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    ${inner}
    <p style="color:#888;font-size:12px;margin-top:32px;">KR ChatBot — By KR System</p>
  </div>`;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password/${token}`;
  await send(
    to,
    "Recupera tu contraseña — KR ChatBot",
    wrapper(`
      <h2>Recupera tu contraseña</h2>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en KR ChatBot.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;background:#4f3ddb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
          Crear nueva contraseña
        </a>
      </p>
      <p>Este enlace vence en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.</p>
    `),
  );
}
