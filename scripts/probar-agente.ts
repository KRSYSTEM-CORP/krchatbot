import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { shouldActivate, runAgent } from "@/lib/ai/agent";
import { retrieveKnowledge } from "@/lib/ai/knowledge";
import { aiIsConfigured, aiProviderName } from "@/lib/ai/client";

// Banco de pruebas del agente. Corre el mismo camino que en producción —
// activación, recuperación de conocimiento, herramientas — pero sobre un chat
// desechable y con el envío desactivado, así que ningún cliente recibe nada.
//
//   npm run ia:probar -- "¿a qué hora abren?"
//   npm run ia:probar               (usa una batería de mensajes de ejemplo)
//
// Es la forma de ajustar el rol y las restricciones sin estrenarlos con gente
// real: se cambia el prompt, se vuelve a correr, se compara.

const EJEMPLOS = [
  "Hola, buenas tardes",
  "¿A qué hora abren?",
  "¿Cuánto cuesta el envío a Valencia?",
  "Compré algo y salió dañado, ¿qué hago?",
  "Necesito 300 unidades, ¿me hacen precio?",
  "Quiero hablar con una persona de verdad",
];

async function main() {
  if (!aiIsConfigured()) {
    console.error(
      "Falta una clave de IA en el .env: pon ANTHROPIC_API_KEY o GEMINI_API_KEY (esta última es gratis, sin tarjeta — aistudio.google.com/apikey).",
    );
    process.exit(1);
  }

  const org = await prisma.org.findFirstOrThrow({
    include: { agentSettings: true, phones: true },
    orderBy: { createdAt: "asc" },
  });
  const settings = org.agentSettings;
  if (!settings) throw new Error(`La organización "${org.name}" no tiene ajustes de IA.`);
  const phone = org.phones[0];
  if (!phone) throw new Error("Conecta al menos un número antes de probar el agente.");

  console.log(`Organización: ${org.name}`);
  console.log(`Motor de IA: ${aiProviderName()}`);
  console.log(`Agente: ${settings.nickname} · ${settings.enabled ? "encendido" : "APAGADO"} · ` +
    `${settings.canSendMessages ? "responde al cliente" : "modo pasivo"}\n`);

  // El banco de pruebas respeta el interruptor maestro a propósito: si aquí
  // respondiera con la IA apagada, estaría probando algo que en producción no
  // ocurre. Se avisa y se corta en vez de dar una falsa sensación de que anda.
  if (!settings.enabled) {
    console.error("El agente está apagado. Enciéndelo en IA › Ajustes (o con --encender) y repite.");
    if (!process.argv.includes("--encender")) process.exit(1);
    await prisma.agentSettings.update({ where: { orgId: org.id }, data: { enabled: true } });
    settings.enabled = true;
    console.log("(encendido para esta prueba con --encender)\n");
  }

  const mensajes = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const aProbar = mensajes.length > 0 ? mensajes : EJEMPLOS;

  // Un chat de pruebas reutilizable, marcado con un JID que no existe en
  // WhatsApp para que nunca pueda salir un mensaje real por error.
  const JID = "banco-de-pruebas@interno";
  const chat = await prisma.chat.upsert({
    where: { orgId_chatId: { orgId: org.id, chatId: JID } },
    create: {
      orgId: org.id,
      phoneId: phone.id,
      chatId: JID,
      type: "USER",
      name: "Banco de pruebas",
      aiEnabled: true,
    },
    update: { aiEnabled: true, agentState: "INACTIVE", snoozedUntil: null },
  });

  for (const texto of aProbar) {
    console.log("─".repeat(70));
    console.log(`CLIENTE: ${texto}`);

    const activa = await shouldActivate(texto, settings.activationPrompt);
    console.log(`  ¿responde? ${activa ? "sí" : "no — se queda callado"}`);
    if (!activa) continue;

    const conocimiento = await retrieveKnowledge(org.id, texto);
    console.log(`  conocimiento aplicable: ${conocimiento.length} entradas`);

    await prisma.message.deleteMany({ where: { chatId: chat.id } });
    await prisma.message.create({
      data: {
        orgId: org.id,
        chatId: chat.id,
        phoneId: phone.id,
        fromJid: JID,
        fromMe: false,
        body: texto,
        timestamp: new Date(),
      },
    });
    await prisma.chat.update({
      where: { id: chat.id },
      data: { agentState: "ACTIVE", snoozedUntil: null },
    });

    const resultado = await runAgent(chat.id);

    if (resultado.toolsUsed.length > 0) {
      console.log(`  herramientas: ${resultado.toolsUsed.join(", ")}`);
    }
    if (resultado.escalated) console.log("  → ESCALADO al equipo humano");
    console.log(`\n  ${settings.nickname.toUpperCase()}: ${resultado.reply ?? "(sin respuesta)"}\n`);
  }

  console.log("─".repeat(70));
  if (!settings.canSendMessages) {
    console.log("Nota: el agente está en modo pasivo, así que en producción NO enviaría");
    console.log("estas respuestas — sólo crearía los tickets y notas que veas arriba.");
  }

  // Se limpia el rastro para que el chat de pruebas no ensucie las métricas.
  await prisma.message.deleteMany({ where: { chatId: chat.id } });
  await prisma.queueJob.deleteMany({ where: { chatJid: JID } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
