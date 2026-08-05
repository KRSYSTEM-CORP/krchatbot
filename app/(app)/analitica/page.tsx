import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui/misc";
import { MessageChart } from "@/components/analytics/MessageChart";
import { formatDuration, daysAgo } from "@/lib/format";

export const metadata = { title: "Métricas — KR ChatBot" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const session = await requireSession();
  const { dias } = await searchParams;
  const days = RANGES.includes(Number(dias) as never) ? Number(dias) : 7;
  const since = daysAgo(days);

  const messages = await prisma.message.findMany({
    where: { orgId: session.orgId, timestamp: { gte: since } },
    select: {
      chatId: true,
      fromMe: true,
      authorKind: true,
      isFlagged: true,
      timestamp: true,
    },
    orderBy: { timestamp: "asc" },
  });

  const incoming = messages.filter((m) => !m.fromMe);
  const outgoing = messages.filter((m) => m.fromMe);
  const byAi = outgoing.filter((m) => m.authorKind === "AI");

  // Mediana del primer tiempo de respuesta por chat: la media la distorsiona
  // un solo chat olvidado el fin de semana, la mediana no.
  const firstResponses: number[] = [];
  const byChat = new Map<string, typeof messages>();
  for (const message of messages) {
    const list = byChat.get(message.chatId) ?? [];
    list.push(message);
    byChat.set(message.chatId, list);
  }
  for (const list of byChat.values()) {
    let pendingSince: Date | null = null;
    for (const message of list) {
      if (!message.fromMe) {
        pendingSince ??= message.timestamp;
      } else if (pendingSince) {
        firstResponses.push(message.timestamp.getTime() - pendingSince.getTime());
        pendingSince = null;
      }
    }
  }
  firstResponses.sort((a, b) => a - b);
  const median =
    firstResponses.length > 0 ? firstResponses[Math.floor(firstResponses.length / 2)] : null;

  // Serie diaria para la gráfica.
  const buckets = new Map<string, { day: string; entrantes: number; salientes: number; ia: number }>();
  for (let index = days - 1; index >= 0; index--) {
    const date = daysAgo(index);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, { day: key.slice(5), entrantes: 0, salientes: 0, ia: 0 });
  }
  for (const message of messages) {
    const key = message.timestamp.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (!message.fromMe) bucket.entrantes++;
    else if (message.authorKind === "AI") bucket.ia++;
    else bucket.salientes++;
  }

  const [tickets, resolved, teamRows] = await Promise.all([
    prisma.ticket.count({ where: { orgId: session.orgId, createdAt: { gte: since } } }),
    prisma.ticket.findMany({
      where: { orgId: session.orgId, resolvedAt: { gte: since } },
      select: { createdAt: true, resolvedAt: true },
    }),
    prisma.chat.groupBy({
      by: ["assigneeId"],
      where: { orgId: session.orgId, assigneeId: { not: null } },
      _count: true,
    }),
  ]);

  const members = await prisma.user.findMany({
    where: { orgId: session.orgId },
    select: { id: true, name: true },
  });

  const resolutionMs =
    resolved.length > 0
      ? resolved.reduce(
          (sum, ticket) =>
            sum + ((ticket.resolvedAt?.getTime() ?? 0) - ticket.createdAt.getTime()),
          0,
        ) / resolved.length
      : null;

  const aiShare = outgoing.length > 0 ? Math.round((byAi.length / outgoing.length) * 100) : 0;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Métricas" description={`Últimos ${days} días.`} />

      <div className="flex gap-2">
        {RANGES.map((range) => (
          <a
            key={range}
            href={`/analitica?dias=${range}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              days === range ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {range} días
          </a>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Chats activos" value={byChat.size} />
        <Stat label="Mensajes entrantes" value={incoming.length} />
        <Stat label="Mensajes salientes" value={outgoing.length} />
        <Stat
          label="Resueltos por la IA"
          value={`${aiShare}%`}
          hint={`${byAi.length} de ${outgoing.length} salientes`}
          tone={aiShare > 0 ? "success" : undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Primera respuesta (mediana)"
          value={median !== null ? formatDuration(median) : "—"}
        />
        <Stat label="Mensajes marcados" value={messages.filter((m) => m.isFlagged).length} />
        <Stat label="Tickets creados" value={tickets} />
        <Stat
          label="Resolución promedio"
          value={resolutionMs !== null ? formatDuration(resolutionMs) : "—"}
          hint={`${resolved.length} resueltos`}
        />
      </div>

      <Card>
        <h2 className="mb-4 font-medium">Volumen de mensajes</h2>
        {messages.length === 0 ? (
          <EmptyState
            title="Sin datos todavía"
            description="Las métricas aparecen a medida que entren y salgan mensajes."
          />
        ) : (
          <MessageChart data={Array.from(buckets.values())} />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-medium">Carga por miembro</h2>
        {teamRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay chats asignados a nadie.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {teamRows.map((row) => (
              <li key={row.assigneeId} className="flex items-center justify-between py-2 text-sm">
                <span>{members.find((m) => m.id === row.assigneeId)?.name ?? "—"}</span>
                <span className="tabular-nums text-muted-foreground">{row._count} chats</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
