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

## Disparador del cron cada minuto (Cloudflare Worker)

- **Por qué existe**: `/api/cron` (drena la cola de mensajes salientes,
  despierta chats en snooze vencido, arranca envíos programados — ver
  `app/api/cron/route.ts`) necesita correr cada minuto, pero el plan de
  Vercel en uso sólo permite cron nativo una vez al día. Sin este disparador,
  un mensaje encolado por la IA se queda esperando hasta que alguien haga
  otra acción en la bandeja por coincidencia — se confirmó en producción un
  promedio real de 114s (hasta 183s) antes de que esto existiera.
- **Dónde**: Cloudflare Worker `krchatbot-drain-queue`, misma cuenta que R2
  (`04ecc0dde2eb8b4d4782f0b05d8cf541`), con un Cron Trigger `* * * * *`.
  Se probó primero con GitHub Actions (`schedule: "* * * * *"`), pero
  GitHub despriorizó el evento en la práctica hasta disparar cada ~1-1.5h en
  vez de cada minuto — problema documentado de la plataforma, no de la
  configuración. Cloudflare Cron Triggers sí cumplen el minuto.
- **Qué hace**: un `scheduled()` handler que llama a
  `POST https://krchatbot.krsystem-corp.com/api/cron` con
  `Authorization: Bearer <CRON_SECRET>`. El secreto vive como Worker Secret
  (`wrangler secret` / API, no en el código) y por separado como variable de
  entorno `CRON_SECRET` en Vercel — deben coincidir; si se rota uno hay que
  rotar el otro.
- **Para editarlo**: no hay `wrangler.toml` en este repo (se desplegó vía
  API directamente, sin ese archivo) — el script vive sólo en el dashboard
  de Cloudflare (Workers & Pages → `krchatbot-drain-queue`). Para cambios
  futuros, lo más simple es editar ahí directamente o recrear el Worker
  desde cero con la API si hace falta versionarlo.

## Base de datos y la app en sí

Ver el resto de `docs/` — `facturacion.md` cubre el modelo de cobro,
`operacion.md` cubre cómo comportarse con los números de WhatsApp para no
que los bloqueen. La base de datos de producción es Neon (Postgres), la app
misma corre en Vercel.
