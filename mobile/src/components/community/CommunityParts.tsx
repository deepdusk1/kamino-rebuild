import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import type { HallEvent, LiveRoomCard, MediaItem, ModeratorRow, Post } from "@/api/types";
import { AvatarStack, EmptyHint, GradientButton, JoinButton, LiveBadge, Picture, Pill, PersonAvatar, VerifiedTick, personFromChip, type IconName } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { compactNumber, plainPreview, timeAgo } from "@/lib/format";
import { font, radius, shadow, useTheme } from "@/theme";
import { postTypeMeta, topicStyle } from "./helpers";
import { serverImage } from "./media";

// ── Topic chips ──────────────────────────────────────────────────────────────

/** The community's topics as tinted emoji chips (Anime, Manga, Fan Art…). Leaders get an "Edit" chip. */
export function TopicChips({ topics, onPress, onEdit }: { topics: string[]; onPress: (topic: string) => void; onEdit?: () => void }) {
  const theme = useTheme();
  if (!topics.length && !onEdit) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingVertical: 2 }}>
      {topics.map((t, i) => {
        const s = topicStyle(t, i);
        return <Pill key={t} label={t} emoji={s.emoji} tone={s.tone} size="md" onPress={() => onPress(t)} accessibilityLabel={`Topic ${t}`} />;
      })}
      {onEdit ? (
        <PressableScale onPress={onEdit} accessibilityLabel={topics.length ? "Edit topics" : "Add topics"} hitSlop={10} scaleTo={0.94} style={{ height: 25, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.accent, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name={topics.length ? "pencil" : "add"} size={12} color={theme.accent} />
          <Txt style={{ fontFamily: font.semibold, fontSize: 12, color: theme.accent }}>{topics.length ? "Edit" : "Add topics"}</Txt>
        </PressableScale>
      ) : null}
    </ScrollView>
  );
}

// ── Moderators ───────────────────────────────────────────────────────────────

const BADGE: Record<ModeratorRow["badge"], { icon: IconName; color: "orange" | "blue" | "violet"; small: IconName }> = {
  leader: { icon: "ribbon", color: "orange", small: "ribbon" },
  coleader: { icon: "star", color: "blue", small: "star" },
  moderator: { icon: "shield-checkmark", color: "violet", small: "shield" },
};

/** Moderator faces with a role badge (leader / co-leader / moderator), name and role. */
export function ModeratorsRow({ moderators }: { moderators: ModeratorRow[] }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}>
      {moderators.map((m) => {
        const b = BADGE[m.badge];
        return (
          <PressableScale key={m.userId} onPress={() => router.push(`/profile/${m.handle}`)} accessibilityLabel={`${m.nickname}, ${m.label}`} scaleTo={0.94} style={{ width: 78, alignItems: "center", gap: 3 }}>
            <View>
              <PersonAvatar person={{ name: m.nickname, hue: m.avatarHue, userId: m.userId, avatarV: m.avatarV }} size={50} outline={2} />
              <View style={{ position: "absolute", right: -3, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: theme[b.color], borderWidth: 2, borderColor: theme.surface, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={b.icon} size={10} color="#fff" />
              </View>
            </View>
            <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 12, lineHeight: 16, color: theme.ink, marginTop: 2 }}>{m.nickname}</Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name={b.small} size={10} color={theme[b.color]} />
              <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 10.5, lineHeight: 13, color: theme.muted }}>{m.label}</Txt>
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

// ── Recent post row ──────────────────────────────────────────────────────────

/** A compact post row: avatar, name + tick, type pill, time, title, one line of text, picture, ⋯. */
export function RecentPostRow({ post, slug, onMore }: { post: Post; slug: string; onMore: () => void }) {
  const theme = useTheme();
  const meta = postTypeMeta(post.type);
  const preview = post.contentWarning ? `Content warning: ${post.contentWarning}` : plainPreview(post.body);
  return (
    <PressableScale
      onPress={() => router.push(`/community/${slug}/post/${post.id}`)}
      accessibilityLabel={`${post.title}, by ${post.author.nickname}, ${timeAgo(post.createdAt)}`}
      scaleTo={0.98}
      style={[{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, paddingRight: 30, backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border }, shadow.card]}
    >
      <PersonAvatar person={personFromChip(post.author)} size={42} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 13.5, lineHeight: 17, color: theme.ink, flexShrink: 1 }}>{post.author.nickname}</Txt>
          {post.authorVerified ? <VerifiedTick size={12} /> : null}
          <Pill label={post.announcement ? "Announcement" : meta.label} tone={post.announcement ? "blue" : meta.tone} style={{ height: 19, paddingHorizontal: 7 }} />
          <Txt style={{ fontFamily: font.regular, fontSize: 11, color: theme.subtle }}>{timeAgo(post.createdAt)}</Txt>
        </View>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 13.5, lineHeight: 18, color: theme.ink }}>{post.title}</Txt>
        {preview ? <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>{preview}</Txt> : null}
      </View>
      {post.cover && !post.contentWarning ? <Picture source={serverImage(post.cover)} hue={post.author.hue} icon="image-outline" radius={12} style={{ width: 84, height: 52 }} /> : null}
      <PressableScale onPress={onMore} accessibilityLabel={`Options for ${post.title}`} hitSlop={12} scaleTo={0.85} style={{ position: "absolute", top: 4, right: 4, width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="ellipsis-horizontal" size={17} color={theme.muted} />
      </PressableScale>
    </PressableScale>
  );
}

// ── Rooms tab ────────────────────────────────────────────────────────────────

/** The community's chat and live rooms; members can start a live room. */
export function RoomsPanel({ slug, rooms, canStart, onStart }: { slug: string; rooms: LiveRoomCard[]; canStart: boolean; onStart: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10, paddingHorizontal: 16 }}>
      {rooms.length ? (
        rooms.map((room) => {
          const live = room.kind === "voice" || room.kind === "screening";
          const open = () => router.push(`/chat/${room.roomId}`);
          return (
            <PressableScale key={room.roomId} onPress={open} accessibilityLabel={`${live ? "Live room" : "Chat room"} ${room.title}`} scaleTo={0.98} style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
              <Picture source={serverImage(room.cover)} hue={250} icon={live ? "radio" : "chatbubbles"} radius={14} style={{ width: 58, height: 58 }}>
                {live && room.liveCount > 0 ? <LiveBadge style={{ position: "absolute", left: 3, top: 3 }} /> : null}
              </Picture>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14.5, color: theme.ink }}>{live ? room.title : `# ${room.title}`}</Txt>
                <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>{live ? `${room.topic || "Live room"} · ${compactNumber(room.liveCount)} here now` : room.subtitle || "Chat room"}</Txt>
                <AvatarStack people={room.faces.map(personFromChip)} size={17} max={4} style={{ marginTop: 2 }} />
              </View>
              <JoinButton color={room.color} icon={live ? "headset" : "chatbubble-ellipses"} label={live ? "Join" : "Open"} size="md" onPress={open} accessibilityLabel={`Open ${room.title}`} />
            </PressableScale>
          );
        })
      ) : (
        <EmptyHint emoji="🎧" title="No rooms yet" text="Start a live room and invite everyone to hang out." />
      )}
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {canStart ? <GradientButton label="Start a live room" icon="mic" onPress={onStart} size="md" /> : null}
        <PressableScale onPress={() => router.push(`/community/${slug}/chats`)} accessibilityLabel="All chat rooms" hitSlop={6} scaleTo={0.95} style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: 6 }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 14, color: theme.accent }}>All chat rooms ›</Txt>
        </PressableScale>
      </View>
    </View>
  );
}

// ── Events tab ───────────────────────────────────────────────────────────────

/** Upcoming events and challenges, with RSVP. Challenges (entries, winners) open the Events page. */
export function EventsPanel({ slug, events, canRsvp, busyId, onRsvp }: { slug: string; events: HallEvent[]; canRsvp: boolean; busyId: number | null; onRsvp: (e: HallEvent) => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10, paddingHorizontal: 16 }}>
      {events.length ? (
        events.map((e) => {
          const when = new Date(e.startsAt);
          return (
            <PressableScale key={e.id} onPress={() => router.push(`/community/${slug}/events`)} accessibilityLabel={`${e.kind === "challenge" ? "Challenge" : "Event"} ${e.title}`} scaleTo={0.98} style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
              <View style={{ width: 54, height: 58, borderRadius: 14, backgroundColor: e.kind === "challenge" ? theme.tints.orange : theme.tints.pink, alignItems: "center", justifyContent: "center" }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 11, color: e.kind === "challenge" ? theme.toneText.orange : theme.toneText.pink, textTransform: "uppercase" }}>{when.toLocaleDateString(undefined, { month: "short" })}</Txt>
                <Txt style={{ fontFamily: font.heavy, fontSize: 21, lineHeight: 25, color: e.kind === "challenge" ? theme.toneText.orange : theme.toneText.pink }}>{when.getDate()}</Txt>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {e.kind === "challenge" ? <Pill label="Challenge" icon="trophy" tone="orange" style={{ height: 19, paddingHorizontal: 7 }} /> : null}
                <Txt numberOfLines={2} style={{ fontFamily: font.heavy, fontSize: 14.5, lineHeight: 19, color: theme.ink }}>{e.title}</Txt>
                <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>
                  {when.toLocaleDateString(undefined, { weekday: "short" })} · {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {compactNumber(e.rsvpCount)} going
                </Txt>
              </View>
              {canRsvp && e.kind === "event" ? (
                e.going ? (
                  <JoinButton joined label="Going" joinedLabel="Going" color={theme.violet} size="md" busy={busyId === e.id} onPress={() => onRsvp(e)} accessibilityLabel={`Not going to ${e.title}`} />
                ) : (
                  <GradientButton label="Join" size="sm" busy={busyId === e.id} onPress={() => onRsvp(e)} accessibilityLabel={`Join ${e.title}`} />
                )
              ) : (
                <Ionicons name="chevron-forward" size={18} color={theme.subtle} />
              )}
            </PressableScale>
          );
        })
      ) : (
        <EmptyHint emoji="📅" title="No events coming up" text="Leaders can plan events and challenges here." />
      )}
      <PressableScale onPress={() => router.push(`/community/${slug}/events`)} accessibilityLabel="All events and challenges" hitSlop={6} scaleTo={0.95} style={{ minHeight: 36, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 6 }}>
        <Txt style={{ fontFamily: font.bold, fontSize: 14, color: theme.accent }}>All events and challenges ›</Txt>
      </PressableScale>
    </View>
  );
}

// ── Media tab ────────────────────────────────────────────────────────────────

/** Every picture posted in the community, three across; tap opens the post. */
export function MediaGrid({ slug, media, width }: { slug: string; media: MediaItem[]; width: number }) {
  const size = Math.floor((width - 32 - 12) / 3);
  if (!media.length) return <EmptyHint emoji="🖼️" title="No pictures yet" text="Pictures shared in posts will show up here." style={{ marginHorizontal: 16 }} />;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16 }}>
      {media.map((m) => (
        <PressableScale key={`${m.postId}-${m.index}`} onPress={() => router.push(`/community/${slug}/post/${m.postId}`)} accessibilityLabel="Open the post with this picture" scaleTo={0.95}>
          <Picture source={serverImage(m.url)} hue={260 + m.index * 15} icon="image-outline" radius={12} style={{ width: size, height: size }} />
        </PressableScale>
      ))}
    </View>
  );
}
