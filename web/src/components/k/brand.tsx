import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The Kamino mark: a gradient planet (violet → pink → orange) with a tilted violet ring
 * and a white 4-point star in the middle. Drawn in SVG so it is sharp at any size.
 */
export function KaminoMark({
  size = 36,
  className,
  title,
}: {
  size?: number;
  className?: string;
  /** Give a title when the mark stands alone (it then becomes an image for screen readers). */
  title?: string;
}) {
  // useId can contain characters that break url(#…) references, so keep letters and digits only.
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const planet = `kp${raw}`;
  const ring = `kr${raw}`;
  // Same drawing as /home/claude/redesign/art/kamino-mark.svg (shared with the phone app).
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={planet} x1="12" y1="54" x2="52" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.5" stopColor="#F43F8E" />
          <stop offset="1" stopColor="#FF9F1A" />
        </linearGradient>
        <linearGradient id={ring} x1="4" y1="44" x2="60" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6A4CFC" />
          <stop offset="1" stopColor="#A04FFB" />
        </linearGradient>
      </defs>
      {/* Back half of the ring, behind the planet. */}
      <g transform="rotate(-22 32 32)">
        <path
          d="M3.5 32 A28.5 9.5 0 0 1 60.5 32"
          fill="none"
          stroke={`url(#${ring})`}
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </g>
      <circle cx="32" cy="32" r="19" fill={`url(#${planet})`} />
      <ellipse
        cx="22.5"
        cy="23"
        rx="4.6"
        ry="2.6"
        fill="#FFFFFF"
        opacity="0.32"
        transform="rotate(-42 22.5 23)"
      />
      {/* Front half of the ring, over the planet. */}
      <g transform="rotate(-22 32 32)">
        <path
          d="M60.5 32 A28.5 9.5 0 0 1 3.5 32"
          fill="none"
          stroke={`url(#${ring})`}
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </g>
      {/* White 4-point star. */}
      <path
        d="M32 20 C33.2 28.2 35.8 30.8 44 32 C35.8 33.2 33.2 35.8 32 44 C30.8 35.8 28.2 33.2 20 32 C28.2 30.8 30.8 28.2 32 20Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/** The word "Kamino" in the brand type (26/800, ink). */
export function KaminoWordmark({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn("font-display font-extrabold tracking-[-0.03em] text-ink", className)}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      Kamino
    </span>
  );
}

/** Mark + wordmark, optionally as a link home. */
export function KaminoLogo({
  size = 36,
  wordSize = 26,
  to,
  className,
}: {
  size?: number;
  wordSize?: number;
  /** Where the logo links to; leave out for a plain (non-link) logo. */
  to?: string;
  className?: string;
}) {
  const inner = (
    <>
      <KaminoMark size={size} />
      <KaminoWordmark size={wordSize} />
    </>
  );
  if (!to) return <span className={cn("inline-flex items-center gap-2", className)}>{inner}</span>;
  return (
    <Link
      to={to}
      aria-label="Kamino home"
      className={cn("k-focus inline-flex min-h-11 items-center gap-2 rounded-full", className)}
    >
      {inner}
    </Link>
  );
}
