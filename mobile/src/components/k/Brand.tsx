import { useId } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Circle, Stop } from "react-native-svg";
import { font, useTheme } from "@/theme";
// Imported file-by-file (not from "@/components/ui") because ui/KMark uses this file: avoids an import cycle.
import { PressableScale } from "@/components/ui/Motion";
import { Txt } from "@/components/ui/Txt";

/** The mark's drawing area is 72 × 56, so its width is `size * 72 / 56`. */
const RATIO = 72 / 56;

/**
 * The Kamino logo mark: a gradient planet (violet → pink → orange) with a tilted violet ring and a white
 * four-point star in the middle. `size` is the height in px (the width is about 1.3 × that).
 */
export function KaminoMark({ size = 34, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  // Unique gradient ids, so two logos on one page (web) never borrow each other's gradients.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View style={style} accessible accessibilityRole="image" accessibilityLabel="Kamino logo">
      <Svg width={size * RATIO} height={size} viewBox="0 0 72 56">
        <Defs>
          <LinearGradient id={`p${id}`} x1="20" y1="46" x2="52" y2="10" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#7C3AED" />
            <Stop offset="0.5" stopColor="#F43F8E" />
            <Stop offset="1" stopColor="#FF9F1A" />
          </LinearGradient>
          <RadialGradient id={`h${id}`} cx="29" cy="19" r="16" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.45} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`r${id}`} x1="2" y1="28" x2="70" y2="28" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#5B3CF5" />
            <Stop offset="0.55" stopColor="#A04FFB" />
            <Stop offset="1" stopColor="#DE4DFC" />
          </LinearGradient>
        </Defs>
        <G transform="rotate(-24 36 28)">
          {/* Back half of the ring (the planet covers most of it). */}
          <Ellipse cx="36" cy="28" rx="33" ry="9.5" fill="none" stroke={`url(#r${id})`} strokeWidth="4.5" opacity={0.85} />
        </G>
        <Circle cx="36" cy="28" r="18.5" fill={`url(#p${id})`} />
        <Circle cx="36" cy="28" r="18.5" fill={`url(#h${id})`} />
        <G transform="rotate(-24 36 28)">
          {/* Front half of the ring, drawn over the planet. */}
          <Path d="M3 28 A33 9.5 0 0 0 69 28" fill="none" stroke={`url(#r${id})`} strokeWidth="4.5" strokeLinecap="round" />
        </G>
        <Path
          d="M36 18.5 C37 24.6 38.4 26.6 45.2 28 C38.4 29.4 37 31.4 36 37.5 C35 31.4 33.6 29.4 26.8 28 C33.6 26.6 35 24.6 36 18.5 Z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}

type WordmarkProps = {
  /** Font size of "Kamino" (mockups: 24). The mark scales with it. */
  size?: number;
  /** Hide the planet and show only the word. */
  hideMark?: boolean;
  /** Text colour (default `ink`; use white on dark pictures). */
  color?: string;
  /** Makes the logo a button (e.g. scroll to top / go home). */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** The mark + "Kamino" (24/800, ink), as in the top-left of every mockup. */
export function KaminoWordmark({ size = 24, hideMark, color, onPress, style }: WordmarkProps) {
  const theme = useTheme();
  const body = (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: size * 0.25 }, style]}>
      {hideMark ? null : <KaminoMark size={size * 1.1} />}
      <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: size, lineHeight: size * 1.2, letterSpacing: -0.6, color: color ?? theme.ink }}>
        Kamino
      </Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} accessibilityLabel="Kamino home" scaleTo={0.96} style={{ minHeight: 44, justifyContent: "center" }}>
      {body}
    </PressableScale>
  );
}
