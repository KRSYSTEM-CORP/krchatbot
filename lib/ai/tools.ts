import "server-only";
import { prisma } from "@/lib/prisma";
import type { AgentSettings, CustomTool } from "@prisma/client";
import type { ToolSpec } from "@/lib/ai/providers/types";

// Las herramientas que el agente puede ejecutar. Se dividen en dos familias:
//
//  · Nativas — crear ticket, dejar nota privada, etiquetar. Se activan con un
//    interruptor y sus criterios se escriben en lenguaje natural: el texto que
//    el equipo redacta en la configuración entra tal cual en la descripción de
//    la herramienta, así que ajustar cuándo se abre un ticket no requiere
//    tocar código.
//
//  · A medida — endpoints HTTP del propio negocio (estado de un pedido, saldo,
//    disponibilidad). El modelo elige cuál llamar leyendo su nombre y su
//    descripción, por eso ambos campos importan tanto.

export type ToolContext = {
  orgId: string;
  chatId: string;
  chatName: string;
};

type ToolParam = {
  name: string;
  type: "string" | "number" | "boolean";
  description?: string;
  required?: boolean;
};

export function buildTools(
  settings: AgentSettings,
  customTools: CustomTool[],
): ToolSpec[] {
  const tools: ToolSpec[] = [];

  if (settings.canCreateTickets) {
    tools.push({
      name: "crear_ticket",
      description: [
        "Abre un ticket de soporte ligado a esta conversación para que el equipo humano le dé seguimiento.",
        settings.ticketRules
          ? `Criterios definidos por el negocio para abrir un ticket:\n${settings.ticketRules}`
          : "Úsala cuando el cliente reporte un problema que requiere seguimiento y no se resuelve con una respuesta.",
      ].join("\n\n"),
      parameters: {
        type: "object",
        properties: {
          titulo: {
            type: "string",
            description:
              "Título específico y accionable. 'Cobro duplicado en factura de marzo', no 'Problema con pago'.",
          },
          descripcion: {
            type: "string",
            description: "Resumen del caso con el contexto que necesita quien lo atienda.",
          },
          prioridad: {
            type: "string",
            enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
            description: "URGENT sólo si el cliente está bloqueado o hay dinero en riesgo.",
          },
        },
        required: ["titulo", "descripcion", "prioridad"],
      },
    });
  }

  if (settings.canCreatePrivateNotes) {
    tools.push({
      name: "nota_privada",
      description: [
        "Deja una nota interna dentro del chat. El cliente NO la ve. Sirve para avisarle a un compañero o dejar contexto antes de un traspaso.",
        settings.privateNoteRules
          ? `Reglas de a quién avisar:\n${settings.privateNoteRules}`
          : "Úsala cuando la consulta necesita a una persona concreta del equipo.",
      ].join("\n\n"),
      parameters: {
        type: "object",
        properties: {
          nota: { type: "string", description: "El mensaje interno." },
          mencionar: {
            type: "array",
            items: { type: "string" },
            description: "Correos de los compañeros a etiquetar. Vacío si no aplica.",
          },
        },
        required: ["nota"],
      },
    });
  }

  tools.push({
    name: "escalar_a_humano",
    description:
      "Detiene la atención automática y deja la conversación esperando a una persona. Úsala cuando el cliente lo pida explícitamente, cuando esté molesto, o cuando no tengas información confiable para responder.",
    parameters: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Por qué hace falta un humano." },
      },
      required: ["motivo"],
    },
  });

  for (const tool of customTools) {
    if (!tool.isActive) continue;
    const params = (tool.parameters as unknown as ToolParam[]) ?? [];
    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];

    for (const param of params) {
      properties[param.name] = { type: param.type, description: param.description };
      if (param.required) required.push(param.name);
    }

    tools.push({
      name: tool.name,
      description: tool.description,
      parameters: { type: "object", properties, required },
    });
  }

  return tools;
}

// ── Ejecución ───────────────────────────────────────────────────────────────

export type ToolOutcome = {
  result: string;
  // Efectos que el llamador necesita conocer después de la corrida: si se
  // escaló, deja de responderle al cliente.
  escalated?: boolean;
};

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  customTools: CustomTool[],
): Promise<ToolOutcome> {
  switch (name) {
    case "crear_ticket":
      return runCreateTicket(input, ctx);
    case "nota_privada":
      return runPrivateNote(input, ctx);
    case "escalar_a_humano":
      return runEscalate(input, ctx);
    default: {
      const tool = customTools.find((t) => t.name === name && t.isActive);
      if (!tool) return { result: `La herramienta "${name}" no existe.` };
      return runCustomTool(tool, input);
    }
  }
}

async function runCreateTicket(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const last = await prisma.ticket.findFirst({
    where: { orgId: ctx.orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const ticket = await prisma.ticket.create({
    data: {
      orgId: ctx.orgId,
      chatId: ctx.chatId,
      number: (last?.number ?? 0) + 1,
      title: String(input.titulo ?? "Sin título"),
      description: String(input.descripcion ?? ""),
      priority: (["LOW", "MEDIUM", "HIGH", "URGENT"] as const).includes(
        input.prioridad as never,
      )
        ? (input.prioridad as "LOW" | "MEDIUM" | "HIGH" | "URGENT")
        : "MEDIUM",
      byAi: true,
    },
  });

  return { result: `Ticket #${ticket.number} creado y asignado a la cola del equipo.` };
}

async function runPrivateNote(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const mentions = Array.isArray(input.mencionar)
    ? (input.mencionar as unknown[]).map(String)
    : [];

  await prisma.privateNote.create({
    data: {
      chatId: ctx.chatId,
      body: String(input.nota ?? ""),
      mentions,
      byAi: true,
    },
  });

  return {
    result: mentions.length
      ? `Nota interna publicada, mencionando a ${mentions.join(", ")}.`
      : "Nota interna publicada en el chat.",
  };
}

async function runEscalate(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  await prisma.privateNote.create({
    data: {
      chatId: ctx.chatId,
      body: `Escalado por la IA: ${String(input.motivo ?? "sin motivo")}`,
      byAi: true,
    },
  });

  // El chat queda dormido hasta que un humano intervenga: si la IA ya decidió
  // que no puede resolverlo, seguir contestando sólo empeora la conversación.
  await prisma.chat.update({
    where: { id: ctx.chatId },
    data: { agentState: "SNOOZED", snoozedUntil: null },
  });

  return { result: "Conversación escalada. Deja de responder y despídete brevemente.", escalated: true };
}

async function runCustomTool(
  tool: CustomTool,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((tool.headers as Record<string, string>) ?? {}),
  };

  if (tool.authType === "BEARER" && tool.authValue) {
    headers.Authorization = `Bearer ${tool.authValue}`;
  } else if (tool.authType === "API_KEY" && tool.authValue && tool.authHeader) {
    headers[tool.authHeader] = tool.authValue;
  } else if (tool.authType === "BASIC" && tool.authValue) {
    headers.Authorization = `Basic ${Buffer.from(tool.authValue).toString("base64")}`;
  }

  try {
    let url = tool.endpoint;
    let body: string | undefined;

    if (tool.method === "GET") {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(input)) query.set(key, String(value));
      const separator = url.includes("?") ? "&" : "?";
      if (query.toString()) url += `${separator}${query.toString()}`;
    } else {
      body = JSON.stringify(input);
    }

    const response = await fetch(url, {
      method: tool.method,
      headers,
      body,
      // Un endpoint lento no puede dejar colgada la respuesta al cliente.
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      return { result: `El servicio respondió ${response.status}. ${text.slice(0, 400)}` };
    }
    return { result: text.slice(0, 4000) || "(respuesta vacía)" };
  } catch (error) {
    // El error se le devuelve al modelo como resultado, no se lanza: así el
    // agente puede decirle al cliente que no pudo consultarlo en vez de dejar
    // la conversación en silencio.
    return {
      result: `No se pudo consultar el servicio: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    };
  }
}
