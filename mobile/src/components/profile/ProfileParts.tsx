import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { Achievement, CommunityCardData } from "@/api/types";
import { serverImage } from "@/components/community/media";
import { BadgeHex, JoinButton, OnlineDot, Picture, toImageSource, type IconName, type Person, type Src } from "@/components/k";
import { Avatar, PressableScale, Txt } from "@/components/ui";
import { achievementMedal } from "@/lib/achievements";
import { compactNumber } from "@/lib/format";
import { font, radius, shadow, useTheme } from "@/theme";

/** Mockup measurements (points), see SPEC section 6. */
export const COVER_HEIGHT = 150;
/** How far the white "tab" behind the name reaches up into the cover. */
const TAB_RISE = 28;
/** Top of the white page on the right side (just above the cover's bottom edge). */
const PAGE_RISE = 6;
export const AVATAR_SIZE = 100;
const AVATAR_TOP = 32;
const TAB_WIDTH = 168;

/** A small dark see-through round button on the cover (back, share, ⋯) with a 44px touch area. */
export function CoverButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} hitSlop={6} scaleTo={0.88} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(15,11,42,0.55)", alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={icon === "chevron-back" ? 20 : 18} color="#fff" />
    </PressableScale>
  );
}

/**
 * The top of a profile: the cover picture with back / share / ⋯ buttons, the big avatar with a white ring and a
 * green online dot, and the white page curving up behind the name (the mockup's "card curve").
 */
export function ProfileCover({
  cover,
  hue,
  person,
  online,
  onBack,
  onShare,
  onMore,
  onAvatarPress,
}: {
  cover: Src;
  hue: number;
  person: Person;
  online: boolean;
  onBack?: () => void;
  onShare: () => void;
  onMore: () => void;
  onAvatarPress?: () => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const h = TAB_RISE + 2;
  const r = 20;
  // The white page shape: a raised tab on the left (behind the avatar and name) that curves down to the right.
  const path =
    width > 0
      ? `M0 ${h} L0 ${r} Q0 0 ${r} 0 L${TAB_WIDTH - 20} 0 C${TAB_WIDTH + 6} 0 ${TAB_WIDTH + 4} ${TAB_RISE - PAGE_RISE} ${TAB_WIDTH + 34} ${TAB_RISE - PAGE_RISE} L${width - r} ${TAB_RISE - PAGE_RISE} Q${width} ${TAB_RISE - PAGE_RISE} ${width} ${TAB_RISE - PAGE_RISE + r} L${width} ${h} Z`
      : "";
  const avatar = (
    <View style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
      <Avatar
        name={person.name}
        hue={person.hue}
        userId={person.userId}
        version={person.avatarV}
        source={toImageSource(person.image)}
        size={AVATAR_SIZE}
        outline={4}
      />
      {online ? <OnlineDot size={20} style={{ position: "absolute", right: 4, bottom: 4 }} /> : null}
    </View>
  );
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: COVER_HEIGHT + 2 }}>
      <Picture source={cover} hue={hue} style={{ position: "absolute", left: 0, right: 0, top: 0, height: COVER_HEIGHT, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} />
      <View style={{ position: "absolute", left: 14, right: 14, top: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        {onBack ? <CoverButton icon="chevron-back" label="Go back" onPress={onBack} /> : null}
        <View style={{ flex: 1 }} />
        <CoverButton icon="share-outline" label="Share profile" onPress={onShare} />
        <CoverButton icon="ellipsis-horizontal" label="More options" onPress={onMore} />
      </View>
      {width > 0 ? (
        <Svg width={width} height={h} style={{ position: "absolute", left: 0, top: COVER_HEIGHT - TAB_RISE }}>
          <Path d={path} fill={theme.bg} />
        </Svg>
      ) : null}
      <View style={{ position: "absolute", left: 10, top: AVATAR_TOP }} >
        {onAvatarPress ? (
          <PressableScale onPress={onAvatarPress} accessibilityLabel="Change your photo" scaleTo={0.96}>
            {avatar}
          </PressableScale>
        ) : (
          avatar
        )}
      </View>
    </View>
  );
}

/** Profile "Communities" tile: square picture on the left, name, members and a coloured Join / Joined pill. */
export function CommunityTile({ community, index, width, busy, onPress, onJoin, style }: { community: CommunityCardData; index: number; width: number; busy?: boolean; onPress: () => void; onJoin: () => void; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  // Mockup colour order: violet, pink, blue, green.
  const colorIndex = [0, 2, 1, 3][index % 4]!;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${community.name}, ${compactNumber(community.memberCount)} members${community.joined ? ", joined" : ""}`}
      scaleTo={0.97}
      style={[{ width, flexDirection: "row", alignItems: "center", gap: 6, padding: 4, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border }, shadow.card, style]}
    >
      <Picture source={serverImage(community.icon || community.cover)} hue={community.hue} label={community.name} radius={8} style={{ width: 38, height: 40 }} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 10, lineHeight: 13, color: theme.ink }}>{community.name}</Txt>
        <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 8.5, lineHeight: 11, color: theme.muted }}>{compactNumber(community.memberCount)} members</Txt>
        <JoinButton joined={community.joined} onPress={onJoin} index={colorIndex} size="xs" check={false} busy={busy} full accessibilityLabel={community.joined ? `Open ${community.name}` : `Join ${community.name}`} style={{ height: 16, marginTop: 2, paddingHorizontal: 4 }} />
      </View>
    </PressableScale>
  );
}

/** The white card with up to five hexagon medals and a round ">" button that opens every achievement. */
export function BadgeRow({ badges, onSeeAll, emptyText }: { badges: Achievement[]; onSeeAll: () => void; emptyText: string }) {
  const theme = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", backgroundColor: theme.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: theme.border, paddingVertical: 7, paddingLeft: 4, paddingRight: 6 }, shadow.card]}>
      {badges.length ? (
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-around" }}>
          {badges.slice(0, 5).map((a) => {
            const medal = achievementMedal(a.icon);
            return <BadgeHex key={a.id} icon={medal.icon} tone={medal.tone} size={34} label={a.name} onPress={onSeeAll} />;
          })}
        </View>
      ) : (
        <Txt style={{ flex: 1, paddingHorizontal: 10, fontFamily: font.semibold, fontSize: 12.5, lineHeight: 17, color: theme.muted }}>{emptyText}</Txt>
      )}
      <PressableScale onPress={onSeeAll} accessibilityLabel="See all achievements" hitSlop={8} scaleTo={0.88} style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" }, shadow.card]}>
        <Ionicons name="chevron-forward" size={17} color={theme.ink} />
      </PressableScale>
    </View>
  );
}

/** Shown under the header of a private account to people who don't follow it. */
export function PrivateNotice({ requested }: { requested: boolean }) {
  const theme = useTheme();
  return (
    <View style={[{ alignItems: "center", gap: 8, padding: 24, marginHorizontal: 10, borderRadius: radius.card, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.tints.violet, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="lock-closed" size={26} color={theme.violet} />
      </View>
      <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 17, lineHeight: 22, color: theme.ink }}>This account is private</Txt>
      <Txt style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: theme.muted, textAlign: "center" }}>
        {requested ? "Your follow request is waiting. Once it's accepted you'll see their posts, badges and communities." : "Follow this account to see their posts, badges and communities."}
      </Txt>
    </View>
  );
}

/** Section title used further down the profile (Wall, Titles, Characters…), in the redesign's style. */
export function ProfileSection({ title, emoji, children, style }: { title: string; emoji: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[{ gap: 8, paddingHorizontal: 10 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 }}>
        <Txt style={{ fontSize: 16, lineHeight: 21 }}>{emoji}</Txt>
        <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 15.5, lineHeight: 21, letterSpacing: -0.2, color: theme.ink }}>{title}</Txt>
      </View>
      {children}
    </View>
  );
}
