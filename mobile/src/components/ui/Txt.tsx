import { Text, StyleSheet, type TextProps, type TextStyle } from "react-native";
import { font, typeScale, useTheme, useTextScale } from "@/theme";

/**
 * Text styles. The first six follow the type scale measured from the mockups; the rest are older names kept for
 * existing screens.
 * - `screen` 30/800 page titles · `section` 17/800 section titles · `cardTitle` 14/700
 * - `body` 14/500 · `small` 13/500 · `caption` 11.5/600
 * - `display` 28/800 · `title` 22/800 · `heading` 17/700 · `label` 12/700 uppercase
 */
type Variant = "screen" | "section" | "cardTitle" | "display" | "title" | "heading" | "body" | "small" | "caption" | "label";

const variants: Record<Variant, TextStyle> = {
  screen: typeScale.screenTitle,
  section: typeScale.section,
  cardTitle: typeScale.cardTitle,
  display: { fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  title: { fontFamily: font.heavy, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontFamily: font.bold, fontSize: 17, lineHeight: 22 },
  body: typeScale.body,
  small: typeScale.small,
  caption: typeScale.caption,
  label: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: "uppercase" },
};

/** Headings are drawn in `ink`; running text in the slightly softer `text` colour. */
const HEADINGS = new Set<Variant>(["screen", "section", "cardTitle", "display", "title", "heading"]);

type Props = TextProps & {
  variant?: Variant;
  /** Colour. `default` picks `ink` for headings and `text` for body copy. */
  tone?: "default" | "ink" | "text" | "muted" | "subtle" | "accent" | "danger" | "ok" | "onAccent";
};

/** The one text component: consistent font, size and colour everywhere. */
export function Txt({ variant = "body", tone = "default", style, ...rest }: Props) {
  const theme = useTheme();
  const scale = useTextScale();
  const color = {
    default: HEADINGS.has(variant) ? theme.ink : theme.text,
    ink: theme.ink,
    text: theme.text,
    muted: theme.muted,
    subtle: theme.subtle,
    accent: theme.accent,
    danger: theme.danger,
    ok: theme.ok,
    onAccent: theme.accentFg,
  }[tone];
  const flat = StyleSheet.flatten([variants[variant], { color }, style]);
  return <Text {...rest} style={[flat, {fontSize:Number(flat.fontSize ?? 14)*scale,lineHeight:Number(flat.lineHeight ?? 20)*scale}]} />;
}
