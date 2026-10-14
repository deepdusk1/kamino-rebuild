import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
  Check,
  CheckCheck,
  ChevronLeft,
  ImageIcon,
  Loader2,
  Mic,
  MoreHorizontal,
  Play,
  PlusCircle,
  Smile,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Avatar, IconButton, VerifiedTick, type AvatarPerson, type Tone } from "@/components/k";
import { personFromChip } from "@/components/community/helpers";
import { StickerMark } from "@/components/sticker";
import { timeAgo } from "@/lib/format-ui";
import { bubbleLook } from "@/lib/kamino/cosmetics";
import { getMessageMedia } from "@/lib/kamino/server";
import { parseSticker, previewText } from "@/lib/kamino/stickers";
import type { ChatMessage } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

/**
 * The pieces of a chat room in the new look (mirrors the phone app's `ChatChrome.tsx` and `MessageBubble.tsx`):
 * the header, message bubbles, the "is typing…" bubble, tinted banners and the input bar.
 */

// ── Header ───────────────────────────────────────────────────────────────────

export function ChatHeader({
  person,
  title,
  verified,
  online,
  subtitle,
  subtitleTone = "muted",
  profileHandle,
  actions,
}: {
  person: AvatarPerson;
  title: string;
  verified?: boolean;
  /** Green dot on the face (DMs). */
  online?: boolean;
  /** "Online", "typing…", "Anime Haven · 12 people" … */
  subtitle?: string;
  subtitleTone?: "accent" | "green" | "muted";
  /** DMs: the name opens their profile. */
  profileHandle?: string | null;
  actions: ReactNode;
}) {
  const sub = cn(
    "truncate text-[12px] leading-4 font-semibold lg:text-[13px]",
    subtitleTone === "accent"
      ? "text-violet"
      : subtitleTone === "green"
        ? "text-green-ink"
        : "text-muted",
  );
  const who = (
    <>
      <Avatar person={person} size={40} online={online} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[16px] leading-[21px] font-extrabold text-ink lg:text-[18px]">
            {title}
          </span>
          {verified ? <VerifiedTick size={14} /> : null}
        </span>
        {subtitle ? (
          <span className={cn("block", sub)} aria-live="polite">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <header className="sticky top-0 z-20 flex shrink-0 items-center gap-1 border-b border-border bg-surface py-2 pr-2 pl-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-card lg:static lg:px-4 lg:pt-2">
      <IconButton label="Back to chats" to="/chats" className="lg:hidden">
        <ChevronLeft className="size-[26px]" strokeWidth={2.4} aria-hidden />
      </IconButton>
      {profileHandle ? (
        <Link
          to="/u/$handle"
          params={{ handle: profileHandle }}
          aria-label={`${title}. Open profile`}
          className="k-focus flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full"
        >
          {who}
        </Link>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5">
          <h1 className="sr-only">{title}</h1>
          {who}
        </div>
      )}
      {actions}
    </header>
  );
}

// ── Banners ──────────────────────────────────────────────────────────────────

const BANNER_TONE: Record<Exclude<Tone, "pink">, { box: string; button: string }> = {
  violet: { box: "bg-tint-violet text-violet-ink", button: "bg-violet-strong" },
  blue: { box: "bg-tint-blue text-blue-ink", button: "bg-blue-strong" },
  orange: { box: "bg-tint-orange text-orange-ink", button: "bg-orange-strong" },
  green: { box: "bg-tint-green text-green-ink", button: "bg-green-strong" },
};

/** A tinted strip under the header (in a call, watching together, request sent). */
export function ChatBanner({
  icon,
  text,
  action,
  onClick,
  tone = "violet",
}: {
  icon: ReactNode;
  text: string;
  action?: string;
  onClick?: () => void;
  tone?: keyof typeof BANNER_TONE;
}) {
  const look = BANNER_TONE[tone];
  const body = (
    <>
      <span className="grid shrink-0 place-items-center [&_svg]:size-[18px]" aria-hidden>
        {icon}
      </span>
      <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-[17px] font-semibold lg:text-[14px]">
        {text}
      </span>
      {action ? (
        <span
          className={cn("rounded-full px-3 py-1.5 text-[12px] font-bold text-white", look.button)}
        >
          {action}
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    "mx-3 mt-2 flex min-h-11 items-center gap-2.5 rounded-[14px] px-3 py-2 text-left lg:mx-4",
    look.box,
  );
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("k-focus w-[calc(100%-1.5rem)] lg:w-[calc(100%-2rem)]", cls)}
    >
      {body}
    </button>
  );
}

// ── Media inside a message ───────────────────────────────────────────────────

/** A photo, voice note or clip inside a message. Photos and voice notes load straight away; clips on tap. */
export function MessageMedia({
  roomId,
  messageId,
  kind,
  onColor,
  load,
  onLoad,
}: {
  roomId: number;
  messageId: number;
  kind: "image" | "audio" | "video";
  onColor?: boolean;
  load: boolean;
  onLoad: () => void;
}) {
  const enabled = kind !== "video" || load;
  const q = useQuery({
    queryKey: ["message-media", roomId, messageId],
    queryFn: () => getMessageMedia({ data: { roomId, messageId } }),
    enabled,
    staleTime: Infinity,
  });
  if (!enabled)
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onLoad();
        }}
        className={cn(
          "k-focus flex h-11 items-center gap-2 rounded-[12px] px-3 text-[13px] font-bold",
          onColor ? "bg-white/20 text-white" : "bg-tint-violet text-violet-ink",
        )}
      >
        <Play className="size-4" fill="currentColor" aria-hidden /> Play video
      </button>
    );
  if (q.error)
    return (
      <button
        type="button"
        onClick={(e) => (e.stopPropagation(), void q.refetch())}
        className={cn(
          "text-[12.5px] font-semibold underline",
          onColor ? "text-white" : "text-danger",
        )}
      >
        Couldn’t load this. Try again
      </button>
    );
  if (!q.data)
    return (
      <span
        className={cn(
          "grid place-items-center rounded-[12px]",
          kind === "audio" ? "h-11 w-56" : "h-40 w-56",
          onColor ? "bg-white/15" : "bg-surface-alt",
        )}
      >
        <Loader2
          className={cn("size-5 animate-spin", onColor ? "text-white" : "text-muted")}
          aria-label="Loading"
        />
      </span>
    );
  if (kind === "image")
    return (
      <a
        href={q.data.dataUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="k-focus block overflow-hidden rounded-[12px]"
      >
        <img src={q.data.dataUrl} alt="Photo" className="max-h-80 max-w-full object-contain" />
      </a>
    );
  if (kind === "video")
    return (
      <video
        controls
        playsInline
        preload="metadata"
        src={q.data.dataUrl}
        className="max-h-80 max-w-full rounded-[12px]"
        aria-label="Video"
        onClick={(e) => e.stopPropagation()}
      />
    );
  return (
    <audio
      controls
      preload="metadata"
      src={q.data.dataUrl}
      className="w-60 max-w-full"
      aria-label="Voice message"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ── One message ──────────────────────────────────────────────────────────────

/**
 * One chat message. Yours: a violet gradient bubble on the right with white text. Others: a white bubble with a
 * hairline on the left, with their face. A smaller corner on the speaker's side works like a speech-bubble tail.
 * Stickers are shown big without a bubble; a non-"soft" bubble style the author picked (glass, outline, bold) is kept.
 * Tap a bubble (or its ⋯ button) for reactions, reply, edit, delete and report.
 */
export function MessageBubble({
  message,
  mine,
  replyTo,
  showName,
  showAvatar = true,
  showTime = true,
  receipt,
  highlighted,
  mediaLoaded,
  onLoadMedia,
  onMenu,
  onReact,
  onJump,
}: {
  message: ChatMessage;
  mine: boolean;
  replyTo?: ChatMessage;
  showName?: boolean;
  showAvatar?: boolean;
  showTime?: boolean;
  receipt?: "Seen" | "Sent" | null;
  highlighted?: boolean;
  mediaLoaded: boolean;
  onLoadMedia: () => void;
  onMenu: () => void;
  onReact: (emoji: string) => void;
  onJump: (id: number) => void;
}) {
  const sticker = message.deleted ? null : parseSticker(message.body);
  const styled = message.bubbleStyle !== "soft";
  const gradient = mine && !styled && !message.deleted && !sticker;
  const bare = message.deleted || !!sticker;
  const look = styled ? bubbleLook(message.bubbleStyle, message.bubbleHue) : null;
  const style: CSSProperties | undefined =
    look && !bare
      ? {
          background: look.background,
          color: look.color ?? undefined,
          border: look.border ?? undefined,
          backdropFilter: look.blur ? "blur(10px)" : undefined,
        }
      : undefined;
  const label = `${mine ? "You" : message.author.nickname}: ${message.deleted ? "deleted message" : previewText(message.body) || "attachment"}. ${timeAgo(message.createdAt)}`;

  return (
    <div
      id={`m-${message.id}`}
      className={cn(
        "group/msg flex items-end gap-2 px-3 lg:px-5",
        mine ? "flex-row-reverse" : "flex-row",
        showName ? "pt-2" : "pt-0.5",
        showTime ? "pb-1.5" : "pb-px",
      )}
    >
      {mine ? null : showAvatar ? (
        <Link
          to="/u/$handle"
          params={{ handle: message.author.handle }}
          aria-label={`Open ${message.author.nickname}'s profile`}
          className={cn("k-focus shrink-0 rounded-full", showTime && "mb-[18px]")}
        >
          <Avatar person={personFromChip(message.author)} size={30} />
        </Link>
      ) : (
        <span className="w-[30px] shrink-0" aria-hidden />
      )}
      <div
        className={cn(
          "flex max-w-[76%] min-w-0 flex-col gap-[3px] lg:max-w-[64%]",
          mine ? "items-end" : "items-start",
        )}
      >
        {showName && !mine ? (
          <p className="ml-1 text-[11.5px] leading-[15px] font-bold text-muted">
            {message.author.nickname}
          </p>
        ) : null}
        <div className={cn("flex items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
          <div
            onClick={onMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu();
            }}
            aria-label={label}
            className={cn(
              "flex min-w-0 cursor-pointer flex-col gap-1.5 overflow-hidden text-[14.5px] leading-5 break-words whitespace-pre-wrap lg:text-[15px] lg:leading-[22px]",
              !bare && "rounded-[18px] px-[13px] py-[9px]",
              !bare && (mine ? "rounded-br-[6px]" : "rounded-bl-[6px]"),
              gradient && "bg-[linear-gradient(135deg,#A04FFB,#6A4CFC)] text-white",
              !gradient &&
                !bare &&
                !styled &&
                "border border-border bg-surface text-ink shadow-card",
              styled && !bare && "text-ink",
              message.deleted && "rounded-[18px] border border-dashed border-border px-3 py-[7px]",
              highlighted && "ring-2 ring-yellow",
            )}
            style={style}
          >
            {replyTo ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onJump(replyTo.id);
                }}
                className={cn(
                  "k-focus rounded-[4px] border-l-[3px] py-0.5 pr-2 pl-2 text-left",
                  gradient ? "border-white/85 bg-white/15" : "border-violet bg-tint-violet",
                )}
              >
                <span
                  className={cn(
                    "block text-[11.5px] leading-[15px] font-bold",
                    gradient ? "text-white" : "text-violet-ink",
                  )}
                >
                  {replyTo.author.nickname}
                </span>
                <span
                  className={cn(
                    "line-clamp-2 block text-[12.5px] leading-4",
                    gradient ? "text-white/90" : "text-body",
                  )}
                >
                  {replyTo.deleted ? "Deleted message" : previewText(replyTo.body) || "Attachment"}
                </span>
              </button>
            ) : null}
            {message.deleted ? (
              <span className="text-[13px] text-subtle italic">Message deleted</span>
            ) : (
              <>
                {message.mediaKind ? (
                  <MessageMedia
                    roomId={message.roomId}
                    messageId={message.id}
                    kind={message.mediaKind}
                    onColor={gradient}
                    load={mediaLoaded}
                    onLoad={onLoadMedia}
                  />
                ) : null}
                {sticker ? (
                  <StickerMark id={sticker} bare />
                ) : message.body ? (
                  <span>{message.body}</span>
                ) : null}
              </>
            )}
          </div>
          {!message.deleted ? (
            <button
              type="button"
              onClick={onMenu}
              aria-label="Message options"
              className="k-focus grid size-8 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity group-hover/msg:opacity-100 hover:bg-surface-alt focus-visible:opacity-100"
            >
              <MoreHorizontal className="size-[18px]" aria-hidden />
            </button>
          ) : null}
        </div>
        {message.reactions.length ? (
          <div className="-mt-2 flex flex-wrap gap-1 px-1.5">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(r.emoji)}
                aria-label={`${r.emoji} ${r.count}${r.mine ? ", you reacted. Tap to remove" : ". Tap to react"}`}
                className={cn(
                  "k-focus inline-flex h-[22px] items-center gap-[3px] rounded-full border px-[7px] shadow-card",
                  r.mine ? "border-violet bg-tint-violet" : "border-border bg-surface",
                )}
              >
                <span className="text-[12px] leading-none">{r.emoji}</span>
                <span
                  className={cn("text-[11px] font-bold", r.mine ? "text-violet-ink" : "text-muted")}
                >
                  {r.count}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {showTime || receipt ? (
          <p className="flex items-center gap-1 px-1 text-[11px] leading-[14px] text-subtle lg:text-[12px]">
            {showTime ? (
              <span>
                {timeAgo(message.createdAt)}
                {message.editedAt && !message.deleted ? " · edited" : ""}
              </span>
            ) : null}
            {receipt ? (
              <>
                {showTime ? <span aria-hidden>·</span> : null}
                {receipt === "Seen" ? (
                  <CheckCheck className="size-[13px] text-violet" aria-hidden />
                ) : (
                  <Check className="size-[13px]" aria-hidden />
                )}
                <span className={cn("font-semibold", receipt === "Seen" && "text-violet-ink")}>
                  {receipt}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Typing bubble ────────────────────────────────────────────────────────────

/** "Mika is typing…" with three bouncing dots, shown at the bottom of the conversation. */
export function TypingBubble({ names }: { names: string[] }) {
  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing…`
        : `${names.length} people are typing…`;
  return (
    <div role="status" aria-label={label} className="flex items-center gap-2 px-3 py-1.5 lg:px-5">
      <span className="ml-[38px] flex h-8 items-center gap-1 rounded-[16px] rounded-bl-[6px] border border-border bg-surface px-3 shadow-card">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-violet opacity-75 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 160}ms`, animationDuration: "900ms" }}
          />
        ))}
      </span>
      <span className="text-[11.5px] font-semibold text-muted" aria-hidden>
        {label}
      </span>
    </div>
  );
}

// ── Input bar ────────────────────────────────────────────────────────────────

/** The sticky message bar: ＋ attach, a rounded input with sticker and photo buttons, and a violet send / mic circle. */
export function ChatInputBar({
  value,
  onChange,
  onSend,
  onRecord,
  recording,
  onAttach,
  onSticker,
  stickersOpen,
  sending,
  editing,
  placeholder = "Message…",
  top,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** Mic button when there is nothing typed (voice notes). */
  onRecord?: () => void;
  recording?: { seconds: string } | null;
  onAttach?: () => void;
  onSticker?: () => void;
  stickersOpen?: boolean;
  sending?: boolean;
  editing?: boolean;
  placeholder?: string;
  /** Something above the bar: the reply / edit strip, the sticker picker. */
  top?: ReactNode;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const hasText = !!value.trim();
  const showSend = hasText || editing || !onRecord;
  const disabled = sending || (showSend && !recording && !hasText && !editing);
  // Grow the box with the text (up to about five lines).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  }, [value]);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (hasText || editing) onSend();
    }
  };
  return (
    <div className="shrink-0 border-t border-border bg-surface">
      {top}
      <div className="flex items-end gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:px-4 lg:pb-3">
        {recording ? (
          <div
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-tint-pink px-3.5"
            role="status"
          >
            <span className="size-2.5 animate-pulse rounded-full bg-red" aria-hidden />
            <span className="text-[13.5px] font-bold text-danger tabular-nums">
              Recording {recording.seconds}
            </span>
            <span className="truncate text-[12px] text-muted">tap ■ to send</span>
          </div>
        ) : (
          <>
            {onAttach && !editing ? (
              <button
                type="button"
                onClick={onAttach}
                aria-label="Attach a photo or video"
                className="k-focus grid h-10 w-9 shrink-0 place-items-center rounded-full text-violet"
              >
                <PlusCircle
                  className="size-[30px]"
                  fill="currentColor"
                  stroke="var(--color-surface)"
                  strokeWidth={1.8}
                  aria-hidden
                />
              </button>
            ) : null}
            <div className="flex min-h-10 min-w-0 flex-1 items-end rounded-[20px] bg-surface-alt pr-1 pl-3.5 focus-within:ring-2 focus-within:ring-violet">
              <textarea
                ref={box}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                aria-label="Message"
                rows={1}
                maxLength={2000}
                className="block max-h-[120px] min-w-0 flex-1 resize-none bg-transparent py-[9px] text-[16px] leading-[22px] text-ink outline-none placeholder:text-[14.5px] placeholder:text-subtle lg:text-[15px]"
              />
              {onSticker && !editing ? (
                <button
                  type="button"
                  onClick={onSticker}
                  aria-label="Send a sticker"
                  aria-pressed={!!stickersOpen}
                  className={cn(
                    "k-focus grid size-10 shrink-0 place-items-center rounded-full",
                    stickersOpen ? "text-violet" : "text-muted hover:text-ink",
                  )}
                >
                  <Smile className="size-[21px]" aria-hidden />
                </button>
              ) : null}
              {onAttach && !editing && !hasText ? (
                <button
                  type="button"
                  onClick={onAttach}
                  aria-label="Send a photo"
                  className="k-focus grid size-10 shrink-0 place-items-center rounded-full text-muted hover:text-ink"
                >
                  <ImageIcon className="size-5" aria-hidden />
                </button>
              ) : null}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={showSend && !recording ? onSend : (onRecord ?? onSend)}
          disabled={disabled}
          aria-label={
            recording
              ? "Finish and send voice message"
              : showSend
                ? editing
                  ? "Save edit"
                  : "Send message"
                : "Record a voice message"
          }
          className={cn(
            "k-focus grid size-10 shrink-0 place-items-center rounded-full text-white shadow-glow transition-[transform,opacity] active:scale-90 disabled:opacity-50",
            recording ? "bg-red-strong" : "bg-violet-strong",
          )}
        >
          {sending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : recording ? (
            <Square className="size-4" fill="currentColor" aria-hidden />
          ) : showSend ? (
            editing ? (
              <Check className="size-5" strokeWidth={3} aria-hidden />
            ) : (
              <ArrowUp className="size-5" strokeWidth={2.8} aria-hidden />
            )
          ) : (
            <Mic className="size-5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

/** The "Replying to Mika" / "Editing your message" strip above the input. */
export function ReplyStrip({
  title,
  text,
  onCancel,
}: {
  title: string;
  text?: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3.5 pt-2 lg:px-5">
      <span className="w-[3px] self-stretch rounded-full bg-violet" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-violet-ink">{title}</p>
        {text ? <p className="truncate text-[12.5px] text-muted">{text}</p> : null}
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="k-focus grid size-10 place-items-center rounded-full text-subtle hover:text-ink"
      >
        <X className="size-5" aria-hidden />
      </button>
    </div>
  );
}
