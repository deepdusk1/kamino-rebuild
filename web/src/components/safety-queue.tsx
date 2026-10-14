import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getAiStatus,
  listSafetyFlags,
  listSiteSafetyFlags,
  reviewSafetyFlag,
} from "@/lib/kamino/ai-features";
import type { SafetyFlag } from "@/lib/kamino/types";
import { cn, timeAgo } from "@/lib/utils";

const NOUN: Record<SafetyFlag["targetType"], string> = {
  post: "Post",
  comment: "Comment",
  message: "Chat message",
  wall: "Wall note",
  roleplay: "Story turn",
  scene: "Role-play story",
};

/**
 * The review queue of things Kamino's safety check held or flagged. `slug` shows one community (for its moderators);
 * without it, the site-wide queue for the site owner. People decide: restore, remove, or dismiss a flag.
 */
export function SafetyQueue({ slug }: { slug?: string }) {
  const queryClient = useQueryClient();
  const key = ["safety", slug ?? "site"];
  const q = useQuery({
    queryKey: key,
    queryFn: () => (slug ? listSafetyFlags({ data: { slug } }) : listSiteSafetyFlags()),
  });
  const status = useQuery({ queryKey: ["ai-status"], queryFn: () => getAiStatus() });
  const [busy, setBusy] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);

  async function decide(flag: SafetyFlag, decision: "restore" | "remove" | "dismiss") {
    setBusy(flag.id);
    try {
      await reviewSafetyFlag({ data: { id: flag.id, decision } });
      toast.success(
        decision === "restore" ? "Restored" : decision === "remove" ? "Removed" : "Dismissed",
      );
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your decision");
    } finally {
      setBusy(null);
    }
  }

  const flags = q.data ?? [];
  const open = flags.filter((f) => f.status === "open");
  const done = flags.filter((f) => f.status !== "open");

  return (
    <section aria-labelledby="safety-queue" className="glass-card rounded-2xl p-4">
      <h2 id="safety-queue" className="flex items-center gap-2 font-display text-lg font-semibold">
        <ShieldAlert className="size-5 text-accent" />
        Safety queue{" "}
        {open.length ? (
          <span className="rounded-full bg-warn/15 px-2 text-sm text-warn">{open.length}</span>
        ) : null}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Kamino's safety check{" "}
        {status.data?.moderation
          ? "(built-in rules and the configured AI safety check)"
          : "(built-in rules; the AI check is not set up)"}{" "}
        pauses likely illegal or dangerous content here. Nothing is banned automatically: you
        decide. Held items are hidden until you restore them.
      </p>
      {q.error ? <p className="mt-3 text-sm text-warn">{(q.error as Error).message}</p> : null}
      {!q.isPending && !open.length ? (
        <p className="mt-3 text-sm text-muted">Nothing waiting. 🎉</p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {open.map((flag) => (
          <FlagCard
            key={flag.id}
            flag={flag}
            busy={busy === flag.id}
            onDecide={(d) => void decide(flag, d)}
          />
        ))}
      </ul>
      {done.length ? (
        <button
          type="button"
          className="mt-3 text-xs font-bold text-accent"
          onClick={() => setShowDone((v) => !v)}
        >
          {showDone ? "Hide" : "Show"} {done.length} decided
        </button>
      ) : null}
      {showDone ? (
        <ul className="mt-2 space-y-2">
          {done.map((flag) => (
            <FlagCard key={flag.id} flag={flag} busy={false} onDecide={() => undefined} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function FlagCard({
  flag,
  busy,
  onDecide,
}: {
  flag: SafetyFlag;
  busy: boolean;
  onDecide: (d: "restore" | "remove" | "dismiss") => void;
}) {
  const decided = flag.status !== "open";
  return (
    <li
      className={cn(
        "rounded-xl border border-border bg-surface p-3",
        flag.severe && !decided && "border-warn",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold">{NOUN[flag.targetType]}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-bold",
            flag.action === "hold" ? "bg-warn/15 text-warn" : "bg-accent/15 text-accent",
          )}
        >
          {flag.action === "hold" ? "Held (hidden)" : "Flagged (visible)"}
        </span>
        {flag.severe ? (
          <span className="rounded-full bg-danger/15 px-2 py-0.5 font-bold text-danger">
            Serious
          </span>
        ) : null}
        <span className="text-subtle">
          by {flag.authorName} · {timeAgo(flag.createdAt)}
          {flag.communityId ? ` · ${flag.communityId}` : " · profile wall or DM"}
        </span>
        {decided ? (
          <span className="ml-auto font-bold capitalize text-muted">{flag.status}</span>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-semibold">
        {flag.reasons.join(" · ") || "Possible rule break"}
      </p>
      {flag.minors ? (
        <p className="mt-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">
          Possibly involves minors. Its pictures are locked and not shown to anyone. Do not download
          or share it. The site owner should report it (in Canada to Cybertip.ca, in the US to the
          NCMEC CyberTipline) and follow the steps in DEPLOY.md.
        </p>
      ) : null}
      {flag.excerpt ? (
        <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-muted">
          {flag.excerpt}
        </blockquote>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {flag.href && flag.targetType === "post" ? (
          <a className="text-xs font-bold text-accent" href={flag.href}>
            Open the post
          </a>
        ) : flag.href && flag.targetType !== "message" ? (
          <Link className="text-xs font-bold text-accent" to={flag.href as never}>
            Open where it was posted
          </Link>
        ) : null}
        {!decided ? (
          <div className="ml-auto flex gap-2">
            {flag.action === "hold" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || flag.minors}
                onClick={() => onDecide("restore")}
              >
                Restore
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onDecide("dismiss")}
              >
                It's fine
              </Button>
            )}
            <Button size="sm" disabled={busy} onClick={() => onDecide("remove")}>
              Remove
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
