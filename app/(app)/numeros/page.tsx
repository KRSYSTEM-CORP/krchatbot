import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { PhoneManager } from "@/components/phones/PhoneManager";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Números — KR ChatBot" };
export const dynamic = "force-dynamic";

export default async function PhonesPage() {
  const session = await requireAdmin();

  const phones = await prisma.phone.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { chats: true, messages: true } } },
  });

  const evolutionReady = Boolean(process.env.EVOLUTION_URL);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Números de WhatsApp"
        description="Funciona con números normales y de WhatsApp Business — no hace falta la API oficial de Meta. Por eso puedes manejar grupos y no hay ventana de 24 horas ni plantillas que aprobar."
      />

      {!evolutionReady ? (
        <p className="rounded-md bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3 py-2 text-sm text-[var(--warning)]">
          Falta <code>EVOLUTION_URL</code> en el entorno. Levanta Evolution API y apunta esa
          variable a su dirección antes de conectar un número.
        </p>
      ) : null}

      <PhoneManager
        phones={phones.map((phone) => ({
          id: phone.id,
          label: phone.label,
          number: phone.number,
          status: phone.status,
          qrCode: phone.qrCode,
          chats: phone._count.chats,
          messages: phone._count.messages,
        }))}
      />
    </div>
  );
}
