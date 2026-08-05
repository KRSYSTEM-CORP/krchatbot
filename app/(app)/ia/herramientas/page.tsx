import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ToolManager } from "@/components/ai/ToolManager";

export const metadata = { title: "Herramientas — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const session = await requireAdmin();

  const tools = await prisma.customTool.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <ToolManager
      tools={tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        method: tool.method,
        endpoint: tool.endpoint,
        authType: tool.authType,
        authHeader: tool.authHeader ?? "",
        isActive: tool.isActive,
        parameters: JSON.stringify(tool.parameters, null, 2),
      }))}
    />
  );
}
