import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, View } from "react-native";
import { api } from "@/api/endpoints";
import type { Achievement, CommunityCardData, PersonRow } from "@/api/types";
import { AchievementTile } from "@/components/AchievementBanner";
import { postPictures } from "@/components/community/media";
import { EmptyHint, GradientButton, PersonAvatar, PostTile, TabsUnderline, VerifiedTick, useColumnWidth } from "@/components/k";
import { ErrorState, Loading, PressableScale, Txt } from "@/components/ui";
import { byCategory, toggleShowcase } from "@/lib/achievements";
import { showError } from "@/lib/errors";
import { compactNumber, plainPreview } from "@/lib/format";
import { font, radius, shadow, useTheme } from "@/theme";
import { FullSheet } from "./FullSheet";
import { CommunityTile } from "./ProfileParts";
import { postKindIcon } from "./helpers";

export type ListKind = "followers" | "following" | "friends";

// ── Followers / Following / Friends ─────────────────────────────────────────

/** The people lists behind the profile numbers, with a Friends tab (people who follow each other). */
export function FollowListSheet({ handle, kind, onKind, onClose, viewerId }: { handle: string; kind: ListKind | null; onKind: (k: ListKind) => void; onClose: () => void; viewerId?: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["followLists", handle, kind], queryFn: () => api.followLists(handle, kind!), enabled: !!kind });
  const counts = list.data?.counts;
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (person: PersonRow) => {
    setBusy(person.userId);
    try {
      await api.followProfile(person.userId);
      await queryClient.invalidateQueries({ queryKey: ["followLists", handle] });
      void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  const open = (person: PersonRow) => {
    onClose();
    router.push(`/profile/${person.handle}`);
  };

  const tab = (k: ListKind, label: string) => ({ key: k, label: counts ? `${label} ${compactNumber(counts[k])}` : label });

  return (
    <FullSheet
      visible={!!kind}
      title={`@${handle}`}
      onClose={onClose}
      header={<TabsUnderline tabs={[tab("followers", "Followers"), tab("following", "Following"), tab("friends", "Friends")]} value={kind ?? "followers"} onChange={(k) => onKind(k as ListKind)} style={{ marginHorizontal: 12 }} />}
    >
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.locked ? (
        <EmptyHint emoji="🔒" title="This account is private" text="Follow them to see who they follow." style={{ margin: 16 }} />
      ) : (
        <FlatList
          data={list.data.people}
          keyExtractor={(p) => p.userId}
          contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
          ListHeaderComponent={kind === "friends" ? <Txt style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: theme.muted, marginBottom: 4 }}>Friends are people who follow each other.</Txt> : null}
          ListEmptyComponent={
            <EmptyHint
              emoji={kind === "friends" ? "🤝" : "👋"}
              title={kind === "followers" ? "No followers yet" : kind === "following" ? "Not following anyone yet" : "No friends here yet"}
              text="When people connect, they show up here."
            />
          }
          renderItem={({ item }) => <PersonListRow person={item} self={item.userId === viewerId} busy={busy === item.userId} onPress={() => open(item)} onFollow={() => void toggle(item)} />}
        />
      )}
    </FullSheet>
  );
}

function PersonListRow({ person, self, busy, onPress, onFollow }: { person: PersonRow; self: boolean; busy: boolean; onPress: () => void; onFollow: () => void }) {
  const theme = useTheme();
  const label = person.following ? "Following" : person.requested ? "Requested" : person.followsYou ? "Follow Back" : "Follow";
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${person.displayName}, @${person.handle}${person.headline ? `, ${person.headline}` : ""}`}
      scaleTo={0.98}
      style={[{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.tile, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }, shadow.card]}
    >
      <PersonAvatar person={{ name: person.displayName, hue: person.avatarHue, userId: person.userId, avatarV: person.avatarV }} size={44} online={person.online || undefined} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14, lineHeight: 18, color: theme.ink, flexShrink: 1 }}>{person.displayName}</Txt>
          {person.verified ? <VerifiedTick size={13} /> : null}
        </View>
        <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>
          @{person.handle}
          {person.headline ? ` · ${person.headline}` : ""}
        </Txt>
      </View>
      {self ? null : person.following || person.requested ? (
        <PressableScale onPress={onFollow} disabled={busy} accessibilityLabel={person.following ? `Unfollow ${person.displayName}` : `Cancel request to ${person.displayName}`} hitSlop={8} scaleTo={0.94} style={{ height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: theme.tints.violet, alignItems: "center", justifyContent: "center" }}>
          {busy ? <ActivityIndicator size="small" color={theme.violet} /> : <Txt style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: theme.toneText.violet }}>{label}</Txt>}
        </PressableScale>
      ) : (
        <GradientButton label={label} size="sm" onPress={onFollow} busy={busy} accessibilityLabel={`${label} ${person.displayName}`} />
      )}
    </PressableScale>
  );
}

// ── A person's posts (category tiles, "See All") ────────────────────────────

/** A grid of someone's posts, all of them or only one profile category (`tag`). */
export function ProfilePostsSheet({ handle, open, tag, title, onClose }: { handle: string; open: boolean; tag?: string; title: string; onClose: () => void }) {
  const width = useColumnWidth(2, { inset: 12, gap: 8 });
  const posts = useInfiniteQuery({
    queryKey: ["profilePosts", handle, tag ?? ""],
    queryFn: ({ pageParam }) => api.profilePosts(handle, tag, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: open,
  });
  const items = posts.data?.pages.flatMap((p) => p.posts) ?? [];
  const locked = posts.data?.pages[0]?.locked;
  return (
    <FullSheet visible={open} title={title} subtitle={`@${handle}`} onClose={onClose}>
      {posts.isPending ? (
        <Loading />
      ) : posts.isError ? (
        <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />
      ) : locked ? (
        <EmptyHint emoji="🔒" title="This account is private" text="Follow them to see their posts." style={{ margin: 16 }} />
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(p) => String(p.id)}
          columnWrapperStyle={{ gap: 8 }}
          contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
          onEndReached={() => {
            if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
          }}
          ListFooterComponent={posts.isFetchingNextPage ? <Loading /> : null}
          ListEmptyComponent={<EmptyHint emoji="🗂️" title="No posts here yet" text={tag ? "Posts tagged for this category will show up here." : "Posts will show up here."} />}
          renderItem={({ item }) => (
            <PostTile
              title={item.title || plainPreview(item.body).slice(0, 60) || "Post"}
              text={plainPreview(item.body)}
              image={postPictures(item)[0] ?? null}
              hue={item.communityHue}
              likes={item.likeCount}
              comments={item.commentCount}
              kindIcon={postKindIcon(item.type)}
              width={width}
              onPress={() => {
                onClose();
                router.push(`/community/${item.communityId}/post/${item.id}`);
              }}
            />
          )}
        />
      )}
    </FullSheet>
  );
}

// ── All achievements ────────────────────────────────────────────────────────

/** Every achievement with progress. On your own profile the star picks up to three for your showcase. */
export function AchievementsSheet({
  open,
  achievements,
  showcase,
  isSelf,
  loading,
  onShowcase,
  onClose,
}: {
  open: boolean;
  achievements: Achievement[];
  showcase: string[];
  isSelf: boolean;
  loading: boolean;
  onShowcase: (ids: string[]) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [all, setAll] = useState(isSelf);
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const shown = all ? achievements : achievements.filter((a) => a.unlocked);
  return (
    <FullSheet
      visible={open}
      title="Achievements"
      subtitle={`${unlocked} of ${achievements.length} unlocked`}
      onClose={onClose}
      header={
        <TabsUnderline
          tabs={[
            { key: "unlocked", label: "Unlocked", icon: "ribbon-outline" },
            { key: "all", label: "All", icon: "grid-outline" },
          ]}
          value={all ? "all" : "unlocked"}
          onChange={(k) => setAll(k === "all")}
          style={{ marginHorizontal: 12 }}
        />
      }
    >
      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}>
          {isSelf ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 10, borderRadius: radius.tile, backgroundColor: theme.tints.violet }}>
              <Ionicons name="star" size={16} color={theme.violet} />
              <Txt style={{ flex: 1, fontFamily: font.semibold, fontSize: 12.5, lineHeight: 17, color: theme.toneText.violet }}>
                Tap the star on up to three unlocked achievements to show them on your profile. The first one is your top banner.
              </Txt>
            </View>
          ) : null}
          {shown.length === 0 ? <EmptyHint emoji="🏅" title="No achievements yet" text="Post, chat and play to unlock them." /> : null}
          {byCategory(shown).map((group) => (
            <View key={group.category} style={{ gap: 8 }}>
              <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 15, lineHeight: 20, color: theme.ink, marginTop: 4 }}>{group.category}</Txt>
              {group.items.map((a) => (
                <AchievementTile key={a.id} achievement={a} showcased={showcase.includes(a.id)} onToggleShowcase={isSelf ? () => onShowcase(toggleShowcase(showcase, a.id)) : undefined} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </FullSheet>
  );
}

// ── All communities ─────────────────────────────────────────────────────────

/** Every community on the profile, four across, with Join / Joined. */
export function CommunitiesSheet({ open, handle, communities, busy, onJoin, onClose }: { open: boolean; handle: string; communities: CommunityCardData[]; busy: string | null; onJoin: (c: CommunityCardData) => void; onClose: () => void }) {
  const width = useColumnWidth(3, { inset: 12, gap: 8 });
  return (
    <FullSheet visible={open} title="Communities" subtitle={`@${handle}`} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {communities.map((c, i) => (
          <CommunityTile
            key={c.id}
            community={c}
            index={i}
            width={width}
            busy={busy === c.id}
            onJoin={() => onJoin(c)}
            onPress={() => {
              onClose();
              router.push(`/community/${c.id}`);
            }}
          />
        ))}
      </ScrollView>
    </FullSheet>
  );
}
