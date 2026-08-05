# Facturación con Chargebee

## Cómo funciona el bloqueo

Una organización nunca queda bloqueada por sorpresa. El estado vive en
`Org.billingStatus` y la regla exacta está en `isBillingBlocked()`
(`lib/session.ts`):

| Estado | Bloquea cuando |
|---|---|
| `TRIALING` | `trialEndsAt` está puesto y ya pasó. Si `trialEndsAt` es `null` (la org nunca pasó por el checkout de Chargebee, o Chargebee ni siquiera está configurado en este despliegue), **nunca bloquea** — es el estado por defecto de toda organización nueva. |
| `ACTIVE` | Nunca. |
| `PAST_DUE` | Han pasado más de 7 días desde que entró en este estado (`pastDueSince`) — el período de gracia ante un cobro que falló una vez. |
| `CANCELLED` | Siempre. |

`requireSession()` (usada por casi toda página autenticada) redirige a
`/facturacion` cuando `billingBlocked` es `true`. Esa página se lee con
`getSession()`, no con `requireSession()`, para no crear un ciclo de
redirecciones sobre sí misma.

## Configurar Chargebee

1. Crea una cuenta en [chargebee.com](https://chargebee.com) (empieza en
   modo prueba, sin costo).
2. **Product Catalog 2.0** → crea un producto y sus "Item Prices" — uno por
   plan. Chargebee arma el id solo, como `basic-monthly-USD-Monthly` (el
   "Plan ID" que escribiste + moneda + frecuencia) — cópialo del detalle del
   precio, no lo que escribiste en el formulario. Va en
   `CHARGEBEE_PLAN_BASIC`, `CHARGEBEE_PLAN_PREMIUM`, `CHARGEBEE_PLAN_PRO`.
3. **Settings → Custom Fields → Customer** → crea un campo `cf_org_id` (tipo
   texto). Es cómo el webhook ubica a qué organización de esta app
   corresponde el evento antes de que exista un `chargebeeCustomerId`
   guardado.
4. **Settings → API Keys** → copia la clave a `CHARGEBEE_API_KEY`, y el
   subdominio de tu cuenta (`tuempresa` en `tuempresa.chargebee.com`) a
   `CHARGEBEE_SITE`.
5. **Settings → Webhooks** → nueva URL apuntando a
   `https://tu-dominio/api/webhooks/chargebee`, autenticación HTTP Basic —
   el usuario y clave que definas van en `CHARGEBEE_WEBHOOK_USER` y
   `CHARGEBEE_WEBHOOK_PASSWORD`.

Sin estas variables puestas, `/facturacion` lo dice explícitamente y **no
bloquea a nadie** — es el estado en el que arranca este proyecto.

## Los planes

Se crean a mano en el panel de Chargebee (el precio no vive en el código):

- **Basic** — $30/mes. 1 número de WhatsApp, 3 agentes, IA incluida.
- **Premium** — $75/mes. 5 números, agentes ilimitados, automatizaciones y
  envíos masivos incluidos.
- **Pro** — $150/mes. Números ilimitados, clave de IA propia por
  organización, soporte prioritario.

14 días de prueba gratis (se configura en el propio "Item Price" de
Chargebee) antes de pedir tarjeta.

## Qué NO hace todavía este código

Los límites de cada plan (1 número vs. 5, agentes ilimitados o no) **no se
hacen cumplir en la aplicación** — Chargebee sabe qué plan tiene cada quien,
pero nada en KR ChatBot todavía revisa "¿esta org ya tiene 2 números y su
plan Basic sólo permite 1?" antes de dejar conectar un número más. Eso es
trabajo aparte, deliberadamente fuera de esta fase: la facturación automática
en sí (cobrar, avisar cuando falla, bloquear cuando corresponde) es lo que se
pidió resolver primero.
