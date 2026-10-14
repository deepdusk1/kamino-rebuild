import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { api } from "@/api/endpoints";
import { EmptyHint } from "@/components/k";
import { PostCard } from "@/components/PostCard";
import { ErrorState, SkeletonList, Txt } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import { font, useTheme } from "@/theme";

/** Posts you bookmarked, newest first, in the redesign's card style. */
export default function Saved() {
  const theme = useTheme();
  const saved = useQuery({ queryKey: ["saved"], queryFn: api.saved });
  const count = saved.data?.length ?? 0;
  return (
    <FlatList
      data={saved.isError ? [] : saved.data ?? []}
      keyExtractor={(p) => String(p.id)}
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1, paddingBottom: 40 }}
      refreshing={saved.isRefetching}
      onRefresh={() => void saved.refetch()}
      ListHeaderComponent={
        <View style={{ gap: 2, paddingHorizontal: 4, marginBottom: 4 }}>
          <Txt style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 18, color: theme.muted }}>
            {count ? `${compactNumber(count)} post${count === 1 ? "" : "s"} you kept for later. Only you can see this list.` : "Posts you keep for later. Only you can see this list."}
          </Txt>
        </View>
      }
      renderItem={({ item, index }) => <PostCard post={item} showCommunity index={index} />}
      ListEmptyComponent={
        saved.isPending ? (
          <SkeletonList count={3} />
        ) : saved.isError ? (
          <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
        ) : (
          <EmptyHint emoji="🔖" title="Nothing saved yet" text="Tap Save on any post to keep it here." actionLabel="Find something to read" onAction={() => router.navigate("/")} />
        )
      }
    />
  );
}
