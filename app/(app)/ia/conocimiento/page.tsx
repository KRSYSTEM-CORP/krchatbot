import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { KnowledgeManager } from "@/components/ai/KnowledgeManager";

export const metadata = { title: "Base de conocimiento — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const session = await requireAdmin();

  const items = await prisma.knowledgeItem.findMany({
    where: { orgId: session.orgId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 500,
  });

  return (
    <KnowledgeManager
      items={items.map((item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
        instructions: item.instructions,
        status: item.status,
        source: item.source,
        usageCount: item.usageCount,
      }))}
    />
  );
}
