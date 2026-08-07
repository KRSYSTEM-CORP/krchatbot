import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { TeamManager } from "@/components/team/TeamManager";
import { PageHeader } from "@/components/ui/misc";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Equipo — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await requireAdmin();

  const [members, labels, org] = await Promise.all([
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
    prisma.org.findUniqueOrThrow({
      where: { id: session.orgId },
      select: { isExempt: true, nextPaymentDueDate: true },
    }),
  ]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Equipo y etiquetas"
        description="Las etiquetas hacen dos trabajos a la vez: organizan los chats y definen qué puede ver cada miembro. Un admin ve todo; un miembro ve sólo los chats que llevan sus etiquetas."
      />

      {!org.isExempt && org.nextPaymentDueDate ? (
        <div className="flex max-w-sm items-center justify-between rounded-lg border border-border p-4 text-sm">
          <span>
            Suscripción mensual vence el <span className="font-medium">{formatDate(org.nextPaymentDueDate)}</span>
          </span>
          <Link href="/facturacion" className="ml-3 shrink-0 text-primary underline underline-offset-2">
            Ver detalles
          </Link>
        </div>
      ) : null}

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
