"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateTicket } from "@/lib/actions/work";

type Row = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  byAi: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  chatId: string | null;
  chatName: string | null;
  createdAt: string;
};

const priorityDot: Record<string, string> = {
  LOW: "bg-muted-foreground/40",
  MEDIUM: "bg-primary",
  HIGH: "bg-[var(--warning)]",
  URGENT: "bg-[var(--destructive)]",
};

const priorityLabel: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

const statuses = [
  { value: "OPEN", label: "Abierto" },
  { value: "IN_PROGRESS", label: "En curso" },
  { value: "WAITING", label: "En espera" },
  { value: "RESOLVED", label: "Resuelto" },
  { value: "CLOSED", label: "Cerrado" },
];

export function TicketBoard({
  tickets,
  members,
}: {
  tickets: Row[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const update = (id: string, data: Parameters<typeof updateTicket>[1]) => {
    startTransition(async () => {
      await updateTicket(id, data);
      router.refresh();
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Ticket</th>
            <th className="px-4 py-3 font-medium">Conversación</th>
            <th className="px-4 py-3 font-medium">Prioridad</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Responsable</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="align-middle">
              <td className="px-4 py-3">
                <p className="font-medium">
                  <span className="text-muted-foreground">#{ticket.number}</span> {ticket.title}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {ticket.createdAt}
                  {ticket.byAi ? (
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <Sparkles className="h-3 w-3" />
                      creado por la IA
                    </span>
                  ) : null}
                </p>
              </td>

              <td className="px-4 py-3">
                {ticket.chatId ? (
                  <Link
                    href={`/inbox/${ticket.chatId}`}
                    className="text-primary hover:underline"
                  >
                    {ticket.chatName}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>

              <td className="px-4 py-3">
                {/* Un punto de color en vez de repetir la palabra que ya
                    muestra el selector: da la señal de urgencia al recorrer la
                    columna sin decir dos veces lo mismo. */}
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot[ticket.priority])}
                  />
                  <select
                    defaultValue={ticket.priority}
                    disabled={pending}
                    onChange={(event) =>
                      update(ticket.id, {
                        priority: event.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
                      })
                    }
                    className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                  >
                    {Object.entries(priorityLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </span>
              </td>

              <td className="px-4 py-3">
                <select
                  defaultValue={ticket.status}
                  disabled={pending}
                  onChange={(event) =>
                    update(ticket.id, {
                      status: event.target.value as
                        | "OPEN"
                        | "IN_PROGRESS"
                        | "WAITING"
                        | "RESOLVED"
                        | "CLOSED",
                    })
                  }
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-4 py-3">
                <select
                  defaultValue={ticket.assigneeId ?? ""}
                  disabled={pending}
                  onChange={(event) =>
                    update(ticket.id, { assigneeId: event.target.value || null })
                  }
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="">Sin asignar</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
