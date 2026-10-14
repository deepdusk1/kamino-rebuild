import type { BubbleStyle } from "./types";

/** What a chat bubble looks like. Plain values, so the website and the phone app can both use it. */
export type BubbleLook = {
  background: string;
  /** Text colour, or null to keep the theme's normal text colour. */
  color: string | null;
  /** CSS border shorthand, or null for none. */
  border: string | null;
  /** Whether the bubble should blur what is behind it (the "glass" look). */
  blur: boolean;
};

/**
 * The look of one chat bubble. `hue` is the author's chosen colour (0-360).
 * `soft` is the classic pastel tint; the others are free alternatives, never something to buy.
 */
export function bubbleLook(style: BubbleStyle, hue: number): BubbleLook {
  const h = Math.max(0, Math.min(360, Math.round(hue)));
  switch (style) {
    case "glass":
      return { background: `hsla(${h}, 90%, 92%, 0.55)`, color: null, border: `1px solid hsla(${h}, 90%, 100%, 0.8)`, blur: true };
    case "outline":
      return { background: "transparent", color: null, border: `2px solid hsl(${h}, 70%, 55%)`, blur: false };
    case "bold":
      return { background: `hsl(${h}, 72%, 40%)`, color: "#ffffff", border: null, blur: false };
    case "soft":
    default:
      return { background: `linear-gradient(130deg, hsl(${h}, 92%, 94%), #e9f8ff)`, color: null, border: null, blur: false };
  }
}

export const BUBBLE_STYLE_LABELS: Record<BubbleStyle, string> = {
  soft: "Soft",
  glass: "Glass",
  outline: "Outline",
  bold: "Bold",
};
