import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronRight,
  Crown,
  EllipsisVertical,
  Headphones,
  Heart,
  ImageIcon,
  MessageCircle,
  MessagesSquare,
  Mic,
  Pencil,
  Plus,
  Radio,
  Shield,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Avatar,
  AvatarStack,
  EmptyHint,
  GradientButton,
  JoinButton,
  LiveBadge,
  OnlineDot,
  Pill,
  StatCard,
  TONE_STYLE,
  VerifiedTick,
  hueGradient,
  toneAt,
} from "@/components/k";
import { compactNumber, timeAgo } from "@/lib/format-ui";
import type {
  AuthorChip,
  HallEvent,
  LiveRoomCard,
  MediaItem,
  ModeratorRow,
  Post,
} from "@/lib/kamino/types";
import { cn } from "@/lib/utils";
import { personFromChip, plainPreview, postTypeMeta, topicStyle } from "./helpers";

/** A picture, or a colourful gradient (with an optional icon) when there is none. Never a grey box. */
export function Picture({
  src,
  hue,
  icon,
  className,
  alt = "",
}: {
  src?: string | null;
  hue: number;
  icon?: ReactNode;
  className?: string;
  alt?: string;
}) {
  if (src)
    return (
      <img
        src={src}
        alt={alt}
        className={cn("bg-surface-alt object-cover", className)}
        loading="lazy"
        draggable={false}
      />
    );
  return (
    <span
      className={cn("grid place-items-center text-white/90 [&_svg]:size-6", className)}
      style={{ background: hueGradient(hue) }}
      aria-hidden
    >
      {icon}
    </span>
  );
}

// ── Topic chips ──────────────────────────────────────────────────────────────

/** The community's topics as tinted emoji chips (Anime, Manga, Fan Art…). Leaders get an "Edit" chip. */
export function TopicChips({
  topics,
  onEdit,
  className,
}: {
  topics: string[];
  onEdit?: () => void;
  className?: string;
}) {
  if (!topics.length && !onEdit) return null;
  return (
    <ul
      aria-label="Topics"
      className={cn("k-row -mx-4 gap-[7px] px-4 py-0.5 lg:mx-0 lg:flex-wrap lg:px-0", className)}
    >
      {topics.map((t, i) => {
        const s = topicStyle(t, i);
        return (
          <li key={t} className="shrink-0">
            <Link
              to="/explore"
              search={{ q: t }}
              aria-label={`Topic ${t}`}
              className={cn(
                "k-focus k-hit inline-flex h-[25px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap lg:h-8 lg:px-3.5 lg:text-[14px]",
                TONE_STYLE[s.tone].softClassName,
              )}
            >
              <span className="text-[13px] leading-none lg:text-[15px]" aria-hidden>
                {s.emoji}
              </span>
              {t}
            </Link>
          </li>
        );
      })}
      {onEdit ? (
        <li className="shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="k-focus k-hit inline-flex h-[25px] items-center gap-1 rounded-full border-[1.5px] border-dashed border-violet px-2.5 text-[12px] font-semibold text-violet lg:h-8 lg:text-[14px]"
          >
            {topics.length ? (
              <Pencil className="size-3" strokeWidth={2.6} aria-hidden />
            ) : (
              <Plus className="size-3" strokeWidth={2.6} aria-hidden />
            )}
            {topics.length ? "Edit" : "Add topics"}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

// ── Stat cards ───────────────────────────────────────────────────────────────

/** Gold "Top 1%" card with a crown and laurels (the community's rank among all communities). */
export function RankCard({
  percent,
  category,
  to,
  className,
}: {
  percent: number;
  category: string;
  to?: string;
  className?: string;
}) {
  const label = `Top ${percent}%`;
  const body = (
    <>
      <span className="relative grid size-[38px] shrink-0 place-items-center lg:size-12" aria-hidden>
        {/* Laurel leaves either side of the medal. */}
        <span className="absolute -bottom-1 -left-1.5 text-[13px] leading-none text-yellow">🌿</span>
        <span className="absolute -right-1.5 -bottom-1 -scale-x-100 text-[13px] leading-none text-yellow">
          🌿
        </span>
        <span className="grid size-[34px] place-items-center rounded-full bg-[linear-gradient(135deg,#FFB547,#F25C1E)] text-white shadow-[0_4px_10px_rgba(242,92,30,0.35)] lg:size-11">
          <Crown className="size-[18px] lg:size-6" strokeWidth={2.4} fill="currentColor" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] leading-tight font-extrabold tracking-[-0.02em] text-orange-ink lg:text-[22px]">
          {label}
        </span>
        <span className="line-clamp-2 text-[10.5px] leading-tight font-semibold text-body lg:text-[13px]">
          {category}
        </span>
      </span>
    </>
  );
  const cls = cn(
    "k-focus flex items-center gap-2 rounded-[14px] bg-grad-streak p-2.5 lg:rounded-card lg:p-3",
    className,
  );
  return to ? (
    <Link to={to} aria-label={`${label} ${category}. Open the leaderboard`} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls} role="group" aria-label={`${label} ${category}`}>
      {body}
    </div>
  );
}

/** The three cards under the topics: members, who is online, and the rank. */
export function CommunityStats({
  memberCount,
  memberFaces,
  onlineCount,
  onlineFaces,
  rankPercent,
  category,
  membersTo,
  rankTo,
  vertical = false,
  className,
}: {
  memberCount: number;
  memberFaces: AuthorChip[];
  onlineCount: number;
  onlineFaces: AuthorChip[];
  rankPercent: number;
  category: string;
  membersTo?: string;
  rankTo?: string;
  /** Stack the cards (the desktop side column). */
  vertical?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        vertical ? "grid gap-3" : "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.12fr)] gap-2",
        className,
      )}
    >
      <StatCard
        tone="violet"
        to={membersTo}
        icon={
          <span className="grid size-9 place-items-center rounded-full bg-[linear-gradient(135deg,#B26BFF,#7C3AED)] text-white shadow-[0_4px_10px_rgba(124,58,237,0.3)] lg:size-11">
            <Users className="size-[18px] lg:size-[22px]" strokeWidth={2.4} fill="currentColor" aria-hidden />
          </span>
        }
        value={compactNumber(memberCount)}
        label="Members"
        className="min-w-0"
      >
        <AvatarStack
          people={memberFaces.map(personFromChip)}
          size={18}
          max={4}
          label={`${memberFaces.length} members shown`}
          className="ml-11 lg:ml-[52px]"
        />
      </StatCard>
      <StatCard
        tone="pink"
        toTone="blue"
        to={membersTo}
        chevron={!!membersTo}
        icon={
          <span className="grid size-5 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-green)_25%,transparent)]">
            <OnlineDot size={11} className="ring-0" />
          </span>
        }
        value={compactNumber(onlineCount)}
        label="Online Now"
        className="min-w-0"
      >
        <AvatarStack
          people={onlineFaces.map(personFromChip)}
          size={18}
          max={5}
          label={`${onlineCount} online now`}
        />
      </StatCard>
      <RankCard percent={rankPercent} category={`${category} Community`} to={rankTo} />
    </div>
  );
}

// ── Moderators ───────────────────────────────────────────────────────────────

const BADGE: Record<ModeratorRow["badge"], { icon: ReactNode; bg: string; color: string }> = {
  leader: {
    icon: <Crown className="size-2.5" strokeWidth={2.6} fill="currentColor" />,
    bg: "bg-orange-strong",
    color: "text-orange",
  },
  coleader: {
    icon: <Star className="size-2.5" strokeWidth={2.6} fill="currentColor" />,
    bg: "bg-blue-strong",
    color: "text-blue",
  },
  moderator: {
    icon: <Shield className="size-2.5" strokeWidth={2.6} fill="currentColor" />,
    bg: "bg-violet-strong",
    color: "text-violet",
  },
};

/** Moderator faces with a role badge (leader crown, co-leader star, moderator shield), name and role. */
export function ModeratorsRow({
  moderators,
  className,
}: {
  moderators: ModeratorRow[];
  className?: string;
}) {
  return (
    <ul
      aria-label="Moderators"
      className={cn("k-row -mx-4 gap-1 px-3 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0", className)}
    >
      {moderators.map((m) => {
        const b = BADGE[m.badge];
        return (
          <li key={m.userId} className="w-[78px] shrink-0 lg:w-auto">
            <Link
              to="/u/$handle"
              params={{ handle: m.handle }}
              aria-label={`${m.nickname}, ${m.label}`}
              className="k-focus flex flex-col items-center gap-0.5 rounded-tile py-1 hover:bg-surface-alt/70"
            >
              <span className="relative">
                <Avatar
                  person={{ name: m.nickname, hue: m.avatarHue, userId: m.userId, avatarV: m.avatarV }}
                  size={50}
                  ring
                />
                <span
                  className={cn(
                    "absolute -right-1 -bottom-0.5 grid size-[19px] place-items-center rounded-full text-white ring-2 ring-surface",
                    b.bg,
                  )}
                  aria-hidden
                >
                  {b.icon}
                </span>
              </span>
              <span className="mt-1 w-full truncate text-center text-[12px] leading-4 font-extrabold text-ink lg:text-[13.5px]">
                {m.nickname}
              </span>
              <span className="flex items-center gap-0.5 text-[10.5px] leading-[13px] text-muted lg:text-[12px]">
                <span className={cn("[&_svg]:size-2.5", b.color)} aria-hidden>
                  {b.icon}
                </span>
                {m.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ── Featured post tile ───────────────────────────────────────────────────────

/** A featured post card: picture (with "Pinned"), title, author + tick + time, likes and comments. */
export function PostTile({ post, slug, className }: { post: Post; slug: string; className?: string }) {
  return (
    <article
      className={cn(
        "k-card relative flex flex-col overflow-hidden rounded-tile lg:rounded-card",
        className,
      )}
    >
      <div className="relative aspect-[1.95] w-full overflow-hidden">
        <Picture
          src={post.contentWarning ? null : post.cover}
          hue={post.author.hue}
          icon={<ImageIcon aria-hidden />}
          className="absolute inset-0 size-full"
        />
        {post.pinned && (
          <Pill
            tone="pink"
            solid
            icon={<Star className="size-2.5" fill="currentColor" strokeWidth={0} aria-hidden />}
            className="absolute top-[5px] left-[5px] h-[19px] px-[7px] text-[10.5px]"
          >
            Pinned
          </Pill>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-2 pt-1.5 pb-2 lg:px-3 lg:pt-2.5 lg:pb-3">
        <h3 className="line-clamp-2 min-h-[32px] text-[12.5px] leading-4 font-extrabold text-ink lg:min-h-[40px] lg:text-[15px] lg:leading-5">
          <Link
            to="/c/$slug/p/$postId"
            params={{ slug, postId: String(post.id) }}
            className="k-focus after:absolute after:inset-0 after:content-['']"
          >
            {post.title}
          </Link>
        </h3>
        <div className="flex items-center gap-1.5">
          <Avatar person={personFromChip(post.author)} size={24} />
          <div className="min-w-0 leading-none">
            <p className="flex items-center gap-1 text-[11px] font-bold text-ink lg:text-[12.5px]">
              <span className="truncate">{post.author.nickname}</span>
              {post.authorVerified && <VerifiedTick size={11} />}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted lg:text-[11.5px]" suppressHydrationWarning>
              {timeAgo(post.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[12px] font-semibold text-body lg:text-[13px]">
          <span className="inline-flex items-center gap-1" aria-label={`${post.likeCount} likes`}>
            <Heart className="size-4 text-pink" fill="currentColor" strokeWidth={0} aria-hidden />
            {compactNumber(post.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1" aria-label={`${post.commentCount} comments`}>
            <MessageCircle className="size-4 text-body" strokeWidth={2} aria-hidden />
            {compactNumber(post.commentCount)}
          </span>
        </div>
      </div>
    </article>
  );
}

// ── Recent post row ──────────────────────────────────────────────────────────

/** A compact post row: avatar, name + tick, type pill, time, title, one line of text, picture, ⋯. */
export function RecentPostRow({
  post,
  slug,
  onMore,
}: {
  post: Post;
  slug: string;
  onMore?: () => void;
}) {
  const meta = postTypeMeta(post.type);
  const preview = post.contentWarning
    ? `Content warning: ${post.contentWarning}`
    : plainPreview(post.body);
  return (
    <article className="k-card relative flex items-center gap-2.5 rounded-card p-2.5 pr-8 lg:gap-3.5 lg:p-3.5 lg:pr-10">
      <Avatar person={personFromChip(post.author)} size={42} className="lg:hidden" />
      <Avatar person={personFromChip(post.author)} size={52} className="hidden lg:inline-grid" />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13.5px] leading-[17px] font-extrabold text-ink lg:text-[15px]">
            {post.author.nickname}
          </span>
          {post.authorVerified && <VerifiedTick size={12} />}
          <Pill
            tone={post.announcement ? "blue" : meta.tone}
            className="h-[19px] shrink-0 px-[7px] text-[10.5px] lg:h-[22px] lg:text-[11.5px]"
          >
            {post.announcement ? "Announcement" : meta.label}
          </Pill>
          {post.scheduled ? (
            <Pill tone="orange" className="h-[19px] shrink-0 px-[7px] text-[10.5px]">
              Scheduled
            </Pill>
          ) : null}
          <span className="shrink-0 text-[11px] text-subtle lg:text-[12px]" suppressHydrationWarning>
            {timeAgo(post.createdAt)}
          </span>
        </p>
        <h3 className="mt-0.5 truncate text-[13.5px] leading-[18px] font-extrabold text-ink lg:text-[16px] lg:leading-6">
          <Link
            to="/c/$slug/p/$postId"
            params={{ slug, postId: String(post.id) }}
            className="k-focus after:absolute after:inset-0 after:rounded-card after:content-['']"
          >
            {post.title}
          </Link>
        </h3>
        {preview ? (
          <p className="truncate text-[12px] leading-4 text-muted lg:text-[14px] lg:leading-5">{preview}</p>
        ) : null}
      </div>
      {post.cover && !post.contentWarning ? (
        <Picture
          src={post.cover}
          hue={post.author.hue}
          className="h-[52px] w-[84px] shrink-0 rounded-[12px] lg:h-[72px] lg:w-[120px]"
        />
      ) : null}
      {onMore ? (
        <button
          type="button"
          onClick={onMore}
          aria-label={`Options for ${post.title}`}
          className="k-focus k-hit absolute top-1 right-1 z-10 grid size-7 place-items-center rounded-full text-muted hover:text-ink"
        >
          <EllipsisVertical className="size-[17px] rotate-90" aria-hidden />
        </button>
      ) : null}
    </article>
  );
}

// ── Stories (24 h) ───────────────────────────────────────────────────────────

/** Round story bubbles with a gradient ring; each opens the story post. */
export function StoriesRow({ stories, slug }: { stories: Post[]; slug: string }) {
  return (
    <ul aria-label="Stories" className="k-row -mx-4 gap-3 px-4 lg:mx-0 lg:px-0">
      {stories.map((s) => (
        <li key={s.id} className="w-[66px] shrink-0">
          <Link
            to="/c/$slug/p/$postId"
            params={{ slug, postId: String(s.id) }}
            aria-label={`Story by ${s.author.nickname}`}
            className="k-focus flex flex-col items-center gap-1 rounded-tile"
          >
            <span className="rounded-full bg-[linear-gradient(135deg,var(--color-pink),var(--color-violet),var(--color-orange))] p-[2.5px]">
              <span className="block rounded-full bg-bg p-[2px]">
                {s.cover ? (
                  <img src={s.cover} alt="" className="size-[54px] rounded-full object-cover" loading="lazy" />
                ) : (
                  <Avatar person={personFromChip(s.author)} size={54} />
                )}
              </span>
            </span>
            <span className="w-full truncate text-center text-[11px] font-semibold text-body">
              {s.author.nickname}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Rooms tab ────────────────────────────────────────────────────────────────

/** A white rounded row used by the Rooms and Events tabs and by search results. */
export function ResultRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <article
      className={cn(
        "k-card relative flex items-center gap-3 rounded-card p-2.5 lg:gap-4 lg:p-3.5",
        className,
      )}
    >
      {children}
    </article>
  );
}

/** The community's chat and live rooms; members can start a live room. */
export function RoomsPanel({
  slug,
  rooms,
  canStart,
  onStart,
}: {
  slug: string;
  rooms: LiveRoomCard[];
  canStart: boolean;
  onStart: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="space-y-2.5">
      {rooms.length ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {rooms.map((room, i) => {
            const live = room.kind === "voice" || room.kind === "screening";
            return (
              <ResultRow key={room.roomId}>
                <span className="relative size-[58px] shrink-0 overflow-hidden rounded-[14px]">
                  <Picture
                    src={room.cover}
                    hue={250 + i * 20}
                    icon={live ? <Radio aria-hidden /> : <MessagesSquare aria-hidden />}
                    className="size-full"
                  />
                  {live && room.liveCount > 0 ? (
                    <LiveBadge className="absolute top-[3px] left-[3px]" />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14.5px] font-extrabold text-ink">
                    <Link
                      to="/chats/$roomId"
                      params={{ roomId: String(room.roomId) }}
                      className="k-focus after:absolute after:inset-0 after:rounded-card after:content-['']"
                    >
                      {live ? room.title : `# ${room.title}`}
                    </Link>
                  </h3>
                  <p className="truncate text-[12.5px] text-muted">
                    {live
                      ? `${room.topic || "Live room"} · ${compactNumber(room.liveCount)} here now`
                      : room.subtitle || "Chat room"}
                  </p>
                  <AvatarStack people={room.faces.map(personFromChip)} size={17} max={4} className="mt-1" />
                </div>
                <JoinButton
                  tone={toneAt(i)}
                  size="sm"
                  icon={live ? <Headphones className="size-4" aria-hidden /> : <MessageCircle className="size-4" aria-hidden />}
                  label={live ? "Join" : "Open"}
                  name={room.title}
                  onClick={() =>
                    void navigate({ to: "/chats/$roomId", params: { roomId: String(room.roomId) } })
                  }
                />
              </ResultRow>
            );
          })}
        </div>
      ) : (
        <EmptyHint icon="🎧" title="No rooms yet" text="Start a live room and invite everyone to hang out." />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {canStart ? (
          <GradientButton size="sm" icon={<Mic className="size-4" aria-hidden />} onClick={onStart}>
            Start a live room
          </GradientButton>
        ) : null}
        <Link
          to="/c/$slug/chats"
          params={{ slug }}
          className="k-focus k-hit inline-flex min-h-9 items-center gap-0.5 rounded-full px-1.5 text-[14px] font-bold text-violet hover:underline"
        >
          All chat rooms <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

// ── Events tab ───────────────────────────────────────────────────────────────

/** Upcoming events and challenges with RSVP. Challenges (entries, winners) open the Events page. */
export function EventsPanel({
  slug,
  events,
  canRsvp,
  busyId,
  onRsvp,
}: {
  slug: string;
  events: HallEvent[];
  canRsvp: boolean;
  busyId: number | null;
  onRsvp: (e: HallEvent) => void;
}) {
  return (
    <div className="space-y-2.5">
      {events.length ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {events.map((e) => {
            const when = new Date(e.startsAt);
            const challenge = e.kind === "challenge";
            return (
              <ResultRow key={e.id}>
                <span
                  className={cn(
                    "grid h-[58px] w-[54px] shrink-0 place-content-center rounded-[14px] text-center",
                    challenge ? "bg-tint-orange text-orange-ink" : "bg-tint-pink text-pink-ink",
                  )}
                  suppressHydrationWarning
                >
                  <span className="text-[11px] font-bold uppercase" suppressHydrationWarning>
                    {when.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                  <span className="text-[21px] leading-6 font-extrabold" suppressHydrationWarning>
                    {when.getDate()}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  {challenge ? (
                    <Pill tone="orange" icon={<Trophy className="size-3" aria-hidden />} className="h-[19px] px-[7px] text-[10.5px]">
                      Challenge
                    </Pill>
                  ) : null}
                  <h3 className="line-clamp-2 text-[14.5px] leading-5 font-extrabold text-ink">
                    <Link
                      to="/c/$slug/events"
                      params={{ slug }}
                      className="k-focus after:absolute after:inset-0 after:rounded-card after:content-['']"
                    >
                      {e.title}
                    </Link>
                  </h3>
                  <p className="truncate text-[12.5px] text-muted" suppressHydrationWarning>
                    {when.toLocaleDateString(undefined, { weekday: "short" })} ·{" "}
                    {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} ·{" "}
                    {compactNumber(e.rsvpCount)} going
                  </p>
                </div>
                {canRsvp && !challenge ? (
                  e.going ? (
                    <JoinButton
                      joined
                      tone="violet"
                      size="sm"
                      joinedLabel="Going"
                      busy={busyId === e.id}
                      onClick={() => onRsvp(e)}
                      name={e.title}
                    />
                  ) : (
                    <GradientButton
                      size="sm"
                      disabled={busyId === e.id}
                      onClick={() => onRsvp(e)}
                      aria-label={`Join ${e.title}`}
                      className="relative z-10"
                    >
                      Join
                    </GradientButton>
                  )
                ) : (
                  <ChevronRight className="size-[18px] shrink-0 text-subtle" aria-hidden />
                )}
              </ResultRow>
            );
          })}
        </div>
      ) : (
        <EmptyHint icon="📅" title="No events coming up" text="Leaders can plan events and challenges here." />
      )}
      <Link
        to="/c/$slug/events"
        params={{ slug }}
        className="k-focus k-hit inline-flex min-h-9 items-center gap-0.5 rounded-full px-1.5 text-[14px] font-bold text-violet hover:underline"
      >
        <CalendarDays className="mr-1 size-4" aria-hidden />
        All events and challenges <ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

// ── Media tab ────────────────────────────────────────────────────────────────

/** Every picture posted in the community, three across (six on computers); each opens its post. */
export function MediaGrid({ slug, media }: { slug: string; media: MediaItem[] }) {
  if (!media.length)
    return <EmptyHint icon="🖼️" title="No pictures yet" text="Pictures shared in posts will show up here." />;
  return (
    <ul aria-label="Pictures" className="grid grid-cols-3 gap-1.5 lg:grid-cols-6 lg:gap-2">
      {media.map((m) => (
        <li key={`${m.postId}-${m.index}`}>
          <Link
            to="/c/$slug/p/$postId"
            params={{ slug, postId: String(m.postId) }}
            aria-label="Open the post with this picture"
            className="k-focus block aspect-square overflow-hidden rounded-[12px]"
          >
            <Picture src={m.url} hue={260 + m.index * 15} className="size-full transition-transform hover:scale-105" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The orange "check in today" banner for members who haven't checked in yet. */
export function CheckInBanner({
  streak,
  busy,
  onCheckIn,
}: {
  streak: number;
  busy: boolean;
  onCheckIn: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-tile border border-border bg-grad-streak px-3 py-2">
      <span className="text-[22px] leading-none" aria-hidden>
        🔥
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-extrabold text-orange-ink">
          {streak ? `${streak}-day streak` : "Daily check-in"}
        </p>
        <p className="text-[12px] text-body">Check in daily to earn reputation here.</p>
      </div>
      <GradientButton size="sm" disabled={busy} onClick={onCheckIn}>
        {busy ? "Checking in…" : "Check in"}
      </GradientButton>
    </div>
  );
}
