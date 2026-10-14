/**
 * Colour helpers for the kit. The values live as CSS variables in `src/styles.css`;
 * this file only names them so components can pick colours by position or tone.
 */

/** Colour families used for chips, stat cards, Join buttons and badges. */
export type Tone = "violet" | "blue" | "pink" | "green" | "orange";

export const TONES: Tone[] = ["violet", "blue", "pink", "green", "orange"];

/**
 * The Join-button colour cycle (SPEC 1): violet, blue, pink, green, orange, by card position.
 * `fill` carries white text (deeper than the bright brand colour so it stays readable),
 * `bright` is the mockup colour for icons and glows, `tint`/`ink` are the soft background
 * and its readable text colour (used for the lighter "Joined" state).
 */
export const TONE_STYLE: Record<
  Tone,
  { fill: string; bright: string; tint: string; ink: string; className: string; softClassName: string }
> = {
  violet: {
    fill: "var(--color-violet-strong)",
    bright: "#944FFB",
    tint: "var(--color-tint-violet)",
    ink: "var(--color-violet-ink)",
    className: "bg-violet-strong text-white",
    softClassName: "bg-tint-violet text-violet-ink",
  },
  blue: {
    fill: "var(--color-blue-strong)",
    bright: "#0099FE",
    tint: "var(--color-tint-blue)",
    ink: "var(--color-blue-ink)",
    className: "bg-blue-strong text-white",
    softClassName: "bg-tint-blue text-blue-ink",
  },
  pink: {
    fill: "var(--color-pink-strong)",
    bright: "#F94B96",
    tint: "var(--color-tint-pink)",
    ink: "var(--color-pink-ink)",
    className: "bg-pink-strong text-white",
    softClassName: "bg-tint-pink text-pink-ink",
  },
  green: {
    fill: "var(--color-green-strong)",
    bright: "#03D482",
    tint: "var(--color-tint-green)",
    ink: "var(--color-green-ink)",
    className: "bg-green-strong text-white",
    softClassName: "bg-tint-green text-green-ink",
  },
  orange: {
    fill: "var(--color-orange-strong)",
    bright: "#FFA41B",
    tint: "var(--color-tint-orange)",
    ink: "var(--color-orange-ink)",
    className: "bg-orange-strong text-white",
    softClassName: "bg-tint-orange text-orange-ink",
  },
};

/** Tone for the card at `index` (0, 1, 2 …) so neighbours get different colours. */
export function toneAt(index: number): Tone {
  return TONES[((index % TONES.length) + TONES.length) % TONES.length]!;
}

/** Named gradients from SPEC 1 → the CSS class that paints them. */
export type GradientName = "primary" | "fab" | "hero" | "publish" | "streak" | "topCreator";

export const GRADIENT_CLASS: Record<GradientName, string> = {
  primary: "bg-grad-primary",
  fab: "bg-grad-fab",
  hero: "bg-grad-hero",
  publish: "bg-grad-publish",
  streak: "bg-grad-streak",
  topCreator: "bg-grad-top-creator",
};

/**
 * Colourful fallback when something has no picture: a soft gradient from the item's hue
 * (0-360). Never a grey box.
 */
export function hueGradient(hue: number): string {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  return `linear-gradient(135deg, hsl(${h} 85% 72%) 0%, hsl(${(h + 40) % 360} 80% 62%) 100%)`;
}
