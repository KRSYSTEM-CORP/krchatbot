"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { runSelfTraining } from "@/lib/ai/training";
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
