import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PageHeader, Card, EmptyState } from "@/components/ui/misc";
import { TaskPanel } from "@/components/work/TaskPanel";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Tareas — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await requireSession();

  const [tasks, members] = await Promise.all([
    prisma.task.findMany({
      where: { orgId: session.orgId },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        assignee: { select: { name: true } },
        chat: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { orgId: session.orgId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Tareas"
        description="Pendientes sueltos o ligados a una conversación, con fecha límite y responsable."
      />

      <Card>
        <TaskPanel
          members={members}
          currentUserId={session.userId}
          tasks={tasks.map((task) => ({
            id: task.id,
            title: task.title,
            notes: task.notes,
            status: task.status,
            priority: task.priority,
            assigneeName: task.assignee?.name ?? null,
            chatId: task.chat?.id ?? null,
            chatName: task.chat?.name ?? null,
            dueAt: task.dueAt ? formatDate(task.dueAt) : null,
            overdue: Boolean(task.dueAt && task.status === "OPEN" && task.dueAt < new Date()),
          }))}
        />
      </Card>

      {tasks.length === 0 ? (
        <EmptyState
          title="Sin tareas"
          description="Crea la primera arriba, o conviértela desde un mensaje del chat."
        />
      ) : null}
    </div>
  );
}
