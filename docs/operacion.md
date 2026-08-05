# Operar números de WhatsApp sin que te los bloqueen

KR ChatBot trabaja sobre una sesión de WhatsApp Web, igual que si tuvieras el
número abierto en una laptop. Eso es lo que da los grupos, la ausencia de
ventana de 24 horas y el costo cero por mensaje — y también lo que hace que el
comportamiento del número importe. Meta no publica sus umbrales, pero el patrón
que dispara bloqueos es conocido y evitable.

Este documento es la parte del sistema que no está en el código.

---

## 1. Calentar un número antes de usarlo

Un número recién creado que empieza a mandar cientos de mensajes es el caso
más claro de bloqueo. Si el número es nuevo:

- **Semana 1**: úsalo a mano desde el teléfono. Conversaciones normales, pocas
  al día. Que reciba tantos mensajes como envía.
- **Semana 2**: conéctalo a KR ChatBot, pero sólo para responder lo que entra.
  Nada de envíos masivos.
- **Semana 3 en adelante**: envíos, empezando por listas de decenas, no de
  cientos.

Un número que ya lleva meses en uso real con clientes no necesita esto.

## 2. El ritmo de envío es el control más importante

El campo **Segundos entre mensajes** de cada envío existe por esto. Referencias:

| Tamaño de la lista | Segundos entre mensajes |
|---|---|
| Hasta 50 | 8 |
| 50 a 200 | 12 a 15 |
| Más de 200 | 20 o más, y parte la lista en varios días |

El sistema escalona la cola por ti: si pones 8 segundos, el destinatario 100
sale 13 minutos después del primero. Bajarlo a 3 no hace el envío tres veces
más útil; hace el número tres veces más sospechoso.

## 3. Lo que más pesa no es el volumen, es el rechazo

Un número se bloquea sobre todo porque la gente lo **reporta**, no porque mande
mucho. En orden de importancia:

1. **Escribe sólo a quien te dio su número.** Listas compradas o extraídas de
   otro lado son la vía rápida al bloqueo.
2. **Da salida.** Cada mensaje masivo debería decir cómo dejar de recibirlos, y
   esa salida tiene que funcionar de verdad.
3. **Personaliza.** Un mensaje idéntico palabra por palabra a cien personas se
   detecta y se reporta más. Para eso están las variables:
   `{{ nombre || "" }}`.
4. **Respeta el horario.** Un mensaje comercial a las 11 de la noche se reporta.

## 4. Reparte entre varios números

El sistema es multi-número por diseño. Un número para ventas, otro para
soporte, otro para despachos reparte el riesgo: si uno cae, la operación
sigue. Además, cada uno acumula un historial coherente con su propósito, que es
lo que un patrón de uso legítimo se ve.

## 5. Cuando una sesión se cae

Las sesiones de WhatsApp Web se caen. Es normal y casi siempre se recupera
sola. En **Números** tienes, de menos a más agresivo:

| Acción | Qué hace | Cuándo |
|---|---|---|
| **Estado** | Le pregunta a Evolution cómo está la sesión | Primero, siempre |
| **Reiniciar** | Reinicia la conexión sin cerrar sesión | Si aparece desconectado pero el teléfono está bien |
| **QR nuevo** | Pide otro código | Si quedó en "esperando escaneo" y el código caducó |
| **Cerrar sesión** | Cierra la sesión y vuelve al QR. **Los chats se conservan** | Si nada de lo anterior funciona |
| **Eliminar** | Borra el número y todos sus chats y mensajes | Sólo si ya no vas a usar ese número |

Mientras un número está caído, la cola de salida **no descarta los mensajes**:
los reprograma cinco minutos después. Si la sesión vuelve, salen solos.

## 6. Señales de que algo va mal

Revisa **Métricas** de vez en cuando. Estas señales aparecen antes que el
bloqueo:

- Los mensajes se quedan en enviado y no pasan a entregado.
- La tasa de fallos de un envío sube de golpe.
- El número se desconecta varias veces al día sin motivo.

Ante cualquiera de las tres: para los envíos de ese número, deja que sólo
responda conversaciones entrantes durante unos días, y reparte la carga a otro
número.

## 7. Sobre la IA

El agente reduce el riesgo en lugar de aumentarlo, porque responde a quien
escribió primero — que es exactamente el patrón que WhatsApp considera
legítimo. El riesgo está en los envíos masivos, no en las respuestas.

Dos ajustes ayudan:

- **Espera antes de responder** en 15–30 segundos. Una respuesta instantánea a
  cualquier hora del día y de la noche es un patrón que se nota.
- **Nombre visible** configurado, para que el cliente sepa que habla con un
  asistente. Es lo que evita la conversación incómoda que termina en reporte.
