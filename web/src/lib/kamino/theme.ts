import type { ThemeStyle } from "./types";

/**
 * The colours of a community, worked out from the colour (hue 0-360) and style its leaders picked.
 * Plain values so the website and the phone app draw the same thing. The accent colour is always dark
 * enough to read white text on top of it (WCAG contrast 4.5:1), whatever hue was chosen.
 */
export type CommunityColors = {
  /** Buttons, links and highlights inside the community. White text is readable on it. */
  accent: string;
  accentFg: "#ffffff";
  /** The banner tint runs from `from` to `to` (both hex). */
  from: string;
  to: string;
  /** Share of the tint drawn over the banner picture, 0-1. */
  tint: number;
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const hex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** WCAG relative luminance of an sRGB colour. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast of a colour against white (1 to 21). */
export function contrastOnWhite(rgb: [number, number, number]): number {
  return 1.05 / (luminance(rgb) + 0.05);
}

const wrap = (h: number) => ((Math.round(h) % 360) + 360) % 360;

const STYLES: Record<
  ThemeStyle,
  { sat: number; spread: number; from: number; to: number; tint: number }
> = {
  aurora: { sat: 0.65, spread: 50, from: 0.5, to: 0.55, tint: 0.35 },
  solid: { sat: 0.55, spread: 0, from: 0.5, to: 0.5, tint: 0.3 },
  vivid: { sat: 0.85, spread: 120, from: 0.5, to: 0.55, tint: 0.5 },
  soft: { sat: 0.45, spread: 25, from: 0.7, to: 0.75, tint: 0.3 },
  night: { sat: 0.5, spread: 40, from: 0.16, to: 0.28, tint: 0.65 },
};

export function communityColors(hue: number, style: ThemeStyle): CommunityColors {
  const h = wrap(Number.isFinite(hue) ? hue : 220);
  const look = STYLES[style] ?? STYLES.aurora;
  // Start from a comfortable lightness and darken until white text is readable.
  let lightness = 0.45;
  let rgb = hslToRgb(h, look.sat, lightness);
  while (contrastOnWhite(rgb) < 4.5 && lightness > 0.1) {
    lightness -= 0.02;
    rgb = hslToRgb(h, look.sat, lightness);
  }
  return {
    accent: hex(rgb),
    accentFg: "#ffffff",
    from: hex(hslToRgb(h, look.sat, look.from)),
    to: hex(hslToRgb(wrap(h + look.spread), look.sat, look.to)),
    tint: look.tint,
  };
}

/** Allowed ranges for what leaders can send. */
export const clampHue = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(360, Math.round(value)))
    : fallback;
