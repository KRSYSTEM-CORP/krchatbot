"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Card, FormMessage } from "@/components/ui/misc";
import { savePersonalization } from "@/lib/actions/ai";
import type { FormState } from "@/lib/validations";

const initial: FormState = { ok: true };

export function PersonalizationForm({
  orgName,
  values,
}: {
  orgName: string;
  values: {
    rolePrompt: string;
    restrictions: string;
    personality: string;
    activationPrompt: string;
    formatRules: string;
    ticketRules: string;
    privateNoteRules: string;
    flaggingPrompt: string;
  };
}) {
  const [state, action, pending] = useActionState(savePersonalization, initial);

  return (
    <form action={action} className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="font-medium">Rol e instrucciones</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Es el campo que más pesa: se inyecta entero como instrucción del sistema. Cuanto más
            contexto le des, mejor responde. Cubre quién es, qué hace {orgName}, cómo debe hablar y
            a quién derivar cada tipo de consulta.
          </p>
        </div>

        <Textarea
          name="rolePrompt"
          defaultValue={values.rolePrompt}
          rows={16}
          className="font-mono text-xs"
          placeholder={PLACEHOLDER_ROLE}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <Field
            label="Límites innegociables"
            hint="Lo que nunca debe hacer, pida lo que pida el cliente. Es la red de seguridad del negocio."
          >
            <Textarea
              name="restrictions"
              defaultValue={values.restrictions}
              rows={7}
              placeholder={`- No proceses reembolsos. Deriva a facturacion@empresa.com.
- No des descuentos ni negocies precios.
- No confirmes fechas de entrega si no están en la base de conocimiento.
- No agendes llamadas: avisa a un vendedor para que lo haga.`}
            />
          </Field>

          <Field
            label="Estilo"
            hint="Cómo suena. Recuerda que es WhatsApp: frases cortas ganan siempre."
          >
            <Textarea
              name="personality"
              defaultValue={values.personality}
              rows={3}
              placeholder="Cálido y directo. Tutea. Mensajes de dos o tres líneas, sin formalismos."
            />
          </Field>

          <Field
            label="Formato obligatorio de las respuestas"
            hint='Qué debe ir siempre estructurado y cómo — la IA ya separa tipos de información con *negrita* y viñetas por defecto, pero cada negocio maneja datos distintos (presupuestos, perfiles, horarios…). Sé específico: qué bloques van siempre, en qué orden, y con qué encabezado exacto.'
          >
            <Textarea
              name="formatRules"
              defaultValue={values.formatRules}
              rows={8}
              className="font-mono text-xs"
              placeholder={PLACEHOLDER_FORMAT}
            />
          </Field>
        </Card>

        <Card className="space-y-4">
          <Field
            label="Cuándo debe responder"
            hint="Se suma a los criterios base (pregunta, queja, solicitud de ayuda); no los reemplaza."
          >
            <Textarea
              name="activationPrompt"
              defaultValue={values.activationPrompt}
              rows={5}
              placeholder={`- NO respondas si el mensaje sólo dice "ok", "gracias" o "listo".
- Responde siempre si mencionan un número de pedido.
- En grupos, responde sólo si el mensaje va dirigido al negocio.`}
            />
          </Field>

          <Field
            label="Cuándo abrir un ticket"
            hint="Reglas en lenguaje natural. La IA las lee como criterio, así que conviene ser específico."
          >
            <Textarea
              name="ticketRules"
              defaultValue={values.ticketRules}
              rows={5}
              placeholder={`Abre un ticket cuando:
1) El cliente reporte un producto dañado o incompleto.
2) Un pago no se haya reflejado después de 24 horas.
3) Pida un pedido especial o fuera de catálogo.`}
            />
          </Field>

          <Field
            label="A quién avisar con una nota interna"
            hint="Menciona correos del equipo para que la IA sepa a quién etiquetar."
          >
            <Textarea
              name="privateNoteRules"
              defaultValue={values.privateNoteRules}
              rows={4}
              placeholder={`- Temas de facturación: avisa a admin@empresa.com.
- Fallas técnicas: avisa a soporte@empresa.com.
- Un cliente molesto: avisa a gerencia@empresa.com de inmediato.`}
            />
          </Field>
        </Card>
      </div>

      <Card>
        <Field
          label="Qué marcar como importante"
          hint="Funciona aunque la IA no responda: sirve para que nada urgente pase inadvertido y para medir tiempos de respuesta."
        >
          <Textarea
            name="flaggingPrompt"
            defaultValue={values.flaggingPrompt}
            rows={4}
            placeholder={`- Marca todo lo que mencione "cancelar", "devolver" o "reclamo".
- Marca a quien pregunte por compras al mayor.`}
          />
        </Field>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar personalización"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

const PLACEHOLDER_FORMAT = `Cuando la respuesta incluya precios o varios servicios, estructúrala así (un bloque por tipo de información, con una línea en blanco entre cada uno):

*Presupuesto:*
- Servicio A: 30 EUR
- Servicio B: 20 EUR

*Requisitos:*
- Lo que debe traer o preparar el cliente.

*Total: 50 EUR*

Cierra siempre con estos tres bloques, cada uno en su propia línea:
*Ubicación:* [dirección]
*Horario de Atención:* [horario]
*Tasa de Cambio:* [política de precio/moneda]

En mensajes simples (saludos, confirmaciones, cuando escalas a una persona) no fuerces esta estructura — ve directo, sin encabezados.`;

const PLACEHOLDER_ROLE = `Rol e identidad

Eres el asistente de ventas y soporte de [Negocio]. Atiendes a clientes por WhatsApp
en consultas de catálogo, precios, disponibilidad y postventa.

Sobre el negocio

[Negocio] se dedica a [qué hace]. Atendemos de lunes a sábado, de 8:00 a 6:00.
Estamos en [ciudad] y despachamos a todo el país.

Cómo comunicarte

- Eres amable, paciente y vas al grano.
- Sólo das información que esté en la base de conocimiento.
- Si no tienes el dato, lo dices una vez y ofreces pasar la consulta al equipo.
- Nunca inventas precios, plazos ni disponibilidad.

El equipo

- Ana — pedidos y despachos
- Luis — pagos y facturación
- Carmen — mayoristas y precios especiales

Ruteo: problemas de entrega → Ana | pagos → Luis | ventas al mayor → Carmen`;
