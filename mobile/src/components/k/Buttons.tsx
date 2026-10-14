import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { font, gradientOf, joinColor, lighten, radius, shadow, useTheme, type Gradient, type GradientName } from "@/theme";
import { PressableScale, Txt } from "@/components/ui";
import { PersonAvatar } from "./PersonAvatar";
import type { IconName, Person } from "./types";

// ── GradientButton ───────────────────────────────────────────────────────────

const SIZES = {
  sm: { height: 28, font: 12.5, pad: 13, icon: 14 },
  md: { height: 36, font: 14, pad: 18, icon: 17 },
  lg: { height: 52, font: 17, pad: 24, icon: 21 },
} as const;

type GradientButtonProps = {
  label: string;
  onPress: () => void;
  /** Which spec gradient: primary (Follow, Join Event), hero (Get Started, Continue), publish, fab, topCreator… */
  gradient?: GradientName;
  /** Your own colours instead of a named gradient. */
  colors?: Gradient;
  size?: "sm" | "md" | "lg";
  /** Icon before the label (e.g. "person-add", "paper-plane"). */
  icon?: IconName;
  /** Icon after the label (e.g. "arrow-forward" for "Get Started →"). */
  iconRight?: IconName;
  /** Stretch to the full width of the parent. */
  full?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** Soft coloured glow underneath (default on for md / lg). */
  glow?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** A pill button filled with one of the spec gradients (left → right), white bold label, optional icons. */
export function GradientButton({ label, onPress, gradient = "primary", colors, size = "md", icon, iconRight, full, busy, disabled, glow, accessibilityLabel, accessibilityHint, style }: GradientButtonProps) {
  const theme = useTheme();
  const s = SIZES[size];
  const fill = colors ?? gradientOf(theme, gradient);
  const inactive = !!(disabled || busy);
  const showGlow = (glow ?? size !== "sm") && !inactive;
  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      scaleTo={0.96}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: !!busy }}
      hitSlop={Math.max(0, (44 - s.height) / 2)}
      style={[
        { height: s.height, borderRadius: radius.pill, justifyContent: "center", alignSelf: full ? "stretch" : "flex-start", opacity: inactive ? 0.55 : 1 },
        showGlow && shadow.glow(fill[Math.min(1, fill.length - 1)]!, 0.32),
        style,
      ]}
    >
      <LinearGradient colors={fill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: s.pad }}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={s.icon} color="#fff" /> : null}
            <Txt numberOfLines={1} style={{ color: "#fff", fontFamily: font.bold, fontSize: s.font, lineHeight: s.font + 5 }}>{label}</Txt>
            {iconRight ? <Ionicons name={iconRight} size={s.icon} color="#fff" /> : null}
          </>
        )}
      </View>
    </PressableScale>
  );
}

// ── JoinButton ───────────────────────────────────────────────────────────────

type JoinButtonProps = {
  /** Already a member / following: shows the lighter "Joined" look. */
  joined?: boolean;
  onPress: () => void;
  /** The fill colour, or … */
  color?: string;
  /** … the card's position, which picks from the Join colour cycle (violet, blue, pink, green, orange). */
  index?: number;
  label?: string;
  joinedLabel?: string;
  icon?: IconName;
  size?: "xs" | "sm" | "md";
  full?: boolean;
  busy?: boolean;
  /** Show a check before "Joined" (default true). */
  check?: boolean;
  /** Spoken label, e.g. "Join Anime Haven". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The solid coloured Join / Follow pill used on cards. When `joined`, it turns a lighter shade of the same colour
 * with a check ("Joined ✓"). Pass `index` to follow the spec's colour cycle.
 */
export function JoinButton({ joined, onPress, color, index = 0, label = "Join", joinedLabel = "Joined", icon, size = "sm", full, busy, check = true, accessibilityLabel, style }: JoinButtonProps) {
  const base = color ?? joinColor(index);
  const height = size === "md" ? 30 : size === "sm" ? 22 : 19;
  const fs = size === "md" ? 13.5 : size === "sm" ? 11.5 : 10.5;
  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      scaleTo={0.94}
      accessibilityLabel={accessibilityLabel ?? (joined ? joinedLabel : label)}
      accessibilityState={{ selected: !!joined, busy: !!busy }}
      hitSlop={Math.max(0, (44 - height) / 2)}
      style={[
        {
          height,
          borderRadius: radius.pill,
          backgroundColor: joined ? lighten(base, 0.3) : base,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 4,
          // Full-width buttons only need a little side room, so "✓ Joined" fits on narrow cards.
          paddingHorizontal: full ? 6 : size === "xs" ? 10 : 14,
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          {joined && check ? <Ionicons name="checkmark" size={fs} color="#fff" /> : !joined && icon ? <Ionicons name={icon} size={fs + 2} color="#fff" /> : null}
          <Txt numberOfLines={1} style={{ color: "#fff", fontFamily: font.bold, fontSize: fs, lineHeight: fs + 3 }}>{joined ? joinedLabel : label}</Txt>
        </>
      )}
    </PressableScale>
  );
}

// ── AvatarStack ──────────────────────────────────────────────────────────────

type AvatarStackProps = {
  people: Person[];
  /** Circle size (mockups: 15–20). */
  size?: number;
  /** How many faces to draw at most. */
  max?: number;
  /** A number to show after the faces as "+45" (e.g. members not shown). */
  extra?: number;
  /** Text after the faces instead, e.g. "1.3K going". */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/** Overlapping round faces with a white ring, optionally followed by "+45" or a label. */
export function AvatarStack({ people, size = 18, max = 4, extra, label, style }: AvatarStackProps) {
  const theme = useTheme();
  const shown = people.slice(0, max);
  const overlap = Math.round(size * 0.3);
  const names = shown.map((p) => p.name).join(", ");
  return (
    <View accessible accessibilityLabel={label ?? (names ? `${names}${extra ? ` and ${extra} more` : ""}` : "No one yet")} style={[{ flexDirection: "row", alignItems: "center" }, style]}>
      {shown.map((p, i) => (
        <View key={`${p.userId ?? p.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: max - i }}>
          <PersonAvatar person={p} size={size} outline={size >= 30 ? 2.5 : size >= 18 ? 1.5 : 1} />
        </View>
      ))}
      {extra ? <Txt style={{ marginLeft: 5, fontFamily: font.semibold, fontSize: 10.5, lineHeight: 14, color: theme.muted }}>+{extra}</Txt> : null}
      {label ? <Txt style={{ marginLeft: 6, fontFamily: font.semibold, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>{label}</Txt> : null}
    </View>
  );
}
