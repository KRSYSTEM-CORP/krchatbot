"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin, chatScope } from "@/lib/session";
import {
  ticketSchema,
  taskSchema,
  labelSchema,
  inviteSchema,
  fail,
  firstIssue,
  OK,
  type FormState,
} from "@/lib/validations";
import { hashPassword } from "@/lib/password";
import { runRules } from "@/lib/automation/engine";

// ── Tickets ─────────────────────────────────────────────────────────────────

export async function createTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = ticketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const data = parsed.data;

  if (data.chatId) {
    const chat = await prisma.chat.findFirst({
      where: { id: data.chatId, ...chatScope(session) },
      select: { id: true, phoneId: true, chatId: true, name: true, type: true, assigneeId: true },
    });
    if (!chat) return fail("No tienes acceso a ese chat");
  }

  // La numeración es por organización y consecutiva: "ticket #48" tiene que
  // significar lo mismo para todo el equipo.
  const last = await prisma.ticket.findFirst({
    where: { orgId: session.orgId },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const ticket = await prisma.ticket.create({
    data: {
      orgId: session.orgId,
      chatId: data.chatId || null,
      messageId: data.messageId || null,
      number: (last?.number ?? 0) + 1,
      title: data.title,
      description: data.description,
      priority: data.priority,
      assigneeId: data.assigneeId || null,
      createdById: session.userId,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
    },
  });

  if (data.chatId) {
    const chat = await prisma.chat.findUnique({
      where: { id: data.chatId },
      select: { phoneId: true, chatId: true, name: true, type: true, assigneeId: true },
    });
    if (chat) {
      await runRules({
        trigger: "TICKET_CREATED",
        orgId: session.orgId,
        chatId: data.chatId,
        phoneId: chat.phoneId,
        context: {
          messageBody: data.title,
          fromMe: false,
          chatType: chat.type,
          chatName: chat.name,
          chatJid: chat.chatId,
          chatLabelIds: [],
          isAssigned: Boolean(chat.assigneeId),
          isInternalContact: false,
        },
      });
    }
  }

  revalidatePath("/tickets");
  return { ok: true, message: `Ticket #${ticket.number} creado` };
}

export async function updateTicket(
  ticketId: string,
  data: {
    status?: "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED";
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    assigneeId?: string | null;
  },
): Promise<FormState> {
  const session = await requireSession();
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, orgId: session.orgId },
  });
  if (!ticket) return fail("Ticket no encontrado");

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...data,
      // El sello de resolución se pone una sola vez: es lo que alimenta la
      // métrica de tiempo de resolución, y reabrir y volver a cerrar no debe
      // borrar el historial de cuánto tomó la primera vez.
      ...(data.status === "RESOLVED" && !ticket.resolvedAt ? { resolvedAt: new Date() } : {}),
    },
  });

  revalidatePath("/tickets");
  return OK;
}

// ── Tareas ──────────────────────────────────────────────────────────────────

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  await prisma.task.create({
    data: {
      orgId: session.orgId,
      chatId: parsed.data.chatId || null,
      title: parsed.data.title,
      notes: parsed.data.notes,
      priority: parsed.data.priority,
      assigneeId: parsed.data.assigneeId || session.userId,
      createdById: session.userId,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    },
  });

  revalidatePath("/tareas");
  return OK;
}

export async function toggleTask(taskId: string): Promise<FormState> {
  const session = await requireSession();
  const task = await prisma.task.findFirst({
    where: { id: taskId, orgId: session.orgId },
  });
  if (!task) return fail("Tarea no encontrada");

  const done = task.status === "DONE";
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: done ? "OPEN" : "DONE",
      completedAt: done ? null : new Date(),
    },
  });

  revalidatePath("/tareas");
  return OK;
}

// ── Etiquetas ───────────────────────────────────────────────────────────────

export async function createLabel(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = labelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const exists = await prisma.label.findFirst({
    where: { orgId: session.orgId, name: parsed.data.name },
  });
  if (exists) return fail("Ya existe una etiqueta con ese nombre");

  await prisma.label.create({
    data: { orgId: session.orgId, name: parsed.data.name, color: parsed.data.color },
  });

  revalidatePath("/equipo");
  return OK;
}

export async function deleteLabel(labelId: string): Promise<FormState> {
  const session = await requireAdmin();
  const label = await prisma.label.findFirst({
    where: { id: labelId, orgId: session.orgId },
  });
  if (!label) return fail("Etiqueta no encontrada");

  // Borrar una etiqueta le quita el acceso a todo MEMBER que dependiera de
  // ella, así que se avisa con el conteo en vez de hacerlo en silencio.
  const affected = await prisma.userLabel.count({ where: { labelId } });
  await prisma.label.delete({ where: { id: labelId } });

  revalidatePath("/equipo");
  return {
    ok: true,
    message: affected
      ? `Etiqueta eliminada. ${affected} miembro(s) perdieron el acceso que daba.`
      : "Etiqueta eliminada",
  };
}

// ── Equipo ──────────────────────────────────────────────────────────────────

export async function inviteMembers(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    ...Object.fromEntries(formData),
    labelIds: formData.getAll("labelIds").map(String),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const emails = parsed.data.emails
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) return fail("Escribe al menos un correo");

  const hash = hashPassword(parsed.data.password);
  let created = 0;

  for (const email of emails) {
    const exists = await prisma.user.findFirst({ where: { email } });
    if (exists) continue;

    const user = await prisma.user.create({
      data: {
        orgId: session.orgId,
        email,
        name: parsed.data.name || email.split("@")[0],
        passwordHash: hash,
        role: parsed.data.role,
      },
    });

    // Sólo los MEMBER necesitan etiquetas: un ADMIN ya ve todo, y darle
    // etiquetas sugeriría un límite que no existe.
    if (parsed.data.role === "MEMBER" && parsed.data.labelIds.length > 0) {
      await prisma.userLabel.createMany({
        data: parsed.data.labelIds.map((labelId) => ({ userId: user.id, labelId })),
      });
    }
    created++;
  }

  revalidatePath("/equipo");
  if (created === 0) return fail("Todos esos correos ya tienen cuenta");
  return {
    ok: true,
    message: `${created} miembro(s) creados. Comparte la contraseña temporal por un canal seguro.`,
  };
}

export async function setMemberAccess(userId: string, labelIds: string[]): Promise<FormState> {
  const session = await requireAdmin();
  const user = await prisma.user.findFirst({
    where: { id: userId, orgId: session.orgId },
  });
  if (!user) return fail("Miembro no encontrado");

  await prisma.userLabel.deleteMany({ where: { userId } });
  if (labelIds.length > 0) {
    await prisma.userLabel.createMany({
      data: labelIds.map((labelId) => ({ userId, labelId })),
    });
  }

  revalidatePath("/equipo");
  return OK;
}

export async function setMemberStatus(
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<FormState> {
  const session = await requireAdmin();
  if (userId === session.userId) return fail("No puedes suspender tu propia cuenta");

  const user = await prisma.user.findFirst({
    where: { id: userId, orgId: session.orgId },
  });
  if (!user) return fail("Miembro no encontrado");

  await prisma.user.update({ where: { id: userId }, data: { status } });
  revalidatePath("/equipo");
  return OK;
}
