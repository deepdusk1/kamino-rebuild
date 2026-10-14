import { Link } from "@tanstack/react-router";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CategoryItem } from "./categories";
import { TONE_STYLE, toneAt, type Tone } from "./tokens";

/** Emoji (or the grid icon for "More") at chip size. */
function ChipEmoji({ item }: { item: CategoryItem }) {
  if (item.key === "more")
    return <LayoutGrid className="size-[13px] text-ink lg:size-4" strokeWidth={2.6} aria-hidden />;
  return (
    <span className="text-[13px] leading-none lg:text-[16px]" aria-hidden>
      {item.emoji}
    </span>
  );
}

/**
 * Horizontal scroll of category chips (emoji + label). The selected chip is a gradPrimary
 * pill with white text; others are white pills with a soft border. "More" calls `onMore`.
 */
export function CategoryChips({
  items,
  value,
  onChange,
  onMore,
  showArrow = false,
  label = "Categories",
  className,
}: {
  items: CategoryItem[];
  value: string;
  onChange: (key: string) => void;
  /** Called when the "More" chip is pressed (defaults to selecting it). */
  onMore?: () => void;
  /** Show the round ">" button at the end that scrolls the row (Explore). */
  showArrow?: boolean;
  label?: string;
  className?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  return (
    <div className={cn("relative flex items-center", className)}>
      <div
        ref={row}
        role="group"
        aria-label={label}
        className={cn(
          "k-row -mx-4 min-w-0 flex-1 gap-1.5 px-4 py-2 lg:mx-0 lg:gap-2 lg:px-0",
          showArrow && "pr-11 lg:pr-11",
        )}
      >
        {items.map((item) => {
          const selected = item.key === value;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={selected}
              onClick={() => (item.key === "more" && onMore ? onMore() : onChange(item.key))}
              className={cn(
                "k-focus k-hit inline-flex h-7 items-center gap-1.5 rounded-full px-[9px] text-[11.5px] whitespace-nowrap transition-[background-color,box-shadow] duration-150 lg:h-9 lg:px-4 lg:text-[14px]",
                selected
                  ? "bg-grad-primary font-bold text-white shadow-[0_4px_12px_rgba(124,58,237,0.28)]"
                  : "border border-border bg-surface font-semibold text-ink shadow-[0_2px_8px_rgba(20,17,43,0.04)] hover:bg-surface-alt",
              )}
            >
              <ChipEmoji item={item} />
              {item.label}
            </button>
          );
        })}
      </div>
      {showArrow && (
        <button
          type="button"
          aria-label="Show more categories"
          onClick={() => row.current?.scrollBy({ left: 220, behavior: "smooth" })}
          className="k-focus k-hit absolute right-0 grid size-7 place-items-center rounded-full bg-surface text-ink shadow-card before:pointer-events-none before:absolute before:inset-y-0 before:right-full before:w-8 before:bg-gradient-to-l before:from-bg before:to-transparent before:content-['']"
        >
          <ChevronRight className="size-4" strokeWidth={2.6} aria-hidden />
        </button>
      )}
    </div>
  );
}

export type FilterItem = { key: string; label: string; icon?: ReactNode; tone?: Tone };

/**
 * Filter pills (Notifications: All / Social / Community / Events; Chats: All Chats / Direct
 * Messages …). Selected = gradPrimary. Unselected = tinted with the item's tone (`tinted`)
 * or white with a border.
 */
export function FilterPills({
  items,
  value,
  onChange,
  tinted = false,
  size = "md",
  fill = false,
  label = "Filter",
  className,
}: {
  items: FilterItem[];
  value: string;
  onChange: (key: string) => void;
  tinted?: boolean;
  size?: "md" | "lg";
  /** Share the row's width (Notifications: All / Social / Community / Events) instead of scrolling. */
  fill?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("k-row -mx-4 gap-1.5 px-4 py-2 lg:mx-0 lg:gap-2 lg:px-0", className)}
    >
      {items.map((item, i) => {
        const selected = item.key === value;
        const tone = item.tone ?? toneAt(i);
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.key)}
            className={cn(
              "k-focus k-hit inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-[background-color,box-shadow] duration-150 [&_svg]:size-4",
              size === "lg"
                ? "h-8 px-[13px] text-[12.5px] lg:h-10 lg:px-5 lg:text-[15px] lg:[&_svg]:size-[18px]"
                : "h-8 px-[13px] text-[12.5px] lg:h-9 lg:px-4 lg:text-[14px]",
              fill &&
                "min-w-0 shrink grow basis-auto justify-center px-2 text-[12px] [&_svg]:size-3.5 lg:px-4",
              selected
                ? "bg-grad-primary text-white shadow-[0_4px_12px_rgba(124,58,237,0.28)]"
                : tinted
                  ? cn(TONE_STYLE[tone].softClassName, "text-ink")
                  : "border border-border bg-surface text-ink hover:bg-surface-alt",
            )}
          >
            {item.icon && (
              <span
                className={cn("grid place-items-center", selected ? "text-white" : "")}
                style={selected ? undefined : { color: TONE_STYLE[tone].bright }}
                aria-hidden
              >
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export type TabItem = { key: string; label: string; icon?: ReactNode };

/** Tabs with a violet underline under the active one (community: Posts / Rooms / Events / Media). */
export function TabsUnderline({
  tabs,
  value,
  onChange,
  label = "Sections",
  className,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("k-row border-b border-border bg-surface lg:rounded-t-card", className)}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              "k-focus relative inline-flex h-11 min-w-[25%] flex-1 items-center justify-center gap-1.5 px-3 text-[14px] font-semibold whitespace-nowrap lg:h-12 lg:text-[15px] [&_svg]:size-[18px] lg:[&_svg]:size-5",
              active ? "text-violet" : "text-muted hover:text-ink",
            )}
          >
            {t.icon && (
              <span aria-hidden className="grid place-items-center">
                {t.icon}
              </span>
            )}
            {t.label}
            {active && (
              <span
                className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-violet"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

const TAG_TONES: Tone[] = ["pink", "orange", "violet", "violet", "blue"];

/** Tinted hashtag chips with coloured text (#Anime #Art …). Tags may be given with or without "#". */
export function HashtagChips({
  tags,
  hrefFor,
  onTagClick,
  className,
  trailing,
}: {
  tags: string[];
  /** Make each tag a link, e.g. (t) => `/explore?tag=${t}`. */
  hrefFor?: (tag: string) => string;
  onTagClick?: (tag: string) => void;
  className?: string;
  /** Extra chip at the end (e.g. "+ Add Tag"). */
  trailing?: ReactNode;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Tags">
      {tags.map((raw, i) => {
        const tag = raw.replace(/^#/, "");
        const tone = TAG_TONES[i % TAG_TONES.length]!;
        const cls = cn(
          "k-focus k-hit inline-flex h-[25px] items-center rounded-full px-2.5 text-[12px] font-semibold lg:h-8 lg:px-3 lg:text-[13.5px]",
          TONE_STYLE[tone].softClassName,
        );
        return (
          <li key={`${tag}-${i}`}>
            {hrefFor ? (
              <Link to={hrefFor(tag)} className={cls}>
                #{tag}
              </Link>
            ) : onTagClick ? (
              <button type="button" className={cls} onClick={() => onTagClick(tag)}>
                #{tag}
              </button>
            ) : (
              <span className={cls}>#{tag}</span>
            )}
          </li>
        );
      })}
      {trailing && <li>{trailing}</li>}
    </ul>
  );
}

/** Segmented progress (onboarding): `total` bars, the first `current` violet, plus "2 / 5". */
export function ProgressSegments({
  total,
  current,
  showLabel = true,
  className,
}: {
  total: number;
  current: number;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Step ${current} of ${total}`}
        className="flex flex-1 gap-2"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < current ? "bg-grad-hero" : "bg-surface-alt",
            )}
            aria-hidden
          />
        ))}
      </div>
      {showLabel && (
        <span className="text-[13px] font-semibold text-subtle tabular-nums" aria-hidden>
          {current} / {total}
        </span>
      )}
    </div>
  );
}
