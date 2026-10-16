import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { platform } from "@/api/platform-v9";
import { LiveBadge, PersonAvatar, SectionHeader } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { HOME_TOOLS, hubShortcuts, type HubShortcut } from "@/lib/home-shortcuts";
import { font, radius, shadow, useTheme, type Tone } from "@/theme";

/** "Jump back in": a row of shortcut cards to your live rooms, chats, events and recent communities. Hidden when empty. */
export function JumpBackIn() {
  const hub = useQuery({ queryKey: ["discoveryHub", "", ""], queryFn: () => platform.hub(), staleTime: 60_000 });
  const items = hubShortcuts(hub.data);
  if (items.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <SectionHeader emoji="⚡" title="Jump back in" style={{ paddingHorizontal: 16 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingVertical: 2 }}>
        {items.map((item) => (
          <ShortcutCard key={item.key} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

function ShortcutCard({ item }: { item: HubShortcut }) {
  const theme = useTheme();
  // Chats: how long ago; events: the day.
  const when = !item.at
    ? ""
    : item.icon === "chatbubbles"
      ? timeAgo(item.at, undefined, { short: true })
      : item.icon === "calendar"
        ? new Date(item.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "";
  const label = [item.label, when].filter(Boolean).join(" · ");
  return (
    <PressableScale
      onPress={() => router.push(item.href as never)}
      accessibilityRole="button"
      accessibilityLabel={`${item.live ? "Live now" : item.label}: ${item.title}`}
      scaleTo={0.96}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card]}
    >
      {item.person ? (
        <PersonAvatar person={item.person} size={40} />
      ) : (
        <View style={[styles.icon, { backgroundColor: theme.tints[item.tone] }]}>
          <Ionicons name={item.icon} size={19} color={theme.toneText[item.tone]} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          {item.live ? <LiveBadge icon="dot" /> : null}
          {label ? (
            <Txt numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.semibold, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>
              {label}
            </Txt>
          ) : null}
        </View>
        <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 19, color: theme.ink }}>
          {item.title}
        </Txt>
      </View>
    </PressableScale>
  );
}

/** End of Home: "You're all caught up" (when the feed is done) and tinted tiles for Discover, Saved and Creator studio. */
export function HomeTools({ caughtUp }: { caughtUp: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10, paddingTop: 8 }}>
      {caughtUp ? (
        <Txt style={{ textAlign: "center", fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: theme.subtle, paddingBottom: 8 }}>
          {"You're all caught up ✨"}
        </Txt>
      ) : null}
      <SectionHeader emoji="🧰" title="Your tools" style={{ paddingHorizontal: 16 }} />
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16 }}>
        {HOME_TOOLS.map((tool) => (
          <PressableScale
            key={tool.href}
            onPress={() => router.push(tool.href as never)}
            accessibilityRole="button"
            accessibilityLabel={`${tool.title}: ${tool.text}`}
            scaleTo={0.96}
            style={[styles.tool, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card]}
          >
            <View style={[styles.icon, { backgroundColor: theme.tints[tool.tone as Tone] }]}>
              <Ionicons name={tool.icon} size={19} color={theme.toneText[tool.tone as Tone]} />
            </View>
            <Txt numberOfLines={2} style={{ fontFamily: font.bold, fontSize: 13.5, lineHeight: 17, color: theme.ink }}>
              {tool.title}
            </Txt>
            <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>
              {tool.text}
            </Txt>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 214, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.card, borderWidth: 1 },
  tool: { flex: 1, gap: 6, padding: 12, borderRadius: radius.card, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
