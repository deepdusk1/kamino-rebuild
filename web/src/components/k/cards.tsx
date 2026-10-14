import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { compactNumber } from "@/lib/format-ui";
import { cn } from "@/lib/utils";
import { Avatar, AvatarStack, type AvatarPerson } from "./avatar";
import { CountPill, LiveBadge, VerifiedTick } from "./bits";
import { GradientButton, JoinButton } from "./buttons";
import { TONE_STYLE, hueGradient, toneAt, type Tone } from "./tokens";

/** Wraps content in a Link, a button or a plain div, depending on what is given. */
function Pressable({
  to,
  onClick,
  label,
  className,
  style,
  children,
}: {
  to?: string;
  onClick?: () => void;
  label?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (to) {
    return (
      <Link to={to} aria-label={label} className={cn("k-focus block", className)} style={style}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn("k-focus block w-full text-left", className)}
        style={style}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

/** Soft tinted card background for a tone (light gradient, works in dark mode too). */
function tintBackground(tone: Tone, to?: Tone): CSSProperties {
  return {
    background: `linear-gradient(135deg, ${TONE_STYLE[tone].tint} 0%, ${
      to
        ? TONE_STYLE[to].tint
        : `color-mix(in oklab, ${TONE_STYLE[tone].tint} 55%, var(--color-surface))`
    } 100%)`,
  };
}

/**
 * Tinted stat card (community: Members / Online Now / Top 1%).
 * `icon` sits on the left, `value` big, `label` under it, `children` (e.g. an AvatarStack) below.
 */
export function StatCard({
  tone = "violet",
  toTone,
  icon,
  value,
  label,
  children,
  to,
  onClick,
  chevron = false,
  valueClassName,
  className,
}: {
  tone?: Tone;
  /** Second tint for a two-colour background (Online Now = pink → blue). */
  toTone?: Tone;
  icon?: ReactNode;
  value: ReactNode;
  label: ReactNode;
  children?: ReactNode;
  to?: string;
  onClick?: () => void;
  chevron?: boolean;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <Pressable
      to={to}
      onClick={onClick}
      className={cn("relative rounded-[14px] p-2.5 lg:rounded-card lg:p-3", className)}
      style={tintBackground(tone, toTone)}
    >
      <div className="flex items-start gap-2">
        {icon && <div className="shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[17px] leading-tight font-extrabold tracking-[-0.02em] whitespace-nowrap text-ink lg:text-[22px]",
              valueClassName,
            )}
          >
            {value}
          </p>
          <p className="line-clamp-2 text-[11.5px] leading-tight font-semibold text-body lg:text-[13px]">
            {label}
          </p>
        </div>
        {chevron && (
          <ChevronRight
            className="absolute top-2.5 right-1.5 size-4 text-pink-ink"
            strokeWidth={2.6}
            aria-hidden
          />
        )}
      </div>
      {children && <div className="mt-1.5">{children}</div>}
    </Pressable>
  );
}

const HEX_GRADIENTS: Record<Tone, [string, string]> = {
  orange: ["#FFB020", "#FF4D4D"],
  violet: ["#7C8CFF", "#5B3DF5"],
  pink: ["#FF7AB6", "#E0338A"],
  green: ["#2EE59D", "#0BA36B"],
  blue: ["#4FA8FF", "#2D5BFF"],
};

/** Hexagon medal with a gradient fill and a white icon (profile badges row). */
export function BadgeHex({
  icon,
  label,
  tone = "violet",
  size = 38,
  locked = false,
  className,
}: {
  icon: ReactNode;
  label?: string;
  tone?: Tone;
  size?: number;
  locked?: boolean;
  className?: string;
}) {
  const [a, b] = HEX_GRADIENTS[tone];
  const hex = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";
  return (
    <figure className={cn("flex w-[66px] shrink-0 flex-col items-center gap-1", className)}>
      <span
        className={cn("relative grid place-items-center", locked && "opacity-40 grayscale")}
        style={{ width: size, height: size * 1.08, filter: `drop-shadow(0 4px 8px ${a}55)` }}
        role="img"
        aria-label={label ? `${label}${locked ? " (locked)" : ""}` : undefined}
      >
        {/* White frame, then the coloured hexagon inside it. */}
        <span className="absolute inset-0 bg-white" style={{ clipPath: hex }} />
        <span
          className="absolute inset-[2px] grid place-items-center text-white"
          style={{
            clipPath: hex,
            background: `linear-gradient(160deg, ${a}, ${b})`,
            fontSize: size * 0.42,
          }}
        >
          {icon}
        </span>
      </span>
      {label && (
        <figcaption
          className="text-center text-[10px] leading-[1.2] font-semibold"
          style={{ color: TONE_STYLE[tone].ink }}
        >
          {label}
        </figcaption>
      )}
    </figure>
  );
}

/** Profile category tile (My Art 🎨, Daily Life 📷 …): tinted square with a big emoji and a label. */
export function ProfileCategoryTile({
  emoji,
  label,
  tone = "violet",
  count,
  to,
  onClick,
  className,
}: {
  emoji: string;
  label: string;
  tone?: Tone;
  count?: number;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Pressable
      to={to}
      onClick={onClick}
      label={count !== undefined ? `${label}, ${count} posts` : label}
      className={cn(
        "rounded-[12px] px-0.5 py-1.5 text-center transition-transform active:scale-[0.97] lg:rounded-tile lg:py-2.5",
        className,
      )}
      style={tintBackground(tone)}
    >
      <span className="block text-[22px] leading-[1.2] lg:text-[30px]" aria-hidden>
        {emoji}
      </span>
      <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-ink lg:mt-1 lg:text-[14px]">
        {label}
      </span>
    </Pressable>
  );
}

export type CreatorInfo = AvatarPerson & {
  handle: string;
  headline: string;
  verified: boolean;
};

/** Featured creator card: avatar, name + verified tick, headline, coloured Follow pill. */
export function CreatorCard({
  creator,
  following = false,
  busy = false,
  onFollow,
  index = 0,
  to,
  className,
}: {
  creator: CreatorInfo;
  following?: boolean;
  busy?: boolean;
  onFollow?: () => void;
  index?: number;
  to?: string;
  className?: string;
}) {
  const href = to ?? `/u/${encodeURIComponent(creator.handle)}`;
  return (
    <article
      className={cn(
        "k-card relative flex items-center gap-[7px] rounded-tile p-[7px] lg:gap-3 lg:rounded-card lg:p-3",
        className,
      )}
    >
      <Avatar person={creator} size={38} className="lg:hidden" />
      <Avatar person={creator} size={52} className="hidden lg:inline-grid" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1">
          <Link
            to={href}
            className="k-focus truncate text-[12px] leading-[15px] font-extrabold text-ink after:absolute after:inset-0 after:rounded-card after:content-[''] lg:text-[14px]"
          >
            {creator.name}
          </Link>
          {creator.verified && <VerifiedTick size={12} />}
        </p>
        <p className="truncate text-[10.5px] leading-[13px] text-muted lg:text-[12.5px]">
          {creator.headline || `@${creator.handle}`}
        </p>
        {onFollow && (
          <JoinButton
            tone={toneAt(index)}
            joined={following}
            busy={busy}
            onClick={onFollow}
            label="Follow"
            joinedLabel="Following"
            name={creator.name}
            full
            className="mt-1 h-[19px] text-[10.5px] [&_svg]:hidden lg:mt-1.5 lg:h-7 lg:text-[12.5px]"
          />
        )}
      </div>
    </article>
  );
}

export type LiveRoomInfo = {
  title: string;
  subtitle: string;
  topic: string;
  cover?: string | null;
  hue: number;
  liveCount: number;
};

/** Live room card (Chats "Live Rooms Now"): cover with LIVE + listeners, topic, title, faces, Join. */
export function LiveRoomCard({
  room,
  faces = [],
  extra,
  index = 0,
  onJoin,
  joinIcon,
  to,
  className,
}: {
  room: LiveRoomInfo;
  faces?: AvatarPerson[];
  /** "+45" after the faces. */
  extra?: number;
  index?: number;
  onJoin?: () => void;
  joinIcon?: ReactNode;
  to?: string;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "k-card relative flex flex-col overflow-hidden rounded-tile lg:rounded-card",
        className,
      )}
    >
      <div className="relative aspect-[1.16] w-full overflow-hidden">
        {room.cover ? (
          <img
            src={room.cover}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: hueGradient(room.hue) }}
            aria-hidden
          />
        )}
        <div className="absolute top-[5px] left-[5px] flex gap-[3px]">
          <LiveBadge />
          <CountPill count={room.liveCount} kind="watching" />
        </div>
        {room.topic && (
          <span className="absolute bottom-[5px] left-[5px] grid h-[17px] place-items-center rounded-full bg-[#0f0b2a8c] px-[7px] text-[9.5px] font-semibold text-white backdrop-blur-sm lg:h-5 lg:text-[11px]">
            {room.topic}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-px p-1.5 lg:p-3">
        <h3 className="truncate text-[11.5px] leading-[15px] font-extrabold text-ink lg:text-[15px] lg:leading-tight">
          {to ? (
            <Link to={to} className="k-focus after:absolute after:inset-0 after:content-['']">
              {room.title}
            </Link>
          ) : (
            room.title
          )}
        </h3>
        <p className="truncate text-[9.5px] leading-[12px] text-muted lg:text-[12.5px] lg:leading-tight">
          {room.subtitle}
        </p>
        <AvatarStack people={faces} size={15} extra={extra} className="mt-[5px]" />
        {onJoin && (
          <JoinButton
            tone={toneAt(index)}
            onClick={onJoin}
            icon={joinIcon}
            full
            name={room.title}
            className="mt-1.5 h-[25px] text-[11.5px] [&_svg]:size-[13px] lg:h-9 lg:text-[14px]"
          />
        )}
      </div>
    </article>
  );
}

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const WEEK_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Daily streak card: fire, "7 days", "Keep going!", and the seven day circles (Mon … Sun).
 * When not checked in yet and `onCheckIn` is given, the whole card is the check-in button.
 */
export function DayStreakCard({
  days,
  week,
  checkedInToday,
  onCheckIn,
  busy = false,
  to,
  className,
}: {
  days: number;
  /** Seven booleans, Monday first: true = checked in that day. */
  week: boolean[];
  checkedInToday: boolean;
  onCheckIn?: () => void;
  busy?: boolean;
  to?: string;
  className?: string;
}) {
  const canCheckIn = !checkedInToday && !!onCheckIn && !busy;
  const label = checkedInToday
    ? `Daily streak: ${days} ${days === 1 ? "day" : "days"}. You checked in today.`
    : `Daily streak: ${days} ${days === 1 ? "day" : "days"}. Check in for today.`;
  return (
    <Pressable
      to={canCheckIn ? undefined : to}
      onClick={canCheckIn ? onCheckIn : undefined}
      label={label}
      className={cn(
        "relative rounded-[14px] bg-grad-streak p-2.5 shadow-card lg:rounded-card lg:p-3.5",
        busy && "opacity-70",
        className,
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="text-[32px] leading-none" aria-hidden>
          🔥
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] leading-tight font-bold text-orange-ink">Daily Streak</p>
          <p className="text-[21px] leading-tight font-extrabold tracking-[-0.02em] text-orange-ink">
            {days} {days === 1 ? "day" : "days"}
          </p>
          <p className="text-[11px] leading-tight font-semibold text-orange-ink">
            {checkedInToday ? "Keep going!" : onCheckIn ? "Tap to check in" : "Keep going!"}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-orange-ink" strokeWidth={2.6} aria-hidden />
      </div>
      <ol className="mt-2 grid grid-cols-7 gap-0.5" aria-label="This week">
        {WEEK.map((d, i) => {
          const done = !!week[i];
          return (
            <li
              key={i}
              className="flex flex-col items-center gap-0.5"
              aria-label={`${WEEK_FULL[i]}: ${done ? "checked in" : "not yet"}`}
            >
              <span
                className={cn(
                  "grid size-[19px] place-items-center rounded-full lg:size-[26px]",
                  done
                    ? "bg-orange text-white shadow-[0_2px_6px_rgba(255,159,26,0.45)]"
                    : "border border-border bg-surface",
                )}
                aria-hidden
              >
                {done && <Check className="size-3 lg:size-4" strokeWidth={3.6} />}
              </span>
              <span className="text-[9.5px] font-semibold text-muted lg:text-[12px]" aria-hidden>
                {d}
              </span>
            </li>
          );
        })}
      </ol>
    </Pressable>
  );
}

/**
 * Live event card (Home): title, time, picture, attendee faces, "1.3K going", Join Event.
 */
export function EventCard({
  title,
  when,
  image,
  hue = 300,
  faces = [],
  goingCount,
  going = false,
  busy = false,
  onJoin,
  to,
  className,
}: {
  title: string;
  when: string;
  image?: string | null;
  hue?: number;
  faces?: AvatarPerson[];
  goingCount: number;
  going?: boolean;
  busy?: boolean;
  onJoin?: () => void;
  to?: string;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative rounded-[14px] p-2.5 shadow-card lg:rounded-card lg:p-3.5",
        className,
      )}
      style={tintBackground("pink", "violet")}
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[12px] font-bold text-pink-ink">
            <CalendarDays className="size-[15px]" strokeWidth={2.4} aria-hidden />
            Live Event
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-[12.5px] leading-[16px] font-extrabold text-ink lg:text-[17px] lg:leading-tight">
            {to ? (
              <Link to={to} className="k-focus">
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-body lg:text-[14px]">{when}</p>
        </div>
        <div className="size-[52px] shrink-0 overflow-hidden rounded-[10px] bg-surface-alt lg:size-[76px]">
          {image ? (
            <img src={image} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div
              className="grid size-full place-items-center text-[22px]"
              style={{ background: hueGradient(hue) }}
              aria-hidden
            >
              🎤
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-1">
        <AvatarStack
          people={faces}
          size={15}
          max={3}
          extra={`${compactNumber(goingCount)} going`}
        />
        {onJoin && (
          <GradientButton
            size="xs"
            onClick={onJoin}
            disabled={busy}
            aria-pressed={going}
            className="h-7 px-3 text-[12px] lg:h-9 lg:px-4 lg:text-[14px]"
          >
            {going ? "Going ✓" : "Join Event"}
          </GradientButton>
        )}
      </div>
    </article>
  );
}

/** Onboarding interest tile: picture on top, emoji + name below; selected = glowing border + check. */
export function InterestTile({
  label,
  emoji,
  image,
  hue = 270,
  selected,
  onToggle,
  className,
}: {
  label: string;
  emoji: string;
  image?: string | null;
  hue?: number;
  selected: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "k-focus relative flex flex-col overflow-hidden rounded-[12px] bg-surface text-left shadow-card transition-[box-shadow,transform] duration-150 active:scale-[0.98] lg:rounded-[16px]",
        selected
          ? "ring-2 ring-[#C04BF5] shadow-[0_0_0_4px_rgba(192,75,245,0.14),0_8px_22px_rgba(168,85,247,0.28)]"
          : "ring-1 ring-border",
      )}
    >
      <span
        className={cn(
          "relative block aspect-[4/3] w-full overflow-hidden bg-surface-alt",
          className,
        )}
      >
        {image ? (
          <img
            src={image}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span
            className="grid size-full place-items-center text-[34px]"
            style={{ background: hueGradient(hue) }}
            aria-hidden
          >
            {emoji}
          </span>
        )}
        {selected && (
          <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-violet-strong text-white ring-2 ring-white">
            <Check className="size-3" strokeWidth={3.6} aria-hidden />
          </span>
        )}
      </span>
      <span className="flex items-center gap-1 px-1.5 py-1.5 lg:gap-1.5 lg:px-2 lg:py-2">
        <span className="text-[14px] leading-none lg:text-[17px]" aria-hidden>
          {emoji}
        </span>
        <span className="truncate text-[12px] font-bold text-ink lg:text-[14px]">{label}</span>
      </span>
    </button>
  );
}

/**
 * Profile showcase banner: "Top Creator" (violet gradient, white text) or the streak card
 * ("72 Day Streak", orange).
 */
export function ShowcaseBanner({
  variant,
  icon,
  title,
  text,
  to,
  onClick,
  className,
}: {
  variant: "achievement" | "streak";
  icon: ReactNode;
  title: string;
  text?: string;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const dark = variant === "achievement";
  return (
    <Pressable
      to={to}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 rounded-[14px] p-2.5 shadow-card lg:rounded-card lg:p-3.5",
        dark ? "bg-grad-top-creator" : "bg-grad-streak",
        className,
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span className="text-[26px] leading-none lg:text-[40px]" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[13.5px] leading-[17px] font-extrabold lg:text-[18px] lg:leading-tight",
              dark ? "text-white" : "text-orange-ink",
            )}
          >
            {title}
          </span>
          {text && (
            <span
              className={cn(
                "mt-0.5 line-clamp-2 block text-[10.5px] leading-[1.3] lg:text-[13px]",
                dark ? "text-white/90" : "text-body",
              )}
            >
              {text}
            </span>
          )}
        </span>
        <ChevronRight
          className={cn("size-4 shrink-0", dark ? "text-white" : "text-orange-ink")}
          strokeWidth={2.6}
          aria-hidden
        />
      </span>
    </Pressable>
  );
}
