"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessagesSquare,
  LayoutDashboard,
  Ticket,
  ListChecks,
  Sparkles,
  Zap,
  Send,
  Users,
  Smartphone,
  BarChart3,
  CreditCard,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/actions/auth";

const links = [
  { href: "/", label: "Panel", icon: LayoutDashboard, adminOnly: false },
  { href: "/inbox", label: "Bandeja", icon: MessagesSquare, adminOnly: false },
  { href: "/tickets", label: "Tickets", icon: Ticket, adminOnly: false },
  { href: "/tareas", label: "Tareas", icon: ListChecks, adminOnly: false },
  { href: "/ia", label: "IA", icon: Sparkles, adminOnly: true },
  { href: "/automatizacion", label: "Reglas", icon: Zap, adminOnly: true },
  { href: "/envios", label: "Envíos", icon: Send, adminOnly: true },
  { href: "/analitica", label: "Métricas", icon: BarChart3, adminOnly: false },
  { href: "/numeros", label: "Números", icon: Smartphone, adminOnly: true },
  { href: "/equipo", label: "Equipo", icon: Users, adminOnly: true },
  { href: "/facturacion", label: "Facturación", icon: CreditCard, adminOnly: true },
];

export function NavBar({
  orgName,
  userName,
  isAdmin,
}: {
  orgName: string;
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const visible = links.filter((link) => !link.adminOnly || isAdmin);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Escritorio: barra lateral fija. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border px-4 py-4">
          <p className="text-sm font-semibold">KR ChatBot</p>
          <p className="truncate text-xs text-muted-foreground">{orgName}</p>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {visible.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive(link.href)
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <link.icon className="h-4 w-4 shrink-0" />
              {link.label}
            </Link>
          ))}
        </nav>

        <form action={logout} className="border-t border-border p-2">
          <p className="px-3 pb-2 pt-1 text-xs text-muted-foreground">{userName}</p>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </form>
      </aside>

      {/* Teléfono: barra inferior con lo que se usa de pie. El resto del menú
          vive en el panel, al que se llega desde el primer ícono. */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card md:hidden">
        {visible.slice(0, 5).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
              isActive(link.href) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <link.icon className="h-5 w-5" />
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
