import type { ThemeStyle } from "@/api/types";

/**
 * The colours of a community from the colour (hue 0-360) and style its leaders picked. The same recipe as the
 * website (web/src/lib/kamino/theme.ts), plus a dark-mode version. Buttons stay readable: white text on the accent
 * in light mode, near-black text in dark mode, both at least 4.5:1.
 */
export type CommunityColors = {
  accent: string;
  /** Text on the accent colour. */
  accentFg: string;
  /** A second accent a little further round the colour wheel (the button gradient goes accent -> accentAlt). */
  accentAlt: string;
  /** A very light (or, in dark mode, very dark) wash of the accent for chips and selected rows. */
  soft: string;
  from: string;
  to: string;
  /** Share of the banner tint drawn over the banner picture, 0-1. */
  tint: number;
};

type Rgb = [number, number, number];

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast between two colours (1 to 21). */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const INK: Rgb = [18, 8, 31];
const wrap = (h: number) => ((Math.round(h) % 360) + 360) % 360;

const STYLES: Record<ThemeStyle, { sat: number; spread: number; from: number; to: number; tint: number }> = {
  aurora: { sat: 0.65, spread: 50, from: 0.5, to: 0.55, tint: 0.35 },
  solid: { sat: 0.55, spread: 0, from: 0.5, to: 0.5, tint: 0.3 },
  vivid: { sat: 0.85, spread: 120, from: 0.5, to: 0.55, tint: 0.5 },
  soft: { sat: 0.45, spread: 25, from: 0.7, to: 0.75, tint: 0.3 },
  night: { sat: 0.5, spread: 40, from: 0.16, to: 0.28, tint: 0.65 },
};

/** An accent at this hue that the text colour can be read on: darkened for white text, lightened for dark text. */
function accentAt(h: number, sat: number, dark: boolean): Rgb {
  const text = dark ? INK : WHITE;
  let lightness = dark ? 0.6 : 0.45;
  let rgb = hslToRgb(h, sat, lightness);
  while (contrast(rgb, text) < 4.5 && lightness > 0.08 && lightness < 0.92) {
    lightness += dark ? 0.02 : -0.02;
    rgb = hslToRgb(h, sat, lightness);
  }
  return rgb;
}

export function communityColors(hue: number, style: ThemeStyle, dark = false): CommunityColors {
  const h = wrap(Number.isFinite(hue) ? hue : 220);
  const look = STYLES[style] ?? STYLES.aurora;
  return {
    accent: hex(accentAt(h, look.sat, dark)),
    accentFg: dark ? hex(INK) : "#ffffff",
    accentAlt: hex(accentAt(wrap(h + 30), look.sat, dark)),
    soft: hex(hslToRgb(h, 0.7, dark ? 0.2 : 0.94)),
    from: hex(hslToRgb(h, look.sat, look.from)),
    to: hex(hslToRgb(wrap(h + look.spread), look.sat, look.to)),
    tint: look.tint,
  };
}
