"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Flag,
  GraduationCap,
  MoreVertical,
  Send,
  Sparkles,
  StickyNote,
  Tag,
  Ticket as TicketIcon,
  UserCheck,
  Wand2,
  Languages,
  FileText,
  Download,
  SmilePlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge, FormMessage } from "@/components/ui/misc";
import { AttachMenu, type AttachKind } from "@/components/inbox/AttachMenu";
import { VoiceRecorder } from "@/components/inbox/VoiceRecorder";
import { LocationPicker } from "@/components/inbox/LocationPicker";
import { LocationBubble } from "@/components/inbox/LocationBubble";
import { uploadFile } from "@/lib/upload-client";
import {
  sendChatMessage,
  sendChatAttachment,
  sendChatLocation,
  reactToMessage,
  addPrivateNote,
  assignChat,
  toggleChatLabel,
  setChatAi,
  takeOver,
  handBackToAi,
  triggerAiReply,
  markChatRead,
  draftReply,
  polishText,
  toggleMessageFlag,
} from "@/lib/actions/inbox";
import { trainFromMessage } from "@/lib/actions/ai";
import type { FormState } from "@/lib/validations";

type MessageItem = {
  kind: "message";
  id: string;
  at: string;
  body: string;
  fromMe: boolean;
  authorKind: string;
  author: string;
  ack: string;
  isFlagged: boolean;
  flagReason: string | null;
  mediaKind: string;
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  latitude: number | null;
  longitude: number | null;
  durationSeconds: number | null;
  quotedId: string | null;
  reactions: { emoji: string }[];
};

type NoteItem = {
  kind: "note";
  id: string;
  at: string;
  body: string;
  author: string;
  mentions: string[];
};

type TimelineItem = MessageItem | NoteItem;

type ChatMeta = {
  id: string;
  name: string;
  jid: string;
  type: "USER" | "GROUP";
  phoneLabel: string;
  phoneConnected: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  labelIds: string[];
  aiEnabled: boolean;
  aiFlagging: boolean;
  agentState: "INACTIVE" | "ACTIVE" | "THINKING" | "SNOOZED";
  snoozedUntil: string | null;
  imageUrl: string | null;
};

const initial: FormState = { ok: true };

// Mismo mecanismo que en ChatList (ver ese archivo) pero más seguido: es el
// chat que la persona está mirando en este momento, así que un mensaje nuevo
// debe aparecer casi tan rápido como en WhatsApp Web.
const CHAT_REFRESH_MS = 3000;

const agentStateLabel = {
  INACTIVE: "IA en espera",
  ACTIVE: "IA activa",
  THINKING: "IA escribiendo",
  SNOOZED: "IA en pausa",
} as const;

type PendingAttachment = { file: File; kind: AttachKind; previewUrl: string | null };

export function ChatView({
  chat,
  timeline,
  labels,
  members,
  currentUserId,
  aiNickname,
  aiGloballyOn,
  aiCanSend,
  tickets,
  isAdmin,
}: {
  chat: ChatMeta;
  timeline: TimelineItem[];
  labels: { id: string; name: string; color: string }[];
  members: { id: string; name: string; email: string }[];
  currentUserId: string;
  aiNickname: string;
  aiGloballyOn: boolean;
  aiCanSend: boolean;
  tickets: { id: string; number: number; title: string; status: string; priority: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"message" | "note">("message");
  const [pending, startTransition] = useTransition();
  const [assistOutput, setAssistOutput] = useState<string | null>(null);
  const [notice, setNotice] = useState<FormState>(initial);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const [sendState, sendAction, sending] = useActionState(sendChatMessage, initial);
  const [noteState, noteAction, savingNote] = useActionState(addPrivateNote, initial);

  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [menuFor, setMenuFor] = useState<{ item: MessageItem; x: number; y: number } | null>(null);
  const [improveFor, setImproveFor] = useState<{ question: string; answer: string } | null>(null);

  // Para la franja de "respondiendo a": encontrar el mensaje citado por id
  // sin volver a pedirlo al servidor — ya está en el mismo hilo cargado.
  const byId = useMemo(() => {
    const map = new Map<string, MessageItem>();
    for (const item of timeline) if (item.kind === "message") map.set(item.id, item);
    return map;
  }, [timeline]);

  // Al abrir el chat se baja al último mensaje y se limpian los no leídos:
  // dejar el contador en rojo sobre un chat que se está leyendo es ruido.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
    void markChatRead(chat.id);
  }, [chat.id, timeline.length]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, CHAT_REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    if (sendState.ok && !sendState.error && composerRef.current) {
      composerRef.current.value = "";
    }
  }, [sendState]);

  const run = (fn: () => Promise<FormState>) => {
    startTransition(async () => {
      const result = await fn();
      setNotice(result);
      router.refresh();
    });
  };

  const runAssist = (fn: () => Promise<FormState & { draft?: string; result?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      if (result.error) setNotice(result);
      else setAssistOutput(result.draft ?? result.result ?? null);
    });
  };

  function pickFile(file: File, kind: AttachKind) {
    const previewUrl = kind === "IMAGE" || kind === "VIDEO" ? URL.createObjectURL(file) : null;
    setAttachment({ file, kind, previewUrl });
    setCaption("");
  }

  function cancelAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    setCaption("");
  }

  function sendAttachment() {
    if (!attachment) return;
    setUploading(true);
    startTransition(async () => {
      try {
        const uploaded = await uploadFile(attachment.file, attachment.file.name);
        const result = await sendChatAttachment({
          chatId: chat.id,
          kind: attachment.kind,
          mediaUrl: uploaded.url,
          mimeType: uploaded.mimeType,
          fileName: uploaded.fileName,
          caption: caption.trim() || undefined,
        });
        setNotice(result);
      } catch (error) {
        setNotice({ ok: false, error: error instanceof Error ? error.message : "No se pudo enviar" });
      } finally {
        setUploading(false);
        cancelAttachment();
        router.refresh();
      }
    });
  }

  function sendVoiceNote(blob: Blob, durationSeconds: number) {
    startTransition(async () => {
      try {
        const uploaded = await uploadFile(blob, `nota-de-voz-${Date.now()}.webm`);
        const result = await sendChatAttachment({
          chatId: chat.id,
          kind: "AUDIO",
          mediaUrl: uploaded.url,
          mimeType: uploaded.mimeType,
          fileName: uploaded.fileName,
          durationSeconds,
        });
        setNotice(result);
      } catch (error) {
        setNotice({ ok: false, error: error instanceof Error ? error.message : "No se pudo enviar" });
      } finally {
        router.refresh();
      }
    });
  }

  function sendLocationPoint(point: { latitude: number; longitude: number; label: string }) {
    setShowLocationPicker(false);
    startTransition(async () => {
      const result = await sendChatLocation({
        chatId: chat.id,
        latitude: point.latitude,
        longitude: point.longitude,
        label: point.label || undefined,
      });
      setNotice(result);
      router.refresh();
    });
  }

  function react(messageId: string, emoji: string) {
    startTransition(async () => {
      await reactToMessage(chat.id, messageId, emoji);
      router.refresh();
    });
  }

  function toggleFlag(messageId: string) {
    setMenuFor(null);
    run(() => toggleMessageFlag(chat.id, messageId));
  }

  function openImprove(item: MessageItem) {
    setMenuFor(null);
    const index = timeline.findIndex((row) => row.id === item.id);
    // Si el mensaje es de la IA, la pregunta es lo último que mandó el
    // cliente antes; si el mensaje ES la pregunta del cliente, se parte de
    // ahí directo y se deja la respuesta en blanco para escribirla.
    const precedingInbound = [...timeline.slice(0, index)]
      .reverse()
      .find((row): row is MessageItem => row.kind === "message" && !row.fromMe);

    setImproveFor({
      question: item.fromMe ? (precedingInbound?.body ?? "") : item.body,
      answer: item.fromMe ? item.body : "",
    });
  }

  function saveImprovement(question: string, answer: string) {
    startTransition(async () => {
      const result = await trainFromMessage(question, answer);
      setNotice(result);
      if (result.ok) setImproveFor(null);
    });
  }

  return (
    <div className="flex h-dvh flex-col md:h-screen">
      {/* Cabecera */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2.5">
        <Link href="/inbox" className="md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </Link>

        {chat.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL de WhatsApp/R2, no un dominio configurado en next/image
          <img src={chat.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {chat.name.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{chat.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {chat.jid} · vía {chat.phoneLabel}
            {chat.assigneeName ? ` · ${chat.assigneeName}` : ""}
          </p>
        </div>

        <Badge
          tone={
            chat.agentState === "THINKING"
              ? "primary"
              : chat.agentState === "SNOOZED"
                ? "warning"
                : "neutral"
          }
        >
          <Sparkles className="h-3 w-3" />
          {agentStateLabel[chat.agentState]}
        </Badge>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Hilo */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="pane-scroll flex-1 space-y-2 bg-background px-3 py-4">
            {timeline.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sin mensajes todavía.
              </p>
            ) : (
              timeline.map((item, index) => (
                <TimelineRow
                  key={item.id}
                  item={item}
                  quoted={item.kind === "message" && item.quotedId ? byId.get(item.quotedId) : undefined}
                  aiNickname={aiNickname}
                  showDate={
                    index === 0 ||
                    new Date(item.at).toDateString() !==
                      new Date(timeline[index - 1].at).toDateString()
                  }
                  onReact={(emoji) => react(item.id, emoji)}
                  onMenu={(messageItem, x, y) => setMenuFor({ item: messageItem, x, y })}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Compositor */}
          <div className="safe-bottom border-t border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTab("message")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  tab === "message"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                Responder
              </button>
              <button
                type="button"
                onClick={() => setTab("note")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  tab === "note"
                    ? "bg-[var(--warning)] text-[var(--warning-foreground)]"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <StickyNote className="mr-1 inline h-3 w-3" />
                Nota interna
              </button>

              <div className="ml-auto flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => runAssist(() => draftReply(chat.id))}
                  title="Resumir la conversación y proponer una respuesta"
                >
                  <Wand2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Sugerir</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    runAssist(() =>
                      polishText(composerRef.current?.value ?? "", "translate", "inglés"),
                    )
                  }
                  title="Traducir lo que escribiste"
                >
                  <Languages className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {assistOutput ? (
              <div className="mb-2 rounded-lg border border-border bg-muted/60 p-3 text-sm">
                <p className="whitespace-pre-wrap">{assistOutput}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Se copia al compositor, no se envía: la IA propone y la
                      // persona decide, que es lo que hace útil la sugerencia.
                      if (composerRef.current) {
                        const draft = assistOutput.split(/BORRADOR:\s*/i).pop() ?? assistOutput;
                        composerRef.current.value = draft.trim();
                        composerRef.current.focus();
                      }
                      setAssistOutput(null);
                    }}
                  >
                    Usar en el mensaje
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAssistOutput(null)}>
                    Descartar
                  </Button>
                </div>
              </div>
            ) : null}

            {attachment ? (
              <div className="mb-2 flex items-start gap-3 rounded-lg border border-border bg-muted/60 p-3">
                {attachment.previewUrl && attachment.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa local (URL de objeto), no una imagen remota
                  <img
                    src={attachment.previewUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-md object-cover"
                  />
                ) : attachment.previewUrl && attachment.kind === "VIDEO" ? (
                  <video src={attachment.previewUrl} className="h-16 w-16 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate text-xs text-muted-foreground">{attachment.file.name}</p>
                  <input
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    placeholder="Agregar un comentario…"
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={uploading} onClick={sendAttachment}>
                      {uploading ? "Enviando…" : "Enviar"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={uploading} onClick={cancelAttachment}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "message" ? (
              <form action={sendAction} className="flex items-end gap-1.5">
                <input type="hidden" name="chatId" value={chat.id} />
                <AttachMenu onPickFile={pickFile} onPickLocation={() => setShowLocationPicker(true)} />
                <textarea
                  ref={composerRef}
                  name="body"
                  rows={1}
                  placeholder={
                    chat.phoneConnected
                      ? "Escribe un mensaje…"
                      : "El número no está conectado"
                  }
                  disabled={!chat.phoneConnected}
                  className="max-h-32 min-h-9 flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <VoiceRecorder onSend={sendVoiceNote} />
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-full"
                  disabled={sending || !chat.phoneConnected}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <form action={noteAction} className="space-y-2">
                <input type="hidden" name="chatId" value={chat.id} />
                <textarea
                  name="body"
                  rows={2}
                  placeholder="Nota visible sólo para el equipo…"
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center gap-2">
                  <select
                    name="mentions"
                    multiple
                    size={1}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {members.map((member) => (
                      <option key={member.id} value={member.email}>
                        Avisar a {member.name}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" variant="secondary" disabled={savingNote}>
                    Guardar nota
                  </Button>
                </div>
                <FormMessage state={noteState} />
              </form>
            )}
            <FormMessage state={sendState} />
          </div>
        </div>

        {/* Panel lateral */}
        <aside className="pane-scroll hidden w-72 shrink-0 space-y-4 border-l border-border bg-card p-4 xl:block">
          <FormMessage state={notice} />

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agente de IA
            </h3>

            {!aiGloballyOn ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                La IA está apagada para toda la organización.
              </p>
            ) : !aiCanSend ? (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Modo pasivo: la IA analiza y crea tickets, pero no le escribe al cliente.
              </p>
            ) : null}

            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span>Responder en este chat</span>
              <input
                type="checkbox"
                defaultChecked={chat.aiEnabled}
                onChange={(event) => run(() => setChatAi(chat.id, "aiEnabled", event.target.checked))}
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span>Marcar importantes</span>
              <input
                type="checkbox"
                defaultChecked={chat.aiFlagging}
                onChange={(event) =>
                  run(() => setChatAi(chat.id, "aiFlagging", event.target.checked))
                }
                className="h-4 w-4 accent-[var(--primary)]"
              />
            </label>

            <div className="flex gap-2">
              {chat.agentState === "SNOOZED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => run(() => handBackToAi(chat.id))}
                >
                  Devolver a la IA
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => run(() => takeOver(chat.id))}
                >
                  Tomar control
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1"
                disabled={pending || !aiGloballyOn}
                onClick={() => run(() => triggerAiReply(chat.id))}
              >
                <Sparkles className="h-4 w-4" />
                Responder
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UserCheck className="mr-1 inline h-3 w-3" />
              Asignado a
            </h3>
            <select
              defaultValue={chat.assigneeId ?? ""}
              onChange={(event) =>
                run(() => assignChat(chat.id, event.target.value || null))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Sin asignar</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.id === currentUserId ? " (tú)" : ""}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Tag className="mr-1 inline h-3 w-3" />
              Etiquetas
            </h3>
            {labels.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aún no hay etiquetas. Se crean desde Equipo.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {labels.map((label) => {
                  const active = chat.labelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => toggleChatLabel(chat.id, label.id))}
                      className={cn(
                        "rounded-full border px-2 py-1 text-xs font-medium transition-opacity",
                        !active && "opacity-50",
                      )}
                      style={{
                        borderColor: label.color,
                        backgroundColor: active ? `${label.color}22` : "transparent",
                        color: label.color,
                      }}
                    >
                      {label.name}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TicketIcon className="mr-1 inline h-3 w-3" />
              Tickets
            </h3>
            {tickets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin tickets en este chat.</p>
            ) : (
              <ul className="space-y-1">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href="/tickets"
                      className="block rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent"
                    >
                      <span className="font-medium">#{ticket.number}</span> {ticket.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {showLocationPicker ? (
        <LocationPicker onCancel={() => setShowLocationPicker(false)} onSend={sendLocationPoint} />
      ) : null}

      {menuFor ? (
        <MessageMenu
          x={menuFor.x}
          y={menuFor.y}
          item={menuFor.item}
          isAdmin={isAdmin}
          onClose={() => setMenuFor(null)}
          onCopy={() => {
            void navigator.clipboard.writeText(menuFor.item.body);
            setMenuFor(null);
          }}
          onToggleFlag={() => toggleFlag(menuFor.item.id)}
          onImprove={() => openImprove(menuFor.item)}
        />
      ) : null}

      {improveFor ? (
        <ImproveAnswerModal
          question={improveFor.question}
          answer={improveFor.answer}
          onCancel={() => setImproveFor(null)}
          onSave={saveImprovement}
        />
      ) : null}
    </div>
  );
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function MediaContent({ item }: { item: MessageItem }) {
  if (item.mediaKind === "IMAGE" && item.mediaUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL propia (local o R2), no un dominio configurado en next/image
      <img
        src={item.mediaUrl}
        alt={item.body || "Imagen"}
        className="max-h-72 w-full rounded-lg object-cover"
      />
    );
  }
  if (item.mediaKind === "STICKER" && item.mediaUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL propia (local o R2), no un dominio configurado en next/image
      <img src={item.mediaUrl} alt="Sticker" className="h-32 w-32 object-contain" />
    );
  }
  if (item.mediaKind === "VIDEO" && item.mediaUrl) {
    return <video src={item.mediaUrl} controls className="max-h-72 w-full rounded-lg" />;
  }
  if (item.mediaKind === "AUDIO" && item.mediaUrl) {
    return (
      <div className="flex items-center gap-2">
        <audio src={item.mediaUrl} controls className="h-10 w-56" />
        {item.durationSeconds ? (
          <span className="text-[10px] text-muted-foreground">{item.durationSeconds}s</span>
        ) : null}
      </div>
    );
  }
  if (item.mediaKind === "DOCUMENT" && item.mediaUrl) {
    return (
      <a
        href={item.mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2.5 rounded-md bg-black/5 px-2.5 py-2 hover:bg-black/10"
      >
        <FileText className="h-6 w-6 shrink-0 text-[var(--warning)]" />
        <span className="min-w-0 flex-1 truncate text-sm">{item.fileName || "Documento"}</span>
        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
      </a>
    );
  }
  if (item.mediaKind === "LOCATION" && item.latitude != null && item.longitude != null) {
    return <LocationBubble latitude={item.latitude} longitude={item.longitude} label={item.body} />;
  }
  return null;
}

function TimelineRow({
  item,
  quoted,
  aiNickname,
  showDate,
  onReact,
  onMenu,
}: {
  item: TimelineItem;
  quoted?: MessageItem;
  aiNickname: string;
  showDate: boolean;
  onReact: (emoji: string) => void;
  onMenu: (item: MessageItem, x: number, y: number) => void;
}) {
  const at = new Date(item.at);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      {showDate ? (
        <div className="py-2 text-center">
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
            {formatDate(at)}
          </span>
        </div>
      ) : null}

      {item.kind === "note" ? (
        // La nota interna se ve distinta a propósito: nadie debe confundirla
        // con algo que el cliente leyó.
        <div className="mx-auto max-w-lg rounded-lg border border-dashed border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-2">
          <p className="mb-0.5 text-[11px] font-medium text-[var(--warning)]">
            <StickyNote className="mr-1 inline h-3 w-3" />
            Nota interna · {item.author}
            {item.mentions.length > 0 ? ` → ${item.mentions.join(", ")}` : ""}
          </p>
          <p className="whitespace-pre-wrap text-sm">{item.body}</p>
        </div>
      ) : (
        <div className={cn("group flex items-end gap-1", item.fromMe ? "justify-end" : "justify-start")}>
          {!item.fromMe ? (
            <>
              <ReactTrigger open={pickerOpen} setOpen={setPickerOpen} onReact={onReact} side="right" />
              <MenuTrigger item={item} onMenu={onMenu} />
            </>
          ) : null}

          {/* La colita es un triángulo real (dos bordes transparentes, uno de
              color) pegado a la esquina inferior de la burbuja — así se ve
              como WhatsApp en vez de aproximarlo sólo con border-radius. */}
          <div className="relative">
            <div
              onContextMenu={(event) => {
                event.preventDefault();
                onMenu(item, event.clientX, event.clientY);
              }}
              className={cn(
                "max-w-[min(80%,32rem)] rounded-lg px-3 py-2 shadow-sm",
                item.fromMe ? "rounded-br-none bg-bubble-out" : "rounded-bl-none border border-border bg-bubble-in",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-0 h-3 w-3",
                  item.fromMe
                    ? "-right-1.5 border-b-[10px] border-l-[10px] border-b-bubble-out border-l-transparent"
                    : "-left-1.5 border-b-[10px] border-r-[10px] border-b-bubble-in border-r-transparent",
                )}
              />

              {item.authorKind === "AI" ? (
                <p className="mb-0.5 text-[11px] font-medium text-primary">
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  {aiNickname}
                </p>
              ) : null}

              {quoted ? (
                <div className="mb-1.5 rounded-md border-l-2 border-primary bg-black/5 px-2 py-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {quoted.body || `[${quoted.mediaKind.toLowerCase()}]`}
                  </p>
                </div>
              ) : null}

              <MediaContent item={item} />

              {item.mediaKind === "TEXT" || item.body ? (
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words text-sm",
                    item.mediaKind !== "TEXT" && item.mediaUrl ? "mt-1" : "",
                  )}
                >
                  {item.body}
                </p>
              ) : item.mediaKind === "TEXT" ? (
                <p className="whitespace-pre-wrap break-words text-sm italic text-muted-foreground">
                  [sin contenido]
                </p>
              ) : null}

              <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                {item.isFlagged ? (
                  <span title={item.flagReason ?? "Marcado como importante"}>
                    <Flag className="h-3 w-3 text-[var(--warning)]" />
                  </span>
                ) : null}
                {formatTime(at)}
                {item.fromMe ? (
                  item.ack === "READ" ? (
                    <CheckCheck className="h-3 w-3 text-primary" />
                  ) : item.ack === "DELIVERED" ? (
                    <CheckCheck className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )
                ) : null}
              </div>
            </div>

            {item.reactions.length > 0 ? (
              <div
                className={cn(
                  "absolute -bottom-2.5 flex items-center gap-0.5 rounded-full border border-border bg-card px-1 py-0.5 text-[11px] shadow-sm",
                  item.fromMe ? "right-1" : "left-1",
                )}
              >
                {item.reactions.map((r) => (
                  <span key={r.emoji}>{r.emoji}</span>
                ))}
              </div>
            ) : null}
          </div>

          {item.fromMe ? (
            <>
              <MenuTrigger item={item} onMenu={onMenu} />
              <ReactTrigger open={pickerOpen} setOpen={setPickerOpen} onReact={onReact} side="left" />
            </>
          ) : null}
        </div>
      )}
    </>
  );
}

function MenuTrigger({
  item,
  onMenu,
}: {
  item: MessageItem;
  onMenu: (item: MessageItem, x: number, y: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu(item, rect.left, rect.bottom + 4);
      }}
      className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
      title="Más opciones"
    >
      <MoreVertical className="h-3.5 w-3.5" />
    </button>
  );
}

function ReactTrigger({
  open,
  setOpen,
  onReact,
  side,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  onReact: (emoji: string) => void;
  side: "left" | "right";
}) {
  return (
    <div className="relative mb-1 shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
        title="Reaccionar"
      >
        <SmilePlus className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "absolute bottom-full z-20 mb-1 flex items-center gap-0.5 rounded-full border border-border bg-card p-1 shadow-lg",
              side === "left" ? "left-0" : "right-0",
            )}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(emoji);
                  setOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-base hover:bg-accent"
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// Menú contextual al hacer clic derecho (o tocar "⋮") sobre un mensaje —
// inspirado en el menú de mensaje de Periskope: copiar, marcar y, si es
// admin, mandar la respuesta a entrenar la base de conocimiento.
function MessageMenu({
  x,
  y,
  item,
  isAdmin,
  onClose,
  onCopy,
  onToggleFlag,
  onImprove,
}: {
  x: number;
  y: number;
  item: MessageItem;
  isAdmin: boolean;
  onClose: () => void;
  onCopy: () => void;
  onToggleFlag: () => void;
  onImprove: () => void;
}) {
  // Se ajusta para no salirse por la derecha/abajo de la ventana — un menú
  // que aparece medio cortado es peor que uno que se corrió un poco.
  const menuWidth = 220;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - 220);

  return (
    <>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="fixed inset-0 z-30 cursor-default"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        style={{ left, top }}
        className="fixed z-40 w-[220px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
      >
        {item.body ? (
          <button
            type="button"
            onClick={onCopy}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
            Copiar texto
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggleFlag}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent"
        >
          <Flag className="h-4 w-4 text-muted-foreground" />
          {item.isFlagged ? "Quitar de importantes" : "Marcar como importante"}
        </button>

        {isAdmin ? (
          <button
            type="button"
            onClick={onImprove}
            className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <GraduationCap className="h-4 w-4 text-primary" />
            Mejorar respuesta con IA
          </button>
        ) : null}
      </div>
    </>
  );
}

// Panel para corregir lo que la IA debió responder — la corrección se guarda
// tal cual en la base de conocimiento (source SELF_LEARNED, ya ACTIVA: la
// escribió una persona a propósito, no hace falta revisarla después).
function ImproveAnswerModal({
  question,
  answer,
  onCancel,
  onSave,
}: {
  question: string;
  answer: string;
  onCancel: () => void;
  onSave: (question: string, answer: string) => void;
}) {
  const [q, setQ] = useState(question);
  const [a, setA] = useState(answer);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h3 className="font-medium">Mejorar respuesta con IA</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Esto se guarda directo en la base de conocimiento (Conocimiento → Aprendidas) y la IA lo
          usará la próxima vez que le pregunten algo parecido.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Pregunta del cliente</label>
          <textarea
            value={q}
            onChange={(event) => setQ(event.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Respuesta correcta</label>
          <textarea
            value={a}
            onChange={(event) => setA(event.target.value)}
            rows={4}
            className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onSave(q, a)} disabled={!q.trim() || !a.trim()}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
