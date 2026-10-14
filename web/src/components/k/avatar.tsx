import { cn, initials } from "@/lib/utils";
import { OnlineDot } from "./bits";
import { avatarSrc, type AvatarPerson } from "./media";
import { hueGradient } from "./tokens";

export type { AvatarPerson };

/**
 * Round avatar with an optional online dot. `size` in px (44 header, 56 post author,
 * 130 profile). Decorative by default (the name is usually written next to it); pass
 * `labelled` to announce the name.
 */
export function Avatar({
  person,
  size = 36,
  online,
  ring = false,
  labelled = false,
  className,
}: {
  person: AvatarPerson;
  size?: number;
  /** true = green dot, false = grey dot, undefined = no dot. */
  online?: boolean;
  /** White ring around the avatar (stacks, profile header). */
  ring?: boolean;
  labelled?: boolean;
  className?: string;
}) {
  const src = avatarSrc(person);
  const dot = Math.max(8, Math.round(size * 0.26));
  return (
    <span
      className={cn("relative inline-grid shrink-0", className)}
      style={{ width: size, height: size }}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? `${person.name}${online === undefined ? "" : online ? ", Online" : ", Offline"}` : undefined}
      aria-hidden={labelled || online !== undefined ? undefined : true}
    >
      <span
        className={cn(
          "grid size-full place-items-center overflow-hidden rounded-full font-extrabold text-white",
          ring && (size < 24 ? "ring-[1.5px] ring-surface" : "ring-2 ring-surface"),
        )}
        style={{
          background: src ? "var(--color-surface-alt)" : hueGradient(person.hue),
          fontSize: size * 0.36,
        }}
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]">
            {initials(person.name || "?")}
          </span>
        )}
      </span>
      {online !== undefined && (
        // Sits on the circle edge at about 4 o'clock, like the mockups.
        <OnlineDot
          online={online}
          size={dot}
          className="absolute"
          style={{ right: size * 0.02, bottom: size * 0.02 }}
        />
      )}
    </span>
  );
}

/**
 * Overlapping avatars with a white ring, plus optional "+45" text.
 * Shows at most `max` faces; pass `extra` to show a number after them.
 */
export function AvatarStack({
  people,
  size = 16,
  max = 4,
  extra,
  label,
  className,
}: {
  people: AvatarPerson[];
  size?: number;
  max?: number;
  /** Shown after the faces as "+N" (a number) or as given (a string, e.g. "1.3K going"). */
  extra?: number | string;
  /** Screen-reader summary, e.g. "4 members". Defaults to the names. */
  label?: string;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const summary = label ?? (shown.length ? shown.map((p) => p.name).join(", ") : undefined);
  return (
    <span className={cn("inline-flex items-center", className)} role="group" aria-label={summary}>
      <span className="flex">
        {shown.map((p, i) => (
          <span
            key={`${p.userId ?? p.name}-${i}`}
            className="relative"
            style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.3), zIndex: max - i }}
          >
            <Avatar person={p} size={size} ring />
          </span>
        ))}
        {shown.length === 0 &&
          // Empty: soft placeholders so the row keeps its height.
          Array.from({ length: Math.min(max, 4) }, (_, i) => (
            <span
              key={i}
              className="relative rounded-full bg-surface-alt ring-[1.5px] ring-surface"
              style={{
                width: size,
                height: size,
                marginLeft: i === 0 ? 0 : -Math.round(size * 0.3),
              }}
              aria-hidden
            />
          ))}
      </span>
      {extra !== undefined && extra !== 0 && (
        <span className="ml-1.5 text-[11px] font-semibold whitespace-nowrap text-muted">
          {typeof extra === "number" ? `+${extra}` : extra}
        </span>
      )}
    </span>
  );
}
