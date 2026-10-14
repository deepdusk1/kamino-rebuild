import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
  AtSign,
  CalendarDays,
  ChevronRight,
  EllipsisVertical,
  Heart,
  ImageIcon,
  MessageCircleMore,
  Radio,
  Search,
  SlidersHorizontal,
  Smile,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { compactNumber } from "@/lib/format-ui";
import { cn } from "@/lib/utils";
import { Avatar, type AvatarPerson } from "./avatar";
import { RedDot, UnreadCount, VerifiedTick } from "./bits";

/** One conversation in the Messages list: avatar + online dot, name, last message, time, unread. */
export function MessageRow({
  to,
  person,
  name,
  online,
  verified = false,
  preview,
  time,
  unread = 0,
  className,
}: {
  to: string;
  person: AvatarPerson;
  name: string;
  /** true green dot, false grey dot, undefined none (groups). */
  online?: boolean;
  verified?: boolean;
  /** Last message line; may include a bold "You:" part or an icon. */
  preview: ReactNode;
  time: string;
  unread?: number;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "k-focus group flex items-center gap-2.5 rounded-tile py-1 pr-0.5 transition-colors hover:bg-surface-alt/60 lg:gap-3 lg:py-1.5",
        className,
      )}
    >
      <Avatar person={person} size={40} online={online} />
      <div className="min-w-0 flex-1 self-stretch border-b border-border py-1.5 group-last:border-b-0">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[14px] leading-[18px] font-extrabold text-ink lg:text-[16px]">
              <span className="truncate">{name}</span>
              {verified && <VerifiedTick size={14} />}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate text-[12.5px] lg:text-[14px]",
                unread > 0 ? "text-body" : "text-muted",
              )}
            >
              {preview}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
            <span className="text-[11.5px] text-subtle lg:text-[12.5px]">{time}</span>
            <UnreadCount count={unread} />
          </div>
          <ChevronRight
            className="mt-2.5 size-4 shrink-0 text-subtle"
            strokeWidth={2.4}
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}

export type NotificationKind =
  "like" | "comment" | "follow" | "mention" | "community" | "live" | "event" | "achievement";

const KIND_BADGE: Record<
  Exclude<NotificationKind, "live" | "event">,
  { bg: string; icon: ReactNode; label: string }
> = {
  like: {
    bg: "bg-pink-strong",
    icon: <Heart className="size-2.5" fill="currentColor" strokeWidth={0} />,
    label: "Like",
  },
  comment: {
    bg: "bg-blue-strong",
    icon: <MessageCircleMore className="size-2.5" strokeWidth={2.8} />,
    label: "Comment",
  },
  follow: {
    bg: "bg-violet-strong",
    icon: <UserPlus className="size-2.5" strokeWidth={2.8} />,
    label: "New follower",
  },
  mention: {
    bg: "bg-orange-strong",
    icon: <AtSign className="size-2.5" strokeWidth={3} />,
    label: "Mention",
  },
  community: {
    bg: "bg-violet-strong",
    icon: <Users className="size-2.5" strokeWidth={2.8} />,
    label: "Community",
  },
  achievement: {
    bg: "bg-orange-strong",
    icon: <Trophy className="size-2.5" strokeWidth={2.8} />,
    label: "Achievement",
  },
};

/**
 * Notification row: avatar with a small coloured type badge (or an icon circle for events,
 * a LIVE pill for live rooms), bold title, quoted snippet, time, optional thumbnail and
 * action button, pink unread dot, chevron. The whole row opens `to`; buttons stay separate.
 */
export function NotificationRow({
  kind,
  actor,
  title,
  snippet,
  extra,
  time,
  thumb,
  action,
  unread = false,
  chevron = false,
  to,
  label,
  className,
}: {
  kind: NotificationKind;
  actor?: AvatarPerson | null;
  /** e.g. <><b>Mika</b> liked your drawing</> */
  title: ReactNode;
  snippet?: ReactNode;
  /** Anything under the text (e.g. an AvatarStack with "98K members"). */
  extra?: ReactNode;
  time: string;
  thumb?: string | null;
  action?: ReactNode;
  unread?: boolean;
  chevron?: boolean;
  to?: string;
  /** Screen-reader text for the row link (defaults to "Open notification"). */
  label?: string;
  className?: string;
}) {
  const badge = kind === "live" || kind === "event" ? null : KIND_BADGE[kind];
  return (
    <article
      className={cn(
        "relative flex items-center gap-2.5 rounded-[14px] p-2 transition-colors lg:gap-3 lg:rounded-card lg:p-3",
        unread
          ? "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--color-tint-pink)_70%,var(--color-surface)),var(--color-surface))] shadow-card"
          : "bg-surface shadow-card",
        className,
      )}
    >
      {to && (
        <Link
          to={to}
          aria-label={label ?? "Open notification"}
          className="k-focus absolute inset-0 rounded-card"
        />
      )}
      <div className="relative shrink-0 self-start">
        {kind === "event" || !actor ? (
          <span className="grid size-[46px] place-items-center rounded-full bg-tint-pink text-pink-ink lg:size-14">
            {kind === "event" ? (
              <CalendarDays className="size-6" strokeWidth={2} aria-hidden />
            ) : (
              <Users className="size-6" strokeWidth={2} aria-hidden />
            )}
          </span>
        ) : (
          <Avatar person={actor} size={45} />
        )}
        {badge && (
          <span
            className={cn(
              "absolute -right-1 -bottom-0.5 grid size-[19px] place-items-center rounded-full text-white ring-2 ring-surface",
              badge.bg,
            )}
            role="img"
            aria-label={badge.label}
          >
            {badge.icon}
          </span>
        )}
        {kind === "live" && (
          <span className="absolute -bottom-1 left-1/2 inline-flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-red-strong px-1 py-px text-[9.5px] font-extrabold text-white ring-2 ring-surface">
            <Radio className="size-2.5" strokeWidth={2.8} aria-hidden />
            LIVE
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-[17px] text-ink lg:text-[15px] lg:leading-snug [&_b]:text-[13px] [&_b]:font-extrabold lg:[&_b]:text-[15px]">
          {title}
        </p>
        {snippet && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-[16px] text-muted lg:text-[14px] lg:leading-snug">
            {snippet}
          </p>
        )}
        {extra && <div className="mt-1">{extra}</div>}
        <p className="mt-0.5 text-[11px] text-subtle lg:text-[12.5px]">{time}</p>
      </div>
      {thumb && (
        <img
          src={thumb}
          alt=""
          className="h-12 w-[72px] shrink-0 rounded-[10px] object-cover lg:h-16 lg:w-24"
          loading="lazy"
        />
      )}
      {action && <div className="relative z-10 shrink-0">{action}</div>}
      {unread && <RedDot label="Unread" className="size-2 shrink-0 bg-pink ring-0" />}
      {chevron && (
        <ChevronRight className="size-4 shrink-0 text-subtle" strokeWidth={2.4} aria-hidden />
      )}
    </article>
  );
}

/** One comment: avatar, name, time, text, heart + count on the right, ⋯ menu. */
export function CommentRow({
  author,
  name,
  to,
  time,
  text,
  likes,
  liked = false,
  onLike,
  onMore,
  className,
}: {
  author: AvatarPerson;
  name: string;
  /** Link to the author's profile. */
  to?: string;
  time: string;
  text: ReactNode;
  likes: number;
  liked?: boolean;
  onLike?: () => void;
  /** Opens report / delete (render your own menu, e.g. a dropdown, from this). */
  onMore?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2.5 py-1.5", className)}>
      {to ? (
        <Link to={to} aria-label={name} className="k-focus shrink-0 self-start rounded-full">
          <Avatar person={author} size={40} />
        </Link>
      ) : (
        <Avatar person={author} size={40} />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-extrabold text-ink lg:text-[15px]">
            {name}
          </span>
          <span className="shrink-0 text-[11px] text-subtle lg:text-[12.5px]">{time}</span>
        </p>
        <div className="text-[12.5px] leading-[17px] text-body lg:text-[15px] lg:leading-snug">
          {text}
        </div>
      </div>
      <div className="flex shrink-0 items-start">
        <button
          type="button"
          onClick={onLike}
          aria-pressed={liked}
          aria-label={`${liked ? "Unlike" : "Like"} comment, ${likes} likes`}
          className="k-focus inline-flex h-11 items-center gap-1 rounded-full px-1 text-[11px] font-semibold text-muted lg:text-[13px]"
        >
          <Heart
            className="size-4 text-pink"
            fill={liked ? "currentColor" : "none"}
            strokeWidth={2.2}
            aria-hidden
          />
          {compactNumber(likes)}
        </button>
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            aria-label="More options for this comment"
            className="k-focus grid h-11 w-7 place-items-center rounded-full text-muted hover:text-ink"
          >
            <EllipsisVertical className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The comment input bar: own avatar, rounded "Add a comment…" field with picture and emoji
 * buttons, violet send circle. Put it in a sticky/fixed footer on the post page.
 */
export function CommentBar({
  me,
  value,
  onChange,
  onSubmit,
  onPickImage,
  onEmoji,
  sending = false,
  placeholder = "Add a comment…",
  maxLength = 2000,
  className,
}: {
  me?: AvatarPerson | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onPickImage?: () => void;
  onEmoji?: () => void;
  sending?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const id = useId();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || sending) return;
    onSubmit();
  }
  return (
    <form onSubmit={submit} className={cn("flex items-center gap-2.5", className)}>
      {me && <Avatar person={me} size={30} />}
      <div className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-surface-alt pr-1 pl-3.5 focus-within:ring-2 focus-within:ring-violet">
        <label htmlFor={id} className="sr-only">
          Write a comment
        </label>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-[14px] placeholder:text-subtle"
        />
        {onPickImage && (
          <button
            type="button"
            onClick={onPickImage}
            aria-label="Add a picture"
            className="k-focus k-hit grid size-8 place-items-center rounded-full text-muted hover:text-ink"
          >
            <ImageIcon className="size-5" strokeWidth={2} aria-hidden />
          </button>
        )}
        {onEmoji && (
          <button
            type="button"
            onClick={onEmoji}
            aria-label="Add an emoji"
            className="k-focus k-hit grid size-8 place-items-center rounded-full text-muted hover:text-ink"
          >
            <Smile className="size-5" strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      <button
        type="submit"
        disabled={!value.trim() || sending}
        aria-label="Send comment"
        className="k-focus k-hit grid size-9 shrink-0 place-items-center rounded-full bg-violet-strong text-white shadow-glow transition-opacity disabled:opacity-50"
      >
        <ArrowUp className="size-[18px]" strokeWidth={2.8} aria-hidden />
      </button>
    </form>
  );
}

/** Search box with a filter button (Explore). Submitting calls `onSubmit`. */
export function SearchField({
  value,
  onChange,
  onSubmit,
  onFilter,
  filterActive = false,
  placeholder = "Search communities, topics, or interests...",
  label = "Search",
  autoFocus,
  id,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  onFilter?: () => void;
  filterActive?: boolean;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
      className={cn(
        "flex h-10 items-center rounded-[14px] border border-border bg-surface pr-0.5 pl-3.5 shadow-card focus-within:ring-2 focus-within:ring-violet lg:h-12 lg:rounded-[16px]",
        className,
      )}
    >
      <Search className="size-5 shrink-0 text-muted" strokeWidth={2.2} aria-hidden />
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-2.5 text-[16px] text-ink outline-none placeholder:text-[13.5px] placeholder:text-muted lg:placeholder:text-[15px] [&::-webkit-search-cancel-button]:hidden"
      />
      {onFilter && (
        <>
          <span className="h-6 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={onFilter}
            aria-label="Search filters"
            aria-pressed={filterActive}
            className={cn(
              "k-focus ml-0.5 grid size-10 place-items-center rounded-full",
              filterActive ? "bg-tint-violet text-violet" : "text-ink hover:bg-surface-alt",
            )}
          >
            <SlidersHorizontal className="size-5" strokeWidth={2.2} aria-hidden />
          </button>
        </>
      )}
    </form>
  );
}

/** Post pictures: big swipeable picture with a "1/5" counter and a thumbnail strip below. */
export function ImageCarousel({
  images,
  className,
}: {
  images: { src: string; alt?: string }[];
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const many = images.length > 1;
  function goTo(i: number) {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="relative overflow-hidden rounded-[14px] bg-surface-alt lg:rounded-[18px]">
        <div
          ref={track}
          className="k-row aspect-[16/10] w-full"
          style={{ scrollSnapType: "x mandatory" }}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
          aria-roledescription="carousel"
          aria-label="Post pictures"
        >
          {images.map((img, i) => (
            <img
              key={`${img.src}-${i}`}
              src={img.src}
              alt={img.alt ?? `Picture ${i + 1} of ${images.length}`}
              className="h-full w-full snap-center object-cover"
              style={{ width: "100%" }}
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
            />
          ))}
        </div>
        {many && (
          <span className="absolute top-2 right-2 rounded-full bg-[#14112bb3] px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
            {index + 1}/{images.length}
          </span>
        )}
      </div>
      {many && (
        <div className="grid grid-cols-5 gap-1.5">
          {images.slice(0, 10).map((img, i) => (
            <button
              key={`${img.src}-t${i}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show picture ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "k-focus aspect-[1.6] overflow-hidden rounded-[8px] border-2 bg-surface-alt",
                i === index ? "border-violet" : "border-transparent",
              )}
            >
              <img
                src={img.src}
                alt=""
                className="size-full object-cover"
                loading="lazy"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
