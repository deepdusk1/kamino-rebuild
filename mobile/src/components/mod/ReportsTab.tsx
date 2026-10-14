import { router } from "expo-router";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import type { Report } from "@/api/types";
import { Button, Card, Chip, EmptyState, Txt } from "@/components/ui";
import { showError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { space } from "@/theme";

type Props = { slug: string; reports: Report[]; onChanged: () => void };

/** Open reports first. "Open" jumps to the reported post; Resolve / Dismiss closes the report. */
export function ReportsTab({ slug, reports, onChanged }: Props) {
  const close = async (id: number, status: "resolved" | "dismissed") => {
    try {
      await api.resolveReport(slug, id, status);
      onChanged();
    } catch (error) {
      showError(error);
    }
  };

  const open = reports.filter((r) => r.status === "open");
  const done = reports.filter((r) => r.status !== "open");
  if (!reports.length) return <EmptyState icon="checkmark-circle-outline" title="No reports" body="Nothing has been reported in this community." />;

  const card = (r: Report) => (
    <Card key={r.id}>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" }}>
        <Chip label={r.targetType} />
        <Chip label={r.reason} tone="danger" />
        <Txt variant="caption" tone="subtle">{timeAgo(r.createdAt)}</Txt>
      </View>
      {r.details ? <Txt tone="muted">{r.details}</Txt> : null}
      {r.status === "open" ? (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {r.targetType === "post" ? <Button label="Open post" small variant="secondary" onPress={() => router.push(`/community/${slug}/post/${r.targetId}`)} /> : null}
          <Button label="Resolve" small onPress={() => void close(r.id, "resolved")} />
          <Button label="Dismiss" small variant="ghost" onPress={() => void close(r.id, "dismissed")} />
        </View>
      ) : (
        <Chip label={r.status} tone="ok" />
      )}
    </Card>
  );

  return (
    <View style={{ gap: space.md }}>
      {open.length ? open.map(card) : <Txt tone="muted">No open reports. 🎉</Txt>}
      {done.length ? <Txt variant="label" tone="subtle">Closed</Txt> : null}
      {done.map(card)}
    </View>
  );
}
