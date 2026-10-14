import { titleColor } from "@/lib/kamino/titles";
import { cn } from "@/lib/utils";

/**
 * A member title as a small coloured pill ("Lore Keeper · Anime Haven"). The colour comes from the title; a
 * pinned title gets a violet ring. With `onClick` it is a button (pick / pin a title).
 */
export function TitleChip({
  label,
  color,
  hall,
  pinned,
  onClick,
}: {
  label: string;
  color: string;
  hall?: string;
  pinned?: boolean;
  onClick?: () => void;
}) {
  const c = titleColor(color);
  const className = cn(
    "inline-flex h-[22px] max-w-full items-center gap-1 rounded-full px-2.5 text-[11.5px] font-bold whitespace-nowrap",
    pinned && "ring-2 ring-violet ring-offset-1 ring-offset-surface",
    onClick && "k-focus k-hit transition-[filter] hover:brightness-105",
  );
  const style = { background: c.hex, color: c.fg };
  const title = hall ? `${label} · ${hall}` : label;
  const inner = (
    <>
      {pinned ? <span aria-hidden>📌</span> : null}
      <span className="truncate">{label}</span>
      {hall ? <span className="hidden font-semibold opacity-75 sm:inline">· {hall}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={style} title={title} aria-pressed={pinned}>
        {inner}
      </button>
    );
  }
  return (
    <span className={className} style={style} title={title}>
      {inner}
    </span>
  );
}
