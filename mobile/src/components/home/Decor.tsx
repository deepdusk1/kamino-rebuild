import { useId, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Txt } from "@/components/ui";
import { font, useTheme } from "@/theme";

/**
 * Small decorative pieces for the Welcome and onboarding screens (01-welcome, 02-interests):
 * a word painted with a gradient, the hand-drawn underline swoosh, sparkle stars and the cloud edge.
 */

/** Violet → pink, like "People" on the Welcome screen. */
export const PEOPLE_GRADIENT = ["#8B3CF7", "#C04BF2", "#F6508A"] as const;
/** Deep violet → purple, like "Interests" on the onboarding screen. */
export const VIOLET_GRADIENT = ["#5B3CF5", "#7C3AED", "#A855F7"] as const;

type GradientWordProps = {
  text: string;
  size: number;
  colors?: readonly string[];
  letterSpacing?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A word filled with a left → right gradient. React Native can't paint text with a gradient by itself, so an
 * invisible copy of the word sets the size and an SVG draws the coloured word exactly on top of it.
 */
export function GradientWord({ text, size, colors = PEOPLE_GRADIENT, letterSpacing = -0.8, style }: GradientWordProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const lineHeight = Math.round(size * 1.2);
  return (
    <View style={style} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* The invisible copy: gives the right width and is what screen readers read. */}
      <Txt style={{ fontFamily: font.heavy, fontSize: size, lineHeight, letterSpacing, color: "transparent" }}>{text}</Txt>
      {box.w > 0 ? (
        <Svg width={box.w + 4} height={box.h} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Defs>
            <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="0">
              {colors.map((c, i) => <Stop key={c + i} offset={i / Math.max(1, colors.length - 1)} stopColor={c} />)}
            </LinearGradient>
          </Defs>
          <SvgText x={0} y={(lineHeight - size * 1.26) / 2 + size * 0.99} fill={`url(#g${id})`} fontFamily={font.heavy} fontSize={size} letterSpacing={letterSpacing}>
            {text}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

/** The hand-drawn underline under "People", plus two little "shine" dashes at its top-right. */
export function Swoosh({ width, height = 14, colors = PEOPLE_GRADIENT, style }: { width: number; height?: number; colors?: readonly string[]; style?: StyleProp<ViewStyle> }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const w = width;
  return (
    <Svg width={w} height={height} style={style} pointerEvents="none">
      <Defs>
        <LinearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
          {colors.map((c, i) => <Stop key={c + i} offset={i / Math.max(1, colors.length - 1)} stopColor={c} />)}
        </LinearGradient>
      </Defs>
      <Path d={`M3 ${height - 3} C ${w * 0.3} ${height - 7}, ${w * 0.65} ${height - 10}, ${w - 3} ${height - 9}`} stroke={`url(#s${id})`} strokeWidth={3.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Two short tilted dashes (the "shine" next to a word). */
export function ShineDashes({ size = 18, color = "#E04BB8" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" pointerEvents="none">
      <Path d="M5 9 L9 2" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M9 13 L16 10" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** A soft four-point sparkle star (yellow by default). */
export function Sparkle({ size = 16, color = "#FFC23D", style }: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={color} />
      </Svg>
    </View>
  );
}

/**
 * The wavy cloud edge between the sky and the white lower half of the Welcome screen.
 * A row of pastel puffs (behind) and a row of solid puffs in `color` (in front) that melt into a solid block.
 */
export function CloudEdge({ width, height = 120, color }: { width: number; height?: number; color: string }) {
  const theme = useTheme();
  const k = width / 430;
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const base = height * 0.62;
  // Pastel puffs: x, y offset from `base`, radius (in 430-wide units).
  const back: [number, number, number][] = [
    [-10, -18, 52], [58, -34, 46], [128, -12, 40], [205, -24, 44], [290, -30, 50], [370, -48, 52], [440, -30, 48],
  ];
  const front: [number, number, number][] = [
    [-20, 30, 60], [70, 22, 52], [165, 34, 58], [255, 18, 50], [345, 28, 56], [440, 6, 62],
  ];
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <LinearGradient id={`c${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={theme.dark ? "#4B3A8A" : "#E7D7FF"} />
          <Stop offset="0.5" stopColor={theme.dark ? "#5B2E6E" : "#FAD3EC"} />
          <Stop offset="1" stopColor={theme.dark ? "#3A3C8C" : "#D9DCFF"} />
        </LinearGradient>
      </Defs>
      {back.map(([x, y, r], i) => (
        <Circle key={`b${i}`} cx={x * k} cy={base + y * k} r={r * k} fill={`url(#c${id})`} opacity={0.95} />
      ))}
      {front.map(([x, y, r], i) => (
        <Circle key={`f${i}`} cx={x * k} cy={base + y * k + 14 * k} r={r * k} fill={color} />
      ))}
      <Rect x={0} y={base + 40 * k} width={width} height={height} fill={color} />
    </Svg>
  );
}
