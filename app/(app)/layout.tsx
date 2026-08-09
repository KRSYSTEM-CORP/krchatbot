import { requireSession } from "@/lib/session";
import { NavBar } from "@/components/layout/NavBar";
import { PhoneStatusBanner } from "@/components/layout/PhoneStatusBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

  return (
    <div className="flex min-h-dvh flex-col">
      <PhoneStatusBanner isAdmin={isAdmin} />
      <div className="flex min-h-0 flex-1">
        <NavBar
          orgName={session.orgName}
          userName={session.userName}
          isAdmin={isAdmin}
          isSuperAdmin={session.isSuperAdmin}
        />
        {/* El padding inferior deja libre la barra de navegación del teléfono;
            en escritorio no existe y por eso se anula. */}
        <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
      </div>
    </div>
  );
}
