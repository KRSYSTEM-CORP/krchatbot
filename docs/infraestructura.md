# Dónde vive cada pieza

KR ChatBot no corre entero en un solo lugar — Vercel no puede sostener una
sesión de WhatsApp Web persistente (es serverless, mata el proceso entre
requests), así que Evolution API vive aparte, en un servidor propio.

## Evolution API (sesión de WhatsApp)

- **Dónde**: VPS en Vultr, Miami — `krchatbot-evolution`, IP `45.77.165.11`.
  Pagado con cripto vía BitPay (Zinli/Venezuela no pasa por Stripe, que es lo
  que usan Vercel y la mayoría de los VPS tradicionales — ver el hilo sobre
  esto si hace falta el porqué completo).
- **Cómo se entra**: `ssh -i ~/.ssh/kr_chatbot_evolution root@45.77.165.11`.
  El login por contraseña está desactivado — sólo entra quien tenga esa
  llave privada. La llave vive únicamente en esta Mac
  (`~/.ssh/kr_chatbot_evolution`), no está en el repo.
- **Qué corre ahí**: `docker compose` en `/opt/evolution/docker-compose.yml`
  — tres contenedores: `evolution-api` (imagen `evoapicloud/evolution-api`,
  el proyecto renombró su imagen de Docker Hub, ya no es `atendai/*`),
  `postgres` (persiste las instancias y el historial de Evolution) y `redis`
  (caché). El puerto 8080 queda expuesto directo a internet — Evolution
  protege ese puerto con su propia `apikey`, no hace falta nada más encima.
- **Para actualizar la imagen**: `cd /opt/evolution && docker compose pull
  && docker compose up -d`.
- **Para ver logs**: `cd /opt/evolution && docker compose logs evolution-api
  -f`.
- **Variables relacionadas en `.env`**: `EVOLUTION_URL` (apunta a esta IP),
  `EVOLUTION_API_KEY` (la `apikey` que configuramos en
  `AUTHENTICATION_API_KEY` del contenedor), `EVOLUTION_WEBHOOK_SECRET` (lo
  genera esta app, Evolution sólo lo reenvía en la cabecera
  `x-webhook-secret` de cada evento — ver `lib/evolution.ts`).

## Almacenamiento (fotos, videos, notas de voz, documentos)

- **Dónde**: Cloudflare R2, bucket `krchatbot-media`, cuenta
  `04ecc0dde2eb8b4d4782f0b05d8cf541`.
- **Acceso público**: vía su URL `r2.dev` (`R2_PUBLIC_URL` en `.env`) — no
  hay dominio propio conectado todavía. Si más adelante se quiere sacar de
  `r2.dev` (por ejemplo `media.krchatbot.krsystem-corp.com`), se conecta un
  dominio personalizado al bucket desde el dashboard de R2.
- **Llave de acceso**: creada a mano desde el dashboard (R2 → Manage API
  Tokens → Create Account API Token) — la API de Cloudflare no deja crear
  esta llave con un token de cuenta normal, es una acción que exige entrar
  al dashboard.

## Base de datos y la app en sí

Ver el resto de `docs/` — `facturacion.md` cubre el modelo de cobro,
`operacion.md` cubre cómo comportarse con los números de WhatsApp para no
que los bloqueen. La base de datos de producción es Neon (Postgres), la app
misma corre en Vercel.
