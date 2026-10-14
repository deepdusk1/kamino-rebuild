import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { font, joinColor, radius, shadow, useTheme, withAlpha, type Gradient, type Tone } from "@/theme";
import { PressableScale, Txt } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import { CountPill, LiveBadge, VerifiedTick } from "./Badges";
import { AvatarStack, GradientButton, JoinButton } from "./Buttons";
import { PersonAvatar } from "./PersonAvatar";
import { useColumnWidth } from "./layout";
import { Picture } from "./Picture";
import type { IconName, Person, Src } from "./types";

/** Light two-stop wash for a tone (stat cards, banners). */
function toneWash(theme: ReturnType<typeof useTheme>, tone: Tone): Gradient {
  return theme.dark ? [theme.tints[tone], theme.surface] : [theme.tints[tone], withAlpha(theme.tints[tone], 0.35)];
}

// ── StatCard ─────────────────────────────────────────────────────────────────

type StatCardProps = {
  value: string | number;
  label: string;
  /** Colour family of the wash and icon (Members = violet, Online = pink). */
  tone?: Tone;
  /** An icon in a gradient circle on the left (Members). */
  icon?: IconName;
  /** A green dot before the number (Online Now). */
  dot?: boolean;
  faces?: Person[];
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** A tinted stat tile: number + label, optional icon circle / online dot / faces; a chevron when tappable. */
export function StatCard({ value, label, tone = "violet", icon, dot, faces, onPress, style }: StatCardProps) {
  const theme = useTheme();
  const text = typeof value === "number" ? compactNumber(value) : value;
  const body = (
    <LinearGradient colors={toneWash(theme, tone)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.stat, { borderColor: theme.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon ? (
          <LinearGradient colors={[theme[tone], withAlpha(theme[tone], 0.75)]} style={styles.statIcon}>
            <Ionicons name={icon} size={17} color="#fff" />
          </LinearGradient>
        ) : null}
        {dot ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: theme.green }} /> : null}
        <View style={{ flex: 1 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 17, lineHeight: 21, color: theme.ink }}>{text}</Txt>
          <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 11.5, lineHeight: 14, color: theme.text }}>{label}</Txt>
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={15} color={theme.toneText[tone]} /> : null}
      </View>
      {faces?.length ? <AvatarStack people={faces} size={19} max={4} style={{ marginTop: 6, marginLeft: icon ? 40 : 0 }} /> : null}
    </LinearGradient>
  );
  if (!onPress) return <View style={[{ flex: 1 }, style]} accessible accessibilityLabel={`${text} ${label}`}>{body}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${text} ${label}`} scaleTo={0.97} style={[{ flex: 1 }, style]}>
      {body}
    </PressableScale>
  );
}

// ── RankCard ─────────────────────────────────────────────────────────────────

/** The gold "Top 1% · Anime Community" badge card (community page). `percent` 1 = top 1%. */
export function RankCard({ percent, category, onPress, style }: { percent: number; category: string; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const label = `Top ${percent}%`;
  const body = (
    <LinearGradient colors={theme.gradStreak} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.stat, { borderColor: theme.border, flexDirection: "row", alignItems: "center", gap: 10 }]}>
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="leaf" size={16} color={theme.yellow} style={{ position: "absolute", left: -7, bottom: -5, transform: [{ rotate: "-40deg" }] }} />
        <Ionicons name="leaf" size={16} color={theme.yellow} style={{ position: "absolute", right: -7, bottom: -5, transform: [{ rotate: "130deg" }, { scaleY: -1 }] }} />
        <LinearGradient colors={["#FFB547", "#F25C1E"]} style={styles.statIcon}>
          <Ionicons name="trophy" size={16} color="#fff" />
        </LinearGradient>
      </View>
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 17, lineHeight: 21, color: theme.toneText.orange }}>{label}</Txt>
        <Txt numberOfLines={2} style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: theme.text }}>{category}</Txt>
      </View>
    </LinearGradient>
  );
  if (!onPress) return <View style={[{ flex: 1 }, style]} accessible accessibilityLabel={`${label} ${category}`}>{body}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${label} ${category}`} scaleTo={0.97} style={[{ flex: 1 }, style]}>
      {body}
    </PressableScale>
  );
}

// ── StatsRow ─────────────────────────────────────────────────────────────────

/** Profile numbers with thin dividers: 128 Posts | 24.5K Followers | 312 Following. */
export function StatsRow({ items, style }: { items: readonly { value: number | string; label: string; onPress?: () => void }[]; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>
      {items.map((item, i) => {
        const text = typeof item.value === "number" ? compactNumber(item.value) : item.value;
        const cell = (
          <View style={{ alignItems: "center", paddingHorizontal: 16, minHeight: 44, justifyContent: "center" }}>
            <Txt style={{ fontFamily: font.heavy, fontSize: 17, lineHeight: 21, color: theme.ink }}>{text}</Txt>
            <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 15, color: theme.muted }}>{item.label}</Txt>
          </View>
        );
        return (
          <View key={item.label} style={{ flexDirection: "row", alignItems: "center" }}>
            {i > 0 ? <View style={{ width: 1, height: 30, backgroundColor: theme.border }} /> : null}
            {item.onPress ? (
              <PressableScale onPress={item.onPress} accessibilityLabel={`${text} ${item.label}`} scaleTo={0.95}>
                {cell}
              </PressableScale>
            ) : (
              <View accessible accessibilityLabel={`${text} ${item.label}`}>{cell}</View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── ProfileCategoryTile ──────────────────────────────────────────────────────

/** A tinted square tile with a big emoji and a label (profile categories: My Art, Daily Life, Gaming…). */
export function ProfileCategoryTile({ emoji, label, tone = "violet", count, onPress, style }: { emoji: string; label: string; tone?: Tone; count?: number; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const body = (
    <LinearGradient colors={toneWash(theme, tone)} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.catTile, { borderColor: theme.border }]}>
      <Txt style={{ fontSize: 22, lineHeight: 27 }}>{emoji}</Txt>
      <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 10.5, lineHeight: 13, color: theme.ink }}>{label}</Txt>
      {count !== undefined ? <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: theme.muted }}>{compactNumber(count)}</Txt> : null}
    </LinearGradient>
  );
  if (!onPress) return <View style={[{ flex: 1 }, style]}>{body}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={count !== undefined ? `${label}, ${count} posts` : label} scaleTo={0.94} style={[{ flex: 1 }, style]}>
      {body}
    </PressableScale>
  );
}

// ── ShowcaseBanner ───────────────────────────────────────────────────────────

type ShowcaseBannerProps = {
  /** `creator` = violet gradient with white text (Top Creator); `streak` = warm cream with orange title. */
  variant: "creator" | "streak";
  title: string;
  text?: string;
  /** Big emoji on the left (default 🏆 / 🔥). */
  emoji?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** The two profile showcase banners: the chosen top achievement and the streak. */
export function ShowcaseBanner({ variant, title, text, emoji, onPress, style }: ShowcaseBannerProps) {
  const theme = useTheme();
  const creator = variant === "creator";
  const titleColor = creator ? "#fff" : theme.toneText.orange;
  const body = (
    <LinearGradient
      colors={creator ? theme.gradTopCreator : theme.gradStreak}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[styles.banner, creator ? shadow.glow(theme.gradTopCreator[0], 0.25) : { borderWidth: 1, borderColor: theme.border }]}
    >
      <Txt style={{ fontSize: 26, lineHeight: 32 }}>{emoji ?? (creator ? "🏆" : "🔥")}</Txt>
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={2} style={{ fontFamily: font.heavy, fontSize: 13.5, lineHeight: 17, color: titleColor }}>{title}</Txt>
        {text ? <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 10.5, lineHeight: 13, color: creator ? "rgba(255,255,255,0.92)" : theme.text }}>{text}</Txt> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={titleColor} /> : null}
    </LinearGradient>
  );
  if (!onPress) return <View style={[{ flex: 1 }, style]}>{body}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${title}${text ? `. ${text}` : ""}`} scaleTo={0.97} style={[{ flex: 1 }, style]}>
      {body}
    </PressableScale>
  );
}

// ── DayStreakCard ────────────────────────────────────────────────────────────

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

type DayStreakCardProps = {
  days: number;
  /** Monday → Sunday of this week: true = checked in. */
  week: readonly boolean[];
  checkedInToday?: boolean;
  /** Tapping the card checks in when not done today … */
  onCheckIn?: () => void;
  /** … otherwise opens the streak details. */
  onPress?: () => void;
  busy?: boolean;
  title?: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
};

/** Home "Daily Streak": fire, "7 days", "Keep going!", and the week's seven day circles (done = orange check). */
export function DayStreakCard({ days, week, checkedInToday, onCheckIn, onPress, busy, title = "Daily Streak", subtitle = "Keep going!", style }: DayStreakCardProps) {
  const theme = useTheme();
  const action = !checkedInToday && onCheckIn ? onCheckIn : onPress;
  const label = `${title}: ${days} ${days === 1 ? "day" : "days"}. ${!checkedInToday && onCheckIn ? "Tap to check in today." : subtitle}`;
  return (
    <PressableScale onPress={action} disabled={busy || !action} accessibilityLabel={label} scaleTo={0.97} style={[{ flex: 1 }, style]}>
      <LinearGradient colors={theme.gradStreak} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.streak, { borderColor: theme.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Txt style={{ fontSize: 34, lineHeight: 40 }}>🔥</Txt>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: theme.toneText.orange }}>{title}</Txt>
            <Txt style={{ fontFamily: font.heavy, fontSize: 21, lineHeight: 25, color: theme.toneText.orange }}>{`${days} ${days === 1 ? "day" : "days"}`}</Txt>
            <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: theme.toneText.orange }}>{!checkedInToday && onCheckIn ? "Tap to check in" : subtitle}</Txt>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.toneText.orange} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          {DAY_LETTERS.map((d, i) => {
            const done = !!week[i];
            return (
              <View key={i} style={{ alignItems: "center", gap: 3 }}>
                <View style={[styles.day, done ? { backgroundColor: theme.orange } : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}>
                  {done ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
                </View>
                <Txt style={{ fontFamily: font.semibold, fontSize: 9.5, lineHeight: 12, color: theme.muted }}>{d}</Txt>
              </View>
            );
          })}
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

// ── EventCard ────────────────────────────────────────────────────────────────

type EventCardProps = {
  title: string;
  /** e.g. "Today at 8:00 PM". */
  when: string;
  image?: Src;
  hue?: number;
  faces?: Person[];
  going: number;
  /** You already RSVP'd. */
  joined?: boolean;
  onJoin: () => void;
  onPress?: () => void;
  busy?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/** Home "📅 Live Event" card: title, time, picture, attendee faces, "1.3K going" and a `gradPrimary` "Join Event". */
export function EventCard({ title, when, image, hue = 320, faces = [], going, joined, onJoin, onPress, busy, label = "Live Event", style }: EventCardProps) {
  const theme = useTheme();
  const wash: Gradient = theme.dark ? [theme.tints.pink, theme.tints.violet] : ["#FFF0F7", "#F5F0FF"];
  return (
    <PressableScale onPress={onPress} disabled={!onPress} accessibilityLabel={`${label}: ${title}, ${when}`} scaleTo={0.98} style={[{ flex: 1 }, style]}>
      <LinearGradient colors={wash} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.event, { borderColor: theme.border }]}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="calendar" size={16} color={theme.pink} />
              <Txt style={{ fontFamily: font.bold, fontSize: 12, lineHeight: 16, color: theme.toneText.pink }}>{label}</Txt>
            </View>
            <Txt numberOfLines={2} style={{ fontFamily: font.heavy, fontSize: 12.5, lineHeight: 16, color: theme.ink, marginTop: 2 }}>{title}</Txt>
            <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>{when}</Txt>
          </View>
          <Picture source={image} hue={hue} icon="calendar" radius={10} style={{ width: 50, height: 46 }} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 6 }}>
          <AvatarStack people={faces} size={15} max={3} label={`${compactNumber(going)} going`} />
          <GradientButton label={joined ? "Going" : "Join Event"} icon={joined ? "checkmark" : undefined} onPress={onJoin} size="sm" busy={busy} accessibilityLabel={joined ? `Going to ${title}` : `Join ${title}`} />
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

// ── CreatorCard ──────────────────────────────────────────────────────────────

type CreatorCardProps = {
  person: Person;
  /** Shown name (defaults to `person.name`). */
  name?: string;
  /** e.g. "Digital Artist". */
  headline?: string;
  verified?: boolean;
  following?: boolean;
  /** Position in the row: picks the Follow colour (violet, blue, pink, green, orange). */
  index?: number;
  onFollow: () => void;
  onPress: () => void;
  busy?: boolean;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
};

/** A "Featured Creators" card: avatar on the left, name + verified tick, headline, coloured Follow pill. */
export function CreatorCard({ person, name, headline, verified, following, index = 0, onFollow, onPress, busy, width, style }: CreatorCardProps) {
  const theme = useTheme();
  const twoAndHalf = useColumnWidth(3) + 18;
  const shown = name ?? person.name;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${shown}${verified ? ", verified" : ""}${headline ? `, ${headline}` : ""}`}
      scaleTo={0.97}
      style={[{ width: width ?? twoAndHalf, flexDirection: "row", alignItems: "center", gap: 7, padding: 7, backgroundColor: theme.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: theme.border }, shadow.card, style]}
    >
      <PersonAvatar person={person} size={38} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 12, lineHeight: 15, color: theme.ink, flexShrink: 1 }}>{shown}</Txt>
          {verified ? <VerifiedTick size={12} /> : null}
        </View>
        {headline ? <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 10.5, lineHeight: 13, color: theme.muted }}>{headline}</Txt> : null}
        <JoinButton joined={following} onPress={onFollow} index={index} label="Follow" joinedLabel="Following" size="xs" full busy={busy} accessibilityLabel={following ? `Unfollow ${shown}` : `Follow ${shown}`} style={{ marginTop: 4 }} />
      </View>
    </PressableScale>
  );
}

// ── LiveRoomCard ─────────────────────────────────────────────────────────────

type LiveRoomCardProps = {
  title: string;
  subtitle?: string;
  /** Category label on the cover ("Music", "Gaming", "Just Chatting"). */
  topic?: string;
  cover?: Src;
  hue?: number;
  /** People listening now. */
  liveCount: number;
  faces?: Person[];
  /** Shown as "+45" after the faces. */
  extra?: number;
  /** Position in the row: picks the Join colour. */
  index?: number;
  color?: string;
  /** Icon on the Join button (headset, game-controller, color-palette, people…). */
  icon?: IconName;
  onJoin: () => void;
  onPress?: () => void;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
};

/** "Live Rooms Now" card: cover with LIVE + listener count + topic, title, subtitle, faces "+45", coloured Join. */
export function LiveRoomCard({ title, subtitle, topic, cover, hue = 280, liveCount, faces = [], extra, index = 0, color, icon = "headset", onJoin, onPress, width, style }: LiveRoomCardProps) {
  const theme = useTheme();
  const fourUp = useColumnWidth(4);
  const fill = color ?? joinColor(index);
  return (
    <PressableScale
      onPress={onPress ?? onJoin}
      accessibilityLabel={`Live room ${title}, ${compactNumber(liveCount)} listening`}
      scaleTo={0.97}
      style={[{ width: width ?? fourUp, backgroundColor: theme.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: theme.border, overflow: "hidden" }, shadow.card, style]}
    >
      <Picture source={cover} hue={hue} icon="radio" style={{ width: "100%", aspectRatio: 1.16 }}>
        <View style={{ position: "absolute", left: 5, top: 5, flexDirection: "row", gap: 3 }}>
          <LiveBadge />
          <CountPill value={liveCount} icon="person" />
        </View>
        {topic ? (
          <View style={{ position: "absolute", left: 5, bottom: 5, backgroundColor: "rgba(15,11,42,0.55)", borderRadius: radius.pill, paddingHorizontal: 7, height: 17, justifyContent: "center" }}>
            <Txt numberOfLines={1} style={{ color: "#fff", fontFamily: font.semibold, fontSize: 9.5, lineHeight: 12 }}>{topic}</Txt>
          </View>
        ) : null}
      </Picture>
      <View style={{ padding: 6, gap: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 11.5, lineHeight: 15, color: theme.ink }}>{title}</Txt>
        {subtitle ? <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 9.5, lineHeight: 12, color: theme.muted }}>{subtitle}</Txt> : null}
        <AvatarStack people={faces} size={15} max={4} extra={extra} style={{ marginTop: 5 }} />
        <JoinButton onPress={onJoin} color={fill} icon={icon} size="sm" full accessibilityLabel={`Join ${title}`} style={{ marginTop: 6, height: 25 }} />
      </View>
    </PressableScale>
  );
}

// ── InterestTile ─────────────────────────────────────────────────────────────

type InterestTileProps = {
  label: string;
  emoji: string;
  /** Artwork (e.g. `interestArt.anime`). */
  image?: Src;
  hue?: number;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Onboarding interest tile: picture on top, white label row with emoji; selected = glowing pink-violet ring + check. */
export function InterestTile({ label, emoji, image, hue = 270, selected, onPress, style }: InterestTileProps) {
  const theme = useTheme();
  const ring = theme.dark ? "#E879F9" : "#D946EF";
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      scaleTo={0.95}
      style={[
        { flex: 1, borderRadius: radius.tile, backgroundColor: theme.surface, borderWidth: 2, borderColor: selected ? ring : theme.border, overflow: "hidden" },
        selected ? { boxShadow: `0px 0px 12px ${withAlpha("#C026D3", 0.35)}` } : shadow.card,
        style,
      ]}
    >
      <Picture source={image} hue={hue} emoji={emoji} style={{ width: "100%", aspectRatio: 1.3 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 7, height: 31 }}>
        <Txt style={{ fontSize: 14, lineHeight: 18 }}>{emoji}</Txt>
        <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 12, lineHeight: 15, color: theme.ink, flexShrink: 1 }}>{label}</Txt>
      </View>
      {selected ? (
        <View style={[styles.check, { backgroundColor: theme.violet, borderColor: "#fff" }]}>
          <Ionicons name="checkmark" size={12} color="#fff" />
        </View>
      ) : null}
    </PressableScale>
  );
}

// ── PostTile ─────────────────────────────────────────────────────────────────

type PostTileProps = {
  title: string;
  /** Short preview text (Profile "Recent Posts"). */
  text?: string;
  image?: Src;
  hue?: number;
  likes: number;
  comments: number;
  /** Author row (Community "Featured Posts"). */
  author?: Person;
  verified?: boolean;
  /** e.g. "3h ago". */
  time?: string;
  /** Red "★ Pinned" badge on the picture. */
  pinned?: boolean;
  /** Small dark icon square on the picture ("image-outline", "videocam-outline"). */
  kindIcon?: IconName;
  onPress: () => void;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
};

/** A post card with a picture on top: Featured Posts (community) and Recent Posts (profile). */
export function PostTile({ title, text, image, hue = 250, likes, comments, author, verified, time, pinned, kindIcon, onPress, width, style }: PostTileProps) {
  const theme = useTheme();
  const threeUp = useColumnWidth(3);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${title}${author ? ` by ${author.name}` : ""}, ${compactNumber(likes)} likes, ${compactNumber(comments)} comments`}
      scaleTo={0.97}
      style={[{ width: width ?? threeUp, backgroundColor: theme.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: theme.border, overflow: "hidden" }, shadow.card, style]}
    >
      <Picture source={image} hue={hue} icon="image-outline" style={{ width: "100%", aspectRatio: 1.9 }}>
        {pinned ? (
          <View style={{ position: "absolute", left: 6, top: 6, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.red, borderRadius: radius.pill, paddingHorizontal: 7, height: 18 }}>
            <Ionicons name="star" size={9} color="#fff" />
            <Txt style={{ color: "#fff", fontFamily: font.bold, fontSize: 10, lineHeight: 13 }}>Pinned</Txt>
          </View>
        ) : null}
        {kindIcon ? (
          <View style={{ position: "absolute", left: 6, top: 6, width: 22, height: 22, borderRadius: 6, backgroundColor: "rgba(15,11,42,0.62)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={kindIcon} size={13} color="#fff" />
          </View>
        ) : null}
      </Picture>
      <View style={{ padding: 8, gap: 2 }}>
        <Txt numberOfLines={2} style={{ fontFamily: font.heavy, fontSize: 11.5, lineHeight: 15, color: theme.ink }}>{title}</Txt>
        {text ? <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 10.5, lineHeight: 13, color: theme.muted }}>{text}</Txt> : null}
        {author ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            <PersonAvatar person={author} size={22} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 10.5, lineHeight: 13, color: theme.ink, flexShrink: 1 }}>{author.name}</Txt>
                {verified ? <VerifiedTick size={11} /> : null}
              </View>
              {time ? <Txt style={{ fontFamily: font.regular, fontSize: 10, lineHeight: 13, color: theme.subtle }}>{time}</Txt> : null}
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons name="heart" size={15} color={theme.pink} />
            <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: theme.text }}>{compactNumber(likes)}</Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons name="chatbubble-outline" size={14} color={theme.text} />
            <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: theme.text }}>{compactNumber(comments)}</Txt>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  stat: { borderRadius: radius.tile, padding: 9, borderWidth: 1, minHeight: 66, justifyContent: "center" },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  catTile: { borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6, paddingHorizontal: 2, gap: 1, minHeight: 50 },
  banner: { borderRadius: radius.tile, padding: 9, flexDirection: "row", alignItems: "center", gap: 7, minHeight: 52 },
  streak: { borderRadius: radius.tile, padding: 9, borderWidth: 1 },
  day: { width: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  event: { borderRadius: radius.tile, padding: 9, borderWidth: 1 },
  check: { position: "absolute", right: 5, top: 5, width: 21, height: 21, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2 },
});
