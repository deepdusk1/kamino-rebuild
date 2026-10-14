import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import { BottomNavBar, type BottomNavItem } from "@/components/k";
import { haptic } from "@/lib/haptics";

/** Where each bottom-bar button goes from a screen outside the tabs. */
const ROUTES: Record<string, string> = { home: "/", explore: "/explore", create: "/create", chats: "/chats", me: "/me" };

/**
 * The bottom bar (Home · Communities · + · Chats · Profile) for screens that are opened on top of the tabs
 * (Notifications, someone's profile), so they look like the mockups and you can jump straight to a tab.
 * It sits at the bottom of the screen; leave `useTabBarSpace()` of room under your scroll content.
 */
export function StackNav({ active = "" }: { active?: string }) {
  // Same query as the tabs layout, so the red dot on Chats matches.
  const rooms = useQuery({ queryKey: ["rooms"], queryFn: api.rooms, refetchInterval: 60_000 });
  const unreadChats = (rooms.data ?? []).filter((r) => !r.muted).reduce((sum, r) => sum + r.unread, 0);
  const items: BottomNavItem[] = [
    { key: "home", label: "Home", icon: "home-outline" },
    { key: "explore", label: "Communities", icon: "people-outline" },
    { key: "create", label: "Create", icon: "add", fab: true },
    { key: "chats", label: "Chats", icon: "chatbubble-ellipses-outline", badge: unreadChats > 0 ? Math.min(unreadChats, 99) : undefined },
    { key: "me", label: "Profile", icon: "person-outline" },
  ];
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, pointerEvents: "box-none" }}>
      <BottomNavBar
        items={items}
        activeKey={active}
        onPress={(key) => {
          haptic.tap();
          router.navigate(ROUTES[key] as never);
        }}
      />
    </View>
  );
}
