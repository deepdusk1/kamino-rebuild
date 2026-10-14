import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Screen, Card, Txt, Loading } from "@/components/ui";
import { getPlatformAnalytics } from "@/api/platform-analytics";
const metricNames: Record<string, string> = {
  members: "Members",
  dau: "Active today",
  wau: "Active in 7 days",
  mau: "Active in 30 days",
  newMembers7: "New in 7 days",
};

export default function Analytics() {
  const q = useQuery({
    queryKey: ["platformAnalytics"],
    queryFn: getPlatformAnalytics,
  });
  return (
    <Screen>
      <Txt variant="title">Growth & retention</Txt>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <Txt tone="danger">{q.error.message}</Txt>
      ) : q.data ? (
        <>
          <View style={{ gap: 12 }}>
            {Object.entries(q.data.metrics).map(([k, v]) => (
              <Card key={k}>
                <Txt tone="muted">{metricNames[k]}</Txt>
                <Txt variant="title">{v}</Txt>
              </Card>
            ))}
          </View>
          <Txt tone="muted">{q.data.definition}</Txt>
          <Card>
            <Txt variant="heading">Daily activity & signups</Txt>
            {q.data.activity
              .slice()
              .reverse()
              .map((r) => (
                <View key={r.day} style={{ marginTop: 12 }}>
                  <Txt>{r.day} UTC</Txt>
                  <Txt tone="muted">
                    {r.activeMembers} active · {r.newMembers} new
                  </Txt>
                </View>
              ))}
          </Card>
          <Card>
            <Txt variant="heading">Signup cohorts</Txt>
            <Txt tone="muted">
              Incomplete windows and groups below five eligible members are
              withheld.
            </Txt>
            {q.data.cohorts.map((r) => (
              <View key={r.week} style={{ marginTop: 12 }}>
                <Txt>Week of {r.week}</Txt>
                <Txt tone="muted">
                  Members: {r.members ?? "—"} · 7-day return:{" "}
                  {r.retention7 === null ? "—" : `${r.retention7}%`} · 30-day
                  return: {r.retention30 === null ? "—" : `${r.retention30}%`}
                </Txt>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
