import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listSiteReports, reviewSiteReport } from "@/lib/kamino/site-reports";
import { setProfileStoryHidden } from "@/lib/kamino/profile-stories";
import { timeAgo } from "@/lib/utils";

type Report = Awaited<ReturnType<typeof listSiteReports>>["reports"][number];

export function SiteReports() {
  const [closed, setClosed] = useState(false);
  const reports = useInfiniteQuery({
    queryKey: ["siteReports", closed],
    queryFn: ({ pageParam }) =>
      listSiteReports({ data: { closed, ...(pageParam ? { beforeId: pageParam } : {}) } }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextBeforeId ?? undefined,
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Member reports across the site. Details come from the reporter; this list does not fetch
        private message bodies. Resolving a report records your review. Content removal is a
        separate moderation action.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant={closed ? "secondary" : "primary"} onClick={() => setClosed(false)}>
          Waiting
        </Button>
        <Button variant={closed ? "primary" : "secondary"} onClick={() => setClosed(true)}>
          Reviewed
        </Button>
        <Button
          variant="ghost"
          onClick={() => void reports.refetch()}
          disabled={reports.isFetching}
        >
          Refresh
        </Button>
      </div>
      {reports.isPending ? (
        <p className="text-sm text-muted">Loading reports…</p>
      ) : reports.isError ? (
        <p role="alert" className="text-sm text-danger">
          {reports.error.message}
        </p>
      ) : !reports.data?.pages.some((page) => page.reports.length) ? (
        <p className="text-sm text-muted">
          {closed ? "No reviewed reports." : "No reports waiting."}
        </p>
      ) : null}
      {reports.data?.pages
        .flatMap((page) => page.reports)
        .map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      {reports.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={reports.isFetchingNextPage}
          onClick={() => void reports.fetchNextPage()}
        >
          {reports.isFetchingNextPage ? "Loading…" : "Load more reports"}
        </Button>
      ) : null}
    </div>
  );
}

function ReportCard({ report }: { report: Report }) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const review = async (status: "resolved" | "dismissed") => {
    setBusy(true);
    try {
      await reviewSiteReport({ data: { id: report.id, status, note } });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["siteReports"] }),
        client.invalidateQueries({ queryKey: ["adminDashboard"] }),
        client.invalidateQueries({ queryKey: ["mod"] }),
      ]);
      toast.success("Report reviewed and recorded in the platform audit.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not review this report.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="k-card space-y-3 rounded-card p-4">
      <p className="text-xs text-muted">
        #{report.id} · {report.targetType} · {report.communityName || "Site report"} ·{" "}
        {timeAgo(report.createdAt)} · {report.status}
      </p>
      <h2 className="font-display text-lg font-bold text-ink">{report.reason}</h2>
      <p className="text-xs text-muted">
        Target: {report.targetType} {report.targetId}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm text-body">
        {report.details || "No extra details supplied."}
      </p>
      {report.targetType === "profile_story" && /^\d+$/.test(report.targetId) ? (
        <div className="space-y-2">
          <label className="block text-sm">
            Story visibility reason
            <input
              className="w-full rounded-xl border border-border bg-surface p-3"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[true, false].map((hidden) => (
              <Button
                key={String(hidden)}
                size="sm"
                variant={hidden ? "danger" : "secondary"}
                disabled={busy || !note.trim()}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      await setProfileStoryHidden({
                        data: { storyId: Number(report.targetId), hidden, reason: note },
                      });
                      toast.success(
                        hidden
                          ? "Story hidden."
                          : "Story restored; original audience and expiry still apply.",
                      );
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not update story.");
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                {hidden ? "Hide story" : "Restore story"}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {report.status === "open" ? (
        <>
          <label className="block space-y-1 text-sm text-ink">
            <span>Review note (optional)</span>
            <textarea
              className="w-full rounded-xl border border-border bg-surface p-3"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              placeholder="Your internal review note"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {report.targetType === "post" && report.communityId && /^\d+$/.test(report.targetId) ? (
              <a
                className="text-sm font-semibold text-accent"
                href={`/c/${encodeURIComponent(report.communityId)}/p/${report.targetId}`}
              >
                Open post
              </a>
            ) : null}
            <Button size="sm" disabled={busy} onClick={() => void review("resolved")}>
              Resolve report
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void review("dismissed")}
            >
              Dismiss report
            </Button>
          </div>
        </>
      ) : null}
    </article>
  );
}
