import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OnlineDot } from "@/components/k/bits";

export const PROFILE_FRAMES = [
  { id: "ring", label: "Gradient ring" },
  { id: "moon", label: "Moon charm" },
  { id: "star", label: "Star charm" },
  { id: "laurel", label: "Laurel" },
  { id: "spark", label: "Sparkles" },
  { id: "flame", label: "Flame ring" },
  { id: "crown", label: "Crown" },
  { id: "aurora", label: "Aurora glow" },
  { id: "none", label: "Plain" },
] as const;

export type ProfileFrame = (typeof PROFILE_FRAMES)[number]["id"];

export function isAllowedFrame(id: string): id is ProfileFrame {
  return PROFILE_FRAMES.some((f) => f.id === id);
}

/** Ring colours per frame. Frames not listed here use the standard gradient ring. */
const RING: Record<string, string> = {
  ring: "bg-grad-primary",
  flame: "animate-pulse bg-gradient-to-t from-red via-orange to-yellow",
  aurora: "bg-gradient-to-br from-green via-violet to-pink shadow-[0_0_14px_2px_var(--color-violet)]",
  spark: "bg-gradient-to-br from-yellow to-pink",
  crown: "bg-gradient-to-br from-yellow to-orange",
  moon: "bg-grad-hero",
  star: "bg-gradient-to-br from-violet via-pink to-yellow",
  laurel: "bg-gradient-to-br from-green to-blue",
};

/** An avatar with its decorative frame (ring + charm) and an optional green online dot. */
export function AvatarFrame({
  frame = "ring",
  online,
  children,
  className,
}: {
  frame?: string;
  online?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const kind = isAllowedFrame(frame) ? frame : "ring";
  return (
    <span className={cn("relative inline-grid", className)}>
      {kind !== "none" && (
        <span
          className={cn("absolute -inset-1 rounded-full opacity-90", RING[kind] ?? RING.ring)}
          aria-hidden
        />
      )}
      <span className="relative">{children}</span>
      {kind === "moon" && <MoonCharm />}
      {kind === "star" && <StarCharm />}
      {kind === "laurel" && <LaurelCharm />}
      {kind === "spark" && <SparkCharm />}
      {kind === "crown" && <CrownCharm />}
      {online ? (
        <OnlineDot size={14} className="absolute right-0.5 bottom-0.5" />
      ) : null}
    </span>
  );
}

function MoonCharm() {
  return (
    <svg
      viewBox="0 0 32 18"
      className="pointer-events-none absolute -bottom-1 left-1/2 h-5 w-9 -translate-x-1/2 text-yellow"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M16 2c-5.2 0-9.4 3.2-10.6 7.6A8.2 8.2 0 0 0 16 16c5.2 0 9.5-3.3 10.7-7.7A8.4 8.4 0 0 1 16 2z"
      />
      <circle cx="10.5" cy="9" r="1.1" fill="var(--color-surface)" />
      <circle cx="16" cy="7.4" r="1.4" fill="var(--color-surface)" />
      <circle cx="21.2" cy="9.2" r="1" fill="var(--color-surface)" />
    </svg>
  );
}

function StarCharm() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute -bottom-1.5 left-1/2 size-6 -translate-x-1/2 text-yellow"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 2.4 14.4 8l6 .6-4.5 3.9 1.4 5.9L12 15.6 6.7 18.4l1.4-5.9L3.6 8.6l6-.6z"
      />
    </svg>
  );
}

function LaurelCharm() {
  return (
    <svg
      viewBox="0 0 48 20"
      className="pointer-events-none absolute -bottom-1 left-1/2 h-5 w-14 -translate-x-1/2 text-green"
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        d="M24 16c-6-1-12-6-14-12 4 2 9 4 14 4 5 0 10-2 14-4-2 6-8 11-14 12z"
      />
    </svg>
  );
}

function SparkCharm() {
  return (
    <svg viewBox="0 0 32 32" className="pointer-events-none absolute -top-2 -right-2 size-6 text-yellow" aria-hidden>
      <path fill="currentColor" d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
      <path fill="currentColor" d="M25 16l1.1 3.9L30 21l-3.9 1.1L25 26l-1.1-3.9L20 21l3.9-1.1z" />
    </svg>
  );
}

function CrownCharm() {
  return (
    <svg viewBox="0 0 32 20" className="pointer-events-none absolute -top-3 left-1/2 h-5 w-8 -translate-x-1/2 text-yellow" aria-hidden>
      <path fill="currentColor" d="M3 17 1 4l8 6 7-9 7 9 8-6-2 13z" />
    </svg>
  );
}
