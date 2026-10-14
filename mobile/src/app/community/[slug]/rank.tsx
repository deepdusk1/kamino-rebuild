import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { api } from "@/api/endpoints";
import type { RankBoard, RankPeriod } from "@/api/types";
import { Avatar, Card, EmptyState, ErrorState, Loading, Segmented, Txt } from "@/components/ui";
import { compactCount } from "@/lib/format";
import { space, useTheme } from "@/theme";
import { withCommunityTheme } from "@/components/CommunityTheme";

const MEDALS = ["🥇", "🥈", "🥉"];

const BOARDS: { key: RankBoard; label: string; blurb: string; unit: string }[] = [
  { key: "activity", label: "Activity", blurb: "Likes you receive count 3, posts count 4.", unit: "pts" },
  { key: "streak", label: "Check-ins", blurb: "Days in a row checked in to this community.", unit: "days" },
  { key: "quiz", label: "Quizzes", blurb: "Points scored on quizzes.", unit: "pts" },
];
const PERIODS: { key: RankPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All time" },
];

/** Community leaderboards: pick what to rank (activity, check-ins, quizzes) and over how long. */
function Rank() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [by, setBy] = useState<RankBoard>("activity");
  const [period, setPeriod] = useState<RankPeriod>("week");
  const board = BOARDS.find((b) => b.key === by)!;
  const rank = useQuery({ queryKey: ["rank", slug, by, period], queryFn: () => api.board(slug!, by, period), enabled: !!slug });

  const header = (
    <View style={{ gap: space.sm, marginBottom: space.sm }}>
      <Segmented options={BOARDS.map(({ key, label }) => ({ key, label }))} value={by} onChange={setBy} />
      {by !== "streak" ? <Segmented options={PERIODS} value={period} onChange={setPeriod} /> : null}
      <Txt variant="small" tone="muted">{board.blurb} Reputation is the all-time total.</Txt>
    </View>
  );

  if (rank.isError) return <ErrorState error={rank.error} onRetry={() => void rank.refetch()} />;

  return (
    <FlatList
      data={rank.data?.rank ?? []}
      keyExtractor={(r) => r.userId}
      contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
      refreshing={rank.isRefetching}
      onRefresh={() => void rank.refetch()}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => (
        <Card
          index={index}
          onPress={() => item.handle && router.push(`/profile/${item.handle}`)}
          accessibilityLabel={`Number ${index + 1}, ${item.nickname}, ${item.score} ${board.unit}`}
          style={[{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }, index < 3 && item.score > 0 && { borderColor: theme.accent, borderWidth: 1.5 }]}
        >
          <Txt style={{ width: 32, textAlign: "center", fontSize: index < 3 ? 22 : 16 }}>{MEDALS[index] ?? index + 1}</Txt>
          <Avatar name={item.nickname} hue={item.hue} size={40} userId={item.userId} version={item.avatarV} />
          <View style={{ flex: 1 }}>
            <Txt numberOfLines={1}>{item.nickname}</Txt>
            <Txt variant="caption" tone="subtle">{item.role === "member" ? "Member" : item.role === "curator" ? "Curator" : "Leader"} · {compactCount(item.rep)} rep</Txt>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Txt variant="heading" tone="accent">{item.score}</Txt>
            <Txt variant="caption" tone="subtle">{board.unit}</Txt>
          </View>
        </Card>
      )}
      ListEmptyComponent={rank.isPending ? <Loading /> : <EmptyState icon="trophy-outline" title="Nothing to rank yet" body="Take part to get on the board." />}
    />
  );
}

export default withCommunityTheme(Rank);
