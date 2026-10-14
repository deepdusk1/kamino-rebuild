import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { ApiError } from "@/api/client";
import { glowShadow, radius, space, useTheme } from "@/theme";
import { Button } from "./Button";
import { Appear } from "./Motion";
import { Txt } from "./Txt";

/** Three gradient dots that bounce one after another, like someone typing. */
export function Loading({ label }: { label?: string }) {
  const reduceMotion = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const c = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    [a, b, c].forEach((d, i) => {
      d.set(withDelay(i * 140, withRepeat(withSequence(withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) })), -1)));
    });
  }, [reduceMotion, a, b, c]);

  return (
    <View style={{ padding: space.xxl, alignItems: "center", gap: space.md }} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <View style={{ flexDirection: "row", gap: 8, height: 26, alignItems: "flex-end" }}>
        {[a, b, c].map((d, i) => <Dot key={i} value={d} index={i} />)}
      </View>
      {label ? <Txt variant="small" tone="muted">{label}</Txt> : null}
    </View>
  );
}

function Dot({ value, index }: { value: SharedValue<number>; index: number }) {
  const theme = useTheme();
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -value.value * 12 }, { scale: 1 + value.value * 0.15 }] }));
  const colors = [theme.gradPrimary[0], theme.gradPrimary[1], theme.gradCool[0]] as const;
  return <Animated.View style={[{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors[index] }, style]} />;
}

/** Placeholder cards that shimmer while a feed loads, so the screen never looks empty or frozen. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (!reduceMotion) pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const bar = (width: `${number}%` | number, height = 12) => <View style={{ width, height, borderRadius: 6, backgroundColor: theme.dark ? "rgba(255,255,255,0.1)" : "rgba(124,58,237,0.1)" }} />;
  return (
    <Animated.View style={[{ gap: space.md }, style]} accessibilityRole="progressbar" accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ backgroundColor: theme.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.hairline, padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.dark ? "rgba(255,255,255,0.1)" : "rgba(124,58,237,0.12)" }} />
            <View style={{ flex: 1, gap: 6 }}>{bar("40%")}{bar("25%", 10)}</View>
          </View>
          {bar("75%", 16)}
          {bar("95%")}
          {bar("60%")}
        </View>
      ))}
    </Animated.View>
  );
}

/** A friendly empty screen: a floating gradient bubble with an icon, a title and an optional button. */
export function EmptyState({ icon = "sparkles-outline", title, body, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const float = useSharedValue(0);
  useEffect(() => {
    if (!reduceMotion) float.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduceMotion, float]);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + float.value * 12 }, { rotate: `${-4 + float.value * 8}deg` }] }));

  return (
    <Appear style={{ padding: space.xxl, alignItems: "center", gap: space.sm }}>
      <Animated.View style={[{ marginBottom: space.sm, borderRadius: 36, ...glowShadow(theme.glow, "strong") }, bob]}>
        <LinearGradient colors={theme.gradPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={34} color="#fff" />
        </LinearGradient>
      </Animated.View>
      <Txt variant="heading" style={{ textAlign: "center" }}>{title}</Txt>
      {body ? <Txt tone="muted" style={{ textAlign: "center" }}>{body}</Txt> : null}
      {action ? <Button label={action.label} onPress={action.onPress} small style={{ marginTop: space.sm }} /> : null}
    </Appear>
  );
}

/** Friendly message for any failed load, with a Try again button. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : "Something went wrong.";
  return <EmptyState icon="cloud-offline-outline" title="That didn't load" body={message} action={onRetry ? { label: "Try again", onPress: onRetry } : undefined} />;
}
