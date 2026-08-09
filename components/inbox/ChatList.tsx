"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Search, Users, Sparkles, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatChatStamp } from "@/lib/format";
import { toggleChatLabel } from "@/lib/actions/inbox";

// El webhook de Evolution deja el mensaje en la base al instante, pero un
// Server Component sólo lo muestra cuando se vuelve a renderizar — sin esto,
// la bandeja se queda congelada hasta que alguien navega o recarga a mano.
// router.refresh() re-pide los Server Components sin perder el estado del
// cliente (el filtro, el texto buscado); se detiene si la pestaña está en
// segundo plano para no gastar cuota en balde.
const LIST_REFRESH_MS = 5000;

function useLiveRefresh(intervalMs: number) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
}

export type ChatRow = {
  id: string;
  name: string;
  type: "USER" | "GROUP";
  unreadCount: number;
  agentState: "INACTIVE" | "ACTIVE" | "THINKING" | "SNOOZED";
  aiEnabled: boolean;
  lastMessageAt: string | null;
  preview: string;
  phoneLabel: string;
  labels: { id: string; name: string; color: string }[];
  imageUrl: string | null;
};

type Filter = "all" | "unread" | "groups" | "ai";

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "unread", label: "Sin leer" },
  { key: "groups", label: "Grupos" },
  { key: "ai", label: "Con IA" },
];

export function ChatList({
  chats,
  labels,
}: {
  chats: ChatRow[];
  labels: { id: string; name: string; color: string }[];
}) {
  const params = useParams<{ chatId?: string }>();
  const activeId = params?.chatId;
  useLiveRefresh(LIST_REFRESH_MS);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [labelId, setLabelId] = useState<string>("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return chats.filter((chat) => {
      if (needle && !`${chat.name} ${chat.preview}`.toLowerCase().includes(needle)) return false;
      if (labelId && !chat.labels.some((label) => label.id === labelId)) return false;
      if (filter === "unread" && chat.unreadCount === 0) return false;
      if (filter === "groups" && chat.type !== "GROUP") return false;
      if (filter === "ai" && !chat.aiEnabled) return false;
      return true;
    });
  }, [chats, query, filter, labelId]);

  function toggleLabel(chatId: string, id: string) {
    startTransition(async () => {
      await toggleChatLabel(chatId, id);
      router.refresh();
    });
  }

  return (
    // En el teléfono la lista ocupa la pantalla completa y desaparece al abrir
    // un chat; en escritorio son dos paneles lado a lado.
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-r border-border bg-card md:w-80 lg:w-96",
        activeId && "hidden md:flex",
      )}
    >
      <div className="space-y-3 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar chat o mensaje"
            className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                filter === item.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {labels.length > 0 ? (
          <select
            value={labelId}
            onChange={(event) => setLabelId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Todas las etiquetas</option>
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="pane-scroll flex-1">
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {chats.length === 0
              ? "Todavía no hay conversaciones. Cuando entre el primer mensaje aparecerá aquí."
              : "Ningún chat coincide con el filtro."}
          </p>
        ) : (
          <ul>
            {visible.map((chat) => (
              <li key={chat.id} className="relative">
                <Link
                  href={`/inbox/${chat.id}`}
                  className={cn(
                    "flex gap-3 border-b border-border px-3 py-3 transition-colors hover:bg-accent/60",
                    activeId === chat.id && "bg-secondary",
                  )}
                >
                  {chat.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL de WhatsApp/R2, no un dominio configurado en next/image
                    <img
                      src={chat.imageUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                      {chat.type === "GROUP" ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        chat.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{chat.name}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatChatStamp(chat.lastMessageAt ? new Date(chat.lastMessageAt) : null)}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {chat.agentState === "THINKING" ? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Sparkles className="h-3 w-3" />
                            La IA está escribiendo…
                          </span>
                        ) : (
                          chat.preview || "Sin mensajes"
                        )}
                      </p>
                      {chat.unreadCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {chat.unreadCount}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {chat.labels.slice(0, 3).map((label) => (
                        <span
                          key={label.id}
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: `${label.color}22`,
                            color: label.color,
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                      {labels.length > 0 ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPickerFor((current) => (current === chat.id ? null : chat.id));
                          }}
                          className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent"
                        >
                          <Plus className="h-2.5 w-2.5" />
                          Etiqueta
                        </button>
                      ) : null}
                    </div>
                  </div>
                </Link>

                {pickerFor === chat.id ? (
                  <>
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setPickerFor(null)}
                    />
                    <div className="absolute right-3 top-full z-40 mt-1 w-48 rounded-lg border border-border bg-card p-1.5 shadow-lg">
                      {labels.map((label) => {
                        const active = chat.labels.some((l) => l.id === label.id);
                        return (
                          <button
                            key={label.id}
                            type="button"
                            disabled={pending}
                            onClick={() => toggleLabel(chat.id, label.id)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: label.color }}
                            />
                            <span className="min-w-0 flex-1 truncate">{label.name}</span>
                            {active ? <X className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
