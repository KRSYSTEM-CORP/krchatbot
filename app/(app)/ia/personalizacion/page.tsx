import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { PersonalizationForm } from "@/components/ai/PersonalizationForm";

export const metadata = { title: "Personalización — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function PersonalizationPage() {
  const session = await requireAdmin();
  const settings = await prisma.agentSettings.findUnique({
    where: { orgId: session.orgId },
  });
  if (!settings) return null;

  return (
    <PersonalizationForm
      orgName={session.orgName}
      values={{
        rolePrompt: settings.rolePrompt,
        restrictions: settings.restrictions,
        personality: settings.personality,
        activationPrompt: settings.activationPrompt,
        ticketRules: settings.ticketRules,
        privateNoteRules: settings.privateNoteRules,
        flaggingPrompt: settings.flaggingPrompt,
      }}
    />
  );
}
