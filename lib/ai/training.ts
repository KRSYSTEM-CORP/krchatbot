import "server-only";
import { prisma } from "@/lib/prisma";
import { getAiProvider } from "@/lib/ai/client";

// Auto-entrenamiento. Cada semana revisa las conversaciones que el equipo
// resolvió y redacta FAQs a partir de las respuestas que dieron las personas.
// Es el ciclo que cierra el sistema: lo que un agente contestó el lunes es
// base de conocimiento el lunes siguiente, sin que nadie tenga que sentarse a
// documentarlo.
//
// Nada se publica solo si `selfTrainingRequiresReview` está encendido: las
// entradas nacen en NEEDS_REVIEW y esperan aprobación.

const MAX_CHATS = 40;
const MAX_MESSAGES_PER_CHAT = 30;

export type TrainingResult = { ok: boolean; learned: number; error?: string };

export async function runSelfTraining(
  orgId: string,
  weekStart: Date,
  isManual = false,
): Promise<TrainingResult> {
  const settings = await prisma.agentSettings.findUnique({ where: { orgId } });
  if (!settings) return { ok: false, learned: 0, error: "La organización no tiene ajustes de IA" };

  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 86400000);

  const existing = await prisma.trainingRun.findFirst({
    where: { orgId, weekStart: start, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (existing) return { ok: false, learned: 0, error: "Ya hay una corrida en curso para esa semana" };

  const run = await prisma.trainingRun.create({
    data: { orgId, weekStart: start, status: "RUNNING", isManual },
  });

  try {
    // Sólo interesan los chats donde hubo intervención humana: si contestó la
    // IA, aprender de sus propias respuestas amplifica cualquier error que ya
    // tuviera.
    const chats = await prisma.chat.findMany({
      where: {
        orgId,
        lastMessageAt: { gte: start, lt: end },
        messages: { some: { fromMe: true, authorKind: "AGENT", timestamp: { gte: start, lt: end } } },
      },
      include: {
        messages: {
          where: { timestamp: { gte: start, lt: end } },
          orderBy: { timestamp: "asc" },
          take: MAX_MESSAGES_PER_CHAT,
        },
      },
      take: MAX_CHATS,
    });

    if (chats.length === 0) {
      await prisma.trainingRun.update({
        where: { id: run.id },
        data: { status: "COMPLETE", learned: 0, finishedAt: new Date() },
      });
      return { ok: true, learned: 0 };
    }

    const transcripts = chats
      .map((chat, index) => {
        const lines = chat.messages
          .map((m) => `${m.fromMe ? "Equipo" : "Cliente"}: ${m.body}`)
          .filter((line) => line.length > 8)
          .join("\n");
        return `--- Conversación ${index + 1} (${chat.name}) ---\n${lines}`;
      })
      .join("\n\n")
      .slice(0, 120000);

    const existingQuestions = await prisma.knowledgeItem.findMany({
      where: { orgId },
      select: { question: true },
      take: 300,
    });

    const provider = await getAiProvider();
    const parsed = await provider.classify<{ faqs?: { pregunta: string; respuesta: string }[] }>({
      system: `Analiza estas conversaciones reales de WhatsApp entre un negocio y sus clientes, y extrae preguntas frecuentes con la respuesta que dio el equipo.

Reglas:
- Sólo extrae pares donde el equipo dio una respuesta clara, reutilizable y que seguirá siendo válida.
- En "pregunta" escribe varias formulaciones de la misma duda, una por línea, tal como las diría un cliente.
- En "respuesta" redacta la respuesta modelo, generalizada: sin nombres propios, sin números de pedido, sin fechas puntuales ni datos personales.
- Descarta lo que sea específico de un solo cliente, lo que dependa del momento, y lo que ya esté cubierto por estas preguntas existentes:
${existingQuestions.map((q) => `· ${q.question.split("\n")[0]}`).join("\n")}
- Si no hay nada que valga la pena, devuelve una lista vacía. Es preferible no aprender nada a ensuciar la base.`,
      message: transcripts,
      schema: {
        type: "object",
        properties: {
          faqs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pregunta: { type: "string" },
                respuesta: { type: "string" },
              },
              required: ["pregunta", "respuesta"],
              additionalProperties: false,
            },
          },
        },
        required: ["faqs"],
        additionalProperties: false,
      },
      // Extraer FAQs de semanas de conversaciones se beneficia de razonar en
      // serio: es una sola llamada semanal, no algo sensible a la latencia.
      effort: "high",
    });
    if (!parsed) throw new Error("La IA no devolvió resultados");

    const faqs = (parsed.faqs ?? []).filter((f) => f.pregunta?.trim() && f.respuesta?.trim());

    if (faqs.length > 0) {
      await prisma.knowledgeItem.createMany({
        data: faqs.map((faq) => ({
          orgId,
          source: "SELF_LEARNED" as const,
          status: settings.selfTrainingRequiresReview
            ? ("NEEDS_REVIEW" as const)
            : ("ACTIVE" as const),
          question: faq.pregunta.trim(),
          answer: faq.respuesta.trim(),
        })),
      });
    }

    await prisma.trainingRun.update({
      where: { id: run.id },
      data: { status: "COMPLETE", learned: faqs.length, finishedAt: new Date() },
    });

    return { ok: true, learned: faqs.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    await prisma.trainingRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
    return { ok: false, learned: 0, error: message };
  }
}

// El domingo se procesa la semana que acaba de terminar, para todas las
// organizaciones que lo tengan encendido.
export async function runWeeklyTraining(): Promise<number> {
  const orgs = await prisma.agentSettings.findMany({
    where: { selfTrainingEnabled: true },
    select: { orgId: true },
  });

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  let total = 0;
  for (const org of orgs) {
    const result = await runSelfTraining(org.orgId, weekStart);
    total += result.learned;
  }
  return total;
}
