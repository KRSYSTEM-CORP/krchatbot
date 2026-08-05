import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { TrainingPanel } from "@/components/ai/TrainingPanel";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata = { title: "Auto-entrenamiento — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const session = await requireAdmin();

  const [settings, runs, pendingReview] = await Promise.all([
    prisma.agentSettings.findUnique({ where: { orgId: session.orgId } }),
    prisma.trainingRun.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.knowledgeItem.count({
      where: { orgId: session.orgId, status: "NEEDS_REVIEW" },
    }),
  ]);

  if (!settings) return null;

  return (
    <TrainingPanel
      enabled={settings.selfTrainingEnabled}
      requiresReview={settings.selfTrainingRequiresReview}
      pendingReview={pendingReview}
      runs={runs.map((run) => ({
        id: run.id,
        week: formatDate(run.weekStart),
        status: run.status,
        learned: run.learned,
        isManual: run.isManual,
        error: run.error,
        finishedAt: run.finishedAt ? formatDateTime(run.finishedAt) : null,
      }))}
    />
  );
}
