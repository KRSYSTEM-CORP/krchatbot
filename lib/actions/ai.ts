"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { runSelfTraining } from "@/lib/ai/training";
import { chunkText } from "@/lib/ai/knowledge";
import { getAiProvider, REPLY_EFFORT } from "@/lib/ai/client";
import {
  agentSettingsSchema,
  personalizationSchema,
  knowledgeSchema,
  customToolSchema,
  fail,
  firstIssue,
  OK,
  type FormState,
} from "@/lib/validations";

function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

export async function saveAgentSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();

  const parsed = agentSettingsSchema.safeParse({
    ...Object.fromEntries(formData),
    enabled: checkbox(formData, "enabled"),
    canSendMessages: checkbox(formData, "canSendMessages"),
    canCreateTickets: checkbox(formData, "canCreateTickets"),
    canCreatePrivateNotes: checkbox(formData, "canCreatePrivateNotes"),
    allowedPhoneIds: formData.getAll("allowedPhoneIds").map(String),
    businessHoursEnabled: checkbox(formData, "businessHoursEnabled"),
    businessHoursDays: formData.getAll("businessHoursDays").map(String),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  await prisma.agentSettings.update({
    where: { orgId: session.orgId },
    data: parsed.data,
  });

  revalidatePath("/ia");
  return { ok: true, message: "Ajustes guardados" };
}

export async function savePersonalization(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = personalizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  await prisma.agentSettings.update({
    where: { orgId: session.orgId },
    data: parsed.data,
  });

  revalidatePath("/ia/personalizacion");
  return { ok: true, message: "Personalización guardada" };
}

// ── Base de conocimiento ────────────────────────────────────────────────────

export async function saveKnowledgeItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = knowledgeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const { id, ...data } = parsed.data;

  if (id) {
    const exists = await prisma.knowledgeItem.findFirst({
      where: { id, orgId: session.orgId },
    });
    if (!exists) return fail("Entrada no encontrada");
    await prisma.knowledgeItem.update({ where: { id }, data });
  } else {
    await prisma.knowledgeItem.create({
      data: { ...data, orgId: session.orgId, source: "FAQ" },
    });
  }

  revalidatePath("/ia/conocimiento");
  return { ok: true, message: "Entrada guardada" };
}

export async function setKnowledgeStatus(
  ids: string[],
  status: "ACTIVE" | "INACTIVE" | "NEEDS_REVIEW",
): Promise<FormState> {
  const session = await requireAdmin();
  if (ids.length === 0) return fail("No seleccionaste nada");

  await prisma.knowledgeItem.updateMany({
    where: { id: { in: ids }, orgId: session.orgId },
    data: { status },
  });

  revalidatePath("/ia/conocimiento");
  return OK;
}

export async function deleteKnowledgeItems(ids: string[]): Promise<FormState> {
  const session = await requireAdmin();
  if (ids.length === 0) return fail("No seleccionaste nada");

  const { count } = await prisma.knowledgeItem.deleteMany({
    where: { id: { in: ids }, orgId: session.orgId },
  });

  revalidatePath("/ia/conocimiento");
  return { ok: true, message: `${count} entrada(s) eliminadas` };
}

// Carga masiva pegando texto: cada bloque "P: ... R: ..." se convierte en una
// entrada. Es la vía rápida para sembrar la base sin escribir una por una.
export async function bulkImportFaqs(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const raw = String(formData.get("bulk") ?? "").trim();
  if (!raw) return fail("Pega el contenido a importar");

  const blocks = raw.split(/\n\s*\n/);
  const items: { question: string; answer: string }[] = [];

  for (const block of blocks) {
    const match = block.match(/^\s*P:\s*([\s\S]*?)\n\s*R:\s*([\s\S]*)$/i);
    if (!match) continue;
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question && answer) items.push({ question, answer });
  }

  if (items.length === 0) {
    return fail('No se reconoció ningún bloque. Usa el formato "P: pregunta" / "R: respuesta".');
  }

  await prisma.knowledgeItem.createMany({
    data: items.map((item) => ({ ...item, orgId: session.orgId, source: "FAQ" as const })),
  });

  revalidatePath("/ia/conocimiento");
  return { ok: true, message: `${items.length} entradas importadas` };
}

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB — de sobra para un manual/catálogo real.

// Sube un PDF, extrae su texto y lo parte en fragmentos (ver chunkText en
// lib/ai/knowledge.ts) — cada uno se guarda como su propia entrada, source
// DOCUMENT. A diferencia de una FAQ escrita a mano, texto extraído de un PDF
// nunca se sabe si salió limpio (columnas, tablas, encabezados repetidos), así
// que entra como NEEDS_REVIEW en vez de ACTIVE — el admin las revisa y activa
// en bloque desde la pestaña "Por revisar", igual que lo auto-aprendido.
export async function importKnowledgeFromPdf(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();

  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) return fail("Selecciona un archivo PDF");
  if (file.type !== "application/pdf") return fail("El archivo debe ser un PDF");
  if (file.size > MAX_PDF_BYTES) return fail("El PDF no puede pesar más de 10 MB");

  let text: string;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const result = await extractText(pdf, { mergePages: true });
    text = result.text;
  } catch {
    return fail("No se pudo leer el PDF — puede estar dañado o protegido con contraseña");
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return fail("No se encontró texto en el PDF (¿es un PDF escaneado, sin texto real?)");
  }

  const documentName = file.name;
  await prisma.knowledgeItem.createMany({
    data: chunks.map((chunk, index) => ({
      orgId: session.orgId,
      source: "DOCUMENT" as const,
      status: "NEEDS_REVIEW" as const,
      question: `${documentName} — fragmento ${index + 1}/${chunks.length}`,
      answer: chunk,
      documentName,
      chunkIndex: index,
    })),
  });

  revalidatePath("/ia/conocimiento");
  return {
    ok: true,
    message: `${chunks.length} fragmento(s) importados desde "${documentName}" — quedaron por revisar antes de activarse`,
  };
}

const IMPROVE_SCHEMA = {
  type: "object",
  properties: {
    pregunta: { type: "string" },
    respuesta: { type: "string" },
  },
  required: ["pregunta", "respuesta"],
  additionalProperties: false,
} as const;

// "Mejorar respuesta con IA": no es sólo un formulario — una segunda pasada
// de IA (la "maestra") toma la pregunta original, lo que el asistente
// respondió (si respondió) y la guía en lenguaje natural que escribe la
// persona ("debiste decir X", "falta aclarar Y") y redacta la entrada de
// conocimiento lista para guardar: pregunta con variantes + respuesta
// pulida. La persona la revisa y ajusta antes de guardar — la IA propone,
// el equipo decide, mismo principio que draftReply más abajo.
export async function draftImprovedAnswer(
  originalQuestion: string,
  originalAnswer: string,
  guidance: string,
): Promise<FormState & { question?: string; answer?: string }> {
  await requireAdmin();
  if (!guidance.trim()) return fail("Escribe qué debió responder o qué corregir");

  try {
    const provider = await getAiProvider();
    const result = await provider.classify<{ pregunta?: string; respuesta?: string }>({
      system: `Eres el editor maestro de la base de conocimiento de un asistente de WhatsApp para un negocio.
Te dan: la pregunta que hizo un cliente, lo que el asistente respondió (puede venir vacío si no respondió),
y la corrección que escribe el equipo humano. Tu trabajo es redactar la entrada de conocimiento definitiva:

- "pregunta": la pregunta del cliente reescrita con 2 o 3 variantes de cómo alguien la preguntaría, una por línea (mismo formato que las FAQs existentes).
- "respuesta": la respuesta correcta y completa, en el tono de WhatsApp (mensajes claros, sin markdown), incorporando la corrección del equipo. Si la corrección ya trae el texto exacto a usar, respétalo; si es sólo una indicación ("aclara que no hacemos envíos los domingos"), redacta la respuesta completa tú.

Nunca inventes datos (precios, plazos, políticas) que no estén en la pregunta, la respuesta original o la corrección.`,
      message: `Pregunta del cliente:\n${originalQuestion || "(no disponible)"}\n\nRespuesta del asistente (si la hubo):\n${originalAnswer || "(no respondió)"}\n\nCorrección del equipo:\n${guidance}`,
      schema: IMPROVE_SCHEMA,
      effort: REPLY_EFFORT,
    });

    if (!result?.pregunta || !result?.respuesta) {
      return fail("La IA no devolvió una propuesta utilizable — ajusta la corrección e intenta de nuevo");
    }

    return { ok: true, question: result.pregunta, answer: result.respuesta };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "La IA no respondió");
  }
}

// "Mejorar respuesta": desde el menú de un mensaje en el inbox, un agente
// corrige lo que la IA debió responder. A diferencia del auto-entrenamiento
// semanal (que infiere y pide revisión), esto lo escribió una persona a
// propósito — entra ACTIVA de una vez, sin pasar por NEEDS_REVIEW.
export async function trainFromMessage(question: string, answer: string): Promise<FormState> {
  const session = await requireAdmin();

  const q = question.trim();
  const a = answer.trim();
  if (!q) return fail("Falta la pregunta del cliente");
  if (!a) return fail("Escribe la respuesta correcta");

  await prisma.knowledgeItem.create({
    data: {
      orgId: session.orgId,
      source: "SELF_LEARNED",
      status: "ACTIVE",
      question: q,
      answer: a,
    },
  });

  revalidatePath("/ia/conocimiento");
  return { ok: true, message: "Guardado en la base de conocimiento" };
}

// ── Herramientas a medida ───────────────────────────────────────────────────

export async function saveCustomTool(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();

  let parameters: unknown = [];
  try {
    parameters = JSON.parse(String(formData.get("parameters") ?? "[]"));
  } catch {
    return fail("Los parámetros no son un JSON válido");
  }

  const parsed = customToolSchema.safeParse({
    ...Object.fromEntries(formData),
    parameters,
    isActive: checkbox(formData, "isActive"),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const { id, parameters: params, ...rest } = parsed.data;

  if (id) {
    const exists = await prisma.customTool.findFirst({
      where: { id, orgId: session.orgId },
    });
    if (!exists) return fail("Herramienta no encontrada");
    await prisma.customTool.update({ where: { id }, data: { ...rest, parameters: params } });
  } else {
    const duplicate = await prisma.customTool.findFirst({
      where: { orgId: session.orgId, name: rest.name },
    });
    if (duplicate) return fail("Ya existe una herramienta con ese nombre");
    await prisma.customTool.create({
      data: { ...rest, parameters: params, orgId: session.orgId },
    });
  }

  revalidatePath("/ia/herramientas");
  return { ok: true, message: "Herramienta guardada" };
}

export async function deleteCustomTool(toolId: string): Promise<FormState> {
  const session = await requireAdmin();
  const tool = await prisma.customTool.findFirst({
    where: { id: toolId, orgId: session.orgId },
  });
  if (!tool) return fail("Herramienta no encontrada");

  await prisma.customTool.delete({ where: { id: toolId } });
  revalidatePath("/ia/herramientas");
  return OK;
}

// Prueba la herramienta contra el endpoint real antes de dejar que la use la
// IA. Descubrir que un endpoint está caído en mitad de una conversación con un
// cliente es la peor forma de enterarse.
export async function testCustomTool(
  toolId: string,
  sample: Record<string, string>,
): Promise<FormState & { output?: string }> {
  const session = await requireAdmin();
  const tool = await prisma.customTool.findFirst({
    where: { id: toolId, orgId: session.orgId },
  });
  if (!tool) return fail("Herramienta no encontrada");

  const { runTool } = await import("@/lib/ai/tools");
  const outcome = await runTool(
    tool.name,
    sample,
    { orgId: session.orgId, chatId: "", chatName: "prueba" },
    [tool],
  );

  return { ok: true, output: outcome.result };
}

// ── Auto-entrenamiento ──────────────────────────────────────────────────────

export async function setSelfTraining(
  enabled: boolean,
  requiresReview: boolean,
): Promise<FormState> {
  const session = await requireAdmin();
  await prisma.agentSettings.update({
    where: { orgId: session.orgId },
    data: { selfTrainingEnabled: enabled, selfTrainingRequiresReview: requiresReview },
  });

  revalidatePath("/ia/entrenamiento");
  return OK;
}

export async function runTrainingNow(weekStart: string): Promise<FormState> {
  const session = await requireAdmin();
  const start = weekStart ? new Date(weekStart) : new Date(Date.now() - 7 * 86400000);
  if (Number.isNaN(start.getTime())) return fail("Fecha inválida");

  const result = await runSelfTraining(session.orgId, start, true);
  revalidatePath("/ia/entrenamiento");

  if (!result.ok) return fail(result.error ?? "El entrenamiento falló");
  return { ok: true, message: `${result.learned} entradas nuevas para revisar` };
}
