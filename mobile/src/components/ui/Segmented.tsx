import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { font, radius, useTheme } from "@/theme";
import { Txt } from "./Txt";

type Option<K extends string> = { key: K; label: string };

/** An iOS-style switch between a few choices. A gradient pill glides to the chosen one. */
export function Segmented<K extends string>({ options, value, onChange }: { options: Option<K>[]; value: K; onChange: (key: K) => void }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const segment = width / options.length;
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const x = useSharedValue(0);

  useEffect(() => {
    const target = index * segment;
    x.set(reduceMotion ? target : withSpring(target, { damping: 18, stiffness: 200, mass: 0.7 }));
  }, [index, segment, reduceMotion, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - 8)}
      style={[styles.track, { backgroundColor: theme.tint, borderColor: theme.hairline }]}
    >
      {segment > 0 ? (
        <Animated.View style={[styles.pill, { width: segment }, pill]}>
          <LinearGradient colors={theme.gradPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: radius.pill }} />
        </Animated.View>
      ) : null}
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (!selected) haptic.tap();
              onChange(o.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={styles.item}
          >
            <Txt variant="small" style={{ fontFamily: selected ? font.heavy : font.semibold, color: selected ? "#ffffff" : theme.muted }}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radius.pill, padding: 4, borderWidth: 1 },
  pill: { position: "absolute", top: 4, bottom: 4, left: 4 },
  item: { flex: 1, height: 40, alignItems: "center", justifyContent: "center" },
});
