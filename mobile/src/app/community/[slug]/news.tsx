import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { FlatList, Linking } from "react-native";
import { api } from "@/api/endpoints";
import { Card, EmptyState, ErrorState, Loading, Txt } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { space } from "@/theme";
import { withCommunityTheme } from "@/components/CommunityTheme";

/** Headlines from the RSS feeds the community's leaders chose. Tapping opens the article in the browser. */
function News() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const news = useQuery({ queryKey: ["news", slug], queryFn: () => api.readFeeds(slug!), enabled: !!slug });

  if (news.isPending) return <Loading label="Fetching the latest headlines…" />;
  if (news.isError || !news.data) return <ErrorState error={news.error} onRetry={() => void news.refetch()} />;

  return (
    <FlatList
      data={news.data.items}
      keyExtractor={(item, index) => `${item.link}-${index}`}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      refreshing={news.isRefetching}
      onRefresh={() => void news.refetch()}
      renderItem={({ item }) => (
        <Card onPress={() => void Linking.openURL(item.link)} accessibilityLabel={`Open article: ${item.title}`}>
          <Txt variant="caption" tone="accent">{item.source}{item.publishedAt ? ` · ${timeAgo(item.publishedAt)}` : ""}</Txt>
          <Txt variant="heading">{item.title}</Txt>
        </Card>
      )}
      ListEmptyComponent={<EmptyState icon="newspaper-outline" title="No headlines" body="Leaders can add news feeds from the moderation screen." />}
    />
  );
}

export default withCommunityTheme(News);
