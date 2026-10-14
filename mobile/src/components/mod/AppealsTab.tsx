import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import type { AppealRow } from "@/api/models";
import { Button, Card, Chip, EmptyState, Field, Sheet, Txt } from "@/components/ui";
import { useAction } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { space } from "@/theme";

type Props = { slug: string; appeals: AppealRow[]; onChanged: () => void };

/** Appeals from members. "Overturn" removes the strike, mute or ban; "Uphold" keeps it. */
export function AppealsTab({ slug, appeals, onChanged }: Props) {
  const [current, setCurrent] = useState<AppealRow | null>(null);
  const [note, setNote] = useState("");

  const [decide, busy] = useAction(async (decision: "upheld" | "overturned") => {
    if (!current) return;
    await api.resolveAppeal(slug, current.id, decision, note.trim() || undefined);
    setCurrent(null);
    setNote("");
    onChanged();
  });

  if (!appeals.length) return <EmptyState icon="hand-left-outline" title="No appeals" body="Members can appeal strikes, mutes and removals." />;
  return (
    <View style={{ gap: space.md }}>
      {appeals.map((a) => (
        <Card key={a.id} onPress={a.status === "open" ? () => setCurrent(a) : undefined} accessibilityLabel={`Appeal from ${a.name}`}>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <Chip label={a.kind} />
            <Chip label={a.status} tone={a.status === "overturned" ? "ok" : a.status === "upheld" ? "danger" : "default"} />
            <Txt variant="caption" tone="subtle">{timeAgo(a.createdAt)}</Txt>
          </View>
          <Txt variant="heading">{a.name} <Txt tone="subtle">@{a.handle}</Txt></Txt>
          <Txt tone="muted">{a.message}</Txt>
          {a.decisionNote ? <Txt variant="small" tone="subtle">Decision note: {a.decisionNote}</Txt> : null}
        </Card>
      ))}
      <Sheet visible={!!current} title="Decide on this appeal" onClose={() => setCurrent(null)}>
        <Txt tone="muted">{current?.message}</Txt>
        <Field label="Note to the member (optional)" value={note} onChangeText={setNote} multiline maxLength={500} />
        <Button label="Overturn — undo the action" onPress={() => void decide("overturned")} busy={busy} />
        <Button label="Uphold — keep the action" variant="secondary" onPress={() => void decide("upheld")} busy={busy} />
      </Sheet>
    </View>
  );
}
