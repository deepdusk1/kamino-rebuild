import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { api } from "@/api/endpoints";
import type { Membership } from "@/api/types";
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Txt } from "@/components/ui";
import { showError } from "@/lib/errors";
import { space } from "@/theme";
import { withCommunityTheme } from "@/components/CommunityTheme";

const ROLE_LABEL = { agent: "Founder", leader: "Leader", curator: "Curator", member: "" } as const;

function Members() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug!), enabled: !!slug });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [search, setSearch] = useState("");

  const people = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (page.data?.members ?? [])
      .filter((m) => m.status === "active" && (!term || m.nickname.toLowerCase().includes(term) || (m.handle ?? "").toLowerCase().includes(term)))
      .sort((a, b) => b.rep - a.rep);
  }, [page.data, search]);

  const toggleFollow = async (member: Membership) => {
    try {
      await api.follow(slug!, member.userId);
      await queryClient.invalidateQueries({ queryKey: ["community", slug] });
    } catch (error) {
      showError(error);
    }
  };

  if (page.isPending) return <Loading />;
  if (page.isError || !page.data) return <ErrorState error={page.error} onRetry={() => void page.refetch()} />;
  const following = new Set(page.data.followingIds);
  const requested = new Set(page.data.requestedIds ?? []);
  const myId = me.data?.profile.userId;

  return (
    <FlatList
      data={people}
      keyExtractor={(m) => m.userId}
      contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
      refreshing={page.isRefetching}
      onRefresh={() => void page.refetch()}
      ListHeaderComponent={<View style={{ marginBottom: space.sm }}><Field value={search} onChangeText={setSearch} placeholder="Find a member" autoCapitalize="none" autoCorrect={false} /></View>}
      renderItem={({ item, index }) => (
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
          {item.userId !== myId ? (
            <Button label={following.has(item.userId) ? "Following" : requested.has(item.userId) ? "Requested" : "Follow"} small disabled={requested.has(item.userId)} variant={following.has(item.userId) ? "secondary" : "primary"} onPress={() => void toggleFollow(item)} />
          ) : null}
        </Card>
      )}
      ListEmptyComponent={<EmptyState icon="people-outline" title="No members found" />}
    />
  );
}

export default withCommunityTheme(Members);
