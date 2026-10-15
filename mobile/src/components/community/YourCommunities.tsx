import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import type { CommunityCardData } from "@/api/types";
import { serverImage } from "@/components/community/media";
import { GradientButton, Picture, SectionHeader } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import { font, radius, shadow, useTheme } from "@/theme";

const TILE = 84;

/**
 * "Your communities": the first thing on the Communities tab.
 * A row of the communities you belong to (tap to open), ending with a "New" tile.
 * With none joined yet, a short card that points to creating or browsing one.
 */
export function YourCommunities({
  communities,
  loading,
  onBrowse,
}: {
  communities: CommunityCardData[];
  loading: boolean;
  onBrowse: () => void;
}) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={{ gap: 8 }}>
        <SectionHeader title="Your communities" style={{ paddingHorizontal: 16 }} />
        <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: TILE, gap: 6 }}>
              <View style={[styles.cover, { backgroundColor: theme.surfaceAlt }]} />
              <View style={{ height: 10, width: TILE - 18, borderRadius: 5, backgroundColor: theme.surfaceAlt }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (communities.length === 0) {
    return (
      <View style={{ gap: 8, paddingHorizontal: 16 }}>
        <SectionHeader title="Your communities" />
        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.tints.violet }]}>
            <Ionicons name="planet-outline" size={22} color={theme.violet} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={{ fontFamily: font.heavy, fontSize: 14.5, lineHeight: 19, color: theme.ink }}>
              You haven&apos;t joined a community yet
            </Txt>
            <Txt style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: theme.muted }}>
              Browse the ones below, or start your own in a minute.
            </Txt>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <GradientButton label="Start a community" icon="add" size="sm" onPress={() => router.push("/new-community")} style={{ flex: 1 }} />
          <PressableScale
            onPress={onBrowse}
            accessibilityRole="button"
            accessibilityLabel="Browse communities"
            scaleTo={0.96}
            style={[styles.secondaryBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Txt style={{ fontFamily: font.bold, fontSize: 13, color: theme.ink }}>Browse</Txt>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <SectionHeader
        title="Your communities"
        actionLabel="New"
        onAction={() => router.push("/new-community")}
        style={{ paddingHorizontal: 16 }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {communities.map((c) => (
          <PressableScale
            key={c.id}
            onPress={() => router.push(`/community/${c.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${c.name}${c.onlineCount > 0 ? `, ${c.onlineCount} online` : ""}`}
            scaleTo={0.95}
            style={{ width: TILE, gap: 6 }}
          >
            <Picture
              source={c.icon ? serverImage(c.icon) : c.cover ? serverImage(c.cover) : null}
              hue={c.hue}
              label={c.name}
              radius={radius.card}
              style={styles.cover}
            />
            {c.onlineCount > 0 ? (
              <View style={[styles.onlineDot, { backgroundColor: theme.ok, borderColor: theme.bg }]} />
            ) : null}
            <View style={{ gap: 1 }}>
              <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: theme.ink }}>
                {c.name}
              </Txt>
              <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 11, lineHeight: 14, color: theme.muted }}>
                {c.onlineCount > 0 ? `${compactNumber(c.onlineCount)} online` : `${compactNumber(c.memberCount)} members`}
              </Txt>
            </View>
          </PressableScale>
        ))}
        <PressableScale
          onPress={() => router.push("/new-community")}
          accessibilityRole="button"
          accessibilityLabel="Start a new community"
          scaleTo={0.95}
          style={{ width: TILE, gap: 6 }}
        >
          <View style={[styles.cover, styles.newTile, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
            <Ionicons name="add" size={28} color={theme.accent} />
          </View>
          <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: theme.accent }}>
            New
          </Txt>
        </PressableScale>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: TILE, height: TILE, borderRadius: radius.card },
  newTile: { borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  onlineDot: { position: "absolute", top: TILE - 16, left: TILE - 16, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.card, borderWidth: 1 },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  secondaryBtn: { height: 36, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
