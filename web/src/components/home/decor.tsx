import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small decorative pieces for the Welcome, sign-in and onboarding screens (mockups 01 and 02):
 * a word painted with a gradient, the hand-drawn underline swoosh, sparkle stars, outline hearts
 * and the wavy cloud edge between the sky and the white lower half. Same shapes as the phone app
 * (`/home/claude/mobile/src/components/home/Decor.tsx`).
 */

/** Violet → pink, like "People" on the Welcome screen. */
export const PEOPLE_GRADIENT = ["#8B3CF7", "#C04BF2", "#F6508A"] as const;
/** Deep violet → purple, like "Interests" on the onboarding screen. */
export const VIOLET_GRADIENT = ["#5B3CF5", "#7C3AED", "#A855F7"] as const;

/** A word filled with a left → right gradient (CSS background-clip: text). */
export function GradientWord({
  children,
  colors = PEOPLE_GRADIENT,
  className,
  style,
}: {
  children: ReactNode;
  colors?: readonly string[];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn("bg-clip-text text-transparent [-webkit-background-clip:text]", className)}
      style={{
        backgroundImage: `linear-gradient(90deg, ${colors.join(", ")})`,
        // A little room on the right so the last letter's italic-ish edge is not cut off.
        paddingRight: "0.04em",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** The hand-drawn underline under "People" (stretches to the width of its box). */
export function Swoosh({ className, colors = PEOPLE_GRADIENT }: { className?: string; colors?: readonly string[] }) {
  const id = `sw${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox="0 0 200 14"
      preserveAspectRatio="none"
      className={cn("pointer-events-none", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          {colors.map((c, i) => (
            <stop key={c + i} offset={i / Math.max(1, colors.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <path
        d="M3 11 C 60 7, 130 4, 197 5"
        stroke={`url(#${id})`}
        strokeWidth={3.2}
        strokeLinecap="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Two short tilted dashes (the "shine" next to a word). */
export function ShineDashes({ size = 18, color = "#E04BB8", className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 18 18" width={size} height={size} className={cn("pointer-events-none", className)} aria-hidden>
      <path d="M5 9 L9 2" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M9 13 L16 10" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

/** A soft four-point sparkle star (yellow by default). */
export function Sparkle({
  size = 16,
  color = "#FFC23D",
  className,
  style,
}: {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cn("pointer-events-none", className)} style={style} aria-hidden>
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={color} />
    </svg>
  );
}

/** Outline heart (the pink doodles floating over the sky). */
export function HeartDoodle({ size = 22, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("pointer-events-none", className)}
      style={style}
      fill="none"
      stroke="#FF8FC8"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.7 3.6 4.5 6.9 4.5c2 0 3.5 1.1 4.1 2.6.6-1.5 2.1-2.6 4.1-2.6 3.3 0 5.5 3.2 4.2 6.6C18.6 15.7 12 20.5 12 20.5Z" />
    </svg>
  );
}

// Pastel puffs (behind) and solid puffs (in front) for one 430-wide tile: [x, y offset, radius].
const BACK_PUFFS: [number, number, number][] = [
  [-10, -18, 52], [58, -34, 46], [128, -12, 40], [205, -24, 44], [290, -30, 50], [370, -48, 52],
];
const FRONT_PUFFS: [number, number, number][] = [
  [-20, 30, 60], [70, 22, 52], [165, 34, 58], [255, 18, 50], [345, 28, 56],
];

/**
 * The wavy cloud edge between the sky and the white lower half. `tiles` repeats the 430-wide
 * pattern side by side (1 for phones, 4 for a 1440 desktop) so the puffs keep their round shape.
 * The front row is painted in the page's lower colour (white, or the dark background).
 */
export function CloudEdge({ tiles = 1, className }: { tiles?: number; className?: string }) {
  const id = `ce${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const width = 430 * tiles;
  const height = 130;
  const base = height * 0.62;
  const back = Array.from({ length: tiles + 1 }, (_, t) => BACK_PUFFS.map(([x, y, r]) => [x + t * 430, y, r] as const)).flat();
  const front = Array.from({ length: tiles + 1 }, (_, t) => FRONT_PUFFS.map(([x, y, r]) => [x + t * 430, y, r] as const)).flat();
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMax slice"
      className={cn("pointer-events-none block w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="[stop-color:#E7D7FF] dark:[stop-color:#4B3A8A]" />
          <stop offset="0.5" className="[stop-color:#FAD3EC] dark:[stop-color:#5B2E6E]" />
          <stop offset="1" className="[stop-color:#D9DCFF] dark:[stop-color:#3A3C8C]" />
        </linearGradient>
      </defs>
      {back.map(([x, y, r], i) => (
        <circle key={`b${i}`} cx={x} cy={base + y} r={r} fill={`url(#${id})`} opacity={0.95} />
      ))}
      {front.map(([x, y, r], i) => (
        <circle key={`f${i}`} cx={x} cy={base + y + 14} r={r} className="fill-[var(--k-lower)]" />
      ))}
      <rect x={0} y={base + 40} width={width} height={height} className="fill-[var(--k-lower)]" />
    </svg>
  );
}
