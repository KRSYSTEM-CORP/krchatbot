import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession, chatScope } from "@/lib/session";
import { Stat, Card, PageHeader, Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { formatChatStamp, daysAgo } from "@/lib/format";
import { Smartphone, Sparkles } from "lucide-react";

export const metadata = { title: "Panel — KR ChatBot" };
export const dynamic = "force-dynamic";

const phoneTone = {
  CONNECTED: "success",
  QR_PENDING: "warning",
  CONNECTING: "warning",
  DISCONNECTED: "danger",
} as const;

const phoneLabel = {
  CONNECTED: "Conectado",
  QR_PENDING: "Esperando QR",
  CONNECTING: "Conectando",
  DISCONNECTED: "Desconectado",
} as const;

export default async function DashboardPage() {
  const session = await requireSession();
  const scope = chatScope(session);
  const since = daysAgo(7);

  const [chats, unread, flagged, openTickets, phones, team, settings, recent] =
    await Promise.all([
      prisma.chat.count({ where: scope }),
      prisma.chat.count({ where: { ...scope, unreadCount: { gt: 0 } } }),
      prisma.message.count({
        where: { orgId: session.orgId, isFlagged: true, timestamp: { gte: since } },
      }),
      prisma.ticket.count({
        where: { orgId: session.orgId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] } },
      }),
      prisma.phone.findMany({ where: { orgId: session.orgId }, orderBy: { createdAt: "asc" } }),
      prisma.user.count({ where: { orgId: session.orgId, status: "ACTIVE" } }),
      prisma.agentSettings.findUnique({ where: { orgId: session.orgId } }),
      prisma.chat.findMany({
        where: scope,
        orderBy: { lastMessageAt: "desc" },
        take: 6,
        select: { id: true, name: true, lastMessageAt: true, unreadCount: true, agentState: true },
      }),
    ]);

  const aiHandled = await prisma.message.count({
    where: { orgId: session.orgId, authorKind: "AI", timestamp: { gte: since } },
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={`Hola, ${session.userName.split(" ")[0]}`}
        description="Resumen de los últimos 7 días."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Chats" value={chats} />
        <Stat label="Sin leer" value={unread} tone={unread > 0 ? "warning" : undefined} />
        <Stat label="Marcados" value={flagged} hint="Por la IA o el equipo" />
        <Stat
          label="Tickets abiertos"
          value={openTickets}
          tone={openTickets > 0 ? "danger" : undefined}
        />
        <Stat label="Equipo activo" value={team} />
      </div>

      {/* El estado de la IA es lo primero que alguien quiere saber al entrar:
          si está apagada, si está en modo pasivo, o si ya está atendiendo. */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="font-medium">
              {!settings?.enabled
                ? "El agente de IA está apagado"
                : settings.canSendMessages
                  ? "El agente de IA está atendiendo clientes"
                  : "El agente de IA está en modo pasivo"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {!settings?.enabled
                ? "Enciéndelo cuando la base de conocimiento tenga contenido suficiente."
                : settings.canSendMessages
                  ? `Responde como "${settings.nickname}" y escala al equipo cuando hace falta. Atendió ${aiHandled} mensajes esta semana.`
                  : "Analiza, crea tickets y deja notas internas, pero no le escribe a los clientes."}
            </p>
          </div>
        </div>
        {session.role === "ADMIN" ? (
          <Link href="/ia">
            <Button variant={settings?.enabled ? "outline" : "default"}>Configurar IA</Button>
          </Link>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Números conectados</h2>
            {session.role === "ADMIN" ? (
              <Link href="/numeros" className="text-sm text-primary hover:underline">
                Administrar
              </Link>
            ) : null}
          </div>

          {phones.length === 0 ? (
            <EmptyState
              title="Todavía no hay números"
              description="Conecta un número de WhatsApp escaneando un QR. Funciona con números normales y de WhatsApp Business."
              action={
                session.role === "ADMIN" ? (
                  <Link href="/numeros">
                    <Button size="sm">
                      <Smartphone className="h-4 w-4" />
                      Conectar número
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {phones.map((phone) => (
                <li
                  key={phone.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{phone.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {phone.number ? `+${phone.number}` : "Sin vincular"}
                    </p>
                  </div>
                  <Badge tone={phoneTone[phone.status]}>{phoneLabel[phone.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Conversaciones recientes</h2>
            <Link href="/inbox" className="text-sm text-primary hover:underline">
              Ver bandeja
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Cuando entre el primer mensaje aparecerá aquí.
            </p>
          ) : (
            <ul className="space-y-1">
              {recent.map((chat) => (
                <li key={chat.id}>
                  <Link
                    href={`/inbox/${chat.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{chat.name}</span>
                    {chat.agentState === "THINKING" ? (
                      <Badge tone="primary">IA escribiendo</Badge>
                    ) : null}
                    {chat.unreadCount > 0 ? (
                      <Badge tone="warning">{chat.unreadCount}</Badge>
                    ) : null}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatChatStamp(chat.lastMessageAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
