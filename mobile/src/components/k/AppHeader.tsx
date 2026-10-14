import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/endpoints";
import { PressableScale } from "@/components/ui";
import { useTheme } from "@/theme";
import { KaminoWordmark } from "./Brand";
import { PersonAvatar } from "./PersonAvatar";
import { personFromProfile, type IconName, type Person } from "./types";

/** A right-side button: one of the built-ins, or your own icon. */
export type HeaderAction =
  | "search"
  | "bell"
  | "avatar"
  | "share"
  | "more"
  | { key: string; icon: IconName; label: string; onPress: () => void; dot?: boolean };

type AppHeaderProps = {
  /** Shows "<" before the logo. `true` goes back (or Home when there is nothing to go back to); or pass your own handler. */
  back?: boolean | (() => void);
  /**
   * Right-side buttons, left to right. Default: search, bell, avatar (tab screens) — or search, more when `back`
   * is set (post page). Community page: `["search", "share", "more"]`.
   */
  actions?: readonly HeaderAction[];
  /** Search button (default: opens the Explore tab with `?search=1`). */
  onSearch?: () => void;
  onShare?: () => void;
  /** ⋯ button. Hidden when not given. */
  onMore?: () => void;
  /** Draw the bell filled (on the Notifications screen). */
  bellActive?: boolean;
  /** Override the viewer shown in the avatar (otherwise read from the signed-in session). */
  viewer?: (Person & { handle?: string }) | null;
  /** Override the unread notification count (otherwise read from the session). */
  unread?: number;
  /** Add the status-bar height on top (default true; turn off inside a navigator header). */
  insetTop?: boolean;
  /** Logo press (e.g. scroll to top). */
  onLogoPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The top bar of every redesigned screen: Kamino mark + wordmark on the left; search, bell (red dot when there are
 * unread notifications → Notifications) and the viewer's avatar with a green dot (→ own profile) on the right.
 * Put it at the top of the screen's scroll content (it scrolls away) or above it (it stays). It reads the viewer and
 * the unread count from the shared `["bootstrap"]` query, so it costs no extra request on screens that already use it.
 */
export function AppHeader({ back, actions, onSearch, onShare, onMore, bellActive, viewer, unread, insetTop = true, onLogoPress, style }: AppHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const needsSession = viewer === undefined || unread === undefined;
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap, enabled: needsSession, refetchInterval: 60_000 });
  const profile = boot.data?.profile ?? null;
  const me: (Person & { handle?: string }) | null = viewer !== undefined ? viewer : profile ? { ...personFromProfile(profile), handle: profile.handle } : null;
  const unreadCount = unread ?? boot.data?.unread ?? 0;
  const list = actions ?? (back ? (onMore ? ["search", "more"] : ["search"]) : ["search", "bell", "avatar"]);

  const goBack = () => {
    if (typeof back === "function") return back();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View style={[{ paddingTop: insetTop ? insets.top + 4 : 4, paddingHorizontal: 16, paddingBottom: 6, flexDirection: "row", alignItems: "center", gap: 4 }, style]}>
      {back ? (
        <PressableScale onPress={goBack} accessibilityLabel="Go back" scaleTo={0.85} style={{ width: 40, height: 44, justifyContent: "center", marginLeft: -8 }}>
          <Ionicons name="chevron-back" size={26} color={theme.ink} />
        </PressableScale>
      ) : null}
      <View style={{ flex: 1, alignItems: "flex-start" }}>
        <KaminoWordmark size={back ? 23 : 24} onPress={onLogoPress} />
      </View>
      {list.map((action) => {
        if (typeof action === "object") {
          return <IconButton key={action.key} icon={action.icon} label={action.label} onPress={action.onPress} dot={action.dot} />;
        }
        switch (action) {
          case "search":
            return <IconButton key="search" icon="search-outline" label="Search" onPress={onSearch ?? (() => router.push("/explore?search=1" as never))} />;
          case "bell":
            return (
              <IconButton
                key="bell"
                icon={bellActive ? "notifications" : "notifications-outline"}
                label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
                onPress={() => router.push("/notifications")}
                dot={unreadCount > 0}
              />
            );
          case "share":
            return onShare ? <IconButton key="share" icon="share-outline" label="Share" onPress={onShare} /> : null;
          case "more":
            return onMore ? <IconButton key="more" icon="ellipsis-horizontal" label="More options" onPress={onMore} /> : null;
          case "avatar":
            return (
              <PressableScale key="avatar" onPress={() => router.push("/me")} accessibilityLabel="My profile" scaleTo={0.9} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", marginLeft: 4 }}>
                {me ? (
                  <PersonAvatar person={me} size={36} online />
                ) : (
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="person" size={20} color={theme.subtle} />
                  </View>
                )}
              </PressableScale>
            );
          default:
            return null;
        }
      })}
    </View>
  );
}

/** A 44px round icon button with an optional red dot. */
export function IconButton({ icon, label, onPress, dot, color, size = 24 }: { icon: IconName; label: string; onPress: () => void; dot?: boolean; color?: string; size?: number }) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} scaleTo={0.85} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <View>
        <Ionicons name={icon} size={size} color={color ?? theme.ink} />
        {dot ? <View style={{ position: "absolute", top: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.red, borderWidth: 2, borderColor: theme.bg }} /> : null}
      </View>
    </PressableScale>
  );
}

/** A dark see-through round button for use on top of pictures (profile cover: back, share, ⋯). */
export function CoverButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} scaleTo={0.88} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(15,11,42,0.55)", alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={22} color="#fff" />
    </PressableScale>
  );
}
