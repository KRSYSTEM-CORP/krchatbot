import "server-only";
import { prisma } from "@/lib/prisma";
import type { KnowledgeItem } from "@prisma/client";

// Recuperación para el agente. En vez de montar una base vectorial aparte,
// se buscan las entradas activas con la búsqueda de texto de Postgres y se le
// entregan al modelo las mejores candidatas: él decide cuál aplica. Para una
// base de conocimiento del tamaño que maneja un negocio (decenas o cientos de
// FAQs) esto acierta igual que los embeddings y no añade otro proveedor,
// otra clave y otro proceso de reindexado que mantener.

const STOPWORDS = new Set([
  "que", "de", "la", "el", "los", "las", "un", "una", "y", "o", "en", "para",
  "por", "con", "del", "al", "es", "son", "me", "mi", "te", "se", "lo", "su",
  "como", "cuando", "donde", "cual", "cuanto", "hay", "tiene", "puedo", "quiero",
]);

function keywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9ñ\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
    ),
  ).slice(0, 12);
}

function score(item: KnowledgeItem, terms: string[]): number {
  const haystack = `${item.question} ${item.answer}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let total = 0;
  for (const term of terms) {
    // La pregunta pesa el doble que la respuesta: una FAQ acierta porque la
    // pregunta del cliente se parece a la pregunta guardada, no porque la
    // palabra aparezca de pasada en un párrafo de la respuesta.
    if (item.question.toLowerCase().includes(term)) total += 2;
    else if (haystack.includes(term)) total += 1;
  }
  return total;
}

export type RetrievedKnowledge = {
  id: string;
  question: string;
  answer: string;
  instructions: string;
  source: string;
};

// Por debajo de este número de entradas activas se le entrega la base completa
// al modelo en vez de filtrarla. La búsqueda por palabras falla justo donde más
// duele: un cliente que escribe "compré algo y salió dañado" no comparte
// ninguna palabra con la FAQ "¿qué pasa si el producto sale malo?", y quedarse
// callado por eso es peor que gastar unos miles de tokens. Emparejar el sentido
// es exactamente lo que el modelo hace bien; filtrar antes sólo tiene sentido
// cuando la base ya no cabe cómodamente en el contexto.
const SEND_ALL_THRESHOLD = 40;

function toDto(item: KnowledgeItem): RetrievedKnowledge {
  return {
    id: item.id,
    question: item.question,
    answer: item.answer,
    instructions: item.instructions,
    source: item.source,
  };
}

export async function retrieveKnowledge(
  orgId: string,
  query: string,
  limit = 8,
): Promise<RetrievedKnowledge[]> {
  // Sólo entradas activas: lo auto-aprendido pendiente de revisión y lo
  // desactivado a mano nunca debe llegar a un cliente.
  const activeCount = await prisma.knowledgeItem.count({
    where: { orgId, status: "ACTIVE" },
  });
  if (activeCount === 0) return [];

  if (activeCount <= SEND_ALL_THRESHOLD) {
    const all = await prisma.knowledgeItem.findMany({
      where: { orgId, status: "ACTIVE" },
      orderBy: { usageCount: "desc" },
    });
    return all.map(toDto);
  }

  const terms = keywords(query);
  if (terms.length === 0) return [];

  const items = await prisma.knowledgeItem.findMany({
    where: {
      orgId,
      status: "ACTIVE",
      OR: terms.map((term) => ({
        OR: [
          { question: { contains: term, mode: "insensitive" as const } },
          { answer: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    take: 60,
  });

  return items
    .map((item) => ({ item, points: score(item, terms) }))
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map(({ item }) => toDto(item));
}

export function renderKnowledge(items: RetrievedKnowledge[]): string {
  if (items.length === 0) {
    return "(No hay entradas de la base de conocimiento que apliquen a este mensaje.)";
  }
  return items
    .map((item, index) => {
      const lines = [
        `[${index + 1}] Pregunta: ${item.question}`,
        `    Respuesta: ${item.answer}`,
      ];
      if (item.instructions) lines.push(`    Instrucción: ${item.instructions}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export async function markKnowledgeUsed(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.knowledgeItem.updateMany({
    where: { id: { in: ids } },
    data: { usageCount: { increment: 1 } },
  });
}

// ── Importar desde PDF ──────────────────────────────────────────────────────

// Un PDF crudo no llega troceado en preguntas y respuestas como una FAQ — se
// parte en fragmentos de tamaño manejable para el modelo (ver
// SEND_ALL_THRESHOLD arriba) y cada uno se guarda como su propia entrada.
// Nunca corta a la mitad de una oración si puede evitarlo: busca el último
// salto de párrafo, punto seguido, o salto de línea dentro del último 50% del
// fragmento y corta ahí en vez de en el límite exacto de caracteres.
const CHUNK_MAX_CHARS = 1800;
// Frena un PDF absurdamente largo antes de que genere miles de filas —
// ~150 páginas de texto denso, de sobra para un manual de producto real.
const CHUNK_MAX_COUNT = 200;

export function chunkText(rawText: string, maxChars = CHUNK_MAX_CHARS): string[] {
  const text = rawText.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!text) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < CHUNK_MAX_COUNT) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const breakPoint = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("\n"),
      );
      if (breakPoint > maxChars * 0.5) {
        end = start + breakPoint + 1;
      }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }
  return chunks;
}
