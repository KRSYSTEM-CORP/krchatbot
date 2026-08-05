import "server-only";
import { prisma } from "@/lib/prisma";
import { enqueueMessage } from "@/lib/queue";
import type { AutomationTrigger, Prisma } from "@prisma/client";

// Motor de reglas determinista, complementario a la IA. Tres piezas:
// disparador → condiciones → acciones. La IA decide con criterio; esto hace
// exactamente lo mismo siempre, que es lo que se quiere para un SLA, una
// derivación por turno o un aviso a las 8 de la mañana.

export type ConditionLeaf = {
  field:
    | "message.body"
    | "message.fromMe"
    | "chat.type"
    | "chat.name"
    | "chat.label"
    | "chat.assigned"
    | "contact.internal";
  op: "contains" | "equals" | "startsWith" | "notContains" | "isTrue" | "isFalse";
  value?: string;
};

export type ConditionNode = {
  op: "AND" | "OR";
  items: (ConditionLeaf | ConditionNode)[];
};

export type ActionSpec =
  | { type: "SEND_MESSAGE"; delaySeconds?: number; body: string; debounceMinutes?: number }
  | { type: "ADD_CHAT_LABEL"; delaySeconds?: number; labelId: string }
  | { type: "ASSIGN_CHAT"; delaySeconds?: number; userId: string }
  | { type: "CREATE_TICKET"; delaySeconds?: number; title: string; priority?: string }
  | { type: "FLAG_MESSAGE"; delaySeconds?: number }
  | { type: "PRIVATE_NOTE"; delaySeconds?: number; body: string; mentions?: string[] }
  | { type: "DISABLE_AI"; delaySeconds?: number };

export type RuleEvent = {
  trigger: AutomationTrigger;
  orgId: string;
  chatId: string;
  phoneId: string;
  messageId?: string;
  labelId?: string;
  context: {
    messageBody: string;
    fromMe: boolean;
    chatType: string;
    chatName: string;
    chatJid: string;
    chatLabelIds: string[];
    isAssigned: boolean;
    isInternalContact: boolean;
  };
};

function isNode(value: ConditionLeaf | ConditionNode): value is ConditionNode {
  return (value as ConditionNode).items !== undefined;
}

function evalLeaf(leaf: ConditionLeaf, ctx: RuleEvent["context"]): boolean {
  const needle = (leaf.value ?? "").toLowerCase();

  switch (leaf.field) {
    case "message.body": {
      const body = ctx.messageBody.toLowerCase();
      if (leaf.op === "contains") return body.includes(needle);
      if (leaf.op === "notContains") return !body.includes(needle);
      if (leaf.op === "equals") return body.trim() === needle;
      if (leaf.op === "startsWith") return body.trimStart().startsWith(needle);
      return false;
    }
    case "message.fromMe":
      return leaf.op === "isTrue" ? ctx.fromMe : !ctx.fromMe;
    case "chat.type":
      return ctx.chatType.toLowerCase() === needle;
    case "chat.name": {
      const name = ctx.chatName.toLowerCase();
      if (leaf.op === "contains") return name.includes(needle);
      if (leaf.op === "notContains") return !name.includes(needle);
      return name === needle;
    }
    case "chat.label": {
      const has = ctx.chatLabelIds.includes(leaf.value ?? "");
      return leaf.op === "notContains" ? !has : has;
    }
    case "chat.assigned":
      return leaf.op === "isTrue" ? ctx.isAssigned : !ctx.isAssigned;
    case "contact.internal":
      return leaf.op === "isTrue" ? ctx.isInternalContact : !ctx.isInternalContact;
    default:
      return false;
  }
}

export function evaluate(node: ConditionNode, ctx: RuleEvent["context"], depth = 0): boolean {
  // Se corta a dos niveles a propósito: más profundidad produce reglas que
  // nadie puede leer en la interfaz ni depurar cuando fallan.
  if (depth > 2 || node.items.length === 0) return true;

  const results = node.items.map((item) =>
    isNode(item) ? evaluate(item, ctx, depth + 1) : evalLeaf(item, ctx),
  );

  return node.op === "AND" ? results.every(Boolean) : results.some(Boolean);
}

// Recuerda el último envío automático por chat+regla, para el debounce.
const lastSent = new Map<string, number>();

export async function runRules(event: RuleEvent): Promise<number> {
  const rules = await prisma.automationRule.findMany({
    where: { orgId: event.orgId, trigger: event.trigger, isActive: true },
  });

  let fired = 0;

  for (const rule of rules) {
    if (rule.phoneIds.length > 0 && !rule.phoneIds.includes(event.phoneId)) continue;

    const conditions = rule.conditions as unknown as ConditionNode;
    if (!evaluate(conditions, event.context)) continue;

    const actions = (rule.actions as unknown as ActionSpec[]) ?? [];
    for (const action of actions) {
      await runAction(action, event, rule.id);
    }

    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });
    fired++;
  }

  return fired;
}

async function runAction(action: ActionSpec, event: RuleEvent, ruleId: string) {
  const delay = action.delaySeconds ?? 0;

  switch (action.type) {
    case "SEND_MESSAGE": {
      if (action.debounceMinutes) {
        const key = `${ruleId}:${event.chatId}`;
        const previous = lastSent.get(key) ?? 0;
        // Sin este freno, una regla de "responde a cualquier mensaje" convierte
        // una ráfaga de cinco mensajes del cliente en cinco respuestas iguales.
        if (Date.now() - previous < action.debounceMinutes * 60 * 1000) return;
        lastSent.set(key, Date.now());
      }
      await enqueueMessage({
        orgId: event.orgId,
        phoneId: event.phoneId,
        chatJid: event.context.chatJid,
        body: renderTemplate(action.body, event),
        delaySeconds: delay,
      });
      return;
    }

    case "ADD_CHAT_LABEL":
      await prisma.chatLabel.upsert({
        where: { chatId_labelId: { chatId: event.chatId, labelId: action.labelId } },
        create: { chatId: event.chatId, labelId: action.labelId },
        update: {},
      });
      return;

    case "ASSIGN_CHAT":
      await prisma.chat.update({
        where: { id: event.chatId },
        data: { assigneeId: action.userId },
      });
      return;

    case "CREATE_TICKET": {
      const last = await prisma.ticket.findFirst({
        where: { orgId: event.orgId },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      await prisma.ticket.create({
        data: {
          orgId: event.orgId,
          chatId: event.chatId,
          messageId: event.messageId,
          number: (last?.number ?? 0) + 1,
          title: renderTemplate(action.title, event),
          description: event.context.messageBody.slice(0, 2000),
          priority: (["LOW", "MEDIUM", "HIGH", "URGENT"] as const).includes(
            action.priority as never,
          )
            ? (action.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT")
            : "MEDIUM",
        },
      });
      return;
    }

    case "FLAG_MESSAGE":
      if (!event.messageId) return;
      await prisma.message.update({
        where: { id: event.messageId },
        data: { isFlagged: true, flagReason: "Regla de automatización" },
      });
      return;

    case "PRIVATE_NOTE":
      await prisma.privateNote.create({
        data: {
          chatId: event.chatId,
          body: renderTemplate(action.body, event),
          mentions: action.mentions ?? [],
        },
      });
      return;

    case "DISABLE_AI":
      await prisma.chat.update({
        where: { id: event.chatId },
        data: { aiEnabled: false, agentState: "INACTIVE" },
      });
      return;
  }
}

// Variables con valor por defecto: {{ chat.nombre || "cliente" }}. El fallback
// no es un adorno — sin él, un grupo sin nombre produce un mensaje que empieza
// con "Hola , ..." y sale así a cientos de chats.
export function renderTemplate(template: string, event: RuleEvent): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) => {
    const [path, fallbackRaw] = expression.split("||").map((part) => part.trim());
    const fallback = fallbackRaw?.replace(/^['"]|['"]$/g, "") ?? "";

    const values: Record<string, string> = {
      "chat.nombre": event.context.chatName,
      "chat.jid": event.context.chatJid,
      "mensaje.texto": event.context.messageBody,
    };

    return values[path] || fallback;
  });
}

export type RuleSummary = Prisma.AutomationRuleGetPayload<Record<string, never>>;
