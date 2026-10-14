import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router/js-tabs";
import { useWindowDimensions, View } from "react-native";
import { api } from "@/api/endpoints";
import { BottomNav } from "@/components/k";
import { NavRail, NAV_RAIL_WIDTH } from "@/components/k/NavRail";
import { Backdrop } from "@/components/ui";
import { font, useTheme } from "@/theme";
import { useT } from "@/lib/i18n";

/**
 * The five tabs, in this order: Home · Communities · (+) Create · Chats · Profile.
 * `BottomNav` draws the bar (icons come from the route names, labels from `title`; the `create` route is the raised
 * + button and opens the Create screen). Screens draw their own `AppHeader`, so the default headers are hidden.
 */
/** Tablets get the side rail; phones keep the bottom bar. */
const RAIL_MIN_WIDTH = 768;

export default function TabsLayout() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const rail = width >= RAIL_MIN_WIDTH;
  const t = useT();
  // Unread chats drive the red dot on Chats; refetched every minute while the app is open.
  const rooms = useQuery({ queryKey: ["rooms"], queryFn: api.rooms, refetchInterval: 60_000 });
  const unreadChats = (rooms.data ?? []).filter((r) => !r.muted).reduce((sum, r) => sum + r.unread, 0);

  return (
    <Tabs
      tabBar={(props) => (rail ? <NavRail {...props} /> : <BottomNav {...props} />)}
      screenLayout={({ children }) => (
        <Backdrop>
          <View style={{ flex: 1, paddingLeft: rail ? NAV_RAIL_WIDTH : 0 }}>{children}</View>
        </Backdrop>
      )}
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: theme.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: font.heavy, color: theme.ink, fontSize: 22 },
        headerTitleAlign: "left",
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("nav.home") }} />
      <Tabs.Screen name="explore" options={{ title: t("nav.communities") }} />
      <Tabs.Screen name="create" options={{ title: t("nav.create") }} />
      <Tabs.Screen name="chats" options={{ title: t("nav.chats"), tabBarBadge: unreadChats > 0 ? Math.min(unreadChats, 99) : undefined }} />
      <Tabs.Screen name="me" options={{ title: t("nav.profile") }} />
    </Tabs>
  );
}
