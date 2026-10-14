import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import type { SafetyFlag } from "@/api/types";
import { Button, Card, Chip, EmptyState, Loading, Txt } from "@/components/ui";
import { showError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { radius, space, useTheme } from "@/theme";

const NOUN: Record<SafetyFlag["targetType"], string> = {
  post: "Post",
  comment: "Comment",
  message: "Chat message",
  wall: "Wall note",
  roleplay: "Story turn",
  scene: "Role-play story",
};

/**
 * Things Kamino's safety check held or flagged in this community. People decide: restore a held item, remove it, or say
 * a flagged (still visible) item is fine. Nothing is banned automatically.
 */
export function SafetyTab({ slug }: { slug: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const flags = useQuery({ queryKey: ["safety", slug], queryFn: () => api.safetyFlags(slug) });
  const status = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus });
  const [busy, setBusy] = useState<number | null>(null);

  const decide = async (flag: SafetyFlag, decision: "restore" | "remove" | "dismiss") => {
    setBusy(flag.id);
    try {
      await api.reviewSafetyFlag(flag.id, decision);
      await queryClient.invalidateQueries({ queryKey: ["safety", slug] });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  if (flags.isPending) return <Loading />;
  const open = (flags.data ?? []).filter((f) => f.status === "open");
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="small" tone="muted">
        {status.data?.moderation ? "Built-in rules and the configured AI safety check" : "Built-in rules (the AI check is not set up)"} pause likely illegal or
        dangerous content here. You decide what happens.
      </Txt>
      {!open.length ? <EmptyState icon="shield-checkmark-outline" title="Nothing waiting" body="The safety queue is empty." /> : null}
      {open.map((flag) => (
        <Card key={flag.id}>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" }}>
            <Chip label={NOUN[flag.targetType]} />
            <Chip label={flag.action === "hold" ? "Held (hidden)" : "Flagged (visible)"} tone={flag.action === "hold" ? "danger" : "default"} />
            {flag.severe ? <Chip label="Serious" tone="danger" /> : null}
            <Txt variant="caption" tone="subtle">{flag.authorName} · {timeAgo(flag.createdAt)}</Txt>
          </View>
          <Txt variant="heading">{flag.reasons.join(" · ") || "Possible rule break"}</Txt>
          {flag.minors ? (
            <View style={{ backgroundColor: theme.dark ? "#3a1733" : "#fde6ef", borderRadius: radius.md, padding: space.md }}>
              <Txt tone="danger" variant="small">
                Possibly involves minors. Its pictures are locked. Do not download or share it. Only the site owner can restore it; they
                should report it to Cybertip.ca (Canada) or the NCMEC CyberTipline (US).
              </Txt>
            </View>
          ) : null}
          {flag.excerpt ? <Txt tone="muted">“{flag.excerpt}”</Txt> : null}
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {flag.targetType === "post" ? <Button label="Open post" small variant="secondary" onPress={() => router.push(`/community/${slug}/post/${flag.targetId}`)} /> : null}
            {flag.action === "hold" ? (
              <Button label="Restore" small variant="secondary" disabled={busy === flag.id || flag.minors} onPress={() => void decide(flag, "restore")} />
            ) : (
              <Button label="It's fine" small variant="secondary" disabled={busy === flag.id} onPress={() => void decide(flag, "dismiss")} />
            )}
            <Button label="Remove" small variant="danger" disabled={busy === flag.id} onPress={() => void decide(flag, "remove")} />
          </View>
        </Card>
      ))}
    </View>
  );
}
