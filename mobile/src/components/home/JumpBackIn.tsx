import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { platform, type Row } from "@/api/platform-v9";
import { SectionHeader } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { font, radius, shadow, useTheme, type Tone } from "@/theme";

type Shortcut = {
  key: string;
  kind: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  href: string;
};

/** How many of each kind to show, so one busy kind can't push the others off the row. */
const PER_KIND = 3;

/**
 * Turns the discovery hub rows into shortcut cards: live rooms first, then chats you were in,
 * upcoming events and communities you visited recently. Rows without an id are skipped.
 */
export function hubShortcuts(hub: { live: Row[]; chats: Row[]; events: Row[]; visits: Row[] } | undefined): Shortcut[] {
  if (!hub) return [];
  const list: Shortcut[] = [];
  const seen = new Set<string>();
  const add = (rows: Row[], make: (r: Row) => Omit<Shortcut, "key"> | null, prefix: string) => {
    for (const r of rows.slice(0, PER_KIND)) {
      if (r.id === null || r.id === undefined || r.id === "") continue;
      const item = make(r);
      // A live voice room is also one of your chats: show it once, as live.
      if (!item || seen.has(item.href)) continue;
      seen.add(item.href);
      list.push({ key: `${prefix}-${String(r.id)}`, ...item });
    }
  };
  add(hub.live, (r) => ({ kind: Number(r.listeners) > 0 ? `Live · ${Number(r.listeners)} listening` : "Live now", title: String(r.name ?? "Live room"), icon: "radio", tone: "pink", href: `/chat/${String(r.id)}` }), "live");
  add(hub.chats, (r) => ({ kind: "Chat", title: String(r.name ?? "Chat"), icon: "chatbubbles", tone: "violet", href: `/chat/${String(r.id)}` }), "chat");
  add(
    hub.events,
    (r) =>
      r.community_id
        ? { kind: "Upcoming", title: String(r.title ?? "Event"), icon: "calendar", tone: "blue", href: `/community/${String(r.community_id)}/events` }
        : null,
    "event",
  );
  add(hub.visits, (r) => ({ kind: "Visited", title: String(r.name ?? "Community"), icon: "planet", tone: "green", href: `/community/${String(r.id)}` }), "visit");
  return list;
}

/** "Jump back in": a row of shortcut cards to your live rooms, chats, events and recent communities. Hidden when empty. */
export function JumpBackIn() {
  const theme = useTheme();
  const hub = useQuery({ queryKey: ["discoveryHub", "", ""], queryFn: () => platform.hub(), staleTime: 60_000 });
  const items = hubShortcuts(hub.data);
  if (items.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <SectionHeader emoji="⚡" title="Jump back in" style={{ paddingHorizontal: 16 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingVertical: 2 }}>
        {items.map((item) => (
          <PressableScale
            key={item.key}
            onPress={() => router.push(item.href as never)}
            accessibilityRole="button"
            accessibilityLabel={`${item.kind}: ${item.title}`}
            scaleTo={0.96}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card]}
          >
            <View style={[styles.icon, { backgroundColor: theme.tints[item.tone] }]}>
              <Ionicons name={item.icon} size={18} color={theme.toneText[item.tone]} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: theme.muted }}>
                {item.kind}
              </Txt>
              <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 13.5, lineHeight: 18, color: theme.ink }}>
                {item.title}
              </Txt>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 176, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.card, borderWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
