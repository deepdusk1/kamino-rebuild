import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { GradientButton, OutlineButton } from "@/components/k";
import { fieldClass } from "@/components/community/sheet";
import {
  getUploadAllowance,
  chatContentTools,
  pinChatMessage,
  sendChatAttachment,
  shareInChat,
  blockChatPeer,
  updateGroupChat,
} from "@/lib/kamino/content-v9";
import { ContentMedia } from "./post-tools";
import { MediaLibraryPicker } from "@/components/media-v10-library";

export function useChatContent(roomId: number) {
  return useQuery({
    queryKey: ["chatContent", roomId],
    queryFn: () => chatContentTools({ data: { roomId } }),
    refetchInterval: 5000,
  });
}

export function ChatMessageContent({ roomId, messageId }: { roomId: number; messageId: number }) {
  const q = useChatContent(roomId),
    media = q.data?.attachments.filter((a) => a.messageId === messageId),
    card = q.data?.cards.find((a) => a.messageId === messageId);
  return (
    <>
      {media?.map((m) => (
        <div className="mx-3 mb-3 max-w-[440px]" key={m.id}>
          <ContentMedia media={m} />
        </div>
      ))}
      {card ? (
        <a
          className="k-focus mx-3 mb-3 block max-w-[440px] rounded-card border border-border bg-surface p-4 shadow-card"
          href={card.href}
        >
          <span className="text-xs font-bold uppercase text-accent">Shared {card.kind}</span>
          <p className="mt-1 font-extrabold text-ink">{card.title}</p>
          <p className="mt-1 text-sm text-muted">{card.subtitle}</p>
        </a>
      ) : null}
    </>
  );
}

export function ChatContentPanel({
  roomId,
  myId,
  messages,
}: {
  roomId: number;
  myId: string;
  messages: { id: number; body: string }[];
}) {
  const allowance = useQuery({
      queryKey: ["uploadAllowance"],
      queryFn: () => getUploadAllowance(),
    }),
    q = useChatContent(roomId),
    client = useQueryClient(),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<"post" | "profile" | "community">("post"),
    [target, setTarget] = useState(""),
    [messageId, setMessageId] = useState(""),
    [handle, setHandle] = useState("");
  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await fn();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["chatContent", roomId] }),
        client.invalidateQueries({ queryKey: ["room", roomId] }),
        client.invalidateQueries({ queryKey: ["chatsOverview"] }),
      ]);
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function file(file: File) {
    const max =
      allowance.data?.limits[file.type === "image/gif" ? "gif" : "file"] ??
      (file.type === "image/gif" ? 4_000_000 : 8_000_000);
    if (file.size > max) return toast.error(`Files must be under ${max / 1_000_000} MB.`);
    const reader = new FileReader();
    reader.onload = () =>
      void run(
        () =>
          sendChatAttachment({
            data: {
              roomId,
              media: {
                kind: file.type === "image/gif" ? "gif" : "file",
                dataUrl: String(reader.result),
                filename: file.name,
              },
            },
          }),
        "Attachment sent",
      );
    reader.onerror = () => toast.error("Could not read the file.");
    reader.readAsDataURL(file);
  }
  if (!q.data) return null;
  const d = q.data;
  return (
    <details className="mx-3 mt-2 shrink-0 rounded-card border border-border bg-surface text-sm lg:mx-4">
      <summary className="k-focus cursor-pointer rounded-card p-3 font-bold">
        📌 Shared files, pins & people {d.pins.length ? `· ${d.pins.length} pinned` : ""}
      </summary>
      <div className="max-h-[45dvh] space-y-4 overflow-y-auto p-3 pt-0">
        <details><summary className="min-h-11 cursor-pointer font-bold">Choose a GIF from your library</summary><MediaLibraryPicker kind="gif" onSelect={media=>void run(()=>sendChatAttachment({data:{roomId,media}}),"GIF sent")}/></details>
        {d.pins.map((p) => (
          <div
            key={p.id}
            className="flex items-start justify-between gap-2 rounded-tile bg-surface-alt p-3"
          >
            <p className="whitespace-pre-wrap">📌 {p.body}</p>
            {d.canPin ? (
              <button
                onClick={() =>
                  void run(() =>
                    pinChatMessage({ data: { roomId, messageId: p.id, pinned: false } }),
                  )
                }
                className="min-h-9 font-bold text-accent"
              >
                Unpin
              </button>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <label className="k-focus inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border px-4 font-bold text-accent">
            Attach a file or animated GIF
            <input
              className="sr-only"
              type="file"
              accept=".pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx,.gif"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.[0]) void file(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>
          <a
            className="min-h-11 rounded-full border border-border px-4 py-3 font-bold text-accent"
            href="/inbox-tools"
          >
            Start a group
          </a>
        </div>
        <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
          <select
            className={fieldClass}
            aria-label="Share card type"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="post">Post</option>
            <option value="community">Community</option>
            <option value="profile">Profile</option>
          </select>
          <input
            className={fieldClass}
            aria-label="Post, profile or community identifier"
            placeholder={
              kind === "post"
                ? "Paste a post link"
                : kind === "community"
                  ? "Paste a community link"
                  : "@handle or profile link"
            }
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <GradientButton
            disabled={busy || !target.trim()}
            onClick={() =>
              void run(
                () => shareInChat({ data: { roomId, kind, targetId: target.trim() } }),
                "Card shared",
              )
            }
          >
            Share card
          </GradientButton>
        </div>
        {d.canPin ? (
          <div className="flex gap-2">
            <select
              className={`${fieldClass} min-w-0 flex-1`}
              value={messageId}
              onChange={(e) => setMessageId(e.target.value)}
              aria-label="Choose a message to pin"
            >
              <option value="">Choose a message to pin</option>
              {messages.slice(-100).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.body.slice(0, 60) || "Attachment"}
                </option>
              ))}
            </select>
            <OutlineButton
              disabled={!messageId || busy}
              onClick={() =>
                void run(() =>
                  pinChatMessage({ data: { roomId, messageId: Number(messageId), pinned: true } }),
                )
              }
            >
              Pin
            </OutlineButton>
          </div>
        ) : null}
        <section className="space-y-2">
          <p className="font-bold">People</p>
          {d.people.map((p) => (
            <div key={p.userId} className="flex items-center justify-between gap-2">
              <a href={`/u/${p.handle}`} className="min-h-10 min-w-0">
                <span className="font-semibold">{p.name}</span>
                <span className="block text-xs text-muted">
                  {p.lastActive
                    ? `Last active ${new Date(p.lastActive).toLocaleString()}`
                    : "Activity private"}
                </span>
              </a>
              {p.userId !== myId ? (
                <button
                  className="min-h-10 rounded-full px-3 font-semibold text-danger"
                  onClick={() => {
                    if (confirm(`Block ${p.name}?`))
                      void run(
                        () => blockChatPeer({ data: { roomId, userId: p.userId } }),
                        "Member blocked",
                      );
                  }}
                >
                  Block
                </button>
              ) : null}
              {d.kind === "group" && d.ownerId === myId && p.userId !== myId ? (
                <button
                  className="min-h-10 rounded-full px-3 text-danger"
                  onClick={() =>
                    void run(() => updateGroupChat({ data: { roomId, removeUserId: p.userId } }))
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </section>
        {d.kind === "group" ? (
          <div className="space-y-2">
            <a href={`/groups/${roomId}`} className="text-sm font-bold text-accent">Group settings & roles →</a>
            {d.ownerId === myId ? (
              <div className="flex gap-2">
                <input
                  className={fieldClass}
                  placeholder="Mutual follower @handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
                <OutlineButton
                  disabled={!handle.trim() || busy}
                  onClick={() =>
                    void run(
                      () => updateGroupChat({ data: { roomId, addHandle: handle.trim() } }),
                      "Member added",
                    )
                  }
                >
                  Add
                </OutlineButton>
              </div>
            ) : null}
            <button
              className="min-h-10 font-semibold text-danger"
              onClick={() => {
                if (confirm("Leave this group?"))
                  void run(() => updateGroupChat({ data: { roomId, leave: true } })).then(() => {
                    location.href = "/chats";
                  });
              }}
            >
              Leave group
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
}
