import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Section title row: coloured icon (emoji or lucide icon) + title on the left,
 * violet "See All >" on the right (when `seeAllTo` or `onSeeAll` is given) or any `action`.
 */
export function SectionHeader({
  icon,
  title,
  seeAllTo,
  onSeeAll,
  seeAllLabel = "See All",
  seeAllIcon = "arrow",
  action,
  as: Heading = "h2",
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  seeAllTo?: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  /** "arrow" (→, Home) or "chevron" (>, Explore / Community), like the mockups. */
  seeAllIcon?: "arrow" | "chevron";
  action?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  const seeAllCls =
    "k-focus -mr-1.5 inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-1.5 text-[12.5px] font-semibold whitespace-nowrap text-violet k-hit hover:underline lg:text-[14px]";
  const titleText = typeof title === "string" ? title : undefined;
  return (
    <div className={cn("flex min-h-7 items-center justify-between gap-3", className)}>
      <Heading className="flex min-w-0 items-center gap-2 text-[15.5px] leading-[21.5px] font-extrabold tracking-[-0.2px] text-ink lg:text-[20px] lg:leading-tight">
        {icon && (
          <span
            className="grid size-[22px] shrink-0 place-items-center text-[16.5px] leading-none [&_svg]:size-[18px] lg:size-7 lg:text-[21px] lg:[&_svg]:size-6"
            aria-hidden
          >
            {icon}
          </span>
        )}
        <span className="truncate">{title}</span>
      </Heading>
      {action}
      {!action && seeAllTo && (
        <Link
          to={seeAllTo}
          className={seeAllCls}
          aria-label={titleText ? `See all: ${titleText}` : undefined}
        >
          {seeAllLabel}
          {seeAllIcon === "arrow" ? (
            <ArrowRight className="size-[15px]" strokeWidth={2.6} aria-hidden />
          ) : (
            <ChevronRight className="size-[15px]" strokeWidth={2.6} aria-hidden />
          )}
        </Link>
      )}
      {!action && !seeAllTo && onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className={seeAllCls}
          aria-label={titleText ? `See all: ${titleText}` : undefined}
        >
          {seeAllLabel}
          {seeAllIcon === "arrow" ? (
            <ArrowRight className="size-[15px]" strokeWidth={2.6} aria-hidden />
          ) : (
            <ChevronRight className="size-[15px]" strokeWidth={2.6} aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Screen title block: "Explore" (34/800) + subline, with optional art or action on the right.
 */
export function ScreenTitle({
  title,
  subtitle,
  aside,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-[29px] leading-[1.1] font-extrabold tracking-[-0.03em] text-ink lg:text-[36px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-xl text-[13px] leading-[17px] text-muted lg:text-[15px] lg:leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {aside}
    </div>
  );
}

/**
 * A row of cards. On phones it scrolls sideways with `perRow` cards visible (4 like the mockups:
 * about 94px each at 430px wide), or a fixed `itemWidth`. From 1024px wide it becomes a grid with
 * `desktopCols` columns so nothing is hidden off-screen.
 */
export function CardRow({
  children,
  perRow = 4,
  itemWidth,
  desktopCols = 6,
  gap = 8,
  label,
  className,
}: {
  children: ReactNode;
  /** Cards visible across a phone screen (ignored when `itemWidth` is given). */
  perRow?: number;
  itemWidth?: number;
  desktopCols?: 2 | 3 | 4 | 5 | 6;
  gap?: number;
  /** Screen-reader name for the list, e.g. "Recommended communities". */
  label?: string;
  className?: string;
}) {
  const cols = {
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  }[desktopCols];
  const width = itemWidth ? `${itemWidth}px` : `calc((100% - ${(perRow - 1) * gap}px) / ${perRow})`;
  return (
    <div
      role="list"
      aria-label={label}
      className={cn(
        // Phones: horizontal scroll that bleeds to the screen edge (-mx-4 px-4).
        "k-row -mx-4 px-4 pt-0.5 pb-2 [&>*]:w-[var(--k-item)] lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:[&>*]:w-auto",
        cols,
        className,
      )}
      style={{ gap, ["--k-item" as string]: width }}
    >
      {Children.toArray(children).map((child, i) => (
        <div role="listitem" key={i} className="flex [&>*]:w-full">
          {child}
        </div>
      ))}
    </div>
  );
}

/** Friendly empty state: emoji or icon, short title, one line of help, optional action. */
export function EmptyHint({
  icon = "✨",
  title,
  text,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface px-6 py-8 text-center",
        className,
      )}
    >
      <span
        className="grid size-14 place-items-center rounded-full bg-tint-violet text-[28px]"
        aria-hidden
      >
        {icon}
      </span>
      <p className="text-[16px] font-bold text-ink">{title}</p>
      {text && <p className="max-w-xs text-[14px] text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
