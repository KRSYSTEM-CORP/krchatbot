import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { AgentSettingsForm } from "@/components/ai/AgentSettingsForm";

export const metadata = { title: "Ajustes de IA — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const session = await requireAdmin();

  const [settings, phones] = await Promise.all([
    prisma.agentSettings.findUnique({ where: { orgId: session.orgId } }),
    prisma.phone.findMany({
      where: { orgId: session.orgId },
      select: { id: true, label: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!settings) return null;

  return (
    <AgentSettingsForm
      settings={{
        enabled: settings.enabled,
        nickname: settings.nickname,
        activation: settings.activation,
        canSendMessages: settings.canSendMessages,
        canCreateTickets: settings.canCreateTickets,
        canCreatePrivateNotes: settings.canCreatePrivateNotes,
        responseDelaySeconds: settings.responseDelaySeconds,
        snoozeMinutes: settings.snoozeMinutes,
        allowedPhoneIds: settings.allowedPhoneIds,
      }}
      phones={phones}
    />
  );
}
