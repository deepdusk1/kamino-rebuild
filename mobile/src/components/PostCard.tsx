import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { Post } from "@/api/types";
import { cleanTag, postTypeMeta, tagLabel } from "@/components/community/helpers";
import { serverImage } from "@/components/community/media";
import { shareLink } from "@/components/community/platform";
import { CountPill, HashtagChips, Picture, Pill, PersonAvatar, VerifiedTick, personFromChip, type IconName } from "@/components/k";
import { compactNumber, plainPreview, timeAgo } from "@/lib/format";
import { usePostActions } from "@/lib/usePostActions";
import { font, radius, shadow, useTheme } from "@/theme";
import { LikeButton } from "./LikeButton";
import { Appear, PressableScale, Txt } from "./ui";

type Props = {
  post: Post & { communityName?: string };
  /** Show which community the post is from (feeds that mix communities). */
  showCommunity?: boolean;
  /** Position in a feed: cards float in one after another. */
  index?: number;
};

/**
 * A post in a feed (Home, Saved, Search, Profile…): author row with the post type, title, a short preview, the
 * picture (with "+4" when there are more), a few hashtags, and like / comment / share / save.
 */
export function PostCard({ post, showCommunity, index }: Props) {
  const theme = useTheme();
  const { liked, likeCount, saved, toggleLike, toggleSave } = usePostActions(post);
  const [revealed, setRevealed] = useState(!post.contentWarning);
  const open = () => router.push(`/community/${post.communityId}/post/${post.id}`);
  const meta = postTypeMeta(post.type);
  const extraPictures = post.payload.albumCount ?? 0;
  const preview = post.body ? plainPreview(post.body) : "";

  const card = (
    <PressableScale
      onPress={open}
      accessibilityLabel={`Open post: ${post.title}, by ${post.author.nickname}`}
      scaleTo={0.985}
      style={[{ backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, padding: 12, gap: 8 }, shadow.card]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <PressableScale onPress={() => router.push(`/profile/${post.author.handle}`)} accessibilityLabel={`Open ${post.author.nickname}'s profile`} scaleTo={0.9} hitSlop={4}>
          <PersonAvatar person={personFromChip(post.author)} size={38} />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14, lineHeight: 18, color: theme.ink, flexShrink: 1 }}>{post.author.nickname}</Txt>
            {post.authorVerified ? <VerifiedTick size={13} /> : null}
          </View>
          <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>
            {showCommunity && post.communityName ? (
              <Txt style={{ fontFamily: font.semibold, fontSize: 12, color: theme.accent }}>{`${post.communityName} · `}</Txt>
            ) : null}
            {post.scheduled && post.publishAt ? `Scheduled for ${new Date(post.publishAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : timeAgo(post.createdAt)}
          </Txt>
        </View>
        <Pill label={meta.label} tone={meta.tone} icon={meta.icon as IconName} />
      </View>

      {post.pinned || post.featured || post.announcement || post.visibility === "members" || post.originalPostId ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {post.pinned ? <Pill label="Pinned" icon="star" tone="red" variant="solid" /> : null}
          {post.announcement ? <Pill label="Announcement" emoji="📣" tone="blue" /> : null}
          {post.featured ? <Pill label="Featured" emoji="⭐" tone="orange" /> : null}
          {post.visibility === "members" ? <Pill label="Members only" icon="lock-closed" tone="neutral" /> : null}
          {post.originalPostId ? <Pill label="Repost" icon="repeat" tone="green" /> : null}
        </View>
      ) : null}

      <Txt numberOfLines={2} style={{ fontFamily: font.heavy, fontSize: 15.5, lineHeight: 21, color: theme.ink }}>{post.title}</Txt>

      {!revealed ? (
        <PressableScale onPress={() => setRevealed(true)} accessibilityLabel={`Content warning: ${post.contentWarning}. Show content`} scaleTo={0.98} style={{ backgroundColor: theme.tints.violet, borderRadius: radius.tile, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="eye-off-outline" size={20} color={theme.toneText.violet} />
          <View style={{ flex: 1 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 13, lineHeight: 17, color: theme.toneText.violet }}>Content warning: {post.contentWarning}</Txt>
            <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>Tap to show</Txt>
          </View>
        </PressableScale>
      ) : (
        <>
          {preview ? <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: theme.muted }}>{preview}</Txt> : null}
          {post.cover ? (
            <Picture source={serverImage(post.cover)} hue={post.author.hue} icon="image-outline" radius={radius.tile} style={{ width: "100%", aspectRatio: 1.75 }}>
              {extraPictures ? <CountPill value={`+${extraPictures}`} icon="images" style={{ position: "absolute", right: 8, top: 8, height: 20, paddingHorizontal: 7 }} /> : null}
            </Picture>
          ) : null}
        </>
      )}

      {post.hashtags.length ? (
        <HashtagChips tags={post.hashtags.slice(0, 3).map(tagLabel)} onPress={(t) => router.push({ pathname: "/explore", params: { q: `#${cleanTag(t)}` } })} />
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 18, paddingTop: 2 }}>
        <LikeButton liked={liked} count={compactNumber(likeCount)} onPress={() => void toggleLike()} size={20} />
        <Action icon="chatbubble-outline" label={compactNumber(post.commentCount)} onPress={open} a11y={`${post.commentCount} comments`} />
        <Action icon="arrow-redo-outline" onPress={() => void shareLink(post.title, `/c/${post.communityId}/p/${post.id}`)} a11y="Share" />
        <View style={{ flex: 1 }} />
        <Action icon={saved ? "bookmark" : "bookmark-outline"} color={saved ? theme.accent : undefined} onPress={() => void toggleSave()} a11y={saved ? "Remove from saved" : "Save"} />
      </View>
    </PressableScale>
  );
  return index === undefined ? card : <Appear index={index}>{card}</Appear>;
}

function Action({ icon, color, label, onPress, a11y }: { icon: IconName; color?: string; label?: string; onPress: () => void; a11y: string }) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} hitSlop={12} accessibilityLabel={a11y} scaleTo={0.85} style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 28 }}>
      <Ionicons name={icon} size={20} color={color ?? theme.muted} />
      {label ? <Txt style={{ fontFamily: font.semibold, fontSize: 13, lineHeight: 17, color: theme.text }}>{label}</Txt> : null}
    </PressableScale>
  );
}
