import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileText,
  Heart,
  HelpCircle,
  ImageIcon,
  Link2,
  Lock,
  MessageCircle,
  MessageCircleMore,
  Share,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { AchievementMedal } from "@/components/achievement-banner";
import { Picture } from "@/components/community/community-parts";
import { plainPreview, postPictures } from "@/components/community/helpers";
import { Avatar, JoinButton, OnlineDot, type AvatarPerson, type Tone } from "@/components/k";
import { compactNumber } from "@/lib/format-ui";
import type { Achievement, CommunityCardData, Post } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

/** A small dark see-through round button on the cover (back, share, ⋯) with a 44px tap area. */
export function CoverButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="k-focus k-hit relative grid size-[34px] place-items-center rounded-full bg-[#0f0b2a8c] text-white backdrop-blur-sm transition-colors hover:bg-[#0f0b2acc] lg:size-11"
    >
      {children}
    </button>
  );
}

/**
 * The white page "tab" that rises into the bottom of the cover behind the avatar and name, then curves down to
 * the right (the mockup's card curve). Drawn in the page background colour so it works in dark mode too.
 * Phone sizes: tab 168 wide, rises 28px; computers: 260 wide, rises 40px.
 */
function CoverCurve({ tab, rise, drop }: { tab: number; rise: number; drop: number }) {
  const r = 20;
  const low = rise - drop; // where the right-hand part of the page starts (from the top of this strip)
  const w = tab + 34;
  const path = `M0 ${rise + 2} L0 ${r} Q0 0 ${r} 0 L${tab - 20} 0 C${tab + 6} 0 ${tab + 4} ${low} ${tab + 34} ${low} L${w} ${low} L${w} ${rise + 2} Z`;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex" style={{ height: rise + 2 }} aria-hidden>
      <svg width={w} height={rise + 2} viewBox={`0 0 ${w} ${rise + 2}`} className="shrink-0">
        <path d={path} fill="var(--color-bg)" />
      </svg>
      <div className="flex-1 rounded-tr-[20px] bg-bg" style={{ marginTop: low }} />
    </div>
  );
}

/**
 * The top of a profile: the cover picture with back / share / ⋯ buttons, the big avatar with a white ring and a
 * green online dot, and the white page curving up behind the name. Same layout as the phone app.
 */
export function ProfileCover({
  cover,
  hue,
  person,
  online,
  onBack,
  onShare,
  onMore,
  onAvatarClick,
}: {
  cover: string;
  hue: number;
  person: AvatarPerson;
  online: boolean;
  onBack?: () => void;
  onShare: () => void;
  onMore: () => void;
  onAvatarClick?: () => void;
}) {
  const avatar = (
    <>
      <span className="relative block lg:hidden">
        <Avatar person={person} size={100} className="rounded-full ring-4 ring-bg" />
        {online ? <Dot className="right-1 bottom-1 size-5" /> : null}
      </span>
      <span className="relative hidden lg:block">
        <Avatar person={person} size={150} className="rounded-full ring-[6px] ring-bg" />
        {online ? <Dot className="right-2 bottom-2 size-7" /> : null}
      </span>
    </>
  );
  return (
    <div className="relative h-[152px] lg:h-[262px]">
      <Picture
        src={cover}
        hue={hue}
        className="absolute inset-x-0 top-0 h-[150px] w-full rounded-t-[22px] lg:h-[260px] lg:rounded-t-[28px]"
      />
      <div className="absolute inset-x-3.5 top-3 flex items-center gap-2.5 lg:inset-x-5 lg:top-5">
        {onBack ? (
          <CoverButton label="Go back" onClick={onBack}>
            <ChevronLeft className="size-5 lg:size-6" strokeWidth={2.4} aria-hidden />
          </CoverButton>
        ) : null}
        <span className="flex-1" />
        <CoverButton label="Share profile" onClick={onShare}>
          <Share className="size-[17px] lg:size-5" strokeWidth={2.2} aria-hidden />
        </CoverButton>
        <CoverButton label="More options" onClick={onMore}>
          <Ellipsis className="size-5 lg:size-6" strokeWidth={2.4} aria-hidden />
        </CoverButton>
      </div>
      <span className="lg:hidden">
        <CoverCurve tab={168} rise={28} drop={6} />
      </span>
      <span className="hidden lg:block">
        <CoverCurve tab={250} rise={40} drop={8} />
      </span>
      <div className="absolute top-8 left-2.5 lg:top-[72px] lg:left-6">
        {onAvatarClick ? (
          <button
            type="button"
            onClick={onAvatarClick}
            aria-label="Change your photo"
            className="k-focus block rounded-full transition-transform active:scale-[0.97]"
          >
            {avatar}
          </button>
        ) : (
          avatar
        )}
      </div>
    </div>
  );
}

function Dot({ className }: { className?: string }) {
  return <span className={cn("absolute", className)}><OnlineDot className="ring-[3px] ring-bg" style={{ width: "100%", height: "100%" }} /></span>;
}

/** Posts / Followers / Following with thin dividers; each opens its list. */
export function StatsRow({ items }: { items: { value: number; label: string; onClick?: () => void }[] }) {
  return (
    <div className="-ml-2 flex items-stretch">
      {items.map((s, i) => {
        const inner = (
          <>
            <span className="block text-[18px] leading-[22px] font-extrabold tracking-[-0.02em] text-ink tabular-nums lg:text-[22px] lg:leading-7">
              {compactNumber(s.value)}
            </span>
            <span className="block text-[12.5px] leading-4 text-muted lg:text-[14px]">{s.label}</span>
          </>
        );
        return (
          <div key={s.label} className={cn("flex", i > 0 && "border-l border-border")}>
            {s.onClick ? (
              <button
                type="button"
                onClick={s.onClick}
                aria-label={`${compactNumber(s.value)} ${s.label}`}
                className="k-focus min-h-11 rounded-tile px-2 py-1 text-center hover:bg-surface-alt lg:px-5"
                style={{ minWidth: i === 0 ? 56 : 84 }}
              >
                {inner}
              </button>
            ) : (
              <div className="px-2 py-1 text-center lg:px-5" style={{ minWidth: i === 0 ? 56 : 84 }}>
                {inner}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const KIND_ICON: Record<string, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  story: BookOpen,
  poll: BarChart3,
  quiz: HelpCircle,
  link: Link2,
  question: MessageCircleMore,
};

/** The little icon in the corner of a post picture on the profile ("Recent Posts"). */
export function postKindIcon(type: string): LucideIcon {
  return KIND_ICON[type] ?? FileText;
}

/** A post on the profile ("Recent Posts", the posts grid): picture with a kind icon, title, text, likes, comments. */
export function ProfilePostTile({ post, hue, className }: { post: Post; hue: number; className?: string }) {
  const Icon = postKindIcon(post.type);
  const text = plainPreview(post.body);
  const title = post.title || text.slice(0, 60) || "Post";
  const picture = post.contentWarning ? null : (postPictures(post)[0] ?? null);
  return (
    <article className={cn("k-card relative flex flex-col overflow-hidden rounded-tile", className)}>
      <div className="relative aspect-[1.9] w-full overflow-hidden">
        <Picture src={picture} hue={hue} icon={<Icon aria-hidden />} className="absolute inset-0 size-full" />
        <span className="absolute top-1.5 left-1.5 grid size-[22px] place-items-center rounded-[7px] bg-[#0f0b2a99] text-white lg:size-7">
          <Icon className="size-3.5 lg:size-4" strokeWidth={2.2} aria-hidden />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-2 pt-1.5 pb-2 lg:px-3 lg:pt-2.5 lg:pb-3">
        <h3 className="line-clamp-2 text-[12.5px] leading-4 font-extrabold text-ink lg:text-[15px] lg:leading-5">
          <Link
            to="/c/$slug/p/$postId"
            params={{ slug: post.communityId, postId: String(post.id) }}
            className="k-focus after:absolute after:inset-0 after:content-['']"
          >
            {title}
          </Link>
        </h3>
        {text && text !== title ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-[14px] text-muted lg:text-[13px] lg:leading-[17px]">
            {text}
          </p>
        ) : null}
        <div className="mt-auto flex items-center gap-3 pt-1.5 text-[11.5px] font-semibold text-body lg:text-[13px]">
          <span className="inline-flex items-center gap-1" aria-label={`${post.likeCount} likes`}>
            <Heart className="size-[15px] text-pink" fill="currentColor" strokeWidth={0} aria-hidden />
            {compactNumber(post.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1" aria-label={`${post.commentCount} comments`}>
            <MessageCircle className="size-[15px]" strokeWidth={2} aria-hidden />
            {compactNumber(post.commentCount)}
          </span>
        </div>
      </div>
    </article>
  );
}

/** Mockup colour order for the community tiles' Joined pills: violet, pink, blue, green. */
const COMMUNITY_TONES: Tone[] = ["violet", "pink", "blue", "green"];

/** Profile "Communities" tile: square picture on the left, name, members and a coloured Join / Joined pill. */
export function CommunityTile({
  community,
  index,
  busy,
  onJoin,
  className,
}: {
  community: CommunityCardData;
  index: number;
  busy?: boolean;
  onJoin: () => void;
  className?: string;
}) {
  return (
    <article className={cn("k-card relative flex items-center gap-1 rounded-[12px] p-1 lg:gap-2.5 lg:p-2", className)}>
      <Picture
        src={community.icon || community.cover}
        hue={community.hue}
        className="h-[38px] w-[32px] shrink-0 rounded-[8px] lg:size-14 lg:rounded-[12px]"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[10px] leading-[13px] font-extrabold tracking-[-0.2px] text-ink lg:text-[14px] lg:leading-[18px]">
          <Link
            to="/c/$slug"
            params={{ slug: community.id }}
            className="k-focus after:absolute after:inset-0 after:content-['']"
          >
            {community.name}
          </Link>
        </h3>
        <p className="truncate text-[9px] leading-[11px] text-muted lg:text-[12px] lg:leading-4">
          {compactNumber(community.memberCount)} members
        </p>
        <JoinButton
          tone={COMMUNITY_TONES[index % COMMUNITY_TONES.length]}
          joined={false}
          label={community.joined ? "Joined" : "Join"}
          busy={busy}
          onClick={onJoin}
          name={community.name}
          full
          className={cn(
            "mt-0.5 h-4 px-1 text-[9.5px] lg:mt-1 lg:h-7 lg:text-[12.5px]",
            community.joined && "opacity-95",
          )}
        />
      </div>
    </article>
  );
}

/** The white card with up to five hexagon medals (more on computers) and a round ">" that opens every achievement. */
export function BadgeRow({
  badges,
  onSeeAll,
  emptyText,
}: {
  badges: Achievement[];
  onSeeAll: () => void;
  emptyText: string;
}) {
  return (
    <div className="k-card flex items-center rounded-tile py-2 pr-1.5 pl-1 lg:py-3 lg:pr-3">
      {badges.length ? (
        <ul className="flex flex-1 justify-around" aria-label="Badges">
          {badges.slice(0, 8).map((a, i) => (
            <li key={a.id} className={cn(i >= 5 && "hidden lg:block")}>
              <button
                type="button"
                onClick={onSeeAll}
                aria-label={`${a.name}: ${a.desc}`}
                className="k-focus rounded-tile"
              >
                <AchievementMedal achievement={a} size={34} className="lg:hidden" />
                <AchievementMedal achievement={a} size={46} className="hidden w-[96px] lg:flex [&_figcaption]:text-[12px]" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex-1 px-2.5 text-[12.5px] font-semibold text-muted">{emptyText}</p>
      )}
      <button
        type="button"
        onClick={onSeeAll}
        aria-label="See all achievements"
        className="k-focus k-hit relative grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-ink shadow-card hover:bg-surface-alt lg:size-10"
      >
        <ChevronRight className="size-[17px]" strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}

/** Shown under the header of a private account to people who don't follow it. */
export function PrivateNotice({ requested }: { requested: boolean }) {
  return (
    <div className="k-card mx-2.5 flex flex-col items-center gap-2 rounded-card p-6 text-center lg:mx-0">
      <span className="grid size-14 place-items-center rounded-full bg-tint-violet text-violet">
        <Lock className="size-6" strokeWidth={2.4} aria-hidden />
      </span>
      <h2 className="text-[17px] font-extrabold text-ink">This account is private</h2>
      <p className="max-w-sm text-[13px] text-muted">
        {requested
          ? "Your follow request is waiting. Once it's accepted you'll see their posts, badges and communities."
          : "Follow this account to see their posts, badges and communities."}
      </p>
    </div>
  );
}

/** Section title used further down the profile (Wall, Titles, Characters…), in the redesign's style. */
export function ProfileSection({
  title,
  emoji,
  action,
  children,
  className,
}: {
  title: string;
  emoji: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex min-h-7 items-center gap-2">
        <span className="text-[16px] lg:text-[20px]" aria-hidden>
          {emoji}
        </span>
        <h2 className="flex-1 text-[15.5px] leading-[21px] font-extrabold tracking-[-0.2px] text-ink lg:text-[20px]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
