"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import * as evolution from "@/lib/evolution";
import { phoneSchema, fail, firstIssue, OK, type FormState } from "@/lib/validations";

// Conectar un número es crear una instancia en Evolution y esperar a que
// alguien escanee el QR desde el teléfono. El QR llega por webhook
// (org.phone.qr) y se guarda en Phone.qrCode para pintarlo en pantalla.

export async function connectPhone(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = phoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(firstIssue(parsed.error));

  // El nombre de instancia debe ser único en toda la Evolution, no sólo en la
  // organización: el sufijo aleatorio evita chocar con otro despliegue que
  // comparta el mismo contenedor.
  const instanceName = `${session.orgId.slice(-8)}-${Math.random().toString(36).slice(2, 8)}`;

  const phone = await prisma.phone.create({
    data: {
      orgId: session.orgId,
      label: parsed.data.label,
      instanceName,
      status: "CONNECTING",
    },
  });

  try {
    const result = await evolution.createInstance(instanceName);
    const qr = result.qrcode?.base64;
    if (qr) {
      await prisma.phone.update({
        where: { id: phone.id },
        data: { qrCode: qr, status: "QR_PENDING", lastQrAt: new Date() },
      });
    }
  } catch (error) {
    // La fila se borra para no dejar números fantasma en el panel cuando
    // Evolution no está levantada.
    await prisma.phone.delete({ where: { id: phone.id } });
    return fail(
      error instanceof Error ? error.message : "No se pudo crear la instancia en Evolution",
    );
  }

  revalidatePath("/numeros");
  return { ok: true, message: "Escanea el código QR desde WhatsApp para conectar el número" };
}

export async function refreshQr(phoneId: string): Promise<FormState> {
  const session = await requireAdmin();
  const phone = await prisma.phone.findFirst({
    where: { id: phoneId, orgId: session.orgId },
  });
  if (!phone) return fail("Número no encontrado");

  try {
    const result = await evolution.connectInstance(phone.instanceName);
    if (result.base64) {
      await prisma.phone.update({
        where: { id: phone.id },
        data: { qrCode: result.base64, status: "QR_PENDING", lastQrAt: new Date() },
      });
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No se pudo pedir un QR nuevo");
  }

  revalidatePath("/numeros");
  return OK;
}

export async function syncPhoneState(phoneId: string): Promise<FormState> {
  const session = await requireAdmin();
  const phone = await prisma.phone.findFirst({
    where: { id: phoneId, orgId: session.orgId },
  });
  if (!phone) return fail("Número no encontrado");

  try {
    const result = await evolution.instanceState(phone.instanceName);
    const state = result.instance?.state;
    await prisma.phone.update({
      where: { id: phone.id },
      data: {
        status:
          state === "open" ? "CONNECTED" : state === "connecting" ? "CONNECTING" : "DISCONNECTED",
        ...(state === "open" ? { qrCode: null, connectedAt: new Date() } : {}),
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Evolution no respondió");
  }

  revalidatePath("/numeros");
  return OK;
}

export async function restartPhone(phoneId: string): Promise<FormState> {
  const session = await requireAdmin();
  const phone = await prisma.phone.findFirst({
    where: { id: phoneId, orgId: session.orgId },
  });
  if (!phone) return fail("Número no encontrado");

  try {
    await evolution.restartInstance(phone.instanceName);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No se pudo reiniciar");
  }

  revalidatePath("/numeros");
  return { ok: true, message: "Reiniciando la sesión…" };
}

// Cierra la sesión de WhatsApp y devuelve el número al estado QR. No borra
// chats ni mensajes: el historial es del negocio, no de la sesión.
export async function resetPhone(phoneId: string): Promise<FormState> {
  const session = await requireAdmin();
  const phone = await prisma.phone.findFirst({
    where: { id: phoneId, orgId: session.orgId },
  });
  if (!phone) return fail("Número no encontrado");

  try {
    await evolution.logoutInstance(phone.instanceName);
  } catch {
    // Si la instancia ya no existe del lado de Evolution, el estado local
    // igual debe reflejar que está desconectada.
  }

  await prisma.phone.update({
    where: { id: phone.id },
    data: { status: "DISCONNECTED", qrCode: null, jid: null },
  });

  revalidatePath("/numeros");
  return OK;
}

export async function deletePhone(phoneId: string): Promise<FormState> {
  const session = await requireAdmin();
  const phone = await prisma.phone.findFirst({
    where: { id: phoneId, orgId: session.orgId },
    include: { _count: { select: { chats: true } } },
  });
  if (!phone) return fail("Número no encontrado");

  try {
    await evolution.deleteInstance(phone.instanceName);
  } catch {
    // Igual que arriba: borrar el registro local es lo que pidió el usuario.
  }

  await prisma.phone.delete({ where: { id: phone.id } });
  revalidatePath("/numeros");
  return { ok: true, message: `Número eliminado junto con ${phone._count.chats} chats` };
}
