import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession, chatScope } from "@/lib/session";
import { ChatView } from "@/components/inbox/ChatView";
import { formatJid } from "@/lib/jid";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const session = await requireSession();

  const chat = await prisma.chat.findFirst({
    where: { id: chatId, ...chatScope(session) },
    include: {
      phone: { select: { id: true, label: true, status: true } },
      assignee: { select: { id: true, name: true } },
      labels: { select: { labelId: true } },
      messages: { orderBy: { timestamp: "asc" }, take: 200 },
      notes: {
        orderBy: { createdAt: "asc" },
        take: 50,
        include: { author: { select: { name: true } } },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, number: true, title: true, status: true, priority: true },
      },
    },
  });

  if (!chat) notFound();

  const [labels, members, settings] = await Promise.all([
    prisma.label.findMany({ where: { orgId: session.orgId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { orgId: session.orgId, status: "ACTIVE" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.agentSettings.findUnique({ where: { orgId: session.orgId } }),
  ]);

  // Notas y mensajes se intercalan por hora: una nota interna sólo se entiende
  // si se lee junto al mensaje que la provocó.
  const timeline = [
    ...chat.messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      at: message.timestamp.toISOString(),
      body: message.body,
      fromMe: message.fromMe,
      authorKind: message.authorKind,
      author: message.fromJid,
      ack: message.ack,
      isFlagged: message.isFlagged,
      flagReason: message.flagReason,
      mediaKind: message.kind,
      mediaUrl: message.mediaUrl,
      mimeType: message.mimeType,
      fileName: message.fileName,
      latitude: message.latitude,
      longitude: message.longitude,
      durationSeconds: message.durationSeconds,
      quotedId: message.quotedId,
      reactions: (message.reactions as { emoji: string }[] | null) ?? [],
    })),
    ...chat.notes.map((note) => ({
      kind: "note" as const,
      id: note.id,
      at: note.createdAt.toISOString(),
      body: note.body,
      author: note.byAi ? "IA" : (note.author?.name ?? "Equipo"),
      mentions: note.mentions,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <ChatView
      chat={{
        id: chat.id,
        name: chat.name,
        jid: formatJid(chat.chatId, session.maskNumbers),
        type: chat.type,
        phoneLabel: chat.phone.label,
        phoneConnected: chat.phone.status === "CONNECTED",
        assigneeId: chat.assignee?.id ?? null,
        assigneeName: chat.assignee?.name ?? null,
        labelIds: chat.labels.map((l) => l.labelId),
        aiEnabled: chat.aiEnabled,
        aiFlagging: chat.aiFlagging,
        agentState: chat.agentState,
        snoozedUntil: chat.snoozedUntil?.toISOString() ?? null,
      }}
      timeline={timeline}
      labels={labels}
      members={members}
      currentUserId={session.userId}
      aiNickname={settings?.nickname ?? "IA"}
      aiGloballyOn={Boolean(settings?.enabled)}
      aiCanSend={Boolean(settings?.canSendMessages)}
      tickets={chat.tickets}
    />
  );
}
