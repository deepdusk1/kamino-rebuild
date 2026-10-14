import type { BubbleStyle, ProfileFrame } from "@/api/types";

/** How an avatar frame looks: ring colours (left to right along the gradient) and an optional emoji charm. */
export type FrameLook = { colors: [string, string, string]; charm: string | null; glow: boolean };

const STANDARD: [string, string, string] = ["#7c3aed", "#c026d3", "#e11d48"];

const FRAME_LOOKS: Record<ProfileFrame, FrameLook | null> = {
  none: null,
  ring: { colors: STANDARD, charm: null, glow: true },
  moon: { colors: STANDARD, charm: "🌙", glow: true },
  star: { colors: STANDARD, charm: "⭐", glow: true },
  laurel: { colors: ["#059669", "#10b981", "#84cc16"], charm: "🌿", glow: true },
  spark: { colors: ["#f59e0b", "#ec4899", "#8b5cf6"], charm: "✨", glow: true },
  flame: { colors: ["#ef4444", "#f97316", "#facc15"], charm: "🔥", glow: true },
  crown: { colors: ["#f59e0b", "#fbbf24", "#f59e0b"], charm: "👑", glow: true },
  aurora: { colors: ["#22d3ee", "#8b5cf6", "#34d399"], charm: null, glow: true },
};

/** The look for a frame id, or null for "no frame". Unknown ids fall back to the standard ring. */
export function frameLook(frame: string | undefined): FrameLook | null {
  if (frame === undefined) return FRAME_LOOKS.ring;
  return frame in FRAME_LOOKS ? FRAME_LOOKS[frame as ProfileFrame] : FRAME_LOOKS.ring;
}

export type BubbleLook = { background: string; color: string | null; borderColor: string | null; borderWidth: number };

/** The look of a chat bubble in the author's colour (`hue` 0-360). `dark` picks darker tints for dark mode. */
export function bubbleLook(style: BubbleStyle, hue: number, dark: boolean): BubbleLook {
  const h = Math.max(0, Math.min(360, Math.round(hue)));
  switch (style) {
    case "glass":
      return { background: dark ? `hsla(${h}, 60%, 60%, 0.22)` : `hsla(${h}, 90%, 92%, 0.55)`, color: null, borderColor: dark ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.9)", borderWidth: 1 };
    case "outline":
      return { background: "transparent", color: null, borderColor: `hsl(${h}, 70%, 55%)`, borderWidth: 2 };
    case "bold":
      return { background: `hsl(${h}, 72%, 40%)`, color: "#ffffff", borderColor: null, borderWidth: 0 };
    case "soft":
    default:
      return { background: dark ? `hsla(${h}, 55%, 32%, 0.72)` : `hsla(${h}, 85%, 93%, 0.9)`, color: null, borderColor: null, borderWidth: 0 };
  }
}

export const BUBBLE_STYLE_LABELS: Record<BubbleStyle, string> = { soft: "Soft", glass: "Glass", outline: "Outline", bold: "Bold" };
