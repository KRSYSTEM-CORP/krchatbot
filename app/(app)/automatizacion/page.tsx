import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { RuleManager } from "@/components/automation/RuleManager";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Automatización — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const session = await requireAdmin();

  const [rules, phones, labels, members] = await Promise.all([
    prisma.automationRule.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.phone.findMany({
      where: { orgId: session.orgId },
      select: { id: true, label: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.label.findMany({
      where: { orgId: session.orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
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
        title="Reglas de automatización"
        description="Disparador, condiciones y acciones. A diferencia de la IA, esto hace exactamente lo mismo siempre — que es justo lo que se quiere para un SLA, una derivación por turno o un aviso automático."
      />

      <RuleManager
        rules={rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          trigger: rule.trigger,
          isActive: rule.isActive,
          phoneIds: rule.phoneIds,
          runCount: rule.runCount,
          conditions: JSON.stringify(rule.conditions, null, 2),
          actions: JSON.stringify(rule.actions, null, 2),
        }))}
        phones={phones}
        labels={labels}
        members={members}
      />
    </div>
  );
}
