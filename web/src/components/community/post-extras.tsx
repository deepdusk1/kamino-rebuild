import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Check, Copy, History, Pin, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { GradientButton, OutlineButton } from "@/components/k";
import { QuizPlayer } from "@/components/quiz-player";
import { timeAgo } from "@/lib/format-ui";
import {
  copyWikiTemplate,
  listWikiRevisions,
  restoreWikiRevision,
  submitWiki,
  toggleWikiProfilePin,
  votePoll,
} from "@/lib/kamino/server";
import type { Community, Membership, Post, PostPayload } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** A poll: tap an option to vote; after voting the bars show how everyone voted. */
export function PollView({
  postId,
  poll,
  canVote,
  onVoted,
}: {
  postId: number;
  poll: { options: string[]; counts: (number | string)[]; mine: number | null };
  canVote: boolean;
  onVoted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const total = poll.counts.reduce<number>((a, b) => a + Number(b), 0);
  const voted = poll.mine != null;
  async function vote(i: number) {
    setBusy(true);
    try {
      await votePoll({ data: { postId, optionIndex: i } });
      onVoted();
    } catch (e) {
      toast.error(errorText(e, "Could not save your vote"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="k-card space-y-2 rounded-card p-3 lg:p-4" role="group" aria-label="Poll">
      {poll.options.map((opt, i) => {
        const pct = total ? Math.round((Number(poll.counts[i] ?? 0) / total) * 100) : 0;
        const mine = poll.mine === i;
        return (
          <button
            key={`${opt}-${i}`}
            type="button"
            disabled={!canVote || busy}
            aria-pressed={mine}
            onClick={() => void vote(i)}
            className={cn(
              "k-focus relative flex min-h-11 w-full items-center overflow-hidden rounded-tile border-[1.5px] px-3.5 text-left text-[14px] font-semibold transition-colors disabled:cursor-default",
              mine ? "border-violet text-violet-ink" : "border-border text-ink hover:bg-surface-alt",
            )}
          >
            {voted && (
              <span
                className={cn("absolute inset-y-0 left-0", mine ? "bg-tint-violet" : "bg-surface-alt")}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            )}
            <span className="relative flex flex-1 items-center gap-2">
              {mine ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
              {opt}
            </span>
            {voted && <span className="relative text-[13px] text-muted tabular-nums">{pct}%</span>}
          </button>
        );
      })}
      <p className="text-[12px] text-subtle">
        {total} {total === 1 ? "vote" : "votes"}
        {!canVote ? " · Join the community to vote" : voted ? " · Tap another option to change" : ""}
      </p>
    </div>
  );
}

/** A quiz: the player (or your score) and the community's best scores. */
export function QuizCard({
  postId,
  payload,
  myQuiz,
  quizRun,
  board,
  canPlay,
  onDone,
}: {
  postId: number;
  payload: PostPayload;
  myQuiz: { score: number; total: number } | null;
  quizRun: { startedAt: string; serverNow: string } | null;
  board: { nickname: string; score: number; total: number }[];
  canPlay: boolean;
  onDone: () => void;
}) {
  const questions = payload.questions ?? [];
  if (!questions.length) return null;
  return (
    <div className="k-card space-y-3 rounded-card p-3.5 lg:p-5">
      <p className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
        <span className="grid size-8 place-items-center rounded-full bg-tint-orange text-[16px]" aria-hidden>
          🧠
        </span>
        Quiz · {questions.length} {questions.length === 1 ? "question" : "questions"}
      </p>
      {myQuiz ? (
        <p className="text-[14px] text-body">
          You scored{" "}
          <span className="font-extrabold text-violet tabular-nums">
            {myQuiz.score}/{myQuiz.total}
          </span>
        </p>
      ) : canPlay ? (
        <QuizPlayer
          postId={postId}
          questions={questions}
          timeLimitSec={payload.timeLimitSec ?? 0}
          quizRun={quizRun}
          onDone={onDone}
        />
      ) : (
        <p className="text-[13.5px] text-muted">Join the community to play this quiz.</p>
      )}
      {board.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-ink">
            <Trophy className="size-4 text-orange" aria-hidden /> Best scores
          </p>
          <ol className="space-y-1 text-[13.5px]">
            {board.map((row, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate text-body">
                  <span className="mr-2 text-subtle tabular-nums">{i + 1}.</span>
                  {row.nickname}
                </span>
                <span className="font-semibold text-ink tabular-nums">
                  {row.score}/{row.total}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/**
 * Wiki page tools: status, submit to the library, use as a template, pin to your profile, and the edit history
 * (the author can restore an older version).
 */
export function WikiTools({
  post,
  community,
  member,
  isAuthor,
  pinned,
  signedIn,
  onChanged,
}: {
  post: Post;
  community: Community;
  member: Membership | null;
  isAuthor: boolean;
  pinned: boolean;
  signedIn: boolean;
  onChanged: () => Promise<unknown> | void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [historyOn, setHistoryOn] = useState(false);
  const revisions = useQuery({
    queryKey: ["wiki-revisions", post.id],
    queryFn: () => listWikiRevisions({ data: post.id }),
    enabled: historyOn,
  });
  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(errorText(e, "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }
  const status =
    post.wikiStatus === "approved"
      ? "In the community library"
      : post.wikiStatus === "pending"
        ? "Waiting for library review"
        : post.wikiStatus === "rejected"
          ? "Changes requested"
          : "Community wiki page";
  return (
    <div className="space-y-3 rounded-card bg-tint-green p-3.5 lg:p-4">
      <div className="flex items-start gap-2.5">
        <BookOpen className="mt-0.5 size-5 shrink-0 text-green-ink" aria-hidden />
        <div className="min-w-0">
          <p className="text-[14px] font-extrabold text-green-ink">{status}</p>
          <p className="text-[12.5px] text-body">
            Approved pages appear in the community library. Editing an approved page sends it back for review.
          </p>
          {isAuthor && post.wikiReviewNote ? (
            <p className="mt-1 text-[13px] text-body">Review feedback: {post.wikiReviewNote}</p>
          ) : null}
          {post.payload.templateSourceId ? (
            <Link
              to="/c/$slug/p/$postId"
              params={{ slug: community.id, postId: String(post.payload.templateSourceId) }}
              className="k-focus mt-1 inline-block text-[12.5px] font-bold text-violet hover:underline"
            >
              Based on wiki page #{post.payload.templateSourceId} →
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isAuthor && ["draft", "rejected"].includes(post.wikiStatus) && (
          <GradientButton size="sm" disabled={busy} onClick={() => void run(() => submitWiki({ data: post.id }), "Sent for review")}>
            Submit to library
          </GradientButton>
        )}
        {signedIn && post.wikiStatus === "approved" && member?.status === "active" && (
          <OutlineButton
            size="sm"
            icon={<Copy className="size-4" aria-hidden />}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const copy = await copyWikiTemplate({ data: post.id });
                toast.success("Template copied into your drafts");
                await navigate({
                  to: "/c/$slug/p/$postId",
                  params: { slug: copy.slug, postId: String(copy.id) },
                });
              })
            }
          >
            Use as template
          </OutlineButton>
        )}
        {signedIn && post.wikiStatus === "approved" && community.visibility === "public" && (
          <OutlineButton
            size="sm"
            icon={<Pin className="size-4" aria-hidden />}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const res = await toggleWikiProfilePin({ data: post.id });
                toast.success(res.pinned ? "Pinned to your profile" : "Removed from your profile");
              })
            }
          >
            {pinned ? "Unpin from profile" : "Pin to profile"}
          </OutlineButton>
        )}
        <OutlineButton size="sm" icon={<History className="size-4" aria-hidden />} onClick={() => setHistoryOn((v) => !v)}>
          {historyOn ? "Hide history" : "Edit history"}
        </OutlineButton>
        <Link
          to="/c/$slug/wiki"
          params={{ slug: community.id }}
          className="k-focus k-hit rounded-full px-1.5 text-[13px] font-bold text-violet hover:underline"
        >
          Community library →
        </Link>
      </div>
      {historyOn && (
        <div className="space-y-2 border-t border-[color-mix(in_oklab,var(--color-green-ink)_20%,transparent)] pt-3">
          <p className="text-[12.5px] text-body">The page above is the current one. Earlier versions are saved when the author edits.</p>
          {revisions.isLoading && <p className="text-[12.5px] text-muted">Loading history…</p>}
          {revisions.error && <p className="text-[12.5px] text-danger">Could not load the history.</p>}
          {revisions.data?.length === 0 && <p className="text-[12.5px] text-muted">No earlier versions yet.</p>}
          {revisions.data?.map((rev) => (
            <details key={rev.id} className="rounded-tile bg-surface p-3 text-[13.5px]">
              <summary className="cursor-pointer font-semibold text-ink" suppressHydrationWarning>
                {rev.title} · {timeAgo(rev.createdAt)} · {rev.editor}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-muted">{rev.body}</p>
              {isAuthor && (
                <OutlineButton
                  size="sm"
                  className="mt-2"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await restoreWikiRevision({ data: { postId: post.id, revisionId: rev.id } });
                      await revisions.refetch();
                    }, "Earlier version restored")
                  }
                >
                  Restore this version
                </OutlineButton>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
