import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, radius, useTheme, withAlpha } from "@/theme";
import { PressableScale, Txt } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import { LiveBadge, VerifiedTick } from "./Badges";
import { AvatarStack, GradientButton, JoinButton } from "./Buttons";
import { PersonAvatar } from "./PersonAvatar";
import { Picture } from "./Picture";
import type { IconName, Person, Src } from "./types";

// ── MessageRow ───────────────────────────────────────────────────────────────

type MessageRowProps = {
  person: Person;
  /** Chat name (person or group). */
  title: string;
  verified?: boolean;
  /** Presence dot: true = green, false = grey, leave out for none (groups). */
  online?: boolean;
  /** Last message text. */
  preview: string;
  /** Bold prefix before the preview: "You:", "Alex:". */
  previewAuthor?: string;
  /** Small icon before the preview (e.g. "image-outline" for "Sent a photo", "mic-outline"). */
  previewIcon?: IconName;
  /** Short time ("2m", "1h"; see `shortTimeAgo`). */
  time: string;
  unread?: number;
  muted?: boolean;
  /** Small pin after the name (chats pinned to the top). */
  pinned?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** Hairline under the row (default on). */
  divider?: boolean;
};

/** A chat list row: avatar + presence dot, name (+ tick), last message, time, red unread count, chevron. */
export function MessageRow({ person, title, verified, online, preview, previewAuthor, previewIcon, time, unread = 0, muted, pinned, onPress, onLongPress, divider = true }: MessageRowProps) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`${title}${unread ? `, ${unread} unread` : ""}. ${previewAuthor ? `${previewAuthor} ` : ""}${preview}. ${time}`}
      scaleTo={0.98}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, minHeight: 50 }}
    >
      <PersonAvatar person={person} size={40} online={online} />
      <View style={[{ flex: 1, gap: 2, alignSelf: "stretch", justifyContent: "center" }, divider && { borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 6, marginBottom: -6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14, lineHeight: 18, color: theme.ink, flexShrink: 1 }}>{title}</Txt>
            {verified ? <VerifiedTick size={13} /> : null}
            {muted ? <Ionicons name="notifications-off-outline" size={13} color={theme.subtle} /> : null}
            {pinned ? <Ionicons name="pin" size={12} color={theme.subtle} accessibilityLabel="Pinned" /> : null}
          </View>
          <Txt style={{ fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>{time}</Txt>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 5 }}>
            {previewIcon ? <Ionicons name={previewIcon} size={14} color={theme.muted} /> : null}
            <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: theme.muted, flexShrink: 1 }}>
              {previewAuthor ? <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, color: theme.text }}>{`${previewAuthor} `}</Txt> : null}
              {preview}
            </Txt>
          </View>
          {unread > 0 ? (
            <View style={[styles.count, { backgroundColor: theme.red }]}>
              <Txt style={{ color: "#fff", fontFamily: font.bold, fontSize: 10, lineHeight: 13 }}>{unread > 99 ? "99+" : unread}</Txt>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.subtle} />
    </PressableScale>
  );
}

// ── NotificationRow ──────────────────────────────────────────────────────────

/** What kind of notification: picks the small badge on the avatar. */
export type NotificationKind = "like" | "comment" | "follow" | "mention" | "community" | "live" | "event" | "other";

type NotificationAction = {
  label: string;
  onPress: () => void;
  /** `gradient` = gradPrimary pill (Follow Back); `solid` = a Join colour (Join). */
  style?: "gradient" | "solid";
  /** For `solid`: the colour (or `index` into the Join cycle). */
  color?: string;
  index?: number;
  busy?: boolean;
  /** Already done (e.g. followed back): shows the lighter "done" state. */
  done?: boolean;
  doneLabel?: string;
};

type NotificationRowProps = {
  kind: NotificationKind;
  /** Who did it (no actor = an icon circle is shown, e.g. event reminders). */
  actor?: Person;
  /** Bold first words: the actor's name, or a title such as "Reminder: Community Talent Show". */
  name: string;
  /** The rest of the sentence: "liked your drawing". */
  text?: string;
  /** Violet words after the text ("Late Night Vibes" in "ZenTales is live in …"). */
  highlight?: string;
  /** Put `text` on its own line under the name (like "Mika / liked your drawing"). */
  stacked?: boolean;
  /** A grey line such as "Digital Artist · 24.5K followers". */
  meta?: string;
  /** A quote from the comment / post, shown in quotes. */
  snippet?: string;
  /** Member faces + label (invites: "98K members"). */
  faces?: Person[];
  facesLabel?: string;
  /** "2m ago". */
  time: string;
  /** A picture on the right (post, community, room). */
  thumb?: Src;
  thumbHue?: number;
  action?: NotificationAction;
  unread?: boolean;
  /** A ">" on the right (live rooms, events). */
  chevron?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const KIND_BADGE: Record<Exclude<NotificationKind, "live" | "event">, { icon: IconName; color: "pink" | "blue" | "violet" | "orange" }> = {
  like: { icon: "heart", color: "pink" },
  comment: { icon: "chatbubble-ellipses", color: "blue" },
  follow: { icon: "person-add", color: "violet" },
  mention: { icon: "at", color: "orange" },
  community: { icon: "people", color: "violet" },
  other: { icon: "notifications", color: "violet" },
};

/**
 * One notification: avatar with a coloured type badge (or an icon circle for events), bold name + text,
 * optional quote / faces / meta, time, and on the right a thumbnail, an action button and the pink unread dot.
 */
export function NotificationRow({ kind, actor, name, text, highlight, stacked, meta, snippet, faces, facesLabel, time, thumb, thumbHue, action, unread, chevron, onPress, style }: NotificationRowProps) {
  const theme = useTheme();
  const bg = unread ? (theme.dark ? withAlpha("#7C3AED", 0.12) : "#FCF9FF") : theme.surface;
  const badge = kind === "live" || kind === "event" ? null : KIND_BADGE[kind];
  const sentence = `${name}${text ? ` ${text}` : ""}${highlight ? ` ${highlight}` : ""}`;

  const left = actor ? (
    <View style={{ width: 46, height: 46 }}>
      <PersonAvatar person={actor} size={45} />
      {badge ? (
        <View style={[styles.kindBadge, { backgroundColor: theme[badge.color], borderColor: theme.surface }]}>
          <Ionicons name={badge.icon} size={11} color="#fff" />
        </View>
      ) : null}
      {kind === "live" ? <LiveBadge icon="radio" style={{ position: "absolute", bottom: -4, left: -5 }} /> : null}
    </View>
  ) : (
    <View style={[styles.iconCircle, { backgroundColor: kind === "event" ? theme.tints.pink : theme.tints.violet }]}>
      <Ionicons name={kind === "event" ? "calendar" : badge?.icon ?? "notifications"} size={22} color={kind === "event" ? theme.pink : theme.violet} />
    </View>
  );

  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={`${unread ? "Unread. " : ""}${sentence}. ${snippet ? `"${snippet}". ` : ""}${time}`}
      scaleTo={0.98}
      style={[{ flexDirection: "row", alignItems: "center", gap: 10, padding: 9, borderRadius: radius.tile, backgroundColor: bg, borderWidth: 1, borderColor: theme.border }, style]}
    >
      {left}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: theme.text }}>
          <Txt style={{ fontFamily: font.heavy, fontSize: 13, color: theme.ink }}>{name}</Txt>
          {text ? (stacked ? `\n${text}` : ` ${text}`) : null}
          {highlight ? <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, color: theme.accent }}>{` ${highlight}`}</Txt> : null}
        </Txt>
        {meta ? <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>{meta}</Txt> : null}
        {snippet ? <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.text }}>{`"${snippet}"`}</Txt> : null}
        {faces?.length ? <AvatarStack people={faces} size={19} max={4} label={facesLabel} style={{ marginVertical: 2 }} /> : null}
        <Txt style={{ fontFamily: font.regular, fontSize: 11, lineHeight: 14, color: theme.subtle }}>{time}</Txt>
      </View>
      {thumb !== undefined && thumb !== null ? <Picture source={thumb} hue={thumbHue} icon="image-outline" radius={8} style={{ width: 74, height: 46 }} /> : null}
      {action ? (
        action.style === "solid" ? (
          <JoinButton label={action.label} joinedLabel={action.doneLabel ?? action.label} joined={action.done} onPress={action.onPress} color={action.color} index={action.index} busy={action.busy} size="sm" style={{ alignSelf: "center" }} />
        ) : (
          <GradientButton label={action.done ? action.doneLabel ?? action.label : action.label} onPress={action.onPress} size="sm" busy={action.busy} disabled={action.done} style={{ alignSelf: "center" }} />
        )
      ) : null}
      {unread ? <View accessibilityLabel="Unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.red }} /> : null}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={theme.subtle} /> : null}
    </PressableScale>
  );
}

// ── CommentRow ───────────────────────────────────────────────────────────────

type CommentRowProps = {
  person: Person;
  name?: string;
  verified?: boolean;
  time: string;
  text: string;
  likes: number;
  liked?: boolean;
  onLike: () => void;
  /** ⋯ menu (report / delete). */
  onMore?: () => void;
  onPressAuthor?: () => void;
};

/** A comment: avatar, name + time, text; heart + count and ⋯ on the right. */
export function CommentRow({ person, name, verified, time, text, likes, liked, onLike, onMore, onPressAuthor }: CommentRowProps) {
  const theme = useTheme();
  const shown = name ?? person.name;
  const avatar = <PersonAvatar person={person} size={40} />;
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 5 }}>
      {onPressAuthor ? (
        <PressableScale onPress={onPressAuthor} accessibilityLabel={`${shown}'s profile`} scaleTo={0.92}>
          {avatar}
        </PressableScale>
      ) : (
        avatar
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 13, lineHeight: 17, color: theme.ink, flexShrink: 1 }}>{shown}</Txt>
          {verified ? <VerifiedTick size={12} /> : null}
          <Txt style={{ fontFamily: font.regular, fontSize: 11, lineHeight: 15, color: theme.subtle }}>{time}</Txt>
        </View>
        <Txt style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: theme.text }}>{text}</Txt>
      </View>
      <PressableScale onPress={onLike} accessibilityLabel={liked ? `Unlike comment, ${likes} likes` : `Like comment, ${likes} likes`} accessibilityState={{ selected: !!liked }} hitSlop={8} scaleTo={0.85} style={{ flexDirection: "row", alignItems: "flex-start", gap: 4, paddingTop: 2, minWidth: 44 }}>
        <Ionicons name={liked ? "heart" : "heart-outline"} size={16} color={liked ? theme.pink : theme.muted} />
        <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 16, color: theme.muted }}>{compactNumber(likes)}</Txt>
      </PressableScale>
      {onMore ? (
        <PressableScale onPress={onMore} accessibilityLabel="Comment options" hitSlop={12} scaleTo={0.85} style={{ paddingTop: 2 }}>
          <Ionicons name="ellipsis-vertical" size={14} color={theme.muted} />
        </PressableScale>
      ) : null}
    </View>
  );
}

// ── CommentBar ───────────────────────────────────────────────────────────────

type CommentBarProps = {
  /** The viewer (small avatar on the left). */
  me?: Person;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending?: boolean;
  onPickImage?: () => void;
  onEmoji?: () => void;
  placeholder?: string;
  /** Add the phone's bottom safe area under the bar (when it sits at the very bottom of the screen). */
  safeArea?: boolean;
  disabled?: boolean;
};

/** The sticky "Add a comment…" bar: own avatar, rounded input with picture + emoji buttons, violet send circle. */
export function CommentBar({ me, value, onChangeText, onSend, sending, onPickImage, onEmoji, placeholder = "Add a comment…", safeArea, disabled }: CommentBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const canSend = !!value.trim() && !sending && !disabled;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 7, paddingBottom: 7 + (safeArea ? insets.bottom : 0), backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border }}>
      {me ? <PersonAvatar person={me} size={30} /> : null}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: theme.surfaceAlt, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 4, minHeight: 38 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.subtle}
          accessibilityLabel="Comment"
          editable={!disabled}
          multiline
          maxLength={2000}
          selectionColor={theme.accent}
          style={{ flex: 1, fontFamily: font.regular, fontSize: 14, color: theme.ink, paddingVertical: 8, maxHeight: 110, outlineWidth: 0 }}
        />
        {onPickImage ? (
          <PressableScale onPress={onPickImage} accessibilityLabel="Add a picture" hitSlop={6} scaleTo={0.85} style={styles.barIcon}>
            <Ionicons name="image-outline" size={19} color={theme.muted} />
          </PressableScale>
        ) : null}
        {onEmoji ? (
          <PressableScale onPress={onEmoji} accessibilityLabel="Add an emoji" hitSlop={6} scaleTo={0.85} style={styles.barIcon}>
            <Ionicons name="happy-outline" size={20} color={theme.muted} />
          </PressableScale>
        ) : null}
      </View>
      <PressableScale onPress={onSend} disabled={!canSend} accessibilityLabel="Send comment" hitSlop={5} scaleTo={0.88} style={[styles.send, { backgroundColor: theme.violet, opacity: canSend || sending ? 1 : 0.5 }]}>
        {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={19} color="#fff" />}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  count: { minWidth: 20, height: 17, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  kindBadge: { position: "absolute", right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  iconCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  barIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
