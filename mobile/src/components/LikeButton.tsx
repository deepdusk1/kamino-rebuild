import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { font, useTheme } from "@/theme";
import { Txt } from "./ui";

const PARTICLES = 8;

type Props = {
  liked: boolean;
  count: string | number;
  onPress: () => void;
  size?: number;
  /** Text size of the count (default follows the heart size). */
  countSize?: number;
};

/**
 * A heart that pops, and bursts into little sparks, when you like something.
 * Unliking just shrinks it back quietly.
 */
export function LikeButton({ liked, count, onPress, size = 22, countSize }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const burst = useSharedValue(0);
  const wasLiked = useRef(liked);

  useEffect(() => {
    // Only celebrate a new like, not the first render or an unlike.
    if (liked && !wasLiked.current && !reduceMotion) {
      scale.set(withSequence(withTiming(0.6, { duration: 90 }), withSpring(1.3, { damping: 6, stiffness: 320 }), withSpring(1, { damping: 12, stiffness: 220 })));
      burst.set(0);
      burst.set(withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) }));
    }
    wasLiked.current = liked;
  }, [liked, reduceMotion, scale, burst]);

  const heart = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const colors = [theme.pink, theme.orange, theme.violet, theme.red];
  const fs = countSize ?? Math.round(Math.max(12, Math.min(17, size * 0.66)));

  return (
    <Pressable
      onPress={() => {
        if (!liked) haptic.pop();
        onPress();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={liked ? `Unlike, ${count} likes` : `Like, ${count} likes`}
      accessibilityState={{ selected: liked }}
      style={styles.row}
    >
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        {Array.from({ length: PARTICLES }, (_, i) => (
          <Spark key={i} index={i} progress={burst} color={colors[i % colors.length]!} distance={size * 1.1} />
        ))}
        <Animated.View style={heart}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={size} color={liked ? theme.pink : theme.muted} />
        </Animated.View>
      </View>
      <Txt style={{ fontFamily: font.semibold, fontSize: fs, lineHeight: fs + 5, color: theme.text }}>{count}</Txt>
    </Pressable>
  );
}

function Spark({ index, progress, color, distance }: { index: number; progress: SharedValue<number>; color: string; distance: number }) {
  const angle = (index / PARTICLES) * Math.PI * 2;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const visible = p > 0 && p < 1;
    return {
      opacity: visible ? 1 - p : 0,
      transform: [{ translateX: Math.cos(angle) * distance * p }, { translateY: Math.sin(angle) * distance * p }, { scale: 1 - p * 0.6 }],
    };
  });
  return <Animated.View style={[styles.spark, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 },
  spark: { position: "absolute", width: 6, height: 6, borderRadius: 3 },
});
