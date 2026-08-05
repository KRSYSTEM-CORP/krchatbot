"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ruleSchema, fail, firstIssue, OK, type FormState } from "@/lib/validations";
import type { ActionSpec, ConditionNode } from "@/lib/automation/engine";

export async function saveRule(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = ruleSchema.safeParse({
    ...Object.fromEntries(formData),
    isActive: formData.get("isActive") === "on",
    phoneIds: formData.getAll("phoneIds").map(String),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  // Condiciones y acciones llegan como JSON desde el editor del cliente. Se
  // validan aquí porque un JSON roto no rompe el guardado: rompe la ejecución,
  // días después, en silencio.
  let conditions: ConditionNode;
  let actions: ActionSpec[];
  try {
    conditions = JSON.parse(parsed.data.conditions);
    if (!conditions || !Array.isArray(conditions.items)) throw new Error();
  } catch {
    return fail("Las condiciones no tienen un formato válido");
  }
  try {
    actions = JSON.parse(parsed.data.actions);
    if (!Array.isArray(actions)) throw new Error();
  } catch {
    return fail("Las acciones no tienen un formato válido");
  }
  if (actions.length === 0) return fail("Agrega al menos una acción");

  const { id, name, trigger, isActive, phoneIds } = parsed.data;
  const data = { name, trigger, isActive, phoneIds, conditions, actions };

  if (id) {
    const exists = await prisma.automationRule.findFirst({
      where: { id, orgId: session.orgId },
    });
    if (!exists) return fail("Regla no encontrada");
    await prisma.automationRule.update({ where: { id }, data });
  } else {
    await prisma.automationRule.create({ data: { ...data, orgId: session.orgId } });
  }

  revalidatePath("/automatizacion");
  return { ok: true, message: "Regla guardada" };
}

export async function toggleRule(ruleId: string): Promise<FormState> {
  const session = await requireAdmin();
  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, orgId: session.orgId },
  });
  if (!rule) return fail("Regla no encontrada");

  await prisma.automationRule.update({
    where: { id: ruleId },
    data: { isActive: !rule.isActive },
  });

  revalidatePath("/automatizacion");
  return OK;
}

export async function deleteRule(ruleId: string): Promise<FormState> {
  const session = await requireAdmin();
  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, orgId: session.orgId },
  });
  if (!rule) return fail("Regla no encontrada");

  await prisma.automationRule.delete({ where: { id: ruleId } });
  revalidatePath("/automatizacion");
  return OK;
}
