# KR ChatBot

Bandeja compartida de WhatsApp con agente de inteligencia artificial, tickets,
automatizaciones y envíos masivos. Parte de la familia KR System.

Se conecta a **números normales de WhatsApp** (incluida la app de WhatsApp
Business) mediante una sesión de WhatsApp Web, no a la API oficial de Meta. Esa
decisión es la que permite todo lo demás:

| Con la API oficial de Meta | Con KR ChatBot |
|---|---|
| Solo chats 1:1 | Chats 1:1 **y grupos** |
| Ventana de 24 horas | Sin restricción de ventana |
| Plantillas aprobadas por Meta | Sin aprobación de plantillas |
| Costo por conversación | Sin costo por mensaje |
| Un número por cuenta | Multi-número en una sola bandeja |

La contrapartida es real y conviene tenerla presente: al ser una sesión no
oficial, **el riesgo de bloqueo del número lo asume quien lo opera**. Lee
[docs/operacion.md](docs/operacion.md) antes de poner un número de producción.

---

## Qué hace

**Bandeja multi-número y multi-agente.** Todos los números conectados llegan a
una sola bandeja. El equipo responde sin tener WhatsApp en su teléfono.

**Etiquetas como permisos.** Un `ADMIN` ve toda la organización; un `MEMBER` ve
sólo los chats que llevan las etiquetas que se le asignaron. Un solo concepto
organiza y autoriza.

**Agente de IA configurable con prompts, no con formularios.** El rol, los
límites, el criterio de activación y las reglas para abrir tickets o avisar a un
compañero se escriben en lenguaje natural y entran tal cual en las instrucciones
del modelo.

**Modo pasivo.** La IA puede analizar cada conversación, abrir tickets y dejar
notas internas **sin escribirle al cliente**. Es la forma de estrenarla en
producción sin arriesgar ninguna relación mientras se comprueba que decide bien.

**Máquina de estados que evita el choque humano/IA.**
`INACTIVE → ACTIVE → THINKING → INACTIVE`, y en cuanto una persona escribe en el
chat, `SNOOZED` durante los minutos configurados.

**Base de conocimiento con auto-entrenamiento.** FAQs escritas a mano más
entradas que la IA redacta cada domingo a partir de lo que el equipo respondió
esa semana. Nada se publica solo si se exige aprobación.

**Tickets y tareas** ligados a la conversación que los originó.

**Reglas deterministas** (disparador → condiciones → acciones, con retraso y
antirrebote) para lo que no debe quedar a criterio: respuesta fuera de horario,
ticket por palabra clave, aviso al vencerse un plazo.

**Envíos masivos** con variables por destinatario, programación recurrente y
control de ritmo.

**Métricas**: volumen, mediana de primera respuesta, porcentaje resuelto por la
IA, tiempo de resolución y carga por miembro.

---

## Puesta en marcha

### 1. Requisitos

- Node 20 o superior
- Postgres 14 o superior — o ninguno: `npm run db:local` levanta uno portable
- [Evolution API](https://github.com/EvolutionAPI/evolution-api) corriendo y
  alcanzable desde esta app
- Una clave de IA (opcional: sin ella todo funciona menos la IA). Puede ser de
  Claude (console.anthropic.com, de pago) o de **Gemini, gratis de verdad**
  (aistudio.google.com/apikey, sin tarjeta, sin vencimiento — 1500
  solicitudes al día en el modelo Flash). Con las dos puestas gana Claude.

### 2. Evolution API

```bash
docker run -d --name evolution -p 8080:8080 -e AUTHENTICATION_API_KEY=pon-aqui-una-clave-larga atendai/evolution-api:latest
```

### 3. La aplicación

```bash
npm install
```

```bash
cp .env.example .env
```

Si no tienes Postgres instalado, el proyecto trae uno portable con los binarios
oficiales — no instala nada en el sistema y guarda los datos en `.postgres/`:

```bash
npm run db:local
```

Déjalo corriendo en su propia terminal; imprime la `DATABASE_URL` que debes
pegar en el `.env`. Para producción usa un Postgres de verdad.

Completa los valores del `.env` y luego, en otra terminal:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

La cuenta del seed es `admin@demo.com` / `demo1234`, y `agente@demo.com` con la
misma clave para ver cómo se siente el acceso limitado por etiqueta.

### 4. El webhook

Evolution tiene que poder alcanzar `APP_URL/api/webhooks/evolution`. En local
eso significa un túnel:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Pon la URL que te devuelva en `APP_URL` y reinicia. Sin esto no entra ningún
mensaje: `localhost` no le sirve al contenedor.

### 5. El cron

Hay un único punto de entrada para todo lo que corre por reloj: vaciar la cola
de salida, despertar chats en pausa, arrancar envíos programados, revisar SLA
vencidos y entrenar los domingos. Llámalo **cada minuto**:

```bash
curl -X POST https://tu-dominio/api/cron -H "Authorization: Bearer $CRON_SECRET"
```

En Vercel, con un `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron", "schedule": "* * * * *" }] }
```

---

## Cómo está armado

```
app/
  (app)/                  Panel, bandeja, tickets, tareas, IA, reglas,
                          envíos, métricas, equipo, números
  api/
    webhooks/evolution/   Entrada de todo lo que pasa en WhatsApp
    cron/                 Todo lo que corre por reloj
lib/
  evolution.ts            Cliente de Evolution API (instancias, QR, envío, grupos)
  inbound.ts              Procesa cada evento: persiste → reglas → IA
  queue.ts                Cola de salida con reintentos y control de ritmo
  ai/
    client.ts             Elige el motor (Claude o Gemini) según la clave puesta
    providers/             Un archivo por motor detrás de la misma interfaz
    agent.ts              Activación, prompt del sistema, bucle de
                          herramientas, marcado de importantes
    knowledge.ts          Recuperación de la base de conocimiento
    tools.ts              Herramientas nativas y a medida
    training.ts           Auto-entrenamiento semanal
  automation/
    engine.ts             Motor de reglas (condiciones anidadas, acciones con retraso)
  actions/                Server actions por dominio
```

El identificador de todo es el **JID nativo de WhatsApp**
(`584121234567@s.whatsapp.net`, `1203…@g.us`), no un id inventado: así un
mensaje entrante siempre encuentra su chat.

---

## Probar el agente sin escribirle a nadie

Ajustar el rol y las restricciones a base de conversaciones reales es caro: te
enteras de que el prompt estaba mal cuando ya le respondió raro a un cliente.
Para eso está el banco de pruebas, que corre el mismo camino que producción
—activación, conocimiento, herramientas— sobre un chat desechable:

```bash
npm run ia:probar
```

Sin argumentos usa una batería de mensajes típicos. Con argumentos prueba los
tuyos:

```bash
npm run ia:probar -- "¿hacen envíos a Maracaibo?" "quiero devolver algo"
```

Muestra, para cada mensaje: si el agente se activa o se queda callado, cuántas
entradas de conocimiento encontró, qué herramientas usó (ticket, nota interna,
escalamiento) y qué respondería. No envía nada.

---

## Orden recomendado para arrancar

1. Conecta un número y escanea el QR. Espera a que sincronice.
2. Crea etiquetas y da de alta al equipo con acceso por etiqueta.
3. Carga la base de conocimiento — empieza por las diez preguntas que más te
   repiten. Sin esto, la IA sólo podrá escalar.
4. Escribe el rol y los límites en **IA › Personalización**.
5. Enciende la IA **en modo pasivo** y déjala unos días. Revisa los tickets y
   las notas que abrió: eso te dice si entendió tu negocio.
6. Cuando sus decisiones te convenzan, activa "Escribirle al cliente" en un solo
   chat primero, con activación manual.
7. Sólo entonces pasa a activación automática.

---

## Documentación

- [docs/analisis-periskope.md](docs/analisis-periskope.md) — análisis del
  sistema de referencia sobre el que se diseñó este producto
- [docs/operacion.md](docs/operacion.md) — calentamiento de números, ritmo de
  envío y qué hacer si una sesión se cae
