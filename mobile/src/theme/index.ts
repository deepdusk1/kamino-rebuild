import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme, type TextStyle, type ViewStyle } from "react-native";

/**
 * Kamino design tokens (the 2026 redesign).
 *
 * The look: a calm, near-white page, white cards with a hairline and a very soft shadow, bold Plus Jakarta Sans
 * headings, and bright violet → blue gradients for the things you can press. The values come from
 * `redesign/SPEC.md` section 1 and are shared with the website.
 *
 * Old names (`fg`, `tint`, `glass`, `aurora`, …) still work so every existing screen keeps compiling;
 * they now point at the new colours. New code should prefer the new names (`ink`, `text`, `surfaceAlt`,
 * `violet`, `tints.pink`, `gradHero`, …).
 *
 * Text colours were checked for contrast (WCAG AA, 4.5:1) on `bg` and on `surface`. `subtle` is a touch darker
 * than the mockup grey for that reason. White text on the green / orange Join colours is below 4.5:1: that is the
 * look the owner asked for, and those buttons always use large bold text.
 */
export type Gradient = readonly [string, string, ...string[]];

/** The named colours used for badges, chips, Join buttons and stat cards. */
export type Tone = "violet" | "blue" | "pink" | "green" | "orange" | "yellow" | "red";

/** The gradients from the spec, by name (used by `GradientButton`'s `gradient` prop). */
export type GradientName = "primary" | "fab" | "hero" | "publish" | "streak" | "topCreator" | "warm" | "cool";

export type Theme = {
  dark: boolean;
  /** Screen background (near-white in light mode). */
  bg: string;
  /** Cards and sheets. */
  surface: string;
  /** Inputs, inactive chips, picture placeholders. */
  surfaceAlt: string;
  /** Old name for a raised surface; same as `surfaceAlt` now. */
  elevated: string;
  /** Headings and names. */
  ink: string;
  /** Body text. */
  text: string;
  /** Old name for the main text colour; same as `ink`. */
  fg: string;
  /** Secondary text. */
  muted: string;
  /** Timestamps and hints. */
  subtle: string;
  /** Brand colour: links ("See All"), active tab, focus rings. Communities may recolour it. */
  accent: string;
  /** Text / icons placed on the accent colour or on a gradient. */
  accentFg: string;
  /** Card hairlines and dividers. */
  border: string;
  /** Destructive text and icons (a deeper red so it stays readable). */
  danger: string;
  ok: string;
  warn: string;
  /** Soft accent background (chips, selected rows). Same as `tints.violet` unless a community recolours it. */
  tint: string;

  // ── Named colours ──
  violet: string;
  blue: string;
  pink: string;
  green: string;
  orange: string;
  yellow: string;
  /** Unread dots, notification badges, LIVE. */
  red: string;
  /** Light washes of the named colours (chips, stat cards, icon circles). */
  tints: Record<Tone, string>;
  /** Readable text colour to put on each tint (deeper than the named colour). */
  toneText: Record<Tone, string>;

  // ── Gradients (left → right) ──
  /** Brand gradient (the logo planet). */
  gradient: Gradient;
  /** Follow, selected chips, Join Event, most buttons. */
  gradPrimary: Gradient;
  /** The big + button in the bottom bar. */
  gradFab: Gradient;
  /** Get Started, Continue. */
  gradHero: Gradient;
  /** Publish Post. */
  gradPublish: Gradient;
  /** Streak card background (light); put `toneText.orange` text on it. */
  gradStreak: Gradient;
  /** Top Creator banner. */
  gradTopCreator: Gradient;
  /** Likes, celebrations (white text reads on it). */
  gradWarm: Gradient;
  /** Secondary highlights (white text reads on it). */
  gradCool: Gradient;

  // ── Kept for older screens ──
  /** Card fill. Was see-through glass; now the solid card colour. */
  glass: string;
  /** Bars and sheets. */
  glassStrong: string;
  /** Bright inner edge of glass (barely visible now). */
  glassEdge: string;
  /** Hairline around cards (same as `border`). */
  hairline: string;
  /** Coloured shadow under floating, pressable things. */
  glow: string;
  /** Soft background wash colours (see `Aurora`). */
  aurora: readonly [string, string, string, string];
  /** How strong the background wash is (0–1). */
  auroraOpacity: number;
};

const light: Theme = {
  dark: false,
  bg: "#F8F7FC",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2FA",
  elevated: "#F4F2FA",
  ink: "#0F0B2A",
  text: "#2A2640",
  fg: "#0F0B2A",
  muted: "#6B6885",
  subtle: "#706D89",
  accent: "#7C3AED",
  accentFg: "#FFFFFF",
  border: "#ECEAF4",
  danger: "#D81B6A",
  ok: "#047857",
  warn: "#B45309",
  tint: "#F3EEFF",
  violet: "#7C3AED",
  blue: "#0A97FE",
  pink: "#F43F8E",
  green: "#10CF85",
  orange: "#FF9F1A",
  yellow: "#FEBF1C",
  red: "#FD2784",
  tints: { violet: "#F3EEFF", pink: "#FFEEF5", blue: "#EAF5FF", orange: "#FFF3E3", green: "#E7FBF2", yellow: "#FFF7E0", red: "#FFE8F1" },
  toneText: { violet: "#6D28D9", pink: "#C8175F", blue: "#0B6FC4", orange: "#A84A0C", green: "#0A7A4F", yellow: "#8A5A00", red: "#C0156A" },
  gradient: ["#7C3AED", "#F43F8E", "#FF9F1A"],
  gradPrimary: ["#A04FFB", "#6A4CFC", "#2E72FE"],
  gradFab: ["#4B40FC", "#8149FD"],
  gradHero: ["#4157FD", "#753CF9", "#DE4DFC"],
  gradPublish: ["#BB5FFB", "#A698FC", "#1CACFE"],
  gradStreak: ["#FFE7C2", "#FFF6EA"],
  gradTopCreator: ["#8B4DFB", "#C44DF0"],
  gradWarm: ["#E11D48", "#C2410C"],
  gradCool: ["#0891B2", "#7C3AED"],
  glass: "#FFFFFF",
  glassStrong: "#FFFFFF",
  glassEdge: "rgba(255,255,255,0)",
  hairline: "#ECEAF4",
  glow: "#7C3AED",
  aurora: ["#EEE8FF", "#FFEAF4", "#E8F3FF", "#FFF3E6"],
  auroraOpacity: 0.55,
};

const dark: Theme = {
  dark: true,
  bg: "#0E0B1F",
  surface: "#17132E",
  surfaceAlt: "#211C3D",
  elevated: "#211C3D",
  ink: "#F5F3FF",
  text: "#DCD8F0",
  fg: "#F5F3FF",
  muted: "#B1ACCB",
  subtle: "#9C97BC",
  accent: "#A78BFA",
  accentFg: "#FFFFFF",
  border: "#2A2448",
  danger: "#FF7AB0",
  ok: "#5EEAD4",
  warn: "#FBBF24",
  tint: "#261D4A",
  violet: "#A78BFA",
  blue: "#3AAEFF",
  pink: "#FF6FAE",
  green: "#2EE09A",
  orange: "#FFB347",
  yellow: "#FFD15C",
  red: "#FF4D9A",
  tints: { violet: "#261D4A", pink: "#3A1830", blue: "#142A45", orange: "#3A2812", green: "#10332A", yellow: "#3A3010", red: "#3A1430" },
  toneText: { violet: "#C4B5FD", pink: "#FF8DC0", blue: "#7CC4FF", orange: "#FFC27A", green: "#6EE7B7", yellow: "#FFD978", red: "#FF7AB0" },
  gradient: ["#7C3AED", "#F43F8E", "#FF9F1A"],
  gradPrimary: ["#A04FFB", "#6A4CFC", "#2E72FE"],
  gradFab: ["#4B40FC", "#8149FD"],
  gradHero: ["#4157FD", "#753CF9", "#DE4DFC"],
  gradPublish: ["#BB5FFB", "#A698FC", "#1CACFE"],
  gradStreak: ["#3D2610", "#2A1C14"],
  gradTopCreator: ["#8B4DFB", "#C44DF0"],
  gradWarm: ["#E11D48", "#C2410C"],
  gradCool: ["#0891B2", "#7C3AED"],
  glass: "#17132E",
  glassStrong: "#17132E",
  glassEdge: "rgba(255,255,255,0.06)",
  hairline: "#2A2448",
  glow: "#8B5CF6",
  aurora: ["#1C1540", "#26122E", "#0F1E36", "#1A1626"],
  auroraOpacity: 0.7,
};

/** A community can recolour the screens inside it (accent, buttons); everything else stays as it is. */
const OverrideContext = createContext<Partial<Theme> | null>(null);
const AppearanceContext = createContext({ highContrast: false, textScale: 'standard' });
export function AppearanceProvider({value,children}:{value:{highContrast:boolean;textScale:string};children:ReactNode}) { return createElement(AppearanceContext.Provider,{value},children); }
export function useTextScale() { const {textScale}=useContext(AppearanceContext);return textScale==='largest'?1.3:textScale==='large'?1.15:1; }

export function ThemeOverride({ value, children }: { value: Partial<Theme> | null; children: ReactNode }) {
  return createElement(OverrideContext.Provider, { value }, children);
}

export function useTheme(): Theme {
  const base = useColorScheme() === "dark" ? dark : light;
  const override = useContext(OverrideContext);
  const appearance = useContext(AppearanceContext);
  return useMemo(() => {
    const theme = override ? { ...base, ...override } : base;
    return appearance.highContrast ? {...theme, bg:base.dark?'#000000':'#ffffff',surface:base.dark?'#000000':'#ffffff',surfaceAlt:base.dark?'#171717':'#eeeeee',ink:base.dark?'#ffffff':'#000000',text:base.dark?'#ffffff':'#111111',muted:base.dark?'#eeeeee':'#333333',subtle:base.dark?'#eeeeee':'#333333',border:base.dark?'#dddddd':'#333333',accent:base.dark?'#cbb4ff':'#5122b4'} : theme;
  }, [base, override, appearance]);
}

/** Looks up a named gradient on a theme (so components can take `gradient="hero"`). */
export function gradientOf(theme: Theme, name: GradientName): Gradient {
  const map: Record<GradientName, Gradient> = {
    primary: theme.gradPrimary,
    fab: theme.gradFab,
    hero: theme.gradHero,
    publish: theme.gradPublish,
    streak: theme.gradStreak,
    topCreator: theme.gradTopCreator,
    warm: theme.gradWarm,
    cool: theme.gradCool,
  };
  return map[name];
}

/**
 * Join-button colours for cards in a row, by position: violet, blue, pink, green, orange, then again.
 * Use `joinColor(index)` rather than indexing yourself.
 */
export const joinColors = ["#944FFB", "#0099FE", "#F94B96", "#03D482", "#FFA41B"] as const;

/** The Join colour for the card at `index` (0-based; wraps around). */
export function joinColor(index: number): string {
  const i = ((Math.round(index) % joinColors.length) + joinColors.length) % joinColors.length;
  return joinColors[i]!;
}

/** The tone (named colour) that matches `joinColor(index)`, for tinted chips that go with a card. */
export const joinTones: readonly Tone[] = ["violet", "blue", "pink", "green", "orange"];

/** Spacing grid: 4 / 8 / 12 / 16 / 24 / 32. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Corner radii. `card` 18 for cards, `tile`/`image` 14–16 for pictures, `hero` 20 for the big banners,
 * `button` 14 for small square-ish card buttons, `pill` for chips and buttons.
 */
export const radius = { sm: 10, md: 16, lg: 18, xl: 28, card: 18, tile: 14, image: 16, hero: 20, button: 14, pill: 999 } as const;

/** Font family names registered in `app/_layout.tsx` (Plus Jakarta Sans, like the website). */
export const font = {
  regular: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  heavy: "PlusJakartaSans_800ExtraBold",
} as const;

/**
 * The type scale, measured from the mockups (SPEC section 6: mockup px ÷ 1.65). Spread into a style:
 * `style={typeScale.section}`.
 */
export const typeScale = {
  /** Big page titles ("Explore", "Notifications"). */
  screenTitle: { fontFamily: font.heavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  /** Section titles next to a coloured icon ("Recommended for You"). */
  section: { fontFamily: font.heavy, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  /** Card titles. */
  cardTitle: { fontFamily: font.bold, fontSize: 14, lineHeight: 19 },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  /** Sublines under titles, secondary text. */
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.semibold, fontSize: 11.5, lineHeight: 15 },
} as const satisfies Record<string, TextStyle>;

/**
 * Shadows. `card` is the spec's `0 4px 16px rgba(20,17,43,0.06)`; `raised` is a little stronger for floating
 * things (bottom bar, sheets); `glow(color)` is the coloured shadow under gradient buttons and the + button.
 * They use `boxShadow`, which React Native draws the same on iOS, Android and the web.
 */
export const shadow = {
  card: { boxShadow: "0px 4px 16px rgba(20, 17, 43, 0.06)" },
  raised: { boxShadow: "0px 6px 24px rgba(20, 17, 43, 0.10)" },
  none: { boxShadow: "none" },
  glow: (color: string, strength = 0.35): ViewStyle => ({ boxShadow: `0px 8px 20px ${withAlpha(color, strength)}` }),
} as const;

/** `#rrggbb` + opacity (0–1) → `rgba(...)`. Other colour formats are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Mixes a `#rrggbb` colour with white (`amount` 0–1). Used for the lighter "Joined" buttons. */
export function lighten(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  const mix = (v: number) => Math.round(v + (255 - v) * Math.max(0, Math.min(1, amount)));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, "0")).join("")}`;
}

/** A community or member "hue" (0–360) becomes a friendly avatar colour. */
export function hueColor(hue: number, dark = false): string {
  return `hsl(${Math.round(hue) % 360}, ${dark ? 60 : 75}%, ${dark ? 48 : 60}%)`;
}

/** A lively two-colour gradient from a hue (avatars, community tiles without a cover). */
export function hueGradient(hue: number, dark = false): Gradient {
  const h = Math.round(hue) % 360;
  return [`hsl(${h}, ${dark ? 70 : 85}%, ${dark ? 55 : 66}%)`, `hsl(${(h + 45) % 360}, ${dark ? 65 : 75}%, ${dark ? 38 : 48}%)`];
}

/** A soft coloured shadow for floating things (iOS/web shadow + Android elevation). Kept for older screens. */
export function glowShadow(color: string, strength: "soft" | "strong" = "soft") {
  const strong = strength === "strong";
  return {
    shadowColor: color,
    shadowOpacity: strong ? 0.3 : 0.1,
    shadowRadius: strong ? 16 : 12,
    shadowOffset: { width: 0, height: strong ? 8 : 4 },
    elevation: strong ? 6 : 2,
  } as const;
}
