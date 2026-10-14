import { Ionicons } from "@expo/vector-icons";
import { useId, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { font, radius, useTheme, type Gradient, type Tone } from "@/theme";
import { PressableScale, Txt } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import { PresenceDot } from "@/components/ui/PresenceDot";
import type { IconName } from "./types";

// ── VerifiedTick ─────────────────────────────────────────────────────────────

/** A scalloped badge outline (8 soft bumps) centred in a 24 × 24 box. */
const ROSETTE = (() => {
  const points: string[] = [];
  const bumps = 8;
  for (let i = 0; i <= bumps * 8; i++) {
    const a = (i / (bumps * 8)) * Math.PI * 2;
    const r = 10.6 + 1.4 * Math.cos(a * bumps);
    points.push(`${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`);
  }
  return `M${points.join(" L")} Z`;
})();

/** The blue "verified" badge with a white check (next to names). */
export function VerifiedTick({ size = 14, color }: { size?: number; color?: string }) {
  const theme = useTheme();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Verified">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={ROSETTE} fill={color ?? theme.blue} />
        <Path d="M7.6 12.3 L10.6 15.2 L16.6 9.1" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

// ── OnlineDot ────────────────────────────────────────────────────────────────

/** Shared presence indicator: a check for online and a dash for offline. */
export function OnlineDot({ size = 12, online = true, style }: { size?: number; online?: boolean; style?: StyleProp<ViewStyle> }) {
  return <PresenceDot size={size} online={online} style={style} />;
}

// ── LiveBadge ────────────────────────────────────────────────────────────────

/** The red "• LIVE" pill. `icon="radio"` shows the broadcast icon instead of the dot (notifications). */
export function LiveBadge({ label = "LIVE", icon = "bolt", size = "sm", style }: { label?: string; icon?: "bolt" | "dot" | "radio"; size?: "sm" | "md"; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const fs = size === "md" ? 12 : 9.5;
  return (
    <View
      accessibilityLabel="Live now"
      style={[{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.red, borderRadius: radius.pill, paddingHorizontal: size === "md" ? 8 : 4, height: size === "md" ? 21 : 17, alignSelf: "flex-start" }, style]}
    >
      {icon === "dot" ? (
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" }} />
      ) : (
        <Ionicons name={icon === "radio" ? "radio-outline" : "flash"} size={fs} color="#fff" />
      )}
      <Txt style={{ color: "#fff", fontFamily: font.heavy, fontSize: fs, lineHeight: fs + 3, letterSpacing: 0.2 }}>{label}</Txt>
    </View>
  );
}

// ── CountPill ────────────────────────────────────────────────────────────────

/** The dark see-through pill with an icon and a short number ("👥 245K") that sits on pictures. */
export function CountPill({ value, icon = "people", style }: { value: number | string; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const text = typeof value === "number" ? compactNumber(value) : value;
  return (
    <View
      accessibilityLabel={`${text} ${icon === "people" ? "members" : "people"}`}
      style={[{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(15,11,42,0.62)", borderRadius: radius.pill, paddingHorizontal: 5, height: 17, alignSelf: "flex-start" }, style]}
    >
      <Ionicons name={icon} size={10} color="#fff" />
      <Txt style={{ color: "#fff", fontFamily: font.bold, fontSize: 9.5, lineHeight: 12 }}>{text}</Txt>
    </View>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────

type PillProps = {
  label: string;
  /** Colour family. `neutral` = grey-violet. */
  tone?: Tone | "neutral";
  /** `tint` (light wash + coloured text, default), `solid` (filled + white text) or `outline`. */
  variant?: "tint" | "solid" | "outline";
  emoji?: string;
  icon?: IconName;
  size?: "sm" | "md";
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** Extra content after the label (e.g. a chevron). */
  trailing?: ReactNode;
};

/**
 * A small tinted badge: type labels ("Discussion"), role chips ("⭐ Creator"), topic chips, room categories.
 * Becomes a button when `onPress` is given (then it gets a 44px touch area).
 */
export function Pill({ label, tone = "violet", variant = "tint", emoji, icon, size = "sm", onPress, accessibilityLabel, style, trailing }: PillProps) {
  const theme = useTheme();
  const base = tone === "neutral" ? theme.muted : theme[tone];
  const bg = variant === "solid" ? base : variant === "outline" ? "transparent" : tone === "neutral" ? theme.surfaceAlt : theme.tints[tone];
  const fg = variant === "solid" ? "#FFFFFF" : tone === "neutral" ? theme.muted : theme.toneText[tone];
  const fs = size === "md" ? 12 : 11;
  const body = (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingHorizontal: size === "md" ? 10 : 8,
          height: size === "md" ? 25 : 21,
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: theme.border,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      {emoji ? <Txt style={{ fontSize: fs, lineHeight: fs + 4 }}>{emoji}</Txt> : null}
      {icon ? <Ionicons name={icon} size={fs + 1} color={fg} /> : null}
      <Txt style={{ color: fg, fontFamily: font.semibold, fontSize: fs, lineHeight: fs + 4 }}>{label}</Txt>
      {trailing}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel ?? label} hitSlop={10} scaleTo={0.94}>
      {body}
    </PressableScale>
  );
}

// ── BadgeHex ─────────────────────────────────────────────────────────────────

/** A hexagon (point up) with softly rounded corners, centred in a 100 × 100 box. */
function hexPath(r: number, round: number): string {
  const c = 50;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  });
  let d = "";
  pts.forEach((p, i) => {
    const prev = pts[(i + 5) % 6]!;
    const next = pts[(i + 1) % 6]!;
    const t = round / r;
    const a = [p[0] + (prev[0] - p[0]) * t, p[1] + (prev[1] - p[1]) * t];
    const b = [p[0] + (next[0] - p[0]) * t, p[1] + (next[1] - p[1]) * t];
    d += `${i === 0 ? "M" : "L"}${a[0]!.toFixed(2)} ${a[1]!.toFixed(2)} Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${b[0]!.toFixed(2)} ${b[1]!.toFixed(2)} `;
  });
  return `${d}Z`;
}
const HEX_OUTER = hexPath(47, 9);
const HEX_INNER = hexPath(38, 7);

/** Ready-made medal colours (top → bottom) for the badge row on profiles. */
export const BADGE_COLORS: Record<Tone, Gradient> = {
  violet: ["#A78BFA", "#6D28D9"],
  blue: ["#60A5FA", "#3B4FE0"],
  pink: ["#FF8CC6", "#E0337E"],
  green: ["#4ADE80", "#0E9F6E"],
  orange: ["#FFB547", "#F25C1E"],
  yellow: ["#FFE07A", "#E8A300"],
  red: ["#FF7A9C", "#E11D48"],
};

type BadgeHexProps = {
  icon: IconName;
  /** Medal colour family (default violet) … */
  tone?: Tone;
  /** … or your own gradient (top → bottom). */
  colors?: Gradient;
  size?: number;
  /** Text under the medal. */
  label?: string;
  /** Not earned yet: drawn grey and faded. */
  locked?: boolean;
  onPress?: () => void;
};

/** A hexagon medal with a gradient fill, a lighter inner rim and a white icon (achievements on profiles). */
export function BadgeHex({ icon, tone = "violet", colors, size = 40, label, locked, onPress }: BadgeHexProps) {
  const theme = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [top, bottom] = locked ? ([theme.subtle, theme.muted] as const) : (colors ?? BADGE_COLORS[tone]);
  const medal = (
    <View style={{ alignItems: "center", gap: 5, opacity: locked ? 0.55 : 1, width: Math.max(size + 16, 70) }}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute" }}>
          <Defs>
            <LinearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={top} />
              <Stop offset="1" stopColor={bottom ?? top} />
            </LinearGradient>
          </Defs>
          <Path d={HEX_OUTER} fill={`url(#g${id})`} />
          <Path d={HEX_INNER} fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={3} />
        </Svg>
        <Ionicons name={icon} size={size * 0.4} color="#FFFFFF" />
      </View>
      {label ? (
        <Txt numberOfLines={2} style={{ fontFamily: font.semibold, fontSize: 10, lineHeight: 12.5, color: theme.toneText.violet, textAlign: "center" }}>{label}</Txt>
      ) : null}
    </View>
  );
  if (!onPress) return <View accessible accessibilityLabel={label ? `${label} badge${locked ? ", locked" : ""}` : "Badge"}>{medal}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label ? `${label} badge${locked ? ", locked" : ""}` : "Badge"} scaleTo={0.92}>
      {medal}
    </PressableScale>
  );
}
