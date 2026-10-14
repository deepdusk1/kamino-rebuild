import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { CommunityCover } from "@/components/k";
import type { Community } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

const DIM = { sm: "size-12 rounded-[14px]", md: "size-16 rounded-[18px]", lg: "size-20 rounded-[22px]" } as const;

/**
 * A community as a rounded square picture with its name under it (rows of "your communities").
 * Without an icon or cover it shows the colourful letter, never a grey box.
 */
export function CommunityIcon({
  community,
  size = "md",
}: {
  community: Pick<Community, "id" | "name" | "cover"> & Partial<Pick<Community, "icon" | "hue">>;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Link
      to="/c/$slug"
      params={{ slug: community.id }}
      className="k-focus flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-tile"
    >
      <span className={cn("block overflow-hidden shadow-card ring-2 ring-surface", DIM[size])}>
        <CommunityCover
          community={{ name: community.name, cover: community.cover, icon: community.icon ?? null, hue: community.hue ?? 265 }}
          useIcon
          letterSize={size === "sm" ? 18 : 24}
          className="size-full"
        />
      </span>
      <span className="w-full truncate text-center text-[11.5px] leading-tight font-semibold text-ink">
        {community.name}
      </span>
    </Link>
  );
}

/** The "Explore" tile at the end of a row of communities. */
export function ExploreIcon() {
  return (
    <Link to="/explore" className="k-focus flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-tile">
      <span className="grid size-16 place-items-center rounded-[18px] bg-grad-primary text-white shadow-glow">
        <Compass className="size-7" strokeWidth={2.2} aria-hidden />
      </span>
      <span className="w-full truncate text-center text-[11.5px] leading-tight font-semibold text-ink">Explore</span>
    </Link>
  );
}
