import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAV_BAR_HEIGHT, PressableScale, Txt } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { font, shadow, useTheme } from "@/theme";
import type { IconName } from "./types";

/** Size of the raised + button and how far it sticks up above the bar (measured from the mockups). */
const FAB_SIZE = 46;
const FAB_RAISE = 10;
const SPRING = { damping: 14, stiffness: 320, mass: 0.6 } as const;

export type BottomNavItem = {
  key: string;
  label: string;
  /** Outline icon (inactive). */
  icon: IconName;
  /** Filled icon (active). Defaults to `icon` without "-outline". */
  activeIcon?: IconName;
  /** Red dot (unread chats). A number is read out to screen readers. */
  badge?: number | string | boolean;
  /** The middle + button. */
  fab?: boolean;
};

type BottomNavBarProps = {
  items: readonly BottomNavItem[];
  activeKey: string;
  onPress: (key: string) => void;
  onLongPress?: (key: string) => void;
};

/**
 * The bottom navigation bar as plain props (used by `BottomNav` and the kit gallery):
 * white bar, outline icons with labels, active = filled violet; the `fab` item is a raised 64px `gradFab`
 * circle with a white +. Respects the phone's bottom safe area.
 */
export function BottomNavBar({ items, activeKey, onPress, onLongPress }: BottomNavBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  const fabIndex = items.findIndex((i) => i.fab);
  const fab = fabIndex >= 0 ? items[fabIndex]! : null;
  return (
    // The outer view is taller than the bar by the + button's overhang, so the whole button can be tapped
    // (Android ignores touches outside a parent's box). It lets touches through everywhere else.
    <View style={{ paddingTop: FAB_RAISE, pointerEvents: "box-none" }}>
      <View style={[styles.bar, { paddingBottom: bottom, backgroundColor: theme.surface, borderTopColor: theme.border }, shadow.raised]}>
        <View style={styles.row}>
          {items.map((item) =>
            item.fab ? (
              <View key={item.key} style={styles.item} />
            ) : (
              <NavItem key={item.key} item={item} active={item.key === activeKey} onPress={() => onPress(item.key)} onLongPress={onLongPress ? () => onLongPress(item.key) : undefined} />
            ),
          )}
        </View>
      </View>
      {fab ? (
        <View style={{ position: "absolute", top: 0, left: `${((fabIndex + 0.5) / items.length) * 100}%`, marginLeft: -FAB_SIZE / 2 }}>
          <Fab label={fab.label} onPress={() => onPress(fab.key)} />
        </View>
      ) : null}
    </View>
  );
}

function NavItem({ item, active, onPress, onLongPress }: { item: BottomNavItem; active: boolean; onPress: () => void; onLongPress?: () => void }) {
  const theme = useTheme();
  const pop = useSharedValue(1);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const color = active ? theme.accent : theme.muted;
  const filled = item.activeIcon ?? (item.icon.replace(/-outline$/, "") as IconName);
  const hasBadge = item.badge !== undefined && item.badge !== false && item.badge !== 0;
  const spoken = hasBadge && typeof item.badge !== "boolean" ? `${item.label}, ${item.badge} new` : hasBadge ? `${item.label}, new` : item.label;
  return (
    <Pressable
      onPress={() => {
        pop.set(withSequence(withSpring(0.82, SPRING), withSpring(1, SPRING)));
        onPress();
      }}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={spoken}
      style={styles.item}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={active ? filled : item.icon} size={23} color={color} />
        {hasBadge ? <View style={[styles.dot, { backgroundColor: theme.red, borderColor: theme.surface }]} /> : null}
      </Animated.View>
      <Txt numberOfLines={1} style={{ fontFamily: active ? font.bold : font.semibold, fontSize: 11, lineHeight: 14, color }}>{item.label}</Txt>
    </Pressable>
  );
}

function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} accessibilityRole="button" scaleTo={0.9} style={[styles.fab, shadow.glow(theme.gradFab[1], 0.45)]}>
      <LinearGradient colors={theme.gradFab} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: FAB_SIZE / 2 }]} />
      <Ionicons name="add" size={28} color="#fff" />
    </PressableScale>
  );
}

/** Default icons for the five tabs, by route name. Screens can override with `tabBarIcon`-free `BottomNavItem`s. */
const TAB_ICONS: Record<string, IconName> = {
  index: "home-outline",
  explore: "people-outline",
  create: "add",
  chats: "chatbubble-ellipses-outline",
  me: "person-outline",
  notifications: "notifications-outline",
};

/**
 * Custom tab bar for expo-router `Tabs`: `<Tabs tabBar={(props) => <BottomNav {...props} />}>`.
 * - Labels come from each screen's `title`; icons from the table above (by route name).
 * - The route named `create` becomes the raised + button.
 * - `tabBarBadge` on a screen shows the red dot (Chats).
 * - Routes with `href: null` are hidden.
 * The bar sits over the content (absolute), so scrolling screens should leave `useTabBarSpace()` at the bottom.
 */
export function BottomNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // On Android the keyboard pushes the screen up; hide the bar while typing so it doesn't float over the keyboard.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboardOpen) return null;

  const routes = state.routes.filter((r) => (descriptors[r.key]?.options as { href?: unknown } | undefined)?.href !== null);
  const items: BottomNavItem[] = routes.map((route) => {
    const options = descriptors[route.key]!.options;
    return {
      key: route.key,
      label: typeof options.title === "string" ? options.title : route.name,
      icon: TAB_ICONS[route.name] ?? "ellipse-outline",
      badge: options.tabBarBadge,
      fab: route.name === "create",
    };
  });
  const active = state.routes[state.index]?.key ?? "";

  return (
    <View style={[styles.wrap, { pointerEvents: "box-none" }]}>
      <BottomNavBar
        items={items}
        activeKey={active}
        onPress={(key) => {
          const route = state.routes.find((r) => r.key === key);
          if (!route) return;
          haptic.tap();
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (key !== active && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        onLongPress={(key) => navigation.emit({ type: "tabLongPress", target: key })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  bar: { borderTopWidth: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  row: { flexDirection: "row", alignItems: "center", height: NAV_BAR_HEIGHT, paddingHorizontal: 4 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, height: "100%", minWidth: 44 },
  dot: { position: "absolute", top: -2, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  fab: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, alignItems: "center", justifyContent: "center" },
});
