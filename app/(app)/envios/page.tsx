import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { BroadcastManager } from "@/components/broadcast/BroadcastManager";
import { PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Envíos masivos — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const session = await requireAdmin();

  const [broadcasts, phones, lists] = await Promise.all([
    prisma.broadcast.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        phone: { select: { label: true } },
        _count: { select: { recipients: true } },
      },
    }),
    prisma.phone.findMany({
      where: { orgId: session.orgId },
      select: { id: true, label: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.savedChatList.findMany({
      where: { orgId: session.orgId },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Envíos masivos"
        description="Mensajes a muchos chats o grupos a la vez, con variables por destinatario y programación recurrente."
      />

      <BroadcastManager
        phones={phones}
        lists={lists.map((list) => ({
          id: list.id,
          name: list.name,
          entries: list.entries as { jid: string; name: string }[],
        }))}
        broadcasts={broadcasts.map((broadcast) => ({
          id: broadcast.id,
          name: broadcast.name,
          body: broadcast.body,
          status: broadcast.status,
          repeat: broadcast.repeat,
          phoneLabel: broadcast.phone.label,
          total: broadcast._count.recipients,
          sent: broadcast.sentCount,
          failed: broadcast.failedCount,
          throttleSeconds: broadcast.throttleSeconds,
          scheduledAt: broadcast.scheduledAt ? formatDateTime(broadcast.scheduledAt) : null,
        }))}
      />
    </div>
  );
}
