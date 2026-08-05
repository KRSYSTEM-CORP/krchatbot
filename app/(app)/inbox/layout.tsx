import { prisma } from "@/lib/prisma";
import { requireSession, chatScope } from "@/lib/session";
import { ChatList } from "@/components/inbox/ChatList";
import type { MessageKind } from "@prisma/client";

const MEDIA_PREVIEW: Partial<Record<MessageKind, string>> = {
  IMAGE: "📷 Foto",
  VIDEO: "🎥 Video",
  AUDIO: "🎤 Nota de voz",
  DOCUMENT: "📄 Documento",
  LOCATION: "📍 Ubicación",
  STICKER: "Sticker",
};

function previewOf(message: { body: string; fromMe: boolean; kind: MessageKind } | undefined): string {
  if (!message) return "";
  const prefix = message.fromMe ? "Tú: " : "";
  const text = message.body || MEDIA_PREVIEW[message.kind] || "";
  return `${prefix}${text}`;
}

// La bandeja es un layout de dos paneles: la lista vive aquí para que no se
// vuelva a montar (ni pierda su scroll) cada vez que se abre otro chat.
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const scope = chatScope(session);

  const [chats, labels] = await Promise.all([
    prisma.chat.findMany({
      where: scope,
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      include: {
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
        phone: { select: { label: true } },
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
          select: { body: true, fromMe: true, kind: true },
        },
      },
    }),
    prisma.label.findMany({ where: { orgId: session.orgId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex h-dvh md:h-screen">
      <ChatList
        chats={chats.map((chat) => ({
          id: chat.id,
          name: chat.name,
          type: chat.type,
          unreadCount: chat.unreadCount,
          agentState: chat.agentState,
          aiEnabled: chat.aiEnabled,
          lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
          preview: previewOf(chat.messages[0]),
          phoneLabel: chat.phone.label,
          labels: chat.labels.map((l) => l.label),
        }))}
        labels={labels}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
