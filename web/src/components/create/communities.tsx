import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { CommunityCover } from "@/components/k";
import { compactNumber } from "@/lib/format-ui";
import { cn } from "@/lib/utils";
import type { MyCommunity } from "./my-communities";

/** A round community picture (its icon, else its cover, else a colourful initial). */
export function CommunityAvatar({
  community,
  size = 38,
}: {
  community: Pick<MyCommunity, "icon" | "cover" | "hue" | "name">;
  size?: number;
}) {
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <CommunityCover
        community={community}
        useIcon
        letterSize={Math.round(size * 0.42)}
        className="size-full"
      />
    </span>
  );
}

/** A sideways row of community pills to choose from (used inside sheets). */
export function CommunityChoice({
  communities,
  value,
  onChange,
}: {
  communities: MyCommunity[];
  value: string | null;
  onChange: (slug: string) => void;
}) {
  // Show the chosen community even when it sits further along the row.
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    const box = row.current;
    if (el && box) box.scrollLeft = Math.max(0, el.offsetLeft - box.offsetLeft - 20);
  }, [value]);
  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label="Community"
      className="k-row -mx-5 gap-2 px-5 py-0.5"
    >
      {communities.map((c) => {
        const on = c.slug === value;
        return (
          <button
            key={c.slug}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c.slug)}
            className={cn(
              "k-focus inline-flex h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] pr-3 pl-1.5 text-[13px] font-bold",
              on
                ? "border-violet bg-tint-violet text-violet-ink"
                : "border-border bg-surface text-ink hover:bg-surface-alt",
            )}
          >
            <CommunityAvatar community={c} size={32} />
            <span className="max-w-40 truncate">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A full list of communities for a picker sheet: picture, name, members, check on the chosen one. */
export function CommunityList({
  communities,
  value,
  onPick,
}: {
  communities: MyCommunity[];
  value: string | null;
  onPick: (slug: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Communities" className="-mx-2 space-y-1">
      {communities.map((c) => {
        const on = c.slug === value;
        return (
          <button
            key={c.slug}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${c.name}, ${compactNumber(c.memberCount)} members`}
            onClick={() => onPick(c.slug)}
            className={cn(
              "k-focus flex w-full items-center gap-3 rounded-tile p-2 text-left transition-colors",
              on ? "bg-tint-violet" : "hover:bg-surface-alt",
            )}
          >
            <CommunityAvatar community={c} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-ink">{c.name}</span>
              <span className="block text-[12px] text-muted">
                {compactNumber(c.memberCount)} members
              </span>
            </span>
            {on ? <CheckCircle2 className="size-[22px] shrink-0 text-violet" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
