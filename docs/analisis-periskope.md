# Análisis del sistema Periskope

Fuentes: sitio público `periskope.app` y documentación abierta `docs.periskope.app`
(índice completo en `docs.periskope.app/llms.txt`) + referencia de API pública.
No se accedió a la cuenta privada.

Fecha del análisis: 2026-08-04. Operado por Hashlabs Holdings Inc.

---

## 1. Qué es y en qué se diferencia

Periskope es un **workspace de operaciones sobre WhatsApp** para equipos.
Su decisión fundacional —y toda su ventaja competitiva— es que **NO usa la
WhatsApp Business API (WABA)**. Se conecta a números normales de WhatsApp
vía sesión de WhatsApp Web (escaneo de QR), lo que le permite:

| Plataformas con WABA | Periskope |
|---|---|
| Solo números Business API | Números normales de WhatsApp / WhatsApp Business app |
| Solo chats 1:1 | Chats 1:1 **y grupos** |
| Ventana de 24 h | Sin restricción de ventana |
| Plantillas aprobadas por Meta | Sin aprobación de plantillas |
| Costo por mensaje | Sin costo por mensaje |
| Un número por cuenta | Multi-número (hasta 1000+) |
| Enfocado a marketing | Enfocado a ventas, soporte y operaciones |

Contrapartida (implícita, no la publicitan): al ser sesión no oficial, el riesgo
de baneo lo asume el operador. Lo mitigan con guías de *warm-up* de números y
buenas prácticas de envío.

Compliance declarado: GDPR + ISO/IEC 27001. IA impulsada por modelos Google Gemini.

---

## 2. Jerarquía del modelo de datos

```
Organización (org_id)
 └── Phones (org_phone: "918527184400@c.us")   ← números de WhatsApp conectados
      └── Chats (chat_id)                       ← tipo "user" (1:1) o "group"
           ├── Members (contact_id, is_admin, is_internal, is_super_admin)
           ├── Messages (message_id, ack, from_me, flag_status, has_media…)
           ├── Reactions
           ├── Private Notes (note_id)          ← internas, invisibles al cliente
           ├── Notifications                    ← eventos del chat (alta/baja de miembros…)
           ├── Labels (label_ids)               ← eje de organización Y de permisos
           ├── Custom Properties                ← campos definidos por el workspace
           ├── Tickets (ticket_id)
           └── Tasks (task_id)
 └── Members (usuarios del equipo, por email + rol)
 └── Knowledge Base (FAQs, Documents, Self-Learned, External/MCP)
 └── Automation Rules / Workflows
 └── Webhooks
```

### Objetos clave (campos reales de su API)

**Chat**: `org_id`, `chat_id`, `org_phone`, `chat_name`, `chat_type` (`user`/`group`),
`chat_image`, `members{}`, `label_ids{}`, `labels[]`, `is_muted`, `is_exited`,
`closed_at`, `invite_link`, `custom_properties{}`, `created_at`, `updated_at`.

**Message**: `message_id`, `org_id`, `org_phone`, `from`, `author`, `from_me`,
`body`, `ack` (estado de entrega: enviado/entregado/leído), `has_media`,
`duration`, `device_type`, `forwarding_score`, `broadcast`, `flag_status`.

**Ticket**: ticket + chat asociado + mensajes de contexto + `custom_properties`.
Estado, prioridad, asignado, etiquetas.

**Task**: `task_id`, `title`, `type` (`todo` | `message` | …), `status`,
`priority` (1-3), `assignee`, `created_by`, `due_date`, `remind_at`, `notes`,
`chat_id`, `association{}` (polimórfica según `type`), `completed_metadata{}`.

**Nota de diseño importante**: el identificador de chat/contacto es el propio
JID de WhatsApp (`{numero}@c.us`), no un UUID interno. Todo el sistema está
anclado al identificador nativo de la red.

---

## 3. Estructura de trabajo (los 8 bloques funcionales)

### A. Inbox multi-número / multi-agente
- Varios números conectados a una sola bandeja compartida.
- Todo el equipo responde sin tener WhatsApp en su teléfono.
- Onboarding declarado: <5 min, escaneo de QR y sincronización de chats.
- Estados de teléfono gestionables: conectar, QR, reiniciar, resincronizar,
  resetear (cierra sesión y vuelve a estado QR), eliminar.

### B. Organización de conversaciones
- **Labels**: el eje central. Organizan, filtran **y controlan permisos**.
- **Custom Properties**: campos a medida por chat y por ticket
  (tipos: texto, dropdown, picklist…), con marca de obligatorio y secciones.
- **Quick Replies**: respuestas guardadas.
- **Private Notes**: mensajes internos dentro del chat, invisibles al cliente.
- **Bulk Actions**: seleccionar N chats y etiquetar/archivar/organizar en lote.
- **Saved Chat Lists**: listas nombradas de grupos/contactos, reutilizables.

### C. Equipo, roles y privacidad
- Roles: **Admin** (acceso a todos los chats) y **Member** (acceso solo a chats
  que tengan las etiquetas asignadas). El permiso se modela por etiqueta,
  no por chat — decisión elegante y escalable.
- Invitación por email (múltiples separados por coma), rol y etiquetas de acceso.
- Dropdown por chat que muestra quién tiene acceso.
- **Number Masking**: el agente atiende sin poder ver el teléfono del cliente.
- Disponibilidad del agente (online/offline) para asignación.

### D. Tickets y Tareas
- Ticket desde cualquier mensaje: clic derecho (o long-press en móvil) →
  *Create Ticket*. El texto del mensaje queda capturado automáticamente y el
  ticket permanece ligado al historial completo del chat.
- Campos: título, estado, prioridad, asignado, etiquetas, propiedades custom.
- **Emoji ticketing**: reaccionar con un emoji concreto crea el ticket.
- Tasks: to-dos independientes o asociados a mensaje/chat, con `due_date`,
  `remind_at` y prioridad.
- Sincronización saliente a HubSpot, Freshdesk, Zoho, Slack.

### E. Mensajería masiva (Broadcast)
- Envío a múltiples grupos y 1:1: texto, imagen, video, documento.
- Inmediato o programado; **repetición** diaria/semanal/mensual.
- **Variables por contacto** + plantillas de mensaje reutilizables.
- **Saved chat lists** como destinatarios.
- **Logs**: ver estado, detener broadcast en curso, reintentar fallidos, duplicar.
- **Créditos de broadcast**: cuota mensual + recargas.
- Cola de mensajes real (`queue_id`, jobs, purge, health) — separan
  "mensaje encolado" de "mensaje enviado", con estado `ack` de WhatsApp.

### F. Capa de IA (el núcleo que nos interesa replicar)

Esta es la parte mejor diseñada del producto. Se organiza en un menú **AI** con
seis secciones:

**1. Agent Settings** — panel de control
- Toggle maestro del AI Agent.
- **Identity**: *AI Nickname* mostrado al cliente (transparencia de que es IA).
- **Chat Activation Mode**: `auto-activate en todos los chats` vs
  `activación manual por chat`. Recomiendan empezar en manual.
- Toggles **por chat** en la pestaña Settings del chat: `Allow AI Flagging`
  y `Allow AI Agent` (independientes del global).
- **Operational settings**: números permitidos (whitelist), *response delay*,
  *snooze duration*.

**2. Personalization** — cuatro campos
- *Agent Role and Instructions* → es literalmente el **system prompt**
  (quién es, qué hace la empresa, tono, estructura del equipo para derivar).
- *Restrictions* → límites duros ("no puedes procesar reembolsos", "no
  prometas fechas de entrega").
- *Personality Type* → estilo de comunicación.
- *Activation Prompt* → qué mensajes disparan la IA. **Aditivo**: las reglas
  custom se suman a las base, no las reemplazan.

**3. Knowledge Base** — RAG
- Una sola lista con pestañas: **All / FAQ / Self-Learned / Documents /
  External Sources (MCP)**.
- Filtros de estado: All / Active / Inactive / **Needs Review** (con contador).
- FAQ = `Question` (con **múltiples variaciones de la misma pregunta**,
  clave para el matching) + `Answer` (+ adjunto opcional) + `Instructions`
  (guía de comportamiento específica de esa FAQ).
- Documents: PDF → *chunking* → embeddings (su API expone
  `create-document` con troceado explícito y `update-faq` "regenerates embedding").
- Acciones en lote: activar / desactivar / eliminar.

**4. Self-Training** — aprendizaje continuo
- Corre **cada domingo**: revisa chats resueltos de la semana, extrae las
  respuestas que dio el equipo humano y **redacta FAQs nuevas**.
- `Self Learned Context Requires Review`: auto-activar vs revisión manual.
- Historial de corridas: semana, estado (Queued / In progress / Dispatched /
  Failed / Complete), FAQs aprendidas, disparador (Scheduled / Manual).
- Botón *Run training* para procesar una semana concreta a demanda.

**5. Built-in Tools** — acciones nativas, cada una con toggle
- `AI Training` (aprender de respuestas del equipo).
- `Allow AI to Send Messages` — si está OFF, la IA opera en **modo pasivo**:
  procesa, crea notas y tickets, pero no habla con el cliente. Excelente idea
  para la fase de rodaje.
- `Allow AI to Create Tickets` — con reglas escritas **en lenguaje natural**
  en un textarea ("crea ticket cuando: 1) el cliente reporta entrega dañada…").
- `Allow AI to Create Private Notes` — con reglas de a quién taggear
  ("si es sobre automatizaciones, tagea a @fulano").

**6. Custom Tools** — function calling sobre APIs propias
- Nombre en `snake_case` (`get_order_status`), descripción (la IA decide por
  ella), método GET/POST, endpoint HTTPS.
- Auth: No Auth / Bearer Token / API Key / Basic Auth.
- Headers estáticos, parámetros y *response schema* opcional.
- Toggle activo/inactivo por herramienta.

**Máquina de estados del agente** (crítica para replicar):
`INACTIVE` → `ACTIVE` → `THINKING` → `SNOOZED`
- INACTIVE: habilitado, monitoreando, esperando mensaje que cumpla criterios.
- ACTIVE: responderá al próximo mensaje externo.
- THINKING: procesando y preparando respuesta.
- SNOOZED: un humano intervino → se apaga temporalmente y reactiva tras el
  *snooze duration*.

El agente muestra un botón ✨ en la caja de chat con el indicador de estado;
al pulsarlo el humano **toma el control** de la conversación.

**Flujo típico de escalamiento**: cliente pregunta → IA responde con KB →
detecta que requiere humano → crea ticket → crea nota privada taggeando al
responsable → informa al cliente que fue escalado. Todo autónomo.

**Otras funciones de IA**:
- *AI Flagging*: marca mensajes importantes con prompts custom (independiente
  del agente; sirve para métricas de tiempo de respuesta).
- *AI Summaries*: resumen de conversación + redacción de respuesta contextual.
- *Polish & Translate*: pulir la respuesta del agente humano y traducir.
- *AI Dictate*: dictado por voz.
- *MCP server hospedado*: conecta cualquier asistente externo a WhatsApp.

### G. Automatización determinista (Rules / Workflows)
Modelo clásico de tres piezas:

**Triggers**: nuevo chat creado · etiqueta añadida/quitada en chat · reacción
añadida · nuevo mensaje recibido (con filtro externo/interno) · mensaje
editado · mensaje flagged/unflagged · mensaje eliminado. Todos filtrables por
lista de `Org Phones`.

**Conditions**: combinaciones lógicas AND/OR, anidables hasta profundidad 2.

**Actions** (12, cada una con **delay** configurable):
Send Message · Forward Message · Flag · Unflag · Delete Message ·
Create Ticket · Assign Ticket · Close Ticket · Add Ticket Label ·
Add Chat Label · Assign Chat · Send Email.

Detalles de la acción *Send Message*: destino (chat concreto o "trigger chat"),
cuerpo con **variables tipo Handlebars con fallback**
(`{{ chat.chat_name || 'cliente' }}`), media adjunta, y **debounce por chat**
con periodo configurable para no spamear.

Recetas documentadas: ticketing automático, respuestas automáticas,
auto-asignación, escalamiento, flagging, notificaciones, ticket por
incumplimiento de SLA, tickets desde palabras clave.

### H. Analítica, API e integraciones
- Dashboard: All Chats · Unread · Flagged · Tickets abiertos/en progreso ·
  Miembros online. Más panel de *Connected Phones* con estado y acciones.
- Analytics en 3 secciones. Métricas de mensajes: chats activos, salientes,
  entrantes, flagged, **mediana de primer tiempo de respuesta**; gráfico
  temporal; y tabla **por miembro del equipo**.
- Métricas de tickets (con exportación) y de equipo.
- Exportaciones: chats, mensajes, tickets, miembros de grupo, atributos de
  contacto, archivos, uso del equipo + logs de auditoría de acciones.
- **API REST completa** (auth por API key + header `x-phone` para seleccionar
  el número) y **SDK de TypeScript**.
- **Webhooks** (~18 eventos): `message.created`, `message.updated`,
  `message.deleted`, `message.ack.updated`, `message.flagged`,
  `message.unflagged`, `message.ticket.attached`, `chat.created`,
  `chat.custom-properties.updated`, `chat.notification.created`,
  `note.created`, `reaction.created`, `reaction.updated`,
  `ticket.created`, `ticket.updated`, `ticket.deleted`,
  `org.phone.connected`, `org.phone.disconnected`, `org.phone.qr`,
  `org.phone.updated`.
- Integraciones nativas: HubSpot, Zoho CRM, Zoho Desk, Freshdesk,
  Google Sheets, Zapier.

---

## 4. Lecciones de diseño a llevarnos

1. **Todo cuelga del número (`org_phone`), no del usuario.** El multi-número es
   estructural, no un añadido.
2. **Las etiquetas son el sistema de permisos.** Un solo concepto sirve para
   organizar y para autorizar. Menos entidades, más potencia.
3. **La IA se configura con prompts, no con formularios rígidos.** Reglas de
   ticketing, de notas privadas y de activación son todas texto libre que se
   inyecta al modelo. Muy flexible y muy barato de construir.
4. **El modo pasivo es la mejor idea del producto.** Permite desplegar la IA
   sin riesgo: trabaja para el equipo antes de hablarle al cliente.
5. **La máquina de estados con SNOOZE resuelve el conflicto humano/IA.** En
   cuanto un humano escribe, la IA se calla por N minutos.
6. **Separan encolado de envío.** Cola con `queue_id` + `ack` de WhatsApp =
   entregas confiables y reintentos.
7. **El self-training cierra el ciclo.** Las respuestas humanas de esta semana
   son la base de conocimiento de la próxima.
8. **Nota privada + ticket = escalamiento completo.** No hace falta más.
9. **Variables con fallback y debounce** en los envíos automáticos: detalles
   pequeños que evitan desastres en producción.
10. **Transparencia de IA**: el *AI Nickname* visible es requisito, no adorno
    (tienen incluso una página pública de "AI Transparency").
