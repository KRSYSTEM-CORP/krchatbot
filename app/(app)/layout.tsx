import { requireSession } from "@/lib/session";
import { NavBar } from "@/components/layout/NavBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-dvh">
      <NavBar
        orgName={session.orgName}
        userName={session.userName}
        isAdmin={session.role === "ADMIN"}
        isSuperAdmin={session.isSuperAdmin}
      />
      {/* El padding inferior deja libre la barra de navegación del teléfono;
          en escritorio no existe y por eso se anula. */}
      <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
    </div>
  );
}
