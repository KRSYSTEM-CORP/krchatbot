import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/misc";
import { TicketBoard } from "@/components/work/TicketBoard";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Tickets — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const session = await requireSession();
  const { estado } = await searchParams;

  const statuses = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] as const;
  const filter = statuses.includes(estado as never)
    ? (estado as (typeof statuses)[number])
    : undefined;

  const [tickets, members, counts] = await Promise.all([
    prisma.ticket.findMany({
      where: { orgId: session.orgId, ...(filter ? { status: filter } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        assignee: { select: { id: true, name: true } },
        chat: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { orgId: session.orgId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { orgId: session.orgId },
      _count: true,
    }),
  ]);

  const countOf = (status: string) =>
    counts.find((row) => row.status === status)?._count ?? 0;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Tickets"
        description="Cada ticket queda ligado a la conversación que lo originó, con todo su historial."
      />

      <div className="flex flex-wrap gap-2">
        <Link href="/tickets">
          <Badge tone={!filter ? "primary" : "neutral"}>Todos</Badge>
        </Link>
        {statuses.map((status) => (
          <Link key={status} href={`/tickets?estado=${status}`}>
            <Badge tone={filter === status ? "primary" : "neutral"}>
              {statusLabel[status]} · {countOf(status)}
            </Badge>
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          title="No hay tickets"
          description="Se crean desde un mensaje del chat, con una regla de automatización, o los abre la IA cuando detecta un caso que necesita seguimiento."
        />
      ) : (
        <Card className="p-0">
          <TicketBoard
            tickets={tickets.map((ticket) => ({
              id: ticket.id,
              number: ticket.number,
              title: ticket.title,
              status: ticket.status,
              priority: ticket.priority,
              byAi: ticket.byAi,
              assigneeId: ticket.assignee?.id ?? null,
              assigneeName: ticket.assignee?.name ?? null,
              chatId: ticket.chat?.id ?? null,
              chatName: ticket.chat?.name ?? null,
              createdAt: formatDateTime(ticket.createdAt),
            }))}
            members={members}
          />
        </Card>
      )}
    </div>
  );
}

const statusLabel: Record<string, string> = {
  OPEN: "Abiertos",
  IN_PROGRESS: "En curso",
  WAITING: "En espera",
  RESOLVED: "Resueltos",
  CLOSED: "Cerrados",
};
