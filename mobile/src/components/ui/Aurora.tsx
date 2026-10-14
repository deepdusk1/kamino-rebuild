import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/theme";

/**
 * Where each glowing blob sits (as a fraction of the screen), how big it is, and how it drifts.
 * Each blob is a quarter-cycle out of step with the next, so they never move together;
 * that is what makes it feel alive.
 */
const ORBS = [
  { x: -0.35, y: -0.05, size: 1.15, dx: 14, dy: 10 },
  { x: 0.45, y: 0.12, size: 1.0, dx: -12, dy: 14 },
  { x: -0.25, y: 0.58, size: 1.05, dx: 12, dy: -12 },
  { x: 0.4, y: 0.78, size: 1.1, dx: -14, dy: -10 },
] as const;

/**
 * The calm background behind every screen: the near-white page colour with four very faint washes of lavender,
 * pink, blue and peach that drift slowly (the redesign keeps it subtle so the page reads as near-white, like the
 * mockups).
 *
 * It is cheap to draw: four soft radial gradients that are only moved and scaled (the phone's
 * graphics chip does that for free). It stays still when `active` is false (a screen you can't
 * see) and when "Reduce Motion" is switched on in the phone's accessibility settings.
 */
export function Aurora({ active = true }: { active?: boolean }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (!active || reduceMotion) {
      cancelAnimation(t);
      return;
    }
    t.set(withRepeat(withTiming(1, { duration: 20000, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [active, reduceMotion, t]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, overflow: "hidden", pointerEvents: "none" }]}>
      {ORBS.map((orb, i) => (
        <Orb key={i} index={i} t={t} color={theme.aurora[i]!} opacity={theme.auroraOpacity} left={orb.x * width} top={orb.y * height} size={orb.size * width} dx={orb.dx} dy={orb.dy} />
      ))}
      {/* Fade the top so the blobs melt into the header instead of being cut off by it. */}
      <LinearGradient colors={[theme.bg, `${theme.bg}00`]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 56 }} />
    </View>
  );
}

function Orb({ index, t, color, opacity, left, top, size, dx, dy }: { index: number; t: SharedValue<number>; color: string; opacity: number; left: number; top: number; size: number; dx: number; dy: number }) {
  // Each orb follows the shared clock with its own phase, so one timer drives all four.
  const phase = index * 0.25;
  const style = useAnimatedStyle(() => {
    const p = (t.value + phase) % 1;
    const wave = Math.sin(p * Math.PI * 2);
    const wave2 = Math.cos(p * Math.PI * 2);
    return { transform: [{ translateX: wave * dx }, { translateY: wave2 * dy }, { scale: 1 + wave2 * 0.04 }] };
  });
  const id = `orb${index}`;
  return (
    <Animated.View style={[{ position: "absolute", left, top, width: size, height: size, opacity }, style]} shouldRasterizeIOS renderToHardwareTextureAndroid>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.9} />
            <Stop offset="0.5" stopColor={color} stopOpacity={0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Puts the background wash behind a screen. Used once per screen by the navigators in `_layout.tsx`.
 * It must sit inside a navigator (it asks whether its screen is the one on display).
 */
export function Backdrop({ children }: { children: React.ReactNode }) {
  const focused = useIsFocused();
  return (
    <View style={{ flex: 1 }}>
      <Aurora active={focused} />
      {children}
    </View>
  );
}
