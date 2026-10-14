import { CommunityCard as KitCommunityCard } from "@/components/k";
import type { Community } from "@/lib/kamino/types";

/**
 * A community card for lists (older pages). It is the kit's card in the redesign style: picture with the member
 * count, name and a two-line description; the whole card opens the community.
 * Pass `onJoin` (with `joined`) to show the coloured Join button; `index` picks its colour.
 */
export function CommunityCard({
  community,
  variant = "vertical",
  index = 0,
  joined,
  onJoin,
  className,
}: {
  community: Community;
  variant?: "vertical" | "grid" | "compact" | "mini";
  index?: number;
  joined?: boolean;
  onJoin?: () => void;
  className?: string;
}) {
  return (
    <KitCommunityCard
      community={community}
      variant={variant}
      index={index}
      joined={joined}
      onJoin={onJoin}
      className={className}
    />
  );
}
