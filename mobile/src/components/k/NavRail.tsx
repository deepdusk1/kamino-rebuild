import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale, Txt } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { font, useTheme } from "@/theme";
import { type IconName } from "./types";
import type { BottomNavItem } from "./BottomNav";

const TAB_ICONS: Record<string, IconName> = {
  index: "home-outline",
  explore: "people-outline",
  create: "add",
  chats: "chatbubble-ellipses-outline",
  me: "person-outline",
  notifications: "notifications-outline",
};

/** Width of the tablet side rail; the tabs layout pads the content by the same amount. */
export const NAV_RAIL_WIDTH = 88;

/**
 * Tablet navigation: the same five destinations as the bottom bar, as a slim rail pinned to the
 * left edge. Shown instead of `BottomNav` when the window is at least 768pt wide.
 */
export function NavRail({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter(
    (r) => (descriptors[r.key]?.options as { href?: unknown } | undefined)?.href !== null,
  );
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
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top,
          bottom: 0,
          backgroundColor: theme.surface,
          borderRightColor: theme.border,
        },
      ]}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        if (item.fab) {
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                const route = state.routes.find((r) => r.key === item.key);
                if (route) navigation.navigate(route.name, route.params);
              }}
              style={styles.fab}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Ionicons name="add" size={26} color="#ffffff" />
            </Pressable>
          );
        }
        const icon = (isActive ? item.activeIcon ?? item.icon : item.icon) as IconName;
        return (
          <PressableScale
            key={item.key}
            onPress={() => {
              const route = state.routes.find((r) => r.key === item.key);
              if (!route) return;
              haptic.tap();
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (item.key !== active && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isActive }}
          >
            <Ionicons name={icon} size={22} color={isActive ? theme.accent : theme.muted} />
            <Txt
              variant="label"
              tone={isActive ? "accent" : "muted"}
              style={{ fontSize: 10, fontFamily: isActive ? font.bold : font.regular }}
            >
              {item.label}
            </Txt>
            {typeof item.badge === "number" && item.badge > 0 ? (
              <View style={styles.badge} accessibilityLabel={`${item.badge} unread`} />
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    width: NAV_RAIL_WIDTH,
    borderRightWidth: 1,
    alignItems: "center",
    paddingTop: 12,
    gap: 4,
  },
  item: { alignItems: "center", justifyContent: "center", gap: 2, width: "100%", paddingVertical: 10 },
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "#7548df",
  },
  badge: { position: "absolute", top: 8, right: 24, width: 8, height: 8, borderRadius: 4, backgroundColor: "#e5484d" },
});
