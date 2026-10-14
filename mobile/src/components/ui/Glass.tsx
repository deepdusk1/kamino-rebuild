import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

/**
 * Apple's "Liquid Glass" is available on iOS 26 and newer. Some early iOS 26 builds report the
 * feature but crash when it is used, so both checks must pass. Anything goes wrong → no liquid glass.
 */
const liquidGlass = (() => {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Blur strength for frosted glass (iOS before 26, and the web). */
  intensity?: number;
  /** Liquid glass reacts to touches (iOS 26+ only). */
  interactive?: boolean;
};

/**
 * A see-through, blurred surface that shows the colours behind it: the look of iOS. Since the redesign the page
 * behind is near-white, so this mostly reads as a soft white panel; new code should prefer `Card`.
 *
 * - iPhone with iOS 26+: Apple's real Liquid Glass.
 * - Older iPhones and the web: a real blur of what is behind (frosted glass).
 * - Android: a slightly see-through tinted surface. (Real blur on Android needs every screen to be
 *   wrapped in a special view and costs battery, so it is not worth it for bars and sheets.)
 *
 * Give it a `borderRadius` in `style`; the glass is clipped to that shape.
 */
export function Glass({ children, style, intensity = 60, interactive }: Props) {
  const theme = useTheme();
  const edge = { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.glassEdge };

  if (liquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} colorScheme={theme.dark ? "dark" : "light"} style={[{ overflow: "hidden" }, style]}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === "android") {
    return <View style={[{ overflow: "hidden", backgroundColor: theme.glassStrong }, edge, style]}>{children}</View>;
  }
  return (
    <BlurView intensity={intensity} tint={theme.dark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"} style={[{ overflow: "hidden" }, edge, style]}>
      {/* A thin wash of our own colour on top of the blur keeps it on-brand and readable. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass, pointerEvents: "none" }]} />
      {children}
    </BlurView>
  );
}
