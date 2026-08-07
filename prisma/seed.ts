import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scryptSync } from "node:crypto";

// Datos de arranque para poder recorrer el sistema sin conectar un número
// todavía: una organización, dos usuarios con roles distintos, etiquetas,
// conocimiento de ejemplo y una regla. No crea Phone ni Chat — esos aparecen
// solos cuando se escanea un QR y entra el primer mensaje.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function hash(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(plain, salt, 64).toString("hex")}`;
}

async function main() {
  // Va primero y siempre corre, incluso si la org demo ya existe — es la
  // única forma de conseguir un isSuperAdmin=true sin editar la base a mano.
  const platformOrg = await prisma.org.upsert({
    where: { slug: "kr-system" },
    update: {},
    create: { name: "KR System", slug: "kr-system", isExempt: true },
  });

  await prisma.user.upsert({
    where: { orgId_email: { orgId: platformOrg.id, email: "admin@krsystem-corp.com" } },
    update: { isSuperAdmin: true },
    create: {
      orgId: platformOrg.id,
      email: "admin@krsystem-corp.com",
      name: "KR System",
      passwordHash: hash("cambia-esta-clave"),
      role: "ADMIN",
      isSuperAdmin: true,
    },
  });
  console.log(
    "Super admin: admin@krsystem-corp.com / cambia-esta-clave — cámbiala antes de desplegar a producción.",
  );

  const existing = await prisma.org.findUnique({ where: { slug: "demo" } });
  if (existing) {
    console.log("La organización demo ya existe; no se hace nada más.");
    return;
  }

  const org = await prisma.org.create({
    data: {
      name: "Distribuidora Demo",
      slug: "demo",
      agentSettings: {
        create: {
          nickname: "Sofía",
          personality: "Cálida y directa. Tutea. Mensajes de dos o tres líneas.",
          rolePrompt: `Rol e identidad

Eres Sofía, la asistente de Distribuidora Demo en WhatsApp. Atiendes consultas de
catálogo, precios, disponibilidad y postventa.

Sobre el negocio

Distribuidora Demo vende productos de limpieza al detal y al mayor. Atendemos de
lunes a sábado, de 8:00 a 6:00. Despachamos a todo el país.

Cómo comunicarte

- Amable, paciente y al grano.
- Sólo das información que esté en la base de conocimiento.
- Si no tienes el dato, lo dices una vez y ofreces pasar la consulta al equipo.
- Nunca inventas precios, plazos ni disponibilidad.`,
          restrictions: `- No proceses reembolsos: deriva a administracion@demo.com.
- No des descuentos ni negocies precios.
- No confirmes fechas de entrega que no estén en la base de conocimiento.`,
          ticketRules: `Abre un ticket cuando:
1) El cliente reporte un producto dañado o incompleto.
2) Un pago no se haya reflejado después de 24 horas.
3) Pida un producto fuera de catálogo.`,
          privateNoteRules: `- Temas de facturación: avisa a administracion@demo.com.
- Compras al mayor: avisa a ventas@demo.com.`,
          flaggingPrompt: `- Marca todo lo que mencione "reclamo", "devolver" o "cancelar".
- Marca a quien pregunte por compras al mayor.`,
        },
      },
    },
  });

  await prisma.user.createMany({
    data: [
      {
        orgId: org.id,
        email: "admin@demo.com",
        name: "Rosa Admin",
        passwordHash: hash("demo1234"),
        role: "ADMIN",
      },
      {
        orgId: org.id,
        email: "agente@demo.com",
        name: "Luis Agente",
        passwordHash: hash("demo1234"),
        role: "MEMBER",
      },
    ],
  });

  const labels = [];
  for (const label of [
    { name: "Ventas", color: "#4f3ddb" },
    { name: "Soporte", color: "#1f7a4d" },
    { name: "Mayoristas", color: "#b8790f" },
  ]) {
    labels.push(await prisma.label.create({ data: { ...label, orgId: org.id } }));
  }

  // El agente arranca viendo sólo Soporte: así queda claro desde el primer día
  // que la etiqueta es lo que abre y cierra el acceso.
  const agent = await prisma.user.findFirst({
    where: { orgId: org.id, email: "agente@demo.com" },
  });
  if (agent) {
    await prisma.userLabel.create({
      data: { userId: agent.id, labelId: labels[1].id },
    });
  }

  await prisma.knowledgeItem.createMany({
    data: [
      {
        orgId: org.id,
        question: "¿Cuál es el horario?\n¿A qué hora abren?\n¿Están abiertos ahora?",
        answer: "Atendemos de lunes a sábado, de 8:00 de la mañana a 6:00 de la tarde. Los domingos no abrimos.",
      },
      {
        orgId: org.id,
        question: "¿Hacen envíos?\n¿Despachan a otras ciudades?\n¿Tienen delivery?",
        answer:
          "Sí. Dentro de la ciudad el envío cuesta 3 $ y llega el mismo día si el pedido entra antes de las 2:00. A otras ciudades despachamos por agencia y el costo lo cobra la agencia al recibir.",
      },
      {
        orgId: org.id,
        question: "¿Cómo puedo pagar?\n¿Qué formas de pago aceptan?\n¿Aceptan transferencia?",
        answer:
          "Aceptamos efectivo, pago móvil, transferencia y tarjeta de débito. Para pedidos al mayor pedimos el 50 % por adelantado.",
      },
      {
        orgId: org.id,
        question: "¿Venden al mayor?\n¿Tienen precios de mayorista?\n¿Cuál es la compra mínima?",
        answer:
          "Sí, vendemos al mayor a partir de 12 unidades por producto. Los precios de mayorista los maneja el equipo de ventas; te paso con ellos para darte la lista actualizada.",
        instructions:
          "Cuando alguien pregunte por precios de mayorista, deja una nota interna avisando a ventas@demo.com.",
      },
    ],
  });

  await prisma.quickReply.createMany({
    data: [
      {
        orgId: org.id,
        shortcut: "/horario",
        body: "Atendemos de lunes a sábado, de 8:00 a 6:00. Los domingos no abrimos.",
      },
      {
        orgId: org.id,
        shortcut: "/gracias",
        body: "¡Gracias a ti! Cualquier cosa, aquí estamos.",
      },
    ],
  });

  await prisma.automationRule.create({
    data: {
      orgId: org.id,
      name: "Ticket automático por reclamo",
      trigger: "MESSAGE_RECEIVED",
      conditions: {
        op: "OR",
        items: [
          { field: "message.body", op: "contains", value: "reclamo" },
          { field: "message.body", op: "contains", value: "devolver" },
          { field: "message.body", op: "contains", value: "cancelar" },
        ],
      },
      actions: [
        { type: "FLAG_MESSAGE" },
        {
          type: "CREATE_TICKET",
          title: "Reclamo detectado en {{ chat.nombre }}",
          priority: "HIGH",
        },
      ],
    },
  });

  console.log("Listo. Entra con admin@demo.com / demo1234 (o agente@demo.com para ver el acceso limitado).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
