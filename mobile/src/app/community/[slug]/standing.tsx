import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { api } from "@/api/endpoints";
import { Button, Card, Chip, ErrorState, Field, Loading, Screen, Sheet, Txt } from "@/components/ui";
import { useAction } from "@/lib/errors";
import { formatDateTime, timeAgo } from "@/lib/format";
import { space } from "@/theme";
import { withCommunityTheme } from "@/components/CommunityTheme";

type Kind = "strike" | "mute" | "ban";

/** The person's own record in this community: strikes, any mute, and appeals they can file. */
function Standing() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const standing = useQuery({ queryKey: ["standing", slug], queryFn: () => api.standing(slug!), enabled: !!slug });
  const [appealKind, setAppealKind] = useState<Kind | null>(null);
  const [message, setMessage] = useState("");

  const [send, sending] = useAction(async () => {
    if (!appealKind) return;
    if (message.trim().length < 10) throw new Error("Please explain in at least a sentence.");
    await api.appeal(slug!, appealKind, message.trim());
    setMessage("");
    setAppealKind(null);
    await queryClient.invalidateQueries({ queryKey: ["standing", slug] });
    Alert.alert("Appeal sent", "A community leader will review it.");
  });

  if (standing.isPending) return <Loading />;
  if (standing.isError || !standing.data) return <ErrorState error={standing.error} onRetry={() => void standing.refetch()} />;
  const { status, strikes, mute, appeals } = standing.data;
  const good = !strikes.length && !mute && status !== "banned";

  return (
    <Screen refreshing={standing.isRefetching} onRefresh={() => void standing.refetch()}>
      <Card>
        <Txt variant="heading">{good ? "Everything looks good" : status === "banned" ? "You were removed from this community" : "Your record"}</Txt>
        {good ? <Txt tone="muted">No strikes, mutes or removals. Thanks for being kind.</Txt> : null}
      </Card>

      {mute ? (
        <Card>
          <Txt variant="label" tone="danger">Muted until {formatDateTime(mute.until)}</Txt>
          <Txt tone="muted">{mute.reason || "No reason was given."}</Txt>
          <Button label="Appeal this mute" small variant="secondary" onPress={() => setAppealKind("mute")} style={{ alignSelf: "flex-start" }} />
        </Card>
      ) : null}

      {strikes.length ? (
        <Card>
          <Txt variant="heading">Strikes ({strikes.length})</Txt>
          {strikes.map((s) => (
            <Txt key={s.id} tone="muted">• {s.reason || "No reason given"} · {timeAgo(s.createdAt)}</Txt>
          ))}
          <Button label="Appeal a strike" small variant="secondary" onPress={() => setAppealKind("strike")} style={{ alignSelf: "flex-start" }} />
        </Card>
      ) : null}

      {status === "banned" ? <Button label="Appeal my removal" onPress={() => setAppealKind("ban")} /> : null}

      {appeals.length ? (
        <Card>
          <Txt variant="heading">Your appeals</Txt>
          {appeals.map((a) => (
            <Card key={a.id} style={{ padding: space.md }}>
              <Chip label={`${a.kind} · ${a.status}`} tone={a.status === "overturned" ? "ok" : a.status === "upheld" ? "danger" : "default"} />
              {a.decisionNote ? <Txt variant="small" tone="muted">{a.decisionNote}</Txt> : null}
              <Txt variant="caption" tone="subtle">{timeAgo(a.createdAt)}</Txt>
            </Card>
          ))}
        </Card>
      ) : null}

      <Sheet visible={!!appealKind} title="Appeal" onClose={() => setAppealKind(null)}>
        <Txt tone="muted">Explain what you think went wrong. A leader who wasn’t involved in the decision will read this.</Txt>
        <Field value={message} onChangeText={setMessage} multiline maxLength={1000} placeholder="Your message" />
        <Button label="Send appeal" onPress={() => void send()} busy={sending} />
      </Sheet>
    </Screen>
  );
}

export default withCommunityTheme(Standing);
