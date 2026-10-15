import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { api } from "@/api/endpoints";
import { communityV9 } from "@/api/community-v9";
import type { Membership } from "@/api/types";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Txt } from "@/components/ui";
import { showError } from "@/lib/errors";
import { followLabel, setFollow, wantsFollow, type FollowState } from "@/lib/follow";
import { useDebounced } from "@/lib/useDebounced";
import { space } from "@/theme";

const ROLE_LABEL = { agent: "Founder", leader: "Leader", curator: "Curator", member: "" } as const;

/**
 * Everyone in the community, 50 at a time, searchable by nickname or @username on the server (so members beyond the
 * first page can be found). Follow buttons share their state with the rest of the app (src/lib/follow.ts).
 */
function Members() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug!), enabled: !!slug });
  const me = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim(), 300);
  const [busy, setBusy] = useState<string | null>(null);

  const members = useInfiniteQuery({
    queryKey: ["communityMembers", slug, term],
    queryFn: ({ pageParam }) => communityV9.members(slug!, term, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: !!slug,
  });

  const followingIds = new Set(page.data?.followingIds ?? []);
  const requestedIds = new Set(page.data?.requestedIds ?? []);
  const stateOf = (userId: string): FollowState => ({ following: followingIds.has(userId), requested: requestedIds.has(userId) });

  const toggleFollow = async (member: Membership) => {
    setBusy(member.userId);
    try {
      // Says what it wants (follow / stop), so this list can never flip the wrong way.
      await setFollow(queryClient, member.userId, wantsFollow(stateOf(member.userId)));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  if (members.isPending) return <Loading />;
  if (members.isError || !members.data) return <ErrorState error={members.error} onRetry={() => void members.refetch()} />;
  const people = members.data.pages.flatMap((p) => p.members);
  const myId = me.data?.profile?.userId;

  return (
    <FlatList
      data={people}
      keyExtractor={(m) => m.userId}
      contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
      refreshing={members.isRefetching && !members.isFetchingNextPage}
      onRefresh={() => {
        void members.refetch();
        void page.refetch();
      }}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (members.hasNextPage && !members.isFetchingNextPage) void members.fetchNextPage();
      }}
      ListHeaderComponent={
        <View style={{ marginBottom: space.sm }}>
          <Field value={search} onChangeText={setSearch} placeholder="Find a member by name or @username" autoCapitalize="none" autoCorrect={false} />
        </View>
      }
      ListFooterComponent={members.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: space.md }} /> : null}
      renderItem={({ item, index }) => {
        const state = stateOf(item.userId);
        return (
          <Card
            index={index}
            onPress={() => item.handle && router.push(`/profile/${item.handle}`)}
            accessibilityLabel={`${item.nickname}${ROLE_LABEL[item.role] ? `, ${ROLE_LABEL[item.role]}` : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }}
          >
            <Avatar name={item.nickname} hue={item.personaHue} size={44} userId={item.userId} version={item.avatarV} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Txt numberOfLines={1} style={{ flexShrink: 1 }}>{item.nickname}</Txt>
                {ROLE_LABEL[item.role] ? <Chip label={ROLE_LABEL[item.role]} /> : null}
              </View>
              {item.personaBio ? <Txt variant="small" tone="muted" numberOfLines={1}>{item.personaBio}</Txt> : null}
            </View>
            {myId && item.userId !== myId ? (
              <Button
                label={followLabel(state)}
                small
                busy={busy === item.userId}
                variant={state.following || state.requested ? "secondary" : "primary"}
                onPress={() => void toggleFollow(item)}
                accessibilityHint={state.following ? "Unfollows them" : state.requested ? "Cancels your follow request" : "Follows them"}
              />
            ) : null}
          </Card>
        );
      }}
      ListEmptyComponent={<EmptyState icon="people-outline" title={term ? `No members match “${term}”` : "No members found"} />}
    />
  );
}

export default withCommunityTheme(Members);
