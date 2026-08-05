import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { TeamManager } from "@/components/team/TeamManager";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Equipo — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requireAdmin();

  const [members, labels] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: session.orgId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { labelAccess: { select: { labelId: true } } },
    }),
    prisma.label.findMany({
      where: { orgId: session.orgId },
      orderBy: { name: "asc" },
      include: { _count: { select: { chats: true } } },
    }),
  ]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Equipo y etiquetas"
        description="Las etiquetas hacen dos trabajos a la vez: organizan los chats y definen qué puede ver cada miembro. Un admin ve todo; un miembro ve sólo los chats que llevan sus etiquetas."
      />

      <TeamManager
        currentUserId={session.userId}
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status,
          labelIds: member.labelAccess.map((l) => l.labelId),
        }))}
        labels={labels.map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color,
          chats: label._count.chats,
        }))}
      />
    </div>
  );
}
