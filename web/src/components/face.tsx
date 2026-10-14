import { hueGradient } from "@/components/k/tokens";
import { cn, initials } from "@/lib/utils";

/**
 * A round face: the person's photo, or their initials on a colourful gradient (redesign look, same props as before).
 */

export function Face({
  name,
  hue,
  size = "md",
  className,
  level,
  ring,
  userId,
  version,
}: {
  name: string;
  hue: number;
  size?: "sm" | "md" | "lg" | "xl" | "hero" | "call";
  className?: string;
  level?: number;
  ring?: boolean;
  /** With `version` above 0, shows the person's profile photo instead of their initials. */
  userId?: string;
  version?: number;
}) {
  const dim = {
    sm: "size-8 text-[11px]",
    md: "size-10 text-xs",
    lg: "size-14 text-sm",
    xl: "size-20 text-lg",
    hero: "size-28 text-2xl",
    call: "size-36 text-4xl",
  }[size];
  return (
    <span className={cn("relative inline-grid shrink-0", className)}>
      <span
        className={cn(
          "grid place-items-center overflow-hidden rounded-full font-extrabold tracking-tight text-white",
          dim,
          ring && "outline-2 outline-offset-2 outline-violet",
        )}
        style={{
          background: hueGradient(hue),
          textShadow: "0 1px 1px rgba(0,0,0,0.25)",
        }}
        aria-hidden
      >
        {userId && version ? (
          <img
            src={`/api/v1/media/avatar/${encodeURIComponent(userId)}?v=${version}`}
            alt=""
            className="size-full rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          initials(name)
        )}
      </span>
      {level != null && (
        <span className="absolute -right-0.5 -bottom-0.5 grid min-w-4 place-items-center rounded-full bg-violet-strong px-1 text-[9px] font-bold text-white ring-2 ring-surface">
          {level}
        </span>
      )}
    </span>
  );
}
