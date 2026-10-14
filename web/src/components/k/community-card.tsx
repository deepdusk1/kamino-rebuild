import { Link } from "@tanstack/react-router";
import { compactNumber } from "@/lib/format-ui";
import { cn } from "@/lib/utils";
import { AvatarStack, type AvatarPerson } from "./avatar";
import { CountPill } from "./bits";
import { JoinButton } from "./buttons";
import { hueGradient, toneAt } from "./tokens";

/** The few community fields a card needs (a full `Community` fits). */
export type CommunityCardInfo = {
  id: string;
  name: string;
  tagline: string;
  cover?: string | null;
  icon?: string | null;
  hue: number;
  memberCount: number;
};

/**
 * Picture for a community: its cover, or a colourful gradient from its hue with the first
 * letter (never a grey box).
 */
export function CommunityCover({
  community,
  className,
  letterSize = 34,
  useIcon = false,
}: {
  community: Pick<CommunityCardInfo, "name" | "cover" | "icon" | "hue">;
  className?: string;
  letterSize?: number;
  /** Prefer the square icon over the wide cover (small square tiles). */
  useIcon?: boolean;
}) {
  const src = (useIcon ? community.icon || community.cover : community.cover) || null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn("object-cover", className)}
        loading="lazy"
        draggable={false}
      />
    );
  }
  return (
    <div
      className={cn("grid place-items-center font-extrabold text-white/90", className)}
      style={{ background: hueGradient(community.hue), fontSize: letterSize }}
      aria-hidden
    >
      {community.name.trim().charAt(0).toUpperCase() || "K"}
    </div>
  );
}

/**
 * Community card.
 * - `vertical` (Home "Recommended"): picture with member count, title, 2-line text, faces, full-width Join.
 * - `grid` (Explore "Recommended Communities"): smaller, faces and a small Join side by side.
 * - `compact` (Home "Trending"): picture, title and one line, no faces or button.
 * - `mini` (Profile "Communities"): small square picture, name, members, Joined pill.
 * The whole card opens the community; the Join button is separate. `index` picks the Join colour.
 */
export function CommunityCard({
  community,
  variant = "vertical",
  index = 0,
  joined = false,
  joinBusy = false,
  onJoin,
  faces = [],
  to,
  className,
}: {
  community: CommunityCardInfo;
  variant?: "vertical" | "grid" | "compact" | "mini";
  index?: number;
  joined?: boolean;
  joinBusy?: boolean;
  /** Called when Join (or Joined) is pressed. Leave out to hide the button. */
  onJoin?: () => void;
  faces?: AvatarPerson[];
  /** Where the card goes; defaults to the community page. */
  to?: string;
  className?: string;
}) {
  const href = to ?? `/c/${encodeURIComponent(community.id)}`;
  const tone = toneAt(index);
  // The title link stretches over the whole card (after: layer) so the card is one tap target,
  // while the Join button sits above it (z-10) and stays its own button.
  const titleLink = (
    <Link
      to={href}
      className="k-focus rounded-sm after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-offset-4"
    >
      {community.name}
    </Link>
  );

  if (variant === "mini") {
    // Profile "Communities" (10-profile): small square picture, name, members, Joined pill.
    return (
      <article
        className={cn(
          "k-card relative flex flex-col gap-1 rounded-[12px] p-[5px] lg:gap-2 lg:rounded-card lg:p-2",
          className,
        )}
      >
        <div className="flex items-center gap-[5px] lg:gap-2">
          <CommunityCover
            community={community}
            useIcon
            letterSize={13}
            className="size-7 shrink-0 rounded-[7px] lg:size-11 lg:rounded-[10px]"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[10.5px] leading-[13px] font-extrabold text-ink lg:text-[14px] lg:leading-tight">
              {titleLink}
            </h3>
            <p className="truncate text-[9.5px] leading-[12px] text-muted lg:text-[12px] lg:leading-tight">
              {compactNumber(community.memberCount)} members
            </p>
          </div>
        </div>
        {onJoin && (
          <JoinButton
            tone={tone}
            joined={joined}
            busy={joinBusy}
            onClick={onJoin}
            full
            name={community.name}
            className="h-[18px] px-1 text-[10.5px] [&_svg]:hidden lg:h-7 lg:text-[12.5px]"
          />
        )}
      </article>
    );
  }

  // Measured on the mockups (and the same as the phone app): four cards fit across 430px.
  const imageAspect =
    variant === "vertical"
      ? "aspect-[1.33]"
      : variant === "grid"
        ? "aspect-[1.47]"
        : "aspect-[1.78]";
  return (
    <article
      className={cn(
        "k-card relative flex flex-col overflow-hidden rounded-tile lg:rounded-card",
        className,
      )}
    >
      <div className={cn("relative w-full overflow-hidden bg-surface-alt", imageAspect)}>
        <CommunityCover community={community} className="absolute inset-0 size-full" />
        <CountPill count={community.memberCount} className="absolute top-[5px] left-[5px]" />
      </div>
      <div
        className={cn(
          "flex flex-1 flex-col gap-px px-1.5 pt-[5px] lg:gap-0.5 lg:px-3 lg:pt-2.5 lg:pb-3",
          variant === "compact" ? "pb-[7px]" : "pb-2",
        )}
      >
        <h3
          className={cn(
            "truncate font-extrabold tracking-[-0.01em] text-ink lg:text-[15px] lg:leading-tight",
            variant === "vertical"
              ? "text-[11.5px] leading-[15.5px]"
              : "text-[11px] leading-[15px]",
          )}
        >
          {titleLink}
        </h3>
        <p
          className={cn(
            "text-[10px] leading-[13px] text-muted lg:text-[13px] lg:leading-snug",
            variant === "compact" ? "truncate" : "line-clamp-2 min-h-[26px] lg:min-h-[2.75em]",
          )}
        >
          {community.tagline}
        </p>
        {variant === "vertical" && (
          <>
            <AvatarStack
              people={faces}
              size={15}
              className="mt-1 lg:mt-2"
              label={`${faces.length} members shown`}
            />
            {onJoin && (
              <JoinButton
                tone={tone}
                joined={joined}
                busy={joinBusy}
                onClick={onJoin}
                full
                name={community.name}
                className="mt-[7px] h-[22px] text-[11.5px] lg:mt-2.5 lg:h-8 lg:text-[13px]"
              />
            )}
          </>
        )}
        {variant === "grid" && (
          <div className="mt-[5px] flex items-center justify-between gap-0.5 lg:mt-2">
            <AvatarStack people={faces} size={14} max={4} label={`${faces.length} members shown`} />
            {onJoin && (
              <JoinButton
                tone={tone}
                joined={joined}
                busy={joinBusy}
                onClick={onJoin}
                name={community.name}
                className="h-[19px] px-2 text-[10.5px] [&_svg]:hidden lg:h-7 lg:px-3 lg:text-[12.5px]"
              />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
