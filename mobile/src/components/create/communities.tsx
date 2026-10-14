import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { api } from "@/api/endpoints";
import { Picture } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import { font, radius, useTheme } from "@/theme";

/** One of my communities, as the Create screen and the "start a room" / "new event" sheets need it. */
export type MyCommunity = {
  slug: string;
  name: string;
  icon: string;
  cover: string;
  hue: number;
  memberCount: number;
  /** My role there: "leader" / "agent" can schedule events. */
  role: string;
};

/** Leaders (and the site's helpers) may schedule events. */
export function canLeadRole(role: string): boolean {
  return role === "leader" || role === "agent";
}

/** The communities I have joined (shares the `["me"]` cache with other screens). */
export function useMyCommunities() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const list: MyCommunity[] = (me.data?.joined ?? []).map((j) => ({
    slug: j.community.id,
    name: j.community.name,
    icon: j.community.icon,
    cover: j.community.cover,
    hue: j.community.hue,
    memberCount: j.community.memberCount,
    role: j.role,
  }));
  return { list, query: me };
}

/** A round community picture (its icon, else its cover, else a colourful initial). */
export function CommunityAvatar({ community, size = 38 }: { community: Pick<MyCommunity, "icon" | "cover" | "hue" | "name">; size?: number }) {
  return <Picture source={community.icon || community.cover || null} hue={community.hue} label={community.name} radius={size / 2} style={{ width: size, height: size }} />;
}

/** A sideways row of community pills to choose from (used inside sheets). */
export function CommunityChoice({ communities, value, onChange, style }: { communities: MyCommunity[]; value: string | null; onChange: (slug: string) => void; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {communities.map((c) => {
        const on = c.slug === value;
        return (
          <PressableScale
            key={c.slug}
            onPress={() => onChange(c.slug)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={c.name}
            scaleTo={0.95}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 5, paddingRight: 12, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? theme.violet : theme.border, backgroundColor: on ? theme.tints.violet : theme.surface }}
          >
            <CommunityAvatar community={c} size={32} />
            <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 13, lineHeight: 17, color: on ? theme.toneText.violet : theme.ink, maxWidth: 160 }}>{c.name}</Txt>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/** A full list of communities for a picker sheet: picture, name, members, check on the chosen one. */
export function CommunityList({ communities, value, onPick }: { communities: MyCommunity[]; value: string | null; onPick: (slug: string) => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {communities.map((c) => {
        const on = c.slug === value;
        return (
          <PressableScale
            key={c.slug}
            onPress={() => onPick(c.slug)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${c.name}, ${compactNumber(c.memberCount)} members`}
            scaleTo={0.98}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderRadius: radius.tile, backgroundColor: on ? theme.tints.violet : "transparent" }}
          >
            <CommunityAvatar community={c} size={40} />
            <View style={{ flex: 1 }}>
              <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14.5, lineHeight: 19, color: theme.ink }}>{c.name}</Txt>
              <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>{compactNumber(c.memberCount)} members</Txt>
            </View>
            {on ? <Ionicons name="checkmark-circle" size={22} color={theme.violet} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}
