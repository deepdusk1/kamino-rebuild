import {
  Award,
  BarChart3,
  BookOpen,
  Bookmark,
  Brain,
  Cake,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  Film,
  Flame,
  Globe,
  Heart,
  Image as ImageIcon,
  Leaf,
  MessageCircle,
  MessagesSquare,
  PenLine,
  Puzzle,
  Shield,
  Smile,
  Sparkles,
  Star,
  Sticker,
  StickyNote,
  Target,
  Theater,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BadgeHex, ShowcaseBanner, type Tone } from "@/components/k";
import type { Achievement } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

/**
 * The server sends a small icon word for each achievement (see `src/lib/kamino/achievements.ts`). Each word gets
 * an icon (drawn white inside the hexagon medals) and a medal colour, so a row of badges looks colourful like the
 * profile mockup (orange crown, blue brush, pink heart, green leaf…). Same colours as the phone app.
 */
const MEDALS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  pen: { icon: PenLine, tone: "blue" },
  chat: { icon: MessageCircle, tone: "blue" },
  heart: { icon: Heart, tone: "pink" },
  users: { icon: Users, tone: "blue" },
  flame: { icon: Flame, tone: "orange" },
  star: { icon: Star, tone: "orange" },
  message: { icon: MessagesSquare, tone: "violet" },
  sticker: { icon: Sticker, tone: "pink" },
  smile: { icon: Smile, tone: "green" },
  globe: { icon: Globe, tone: "green" },
  crown: { icon: Crown, tone: "orange" },
  shield: { icon: Shield, tone: "violet" },
  brain: { icon: Brain, tone: "orange" },
  target: { icon: Target, tone: "pink" },
  puzzle: { icon: Puzzle, tone: "violet" },
  chart: { icon: BarChart3, tone: "blue" },
  check: { icon: CheckCircle2, tone: "green" },
  clock: { icon: Clock, tone: "violet" },
  book: { icon: BookOpen, tone: "orange" },
  image: { icon: ImageIcon, tone: "pink" },
  mask: { icon: Theater, tone: "violet" },
  film: { icon: Film, tone: "pink" },
  calendar: { icon: Calendar, tone: "orange" },
  trophy: { icon: Trophy, tone: "orange" },
  note: { icon: StickyNote, tone: "blue" },
  bookmark: { icon: Bookmark, tone: "violet" },
  sparkles: { icon: Sparkles, tone: "violet" },
  cake: { icon: Cake, tone: "pink" },
  leaf: { icon: Leaf, tone: "green" },
};

/** The medal look (icon + colour) for an achievement's icon word. Unknown words get a violet medal. */
export function achievementMedal(icon: string): { icon: LucideIcon; tone: Tone } {
  return MEDALS[icon] ?? { icon: Award, tone: "violet" };
}

/** Tier names and colours (a small dot next to the tier on unlocked achievements). */
const TIER_LOOK: Record<Achievement["tier"], { label: string; dot: string; tone: Tone }> = {
  bronze: { label: "Bronze", dot: "#E8742A", tone: "orange" },
  silver: { label: "Silver", dot: "#5B6CF0", tone: "blue" },
  gold: { label: "Gold", dot: "#D97706", tone: "orange" },
  legend: { label: "Legend", dot: "#8B4DFB", tone: "violet" },
};

/** Just the icon for an achievement (kept for older pages). */
export function AchievementIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = achievementMedal(icon).icon;
  return <Icon className={className} aria-hidden="true" />;
}

/** A hexagon medal for an achievement (profile badge row, achievement list). */
export function AchievementMedal({
  achievement,
  size = 38,
  showLabel = true,
  className,
}: {
  achievement: Achievement;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const medal = achievementMedal(achievement.icon);
  const Icon = medal.icon;
  return (
    <BadgeHex
      icon={<Icon style={{ width: size * 0.44, height: size * 0.44 }} strokeWidth={2.4} aria-hidden />}
      label={showLabel ? achievement.name : undefined}
      tone={medal.tone}
      size={size}
      locked={!achievement.unlocked}
      className={className}
    />
  );
}

/**
 * A showcase banner: the colourful strip for an achievement someone chose to show off. It uses the profile's
 * "Top Creator" banner look (violet gradient, white text, trophy), like the phone app.
 */
export function AchievementBanner({
  achievement,
  onClick,
  className,
}: {
  achievement: Achievement;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <ShowcaseBanner
      variant="achievement"
      icon={achievement.tier === "gold" || achievement.tier === "legend" ? "🏆" : "🏅"}
      title={achievement.name}
      text={achievement.desc || `${TIER_LOOK[achievement.tier].label} achievement`}
      onClick={onClick}
      className={className}
    />
  );
}

/**
 * One achievement in the full list: a hexagon medal, the name and what it takes, and either the tier (unlocked)
 * or a progress bar (locked). On your own profile a star picks it for your showcase.
 */
export function AchievementTile({
  achievement,
  showcased,
  onToggleShowcase,
}: {
  achievement: Achievement;
  showcased?: boolean;
  onToggleShowcase?: () => void;
}) {
  const look = TIER_LOOK[achievement.tier];
  const pct = achievement.unlocked
    ? 100
    : Math.round((100 * achievement.progress) / Math.max(1, achievement.target));
  return (
    <li
      className={cn(
        "k-card flex items-center gap-3 rounded-tile p-2.5",
        showcased && "border-violet ring-1 ring-violet",
      )}
    >
      <span className="grid w-[52px] shrink-0 place-items-center">
        <AchievementMedal achievement={achievement} size={44} showLabel={false} className="w-auto" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-[18px] font-extrabold text-ink">{achievement.name}</p>
        {achievement.desc ? (
          <p className="line-clamp-2 text-[12px] leading-4 text-muted">{achievement.desc}</p>
        ) : null}
        {achievement.unlocked ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted">
            <span className="size-2 rounded-full" style={{ background: look.dot }} aria-hidden />
            {look.label}
          </p>
        ) : (
          <div className="mt-1">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-alt"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={achievement.target}
              aria-valuenow={achievement.progress}
              aria-label={`${achievement.name} progress`}
            >
              <div className="h-full rounded-full bg-grad-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-0.5 text-[11px] font-semibold text-subtle tabular-nums">
              {achievement.progress.toLocaleString()} / {achievement.target.toLocaleString()}
            </p>
          </div>
        )}
      </div>
      {achievement.unlocked && onToggleShowcase ? (
        <button
          type="button"
          onClick={onToggleShowcase}
          aria-pressed={showcased}
          aria-label={
            showcased
              ? `Stop showing ${achievement.name} on your profile`
              : `Show ${achievement.name} on your profile`
          }
          className={cn(
            "k-focus grid size-11 shrink-0 place-items-center rounded-full",
            showcased ? "bg-tint-violet text-violet" : "text-subtle hover:text-ink",
          )}
        >
          <Star className={cn("size-5", showcased && "fill-current")} aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
