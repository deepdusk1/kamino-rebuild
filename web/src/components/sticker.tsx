import { stickerEmoji, type StickerId } from "@/lib/kamino/stickers";
import { cn } from "@/lib/utils";

/**
 * A sticker drawn as a large emoji (the same look as the phone app). `bare` is for messages: just the big emoji, no
 * tile behind it; otherwise it sits on a soft violet tile (the sticker picker).
 */
export function StickerMark({
  id,
  className,
  bare = false,
}: {
  id: StickerId;
  className?: string;
  bare?: boolean;
}) {
  if (bare)
    return (
      <span
        role="img"
        aria-label="Sticker"
        className={cn("block text-[64px] leading-[76px]", className)}
      >
        {stickerEmoji(id)}
      </span>
    );
  return (
    <span
      className={cn("grid size-14 place-items-center rounded-[16px] bg-tint-violet", className)}
    >
      <span className="text-3xl leading-none" aria-hidden>
        {stickerEmoji(id)}
      </span>
    </span>
  );
}
