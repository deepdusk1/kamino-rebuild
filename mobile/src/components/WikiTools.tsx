import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import type { PostPage } from "@/api/models";
import { useAction } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { notify } from "@/components/community/platform";
import { Pill } from "@/components/k";
import { font, radius, space, useTheme } from "@/theme";
import { Button, Card, Field, Sheet, Txt } from "./ui";

const STATUS_LABEL = { draft: "Draft", pending: "Waiting for review", approved: "Approved", rejected: "Changes requested" } as const;
const STATUS_TONE = { draft: "neutral", pending: "orange", approved: "green", rejected: "red" } as const;

/** Everything specific to wiki pages: review, suggestions from other members, history, pinning. */
export function WikiTools({ page, isAuthor, isModerator, isMember }: { page: PostPage; isAuthor: boolean; isModerator: boolean; isMember: boolean }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { post } = page;
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [note, setNote] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["post", post.id] });
  const contributors = useQuery({ queryKey: ["wiki-contributors", post.id], queryFn: () => api.wikiContributors(post.id) });
  const proposals = useQuery({ queryKey: ["wiki-proposals", post.id], queryFn: () => api.wikiProposals(post.id) });
  const revisions = useQuery({ queryKey: ["wiki-revisions", post.id], queryFn: () => api.wikiRevisions(post.id), enabled: historyOpen && isAuthor });

  const [submitForReview, submitting] = useAction(async () => { await api.submitWiki(post.id); await refresh(); });
  const [review, reviewing] = useAction(async (decision: "approved" | "rejected") => {
    await api.reviewWiki(post.id, decision, reviewNote.trim() || undefined);
    setReviewNote("");
    await refresh();
  });
  const [copy, copying] = useAction(async () => { await api.copyWiki(post.id); notify("Copied", "A copy is in your drafts for this community."); });
  const [pin, pinning] = useAction(async () => { await api.pinWiki(post.id); await refresh(); });
  const [suggest, suggesting] = useAction(async () => {
    await api.proposeWikiEdit({ postId: post.id, title, body, note: note.trim() || undefined });
    setSuggestOpen(false);
    setNote("");
    await proposals.refetch();
    notify("Suggestion sent", "The page's author or a moderator will review it.");
  });
  const [decide, deciding] = useAction(async (proposalId: number, decision: "accepted" | "rejected") => {
    await api.resolveWikiProposal(proposalId, decision);
    await Promise.all([proposals.refetch(), refresh(), contributors.refetch()]);
  });
  const [restore, restoring] = useAction(async (revisionId: number) => {
    await api.restoreWikiRevision(post.id, revisionId);
    setHistoryOpen(false);
    await refresh();
  });

  const open = (proposals.data?.proposals ?? []).filter((p) => p.status === "open");

  return (
    <View style={{ gap: space.md, backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, padding: 14 }}>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" }}>
        <Pill label="Wiki" icon="book" tone="green" variant="solid" />
        <Pill label={STATUS_LABEL[post.wikiStatus]} tone={STATUS_TONE[post.wikiStatus]} />
        {post.payload.category ? <Pill label={post.payload.category} icon="folder-open-outline" tone="violet" /> : null}
      </View>
      {post.wikiReviewNote ? <Txt style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: theme.muted }}>Reviewer note: {post.wikiReviewNote}</Txt> : null}
      {contributors.data?.length ? <Txt style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: theme.subtle }}>✍️ Contributors: {contributors.data.map((c) => c.name).join(", ")}</Txt> : null}

      {isAuthor && (post.wikiStatus === "draft" || post.wikiStatus === "rejected") ? (
        <Button label="Submit for review" onPress={() => void submitForReview()} busy={submitting} />
      ) : null}

      {isModerator && post.wikiStatus === "pending" ? (
        <Card>
          <Txt variant="heading">Review this page</Txt>
          <Field label="Note to the author (optional)" value={reviewNote} onChangeText={setReviewNote} multiline maxLength={500} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button label="Approve" onPress={() => void review("approved")} busy={reviewing} style={{ flex: 1 }} />
            <Button label="Request changes" variant="secondary" onPress={() => void review("rejected")} disabled={reviewing} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      {isMember && post.wikiStatus === "approved" ? (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {!isAuthor ? <Button label="Suggest an edit" small variant="secondary" onPress={() => { setTitle(post.title); setBody(post.body); setSuggestOpen(true); }} /> : null}
          <Button label="Copy to drafts" small variant="secondary" onPress={() => void copy()} busy={copying} />
          <Button label={page.wikiPinned ? "Unpin from profile" : "Pin to profile"} small variant="secondary" onPress={() => void pin()} busy={pinning} />
        </View>
      ) : null}
      {isAuthor ? <Button label="Edit history" small variant="ghost" onPress={() => setHistoryOpen(true)} /> : null}

      {proposals.data && proposals.data.proposals.length ? (
        <View style={{ gap: space.sm }}>
          <Txt style={{ fontFamily: font.heavy, fontSize: 14, color: theme.ink }}>{proposals.data.canReview ? "Suggested edits" : "Your suggestions"}</Txt>
          {proposals.data.proposals.map((p) => (
            <Card key={p.id}>
              <Txt variant="small" tone="muted">{p.proposer} · {timeAgo(p.createdAt)} · {p.status}</Txt>
              {p.note ? <Txt>{p.note}</Txt> : null}
              <Txt variant="small" numberOfLines={6}>{p.body}</Txt>
              {proposals.data!.canReview && p.status === "open" ? (
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Button label="Accept" small onPress={() => void decide(p.id, "accepted")} disabled={deciding} />
                  <Button label="Decline" small variant="secondary" onPress={() => void decide(p.id, "rejected")} disabled={deciding} />
                </View>
              ) : null}
            </Card>
          ))}
          {open.length === 0 && proposals.data.canReview ? <Txt variant="caption" tone="subtle">No suggestions waiting.</Txt> : null}
        </View>
      ) : null}

      <Sheet visible={suggestOpen} title="Suggest an edit" onClose={() => setSuggestOpen(false)}>
        <Txt tone="muted">Change the text below. If it’s accepted, you’ll be credited as a contributor.</Txt>
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Page text" value={body} onChangeText={setBody} multiline maxLength={8000} style={{ minHeight: 200 }} />
        <Field label="What did you change? (optional)" value={note} onChangeText={setNote} maxLength={300} />
        <Button label="Send suggestion" onPress={() => void suggest()} busy={suggesting} />
      </Sheet>

      <Sheet visible={historyOpen} title="Edit history" onClose={() => setHistoryOpen(false)}>
        {revisions.isPending ? <Txt tone="muted">Loading…</Txt> : (revisions.data ?? []).length === 0 ? <Txt tone="muted">No earlier versions yet.</Txt> : (revisions.data ?? []).map((r) => (
          <Card key={r.id}>
            <Txt variant="small" tone="muted">{timeAgo(r.createdAt)}</Txt>
            <Txt>{r.title}</Txt>
            <Txt variant="small" tone="muted" numberOfLines={4}>{r.body}</Txt>
            <Button label="Restore this version" small variant="secondary" onPress={() => void restore(r.id)} disabled={restoring} />
          </Card>
        ))}
      </Sheet>
    </View>
  );
}
