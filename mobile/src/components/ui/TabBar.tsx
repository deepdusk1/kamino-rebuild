import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/lib/haptics";
import { font, glowShadow, radius, useTheme } from "@/theme";
import { Glass } from "./Glass";
import { Txt } from "./Txt";

const BAR_HEIGHT = 66;
const SPRING = { damping: 17, stiffness: 190, mass: 0.7 } as const;

/** Distance between the bottom of the screen and the floating bar. */
function useBarBottom() {
  const insets = useSafeAreaInsets();
  return insets.bottom > 0 ? insets.bottom : 12;
}

/** Height of the new bottom navigation bar (without the phone's bottom safe area). See `BottomNav` in `@/components/k`. */
export const NAV_BAR_HEIGHT = 56;

/**
 * How much empty space a scrolling tab screen should leave at the bottom so nothing hides under the bottom bar
 * (`BottomNav`: bar + safe area + a little breathing room).
 */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return NAV_BAR_HEIGHT + Math.max(insets.bottom, 8) + 16;
}

/**
 * Old floating glass tab bar. No longer used by the tabs (they use `BottomNav`); kept so nothing that imports it
 * breaks.
 *
 * The floating glass tab bar. A glowing gradient "pill" slides under the chosen tab with a
 * springy bounce, icons pop when tapped, and unread badges bounce in. It hides while the keyboard
 * is open on Android (where the keyboard pushes the screen up).
 */
export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const bottom = useBarBottom();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const itemWidth = width / state.routes.length;
  const x = useSharedValue(0);

  useEffect(() => {
    if (!itemWidth) return;
    const target = state.index * itemWidth;
    x.set(reduceMotion ? target : withSpring(target, SPRING));
  }, [state.index, itemWidth, reduceMotion, x]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (keyboardOpen) return null;

  return (
    <View style={[styles.wrap, { bottom }]}>
      <View style={[styles.shadow, glowShadow(theme.glow, "strong"), Platform.OS === "android" && { elevation: 0 }]}>
        <Glass intensity={70} style={styles.bar}>
          <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {itemWidth > 0 ? (
              <Animated.View style={[styles.pillSlot, { width: itemWidth }, pill]}>
                <LinearGradient colors={theme.gradPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill} />
              </Animated.View>
            ) : null}
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key]!;
              const focused = state.index === index;
              const label = typeof options.title === "string" ? options.title : route.name;
              const onPress = () => {
                haptic.tap();
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              };
              return (
                <TabItem
                  key={route.key}
                  label={label}
                  focused={focused}
                  badge={options.tabBarBadge}
                  icon={options.tabBarIcon?.({ focused, color: focused ? "#ffffff" : theme.subtle, size: 23 })}
                  onPress={onPress}
                  onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                />
              );
            })}
          </View>
        </Glass>
      </View>
    </View>
  );
}

function TabItem({ label, focused, badge, icon, onPress, onLongPress }: { label: string; focused: boolean; badge?: string | number; icon: React.ReactNode; onPress: () => void; onLongPress: () => void }) {
  const theme = useTheme();
  const pop = useSharedValue(1);
  const badgeScale = useSharedValue(badge === undefined ? 0 : 1);

  useEffect(() => {
    badgeScale.set(badge === undefined ? withTiming(0, { duration: 150 }) : withSequence(withSpring(1.35, SPRING), withSpring(1, SPRING)));
  }, [badge, badgeScale]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeScale.value }] }));

  return (
    <Pressable
      onPress={() => {
        pop.set(withSequence(withSpring(0.8, { damping: 12, stiffness: 400 }), withSpring(1, SPRING)));
        onPress();
      }}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={badge !== undefined ? `${label}, ${badge} new` : label}
      style={styles.item}
    >
      <Animated.View style={iconStyle}>{icon}</Animated.View>
      <Txt style={{ fontFamily: focused ? font.heavy : font.semibold, fontSize: 11, lineHeight: 14, color: focused ? "#ffffff" : theme.subtle }}>{label}</Txt>
      {badge !== undefined ? (
        <Animated.View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.bg }, badgeStyle]}>
          <Txt style={{ color: "#fff", fontFamily: font.heavy, fontSize: 10, lineHeight: 13 }}>{badge}</Txt>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 14, right: 14, alignItems: "stretch" },
  shadow: { borderRadius: radius.pill },
  bar: { height: BAR_HEIGHT, borderRadius: radius.pill, justifyContent: "center", paddingHorizontal: 6 },
  row: { flexDirection: "row", alignItems: "center", height: BAR_HEIGHT - 12 },
  pillSlot: { position: "absolute", left: 0, top: 0, bottom: 0, paddingHorizontal: 3 },
  pill: { flex: 1, borderRadius: radius.pill },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 1, height: "100%" },
  badge: { position: "absolute", top: 2, left: "56%", minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
});
