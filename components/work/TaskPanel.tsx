"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { Badge, FormMessage, type BadgeTone } from "@/components/ui/misc";
import { createTask, toggleTask } from "@/lib/actions/work";
import type { FormState } from "@/lib/validations";

type Row = {
  id: string;
  title: string;
  notes: string;
  status: string;
  priority: string;
  assigneeName: string | null;
  chatId: string | null;
  chatName: string | null;
  dueAt: string | null;
  overdue: boolean;
};

const priorityTone: Record<string, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "primary",
  HIGH: "warning",
  URGENT: "danger",
};

const initial: FormState = { ok: true };

export function TaskPanel({
  tasks,
  members,
  currentUserId,
}: {
  tasks: Row[];
  members: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createTask, initial);
  const [toggling, startTransition] = useTransition();

  const open = tasks.filter((task) => task.status === "OPEN");
  const done = tasks.filter((task) => task.status === "DONE");

  return (
    <div className="space-y-5">
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <Input name="title" placeholder="Nueva tarea…" required />
        <Select name="priority" defaultValue="MEDIUM" className="sm:w-32">
          <option value="LOW">Baja</option>
          <option value="MEDIUM">Media</option>
          <option value="HIGH">Alta</option>
          <option value="URGENT">Urgente</option>
        </Select>
        <Select name="assigneeId" defaultValue={currentUserId} className="sm:w-44">
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={pending}>
          Agregar
        </Button>
        <div className="sm:col-span-4">
          <FormMessage state={state} />
        </div>
      </form>

      <ul className="divide-y divide-border">
        {[...open, ...done].map((task) => (
          <li key={task.id} className="flex items-start gap-3 py-3">
            <input
              type="checkbox"
              checked={task.status === "DONE"}
              disabled={toggling}
              onChange={() =>
                startTransition(async () => {
                  await toggleTask(task.id);
                  router.refresh();
                })
              }
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  task.status === "DONE" && "text-muted-foreground line-through",
                )}
              >
                {task.title}
              </p>
              {task.notes ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{task.notes}</p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {task.assigneeName ? <span>{task.assigneeName}</span> : null}
                {task.chatId ? (
                  <Link href={`/inbox/${task.chatId}`} className="text-primary hover:underline">
                    {task.chatName}
                  </Link>
                ) : null}
                {task.dueAt ? (
                  <span className={cn(task.overdue && "font-medium text-[var(--destructive)]")}>
                    {task.overdue ? "Venció el " : "Para el "}
                    {task.dueAt}
                  </span>
                ) : null}
              </div>
            </div>

            <Badge tone={priorityTone[task.priority]}>{task.priority}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
