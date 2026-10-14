import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  CornerUpLeft,
  Flag,
  History,
  Pencil,
  Phone,
  Search,
  Send,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetField, fieldClass, type MenuItem } from "@/components/community/sheet";
import {
  ChatBanner,
  ChatHeader,
  ChatInputBar,
  MessageBubble,
  ReplyStrip,
  TypingBubble,
} from "@/components/chat/chat-parts";
import { roomPerson, roomTitle } from "@/components/chat/rooms";
import { ToggleRow } from "@/components/create/parts";
import { KAMINO_CALL_EVENT } from "@/components/incoming-call";
import { Avatar, EmptyHint, GradientButton, IconButton, OutlineButton } from "@/components/k";
import { LiveStage } from "@/components/live-stage";
import { StickerMark } from "@/components/sticker";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useServerEventsLive } from "@/lib/server-events";
import { timeAgo } from "@/lib/format-ui";
import { HELD_MESSAGE, HELD_TITLE } from "@/lib/kamino/held";
import {
  deleteMessage,
  editMessage,
  endCall,
  fileReport,
  getOlderMessages,
  getRoom,
  inviteToRoom,
  searchRoomMessages,
  sendMessage,
  setRoomInviteRule,
  setRoomPreference,
  setWatchMedia,
  toggleMessageReaction,
  toggleRoomCohost,
  toggleVoice,
  transferRoomHost,
} from "@/lib/kamino/server";
import {
  acceptMessageRequest,
  chatsOverview,
  declineMessageRequest,
  markRoomRead,
  roomReceipts,
  setTyping,
  typingIn,
} from "@/lib/kamino/social";
import { STICKER_PACKS, parseSticker, previewText, stickerToken } from "@/lib/kamino/stickers";
import { REPORT_REASONS, type ChatMessage } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";
import { ChatContentPanel, ChatMessageContent } from "@/components/content/chat-tools";
import { StageControls } from "@/components/stage-controls-v9";

export const Route = createFileRoute("/chats/$roomId")({ component: RoomRoute });

const REACTIONS = ["❤️", "😂", "✨", "🔥", "👏", "😮"];
/** How often we tell the server "I'm typing" while the person types (the server forgets after 6 s). */
const TYPING_EVERY_MS = 4000;
type Media = { kind: "image" | "audio" | "video"; dataUrl: string };

const errorText = (e: unknown, fallback = "Something went wrong. Please try again.") =>
  e instanceof Error ? e.message : fallback;

function RoomRoute() {
  const { user, isPending } = useCurrentUserState();
  const { roomId } = Route.useParams();
  if (!isPending && !user) return <RedirectToSignIn />;
  // Same markup while the account loads as while the room loads, so the server and browser pages match.
  if (!user) return <RoomLoading />;
  // A fresh screen per room, so nothing (drafts, menus, a recording) leaks from one chat into the next.
  return (
    <Room
      key={roomId}
      roomId={Number(roomId)}
      userId={user.id}
      userName={user.displayName ?? "You"}
    />
  );
}

/**
 * One conversation (DM, group, or live room) in the new look (same as the phone app): header with face and status,
 * white / gradient bubbles, the comment-bar style input, "is typing…", "Seen" under your last DM message, and a
 * banner to accept or decline a message request. Reactions, replies, edit / delete, photos, clips, voice notes,
 * stickers, search, calls, watch-together and invites all live here.
 */
function Room({ roomId, userId, userName }: { roomId: number; userId: string; userName: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr ?? "" });
  // New messages arrive instantly over the SSE push stream while it is connected;
  // the few-second polls below are only the fallback for a dropped stream.
  const pushLive = useServerEventsLive();
  const q = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => getRoom({ data: { roomId } }),
    refetchInterval: pushLive ? false : 2500,
  });
  // The chat list knows extra things about the room: online, verified, message request…
  const overview = useQuery({
    queryKey: ["chatsOverview"],
    queryFn: () => chatsOverview(),
    staleTime: 15_000,
  });
  const extra = overview.data?.rooms.find((r) => r.id === roomId);
  const info = q.data?.room;
  const isDm = info?.kind === "dm";
  const typing = useQuery({
    queryKey: ["typing", roomId],
    queryFn: () => typingIn({ data: { roomId } }),
    refetchInterval: pushLive ? false : 3000,
  });
  const receipts = useQuery({
    queryKey: ["receipts", roomId],
    queryFn: () => roomReceipts({ data: { roomId } }),
    enabled: isDm,
    refetchInterval: pushLive ? false : 5000,
  });

  const [text, setText] = useState("");
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [sheet, setSheet] = useState<null | "settings" | "search" | "report">(null);
  const [reportId, setReportId] = useState<number | null>(null);
  const [stickersOn, setStickersOn] = useState(false);
  const [stickerPack, setStickerPack] = useState<string>(STICKER_PACKS[0]!.id);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [answering, setAnswering] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [loadedMedia, setLoadedMedia] = useState<Set<number>>(() => new Set());
  const [autoCall, setAutoCall] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stuckToBottom = useRef(true);

  // ── Voice notes ──
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const cancelRecording = useRef(false);

  const messages = useMemo(
    () =>
      Array.from(
        new Map([...older, ...(q.data?.messages ?? [])].map((m) => [m.id, m])).values(),
      ).sort((a, b) => a.id - b.id),
    [older, q.data?.messages],
  );
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const newestId = messages.at(-1)?.id ?? 0;

  // Open with ?call=1 (a call link) or after answering an incoming call: start the call straight away.
  useEffect(() => {
    let fromStore = false;
    try {
      fromStore = sessionStorage.getItem("kamino-call") === String(roomId);
      if (fromStore) sessionStorage.removeItem("kamino-call");
    } catch {
      /* private mode */
    }
    if (/[?&]call=(1|true)\b/.test(searchStr) || fromStore) setAutoCall(true);
  }, [roomId, searchStr]);

  // Stop the microphone when leaving the room.
  useEffect(
    () => () => {
      cancelRecording.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // Keep the newest message in view (unless the person scrolled up to read older ones).
  useEffect(() => {
    const el = scroller.current;
    if (el && stuckToBottom.current) el.scrollTop = el.scrollHeight;
  }, [newestId, typing.data?.names.length]);

  // Tell the server what we've read (not for message requests: the sender shouldn't see "Seen" before you accept).
  const markedRef = useRef(0);
  useEffect(() => {
    if (!newestId || newestId <= markedRef.current || extra?.isRequest) return;
    markedRef.current = newestId;
    markRoomRead({ data: { roomId, lastId: newestId } })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
        void queryClient.invalidateQueries({ queryKey: ["shell"] });
      })
      .catch(() => undefined);
  }, [newestId, roomId, extra?.isRequest, queryClient]);

  // "I'm typing": sent at most every few seconds while there is text in the box.
  const typingSent = useRef(0);
  const onChangeText = (value: string) => {
    setText(value);
    if (value.trim() && !editing && Date.now() - typingSent.current > TYPING_EVERY_MS) {
      typingSent.current = Date.now();
      setTyping({ data: { roomId } }).catch(() => undefined);
    }
  };

  const refresh = async () => {
    stuckToBottom.current = true;
    await q.refetch();
    void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
  };

  const submit = async (media?: Media, bodyOverride?: string) => {
    const body = (bodyOverride ?? text).trim();
    if (sendingRef.current || (!body && !media)) return;
    sendingRef.current = true;
    setSending(true);
    try {
      if (editing && !media && bodyOverride === undefined) {
        await editMessage({ data: { roomId, messageId: editing.id, body } });
        setEditing(null);
      } else {
        const sent = await sendMessage({ data: { roomId, body, replyTo: replyTo?.id, media } });
        if (sent.held) toast.info(HELD_TITLE, { description: HELD_MESSAGE });
        setReplyTo(null);
      }
      if (bodyOverride === undefined) setText("");
      typingSent.current = 0;
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Message not sent. Try again."));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const sendSticker = (id: string) => {
    setStickersOn(false);
    void submit(undefined, stickerToken(id));
  };

  async function attachMedia(file?: File) {
    if (!file) return;
    const kind = /^video\/(mp4|webm)$/.test(file.type) ? "video" : "image";
    if (
      (kind === "image" &&
        (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 2_000_000)) ||
      (kind === "video" && file.size > 6_000_000)
    ) {
      toast.error("Choose a PNG, JPEG, WebP or GIF under 2 MB, or an MP4/WebM clip under 6 MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
    await submit({ kind, dataUrl });
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice messages need a browser with a microphone.");
      return;
    }
    try {
      cancelRecording.current = false;
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelRecording.current) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = acquired;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const instance = new MediaRecorder(acquired, mime ? { mimeType: mime } : undefined);
      recorder.current = instance;
      const chunks: BlobPart[] = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = () => {
        acquired.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setRecording(false);
        if (cancelRecording.current) return;
        const blob = new Blob(chunks, { type: instance.mimeType || "audio/webm" });
        if (!blob.size || blob.size > 1_500_000) {
          toast.error("Voice messages can be up to 1.5 MB (about 45 seconds).");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (!cancelRecording.current)
            void submit({ kind: "audio", dataUrl: String(reader.result) }, "");
        };
        reader.onerror = () => toast.error("Could not save the recording.");
        reader.readAsDataURL(blob);
      };
      instance.start();
      setRecordSeconds(0);
      setRecording(true);
      window.setTimeout(() => {
        if (instance.state === "recording") instance.stop();
      }, 45_000);
    } catch (e) {
      toast.error(errorText(e, "Microphone unavailable."));
      stream.current?.getTracks().forEach((t) => t.stop());
    }
  }
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  async function loadOlder() {
    const first = messages[0]?.id;
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    stuckToBottom.current = false;
    try {
      const page = await getOlderMessages({ data: { roomId, beforeId: first } });
      setOlder((prev) => [...page.messages, ...prev]);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(errorText(e, "Could not load older messages."));
    } finally {
      setLoadingOlder(false);
    }
  }

  const react = async (message: ChatMessage, emoji: string) => {
    setSelected(null);
    try {
      await toggleMessageReaction({ data: { roomId, messageId: message.id, emoji } });
      await q.refetch();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const remove = async (message: ChatMessage) => {
    if (!window.confirm("Delete this message? This can't be undone.")) return;
    try {
      await deleteMessage({ data: { roomId, messageId: message.id } });
      await q.refetch();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const answer = async (accept: boolean) => {
    setAnswering(true);
    try {
      if (accept) await acceptMessageRequest({ data: { roomId } });
      else await declineMessageRequest({ data: { roomId } });
      void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
      if (!accept) void navigate({ to: "/chats" });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setAnswering(false);
    }
  };

  const setPref = async (prefs: { pinned?: boolean; muted?: boolean }) => {
    try {
      await setRoomPreference({ data: { roomId, ...prefs } });
      await q.refetch();
      void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  /** Scrolls to a message (search result, quoted reply) and highlights it for a moment. */
  const jumpTo = (id: number) => {
    setSheet(null);
    const el = document.getElementById(`m-${id}`);
    if (!el) return toast.info("That message is further back. Load earlier messages to see it.");
    stuckToBottom.current = false;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(id);
    window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2500);
  };

  /** Starts (or joins) the call: the call panel listens for this, just like answering an incoming call. */
  const startCall = () =>
    window.dispatchEvent(new CustomEvent(KAMINO_CALL_EVENT, { detail: roomId }));

  if (q.isPending) return <RoomLoading />;
  if (q.error || !info)
    return (
      <div className="flex h-full flex-1 flex-col bg-bg">
        <ChatHeader person={{ name: "?", hue: 265 }} title="Chat" actions={null} />
        <div className="grid flex-1 place-items-center p-6">
          <EmptyHint
            icon="😕"
            title="This chat didn’t open"
            text={errorText(q.error, "It may have been removed, or you’re no longer a member.")}
            action={
              <GradientButton size="sm" to="/chats">
                Back to chats
              </GradientButton>
            }
          />
        </div>
      </div>
    );

  const data = q.data!;
  const title = roomTitle({ ...info, communityName: extra?.communityName });
  const liveKind =
    info.kind === "voice" || info.kind === "screening" || info.kind === "dm" ? info.kind : null;
  const typingNames = (typing.data?.names ?? []).filter(
    (_, i) => typing.data?.userIds[i] !== userId,
  );
  // "Seen" under my newest message when the other person has read up to it (DMs only, when they share receipts).
  const myLast = [...messages].reverse().find((m) => m.author.userId === userId && !m.deleted);
  const seen =
    !!myLast &&
    (receipts.data?.seenBy ?? []).some((s) => s.userId !== userId && s.lastReadId >= myLast.id);
  const subtitle = typingNames.length
    ? isDm
      ? "typing…"
      : `${typingNames[0]}${typingNames.length > 1 ? ` +${typingNames.length - 1}` : ""} typing…`
    : isDm
      ? extra?.peerOnline
        ? "Online"
        : info.peerHandle
          ? `@${info.peerHandle}`
          : undefined
      : info.kind === "voice"
        ? `Live room${data.voices.length ? ` · ${data.voices.length} in the call` : ""}`
        : [
            extra?.communityName,
            data.participants.length ? `${data.participants.length} people` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined;

  const mineSelected = !!selected && selected.author.userId === userId;
  const menuItems: MenuItem[] = selected
    ? [
        {
          key: "reply",
          label: "Reply",
          icon: <CornerUpLeft />,
          onSelect: () => (setReplyTo(selected), setEditing(null)),
        },
        ...(mineSelected && !selected.mediaKind && !parseSticker(selected.body)
          ? [
              {
                key: "edit",
                label: "Edit",
                icon: <Pencil />,
                onSelect: () => (setEditing(selected), setReplyTo(null), setText(selected.body)),
              },
            ]
          : []),
        ...(mineSelected
          ? [
              {
                key: "delete",
                label: "Delete",
                icon: <Trash2 />,
                destructive: true,
                onSelect: () => void remove(selected),
              },
            ]
          : []),
        ...(!mineSelected
          ? [
              {
                key: "report",
                label: "Report",
                icon: <Flag />,
                tone: "pink" as const,
                onSelect: () => (setReportId(selected.id), setSheet("report")),
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-bg">
      <ChatHeader
        person={roomPerson({ ...info, communityName: extra?.communityName })}
        title={title}
        verified={isDm && extra?.peerVerified}
        online={isDm ? !!extra?.peerOnline : undefined}
        subtitle={subtitle}
        subtitleTone={typingNames.length ? "accent" : isDm && extra?.peerOnline ? "green" : "muted"}
        profileHandle={isDm ? info.peerHandle : null}
        actions={
          <>
            <IconButton label="Search messages" onClick={() => setSheet("search")}>
              <Search className="size-[22px]" strokeWidth={2.2} aria-hidden />
            </IconButton>
            {liveKind ? (
              <IconButton
                label={info.kind === "dm" ? "Start a call" : "Join the voice call"}
                onClick={startCall}
              >
                <Phone className="size-[22px]" strokeWidth={2.2} aria-hidden />
              </IconButton>
            ) : null}
            <IconButton label="Chat settings and invites" onClick={() => setSheet("settings")}>
              <span className="text-[22px] leading-none font-black tracking-[1px]" aria-hidden>
                ⋯
              </span>
            </IconButton>
          </>
        }
      />

      <ChatContentPanel roomId={roomId} myId={userId} messages={messages} />
      {info.kind === "voice" || info.kind === "screening" ? <StageControls roomId={roomId} userId={userId} /> : null}
      {extra?.isRequest ? (
        <section
          className="mx-3 mt-3 space-y-2.5 rounded-card border border-border bg-surface p-3.5 shadow-card lg:mx-4"
          aria-label="Message request"
        >
          <div className="flex items-center gap-2.5">
            <Avatar
              person={roomPerson({ ...info, communityName: extra?.communityName })}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] leading-[19px] font-bold text-ink">{`${title} wants to message you`}</p>
              <p className="text-[12px] leading-4 text-muted">
                You don’t follow each other yet. They won’t know you’ve seen this until you accept
                or reply.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <GradientButton
              full
              disabled={answering}
              onClick={() => void answer(true)}
              className="flex-1"
            >
              Accept
            </GradientButton>
            <OutlineButton
              disabled={answering}
              onClick={() => void answer(false)}
              className="flex-1 text-muted"
            >
              Decline
            </OutlineButton>
          </div>
          <button
            type="button"
            onClick={() => {
              setReportId(messages.at(-1)?.id ?? null);
              setSheet("report");
            }}
            className="k-focus mx-auto block min-h-8 rounded-full px-3 text-[12px] font-semibold text-danger"
          >
            Report
          </button>
        </section>
      ) : null}
      {extra?.awaitingAccept ? (
        <ChatBanner
          icon={<Send />}
          tone="blue"
          text={`Message request sent. ${title} will see it once they accept.`}
        />
      ) : null}
      {data.voices.length && info.kind !== "dm" && !data.voices.some((v) => v.user_id === userId) ? (
        <ChatBanner
          icon={<Phone />}
          tone="green"
          text={`${data.voices.length} in a call · ${data.voices.map((v) => v.nickname).join(", ")}`}
          action="Join"
          onClick={startCall}
        />
      ) : null}

      {liveKind ? (
        <LiveStage
          roomId={roomId}
          userId={userId}
          name={userName}
          kind={liveKind}
          autoCall={autoCall && liveKind === "dm"}
          watchUrl={info.watchUrl}
          watchTitle={info.watchTitle}
          peerName={info.peerName ?? info.name}
          peerHue={info.peerHue}
          showIdleBar={liveKind !== "dm"}
          onWatchSaved={(url, watchTitle) => {
            void setWatchMedia({ data: { roomId, url, title: watchTitle } }).then(() =>
              q.refetch(),
            );
          }}
          onVoice={(on) => {
            void toggleVoice({ data: { roomId, on } })
              .then(() => q.refetch())
              .catch(() => undefined);
            if (!on) void endCall({ data: roomId }).catch(() => undefined);
          }}
        />
      ) : null}

      {/* ── Messages ── */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stuckToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="k-scroll flex min-h-0 flex-1 flex-col overflow-y-auto py-2.5"
        role="log"
        aria-label={`Messages with ${title}`}
      >
        {/* Pushes a short conversation to the bottom, next to the input (like every chat app). */}
        <div aria-hidden className="flex-1" />
        {(hasMore ?? (q.data?.messages.length ?? 0) >= 200) ? (
          <button
            type="button"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            className="k-focus mx-auto mb-2 flex h-9 items-center gap-2 rounded-full bg-surface px-4 text-[12.5px] font-bold text-violet shadow-card"
          >
            <History className="size-4" aria-hidden />
            {loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        ) : null}
        {messages.length === 0 ? (
          <div className="grid place-items-center p-6">
            <EmptyHint
              icon="👋"
              title="Say hello"
              text="No messages yet. Yours can be the first."
            />
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const close = (a?: ChatMessage, b?: ChatMessage) =>
              !!a &&
              !!b &&
              a.author.userId === b.author.userId &&
              Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) <
                5 * 60_000;
            const mine = m.author.userId === userId;
            return (
              <div key={m.id}>
              <MessageBubble
                key={m.id}
                message={m}
                mine={mine}
                replyTo={m.replyTo ? byId.get(m.replyTo) : undefined}
                showName={!isDm && !close(prev, m)}
                showAvatar={!close(m, next)}
                showTime={!close(m, next)}
                receipt={isDm && mine && m.id === myLast?.id ? (seen ? "Seen" : "Sent") : null}
                highlighted={highlight === m.id}
                mediaLoaded={loadedMedia.has(m.id)}
                onLoadMedia={() => setLoadedMedia((s) => new Set(s).add(m.id))}
                onMenu={() => !m.deleted && setSelected(m)}
                onReact={(emoji) => void react(m, emoji)}
                onJump={jumpTo}
              />
              <ChatMessageContent roomId={roomId} messageId={m.id} />
              </div>
            );
          })
        )}
        {typingNames.length ? <TypingBubble names={typingNames} /> : null}
      </div>

      <input
        ref={mediaInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void attachMedia(file).catch((err) =>
            toast.error(errorText(err, "Could not attach that.")),
          );
        }}
      />
      <ChatInputBar
        value={text}
        onChange={onChangeText}
        onSend={() => void submit()}
        onRecord={() => void toggleRecording()}
        recording={
          recording
            ? {
                seconds: `${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, "0")}`,
              }
            : null
        }
        onAttach={() => mediaInput.current?.click()}
        onSticker={() => setStickersOn((v) => !v)}
        stickersOpen={stickersOn}
        sending={sending}
        editing={!!editing}
        placeholder={
          extra?.isRequest ? "Reply to accept…" : isDm ? `Message ${title}…` : "Message…"
        }
        top={
          <>
            {replyTo || editing ? (
              <ReplyStrip
                title={editing ? "Editing your message" : `Replying to ${replyTo!.author.nickname}`}
                text={replyTo ? previewText(replyTo.body) || "Attachment" : undefined}
                onCancel={() => {
                  setReplyTo(null);
                  if (editing) setText("");
                  setEditing(null);
                }}
              />
            ) : null}
            {stickersOn ? (
              <div className="mx-3 mt-2 rounded-card border border-border bg-surface p-3 shadow-card lg:mx-4">
                <div role="tablist" aria-label="Sticker packs" className="k-row mb-2 gap-1.5">
                  {STICKER_PACKS.map((pack) => (
                    <button
                      key={pack.id}
                      role="tab"
                      type="button"
                      aria-selected={pack.id === stickerPack}
                      onClick={() => setStickerPack(pack.id)}
                      className={cn(
                        "k-focus h-8 shrink-0 rounded-full px-3 text-[12.5px] font-bold",
                        pack.id === stickerPack
                          ? "bg-grad-primary text-white"
                          : "bg-surface-alt text-muted",
                      )}
                    >
                      {pack.label}
                    </button>
                  ))}
                </div>
                <div className="grid max-h-48 grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-8">
                  {(
                    STICKER_PACKS.find((p) => p.id === stickerPack) ?? STICKER_PACKS[0]!
                  ).stickers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => sendSticker(s.id)}
                      aria-label={`Send sticker: ${s.label}`}
                      className="k-focus grid place-items-center rounded-[16px]"
                    >
                      <StickerMark id={s.id} className="size-12" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        }
      />

      {/* ── Tap a message: reactions, reply, edit, delete, report ── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title="Message">
        <div
          className="flex justify-between rounded-full bg-surface-alt p-1.5"
          role="group"
          aria-label="React"
        >
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => selected && void react(selected, emoji)}
              aria-label={`React ${emoji}`}
              className="k-focus grid size-11 place-items-center rounded-full text-[26px] transition-transform hover:scale-110"
            >
              {emoji}
            </button>
          ))}
        </div>
        <ul className="-mx-2 space-y-0.5">
          {menuItems.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  window.setTimeout(() => item.onSelect?.(), 60);
                }}
                className="k-focus flex min-h-[52px] w-full items-center gap-3 rounded-tile px-2 text-left hover:bg-surface-alt"
              >
                <span
                  className={cn(
                    "grid size-[38px] place-items-center rounded-full [&_svg]:size-[19px]",
                    item.destructive
                      ? "bg-tint-pink text-pink-ink"
                      : "bg-tint-violet text-violet-ink",
                  )}
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span
                  className={cn(
                    "text-[15px] font-bold",
                    item.destructive ? "text-danger" : "text-ink",
                  )}
                >
                  {item.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <SearchSheet
        open={sheet === "search"}
        onOpenChange={(o) => setSheet(o ? "search" : null)}
        roomId={roomId}
        loaded={byId}
        onPick={jumpTo}
      />
      <RoomSettings
        open={sheet === "settings"}
        onOpenChange={(o) => setSheet(o ? "settings" : null)}
        page={data}
        userId={userId}
        onPref={(p) => void setPref(p)}
        onChanged={() => void q.refetch()}
      />
      <ReportMessageSheet
        messageId={sheet === "report" ? reportId : null}
        communityId={info.communityId ?? undefined}
        label={extra?.isRequest ? "message request" : "message"}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}

/** The room's shape while it loads: the header and a few soft message placeholders. */
function RoomLoading() {
  return (
    <div className="flex h-full flex-1 flex-col bg-bg">
      <ChatHeader person={{ name: "…", hue: 265 }} title="Loading…" actions={null} />
      <div className="flex-1 space-y-3 p-4" aria-label="Loading messages">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "block h-10 w-2/3 animate-pulse rounded-[18px] bg-surface-alt",
              i === 1 && "ml-auto",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Search this conversation (the server searches the whole history). */
function SearchSheet({
  open,
  onOpenChange,
  roomId,
  loaded,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roomId: number;
  loaded: Map<number, ChatMessage>;
  onPick: (id: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(draft.trim()), 300);
    return () => window.clearTimeout(t);
  }, [draft]);
  const results = useQuery({
    queryKey: ["room-search", roomId, term],
    queryFn: () => searchRoomMessages({ data: { roomId, query: term } }),
    enabled: open && term.length >= 2,
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Search this chat">
      <input
        className={fieldClass}
        aria-label="Search messages"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search messages"
        autoFocus
      />
      {term.length < 2 ? (
        <p className="text-[13px] text-muted">Type at least two letters.</p>
      ) : results.isPending ? (
        <p className="text-[13px] text-muted">Searching…</p>
      ) : results.isError ? (
        <p className="text-[13px] font-semibold text-danger">
          {errorText(results.error, "Could not search messages.")}
        </p>
      ) : results.data?.length ? (
        <ul className="space-y-2">
          {results.data.map((m) => {
            const here = loaded.has(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  className="k-focus block w-full space-y-0.5 rounded-[12px] bg-surface-alt p-2.5 text-left hover:brightness-[0.98]"
                >
                  <span className="flex gap-1.5">
                    <span className="flex-1 truncate text-[12.5px] font-bold text-ink">
                      {m.author.nickname}
                    </span>
                    <span className="text-[11.5px] text-subtle">
                      {timeAgo(m.createdAt)}
                      {here ? "" : " · older"}
                    </span>
                  </span>
                  <span className="line-clamp-3 block text-[13.5px] text-body">
                    {previewText(m.body) || "Attachment"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">No messages match that.</p>
      )}
    </Sheet>
  );
}

type RoomPage = Awaited<ReturnType<typeof getRoom>>;

/** Pin / mute, who is in the room, and (for hosts) invites and co-hosts. */
function RoomSettings({
  open,
  onOpenChange,
  page,
  userId,
  onPref,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  page: RoomPage;
  userId: string;
  onPref: (prefs: { pinned?: boolean; muted?: boolean }) => void;
  onChanged: () => void;
}) {
  const { room, participants } = page;
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const isHost = room.createdBy === userId;
  const isCohost = participants.some((p) => p.userId === userId && p.isCohost);
  const canInvite =
    room.kind === "private" && (isHost || isCohost || room.inviteRule === "members");

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      onChanged();
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(errorText(e, "Could not update the room."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={room.kind === "dm" ? "Conversation" : room.name}
      >
        <div className="space-y-1 rounded-card border border-border bg-surface px-3.5 py-2">
          <ToggleRow
            label="Pin to the top of my chats"
            value={room.pinned}
            onChange={(pinned) => onPref({ pinned })}
          />
          <ToggleRow
            label="Mute notifications"
            value={room.muted}
            onChange={(muted) => onPref({ muted })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {room.kind === "dm" && room.peerHandle ? (
            <OutlineButton
              size="sm"
              to={`/u/${room.peerHandle}`}
              icon={<UserRound className="size-4" aria-hidden />}
            >
              View profile
            </OutlineButton>
          ) : null}
          {room.communityId ? (
            <OutlineButton
              size="sm"
              to={`/c/${room.communityId}`}
              icon={<Users className="size-4" aria-hidden />}
            >
              Open community
            </OutlineButton>
          ) : null}
        </div>

        {canInvite ? (
          <form
            className="space-y-2.5 rounded-card border border-border bg-surface p-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              const clean = handle.trim().replace(/^@/, "");
              if (!clean) return;
              void run(
                () => inviteToRoom({ data: { roomId: room.id, handle: clean } }),
                `@${clean} can now join this room`,
              ).then((ok) => ok && setHandle(""));
            }}
          >
            <p className="text-[15px] font-extrabold text-ink">Invite someone</p>
            <SheetField label="Their @handle">
              <input
                className={fieldClass}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@handle"
                autoCapitalize="none"
              />
            </SheetField>
            <GradientButton type="submit" size="sm" disabled={busy || !handle.trim()}>
              Send invite
            </GradientButton>
            {isHost ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[13px] text-muted">Who can invite:</span>
                {(["hosts", "members"] as const).map((rule) => (
                  <button
                    key={rule}
                    type="button"
                    aria-pressed={room.inviteRule === rule}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => setRoomInviteRule({ data: { roomId: room.id, rule } }),
                        "Invite rule updated",
                      )
                    }
                    className={cn(
                      "k-focus k-hit h-8 rounded-full px-3.5 text-[13px] font-semibold",
                      room.inviteRule === rule
                        ? "bg-violet-strong text-white"
                        : "bg-surface-alt text-ink",
                    )}
                  >
                    {rule === "hosts" ? "Hosts" : "Everyone"}
                  </button>
                ))}
              </div>
            ) : null}
          </form>
        ) : null}

        {room.kind !== "dm" && participants.length ? (
          <div className="space-y-2 rounded-card border border-border bg-surface p-3.5">
            <p className="text-[15px] font-extrabold text-ink">{`In this room · ${participants.length}`}</p>
            <ul className="space-y-2">
              {participants.map((p) => (
                <li key={p.userId} className="flex flex-wrap items-center gap-2.5">
                  <Avatar person={{ name: p.name, hue: 265, userId: p.userId }} size={34} />
                  <Link
                    to="/u/$handle"
                    params={{ handle: p.handle || "member" }}
                    className="k-focus min-w-[120px] flex-1 rounded"
                  >
                    <span className="block truncate text-[14px] font-bold text-ink">{p.name}</span>
                    <span className="block text-[12px] text-subtle">
                      @{p.handle}
                      {p.isHost ? " · host" : p.isCohost ? " · co-host" : ""}
                    </span>
                  </Link>
                  {isHost && !p.isHost && room.kind === "private" ? (
                    <span className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              toggleRoomCohost({
                                data: { roomId: room.id, targetUserId: p.userId },
                              }),
                            p.isCohost ? "Co-host removed" : "Co-host added",
                          )
                        }
                        className="k-focus k-hit h-8 rounded-full bg-tint-violet px-3 text-[12.5px] font-bold text-violet-ink"
                      >
                        {p.isCohost ? "Remove co-host" : "Co-host"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Make ${p.name} the host? You will no longer be the host of this room.`,
                            )
                          )
                            void run(
                              () =>
                                transferRoomHost({
                                  data: { roomId: room.id, targetUserId: p.userId },
                                }),
                              "Room handed over",
                            );
                        }}
                        className="k-focus k-hit h-8 rounded-full bg-tint-pink px-3 text-[12.5px] font-bold text-pink-ink"
                      >
                        Make host
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {room.kind === "screening" && room.watchUrl ? (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Clapperboard className="size-4" aria-hidden /> Watching together:{" "}
            {room.watchTitle || room.watchUrl}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}

/** Report a message (or a message request) to the moderators / safety team. */
function ReportMessageSheet({
  messageId,
  communityId,
  label,
  onClose,
}: {
  messageId: number | null;
  communityId?: string;
  label: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!messageId) return;
    setBusy(true);
    try {
      await fileReport({
        data: { communityId, targetType: "message", targetId: String(messageId), reason, details },
      });
      toast.success("Thanks for telling us", { description: "The moderators will take a look." });
      setDetails("");
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Could not send the report"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={messageId !== null}
      onOpenChange={(o) => !o && onClose()}
      title={`Report this ${label}`}
      description="Reports are private. Only the moderators see who sent them."
    >
      <SheetField label="What's wrong?">
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass}>
          {REPORT_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </SheetField>
      <SheetField label="Details (optional)">
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={1000}
          className={fieldClass}
          placeholder="Anything that helps the moderators understand"
        />
      </SheetField>
      <GradientButton full disabled={busy} onClick={() => void send()}>
        {busy ? "Sending…" : "Send report"}
      </GradientButton>
    </Sheet>
  );
}
