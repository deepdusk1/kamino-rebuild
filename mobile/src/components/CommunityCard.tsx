import { router } from "expo-router";
import { View } from "react-native";
import type { Community } from "@/api/types";
import { serverImage } from "@/components/community/media";
import { CountPill, Picture, Pill, VerifiedTick } from "@/components/k";
import { defaultCover } from "@/lib/brandArt";
import { font, radius, shadow, useTheme } from "@/theme";
import { Appear, PressableScale, Txt } from "./ui";

/**
 * An older-style community tile, used by screens that list whole `Community` objects (Welcome, Profile…).
 * It now has the redesign look: a white card with the cover on top (or a calm default cover), the member count
 * pill, the name, the tagline and the category. `compact` is the narrow carousel size.
 * New screens should prefer the kit's `CommunityCard` from "@/components/k".
 */
export function CommunityCard({ community, compact, index }: { community: Community; compact?: boolean; index?: number }) {
  const theme = useTheme();
  const tile = (
    <PressableScale
      onPress={() => router.push(`/community/${community.id}`)}
      accessibilityLabel={`${community.name}, ${community.memberCount} members`}
      scaleTo={0.97}
      style={[{ width: compact ? 176 : undefined, backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, overflow: "hidden" }, shadow.card]}
    >
      <Picture source={community.cover ? serverImage(community.cover) : defaultCover(community.hue)} hue={community.hue} style={{ width: "100%", aspectRatio: compact ? 1.9 : 2.6 }}>
        <CountPill value={community.memberCount} style={{ position: "absolute", left: 8, top: 8, height: 20, paddingHorizontal: 7 }} />
        {community.visibility !== "public" ? (
          <Pill label={community.visibility === "private" ? "Private" : "Unlisted"} icon="lock-closed" tone="neutral" variant="solid" style={{ position: "absolute", right: 8, top: 8 }} />
        ) : null}
      </Picture>
      <View style={{ padding: compact ? 10 : 12, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: compact ? 14 : 15.5, lineHeight: compact ? 18 : 20, color: theme.ink, flexShrink: 1 }}>{community.name}</Txt>
          {community.verified ? <VerifiedTick size={13} /> : null}
        </View>
        {community.tagline ? <Txt numberOfLines={compact ? 1 : 2} style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: theme.muted }}>{community.tagline}</Txt> : null}
        {!compact && community.category ? <Pill label={community.category} tone="violet" style={{ marginTop: 4 }} /> : null}
      </View>
    </PressableScale>
  );
  return index === undefined ? tile : <Appear index={index}>{tile}</Appear>;
}
