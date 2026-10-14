import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import { stories } from "@/api/profile-stories";
import { safety, type SiteReport } from "@/api/site-reports";
import type { SafetyFlag } from "@/api/types";
import { confirmAction, notify } from "@/components/community/platform";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Txt,
} from "@/components/ui";
import { showError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { appHrefFromServerHref } from "@/lib/hrefs";
import { space } from "@/theme";

/** Mounted only after the shared server has confirmed a verified platform administrator. Every RPC checks again. */
export function SiteSafetyQueues() {
  const [tab, setTab] = useState<"flags" | "reports">("flags");
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="heading">Site administration</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Chip
          label="Safety queue"
          selected={tab === "flags"}
          onPress={() => setTab("flags")}
        />
        <Chip
          label="Human reports"
          selected={tab === "reports"}
          onPress={() => setTab("reports")}
        />
      </View>
      {tab === "flags" ? <SiteFlags /> : <SiteReports />}
    </View>
  );
}

function SiteFlags() {
  const client = useQueryClient();
  const flags = useQuery({
    queryKey: ["siteSafetyFlags"],
    queryFn: safety.flags,
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const decide = async (
    flag: SafetyFlag,
    decision: "restore" | "remove" | "dismiss",
  ) => {
    if (
      decision === "remove" &&
      !(await confirmAction(
        "Remove this content?",
        "This decision removes the content and is recorded for review.",
        "Remove",
        true,
      ))
    )
      return;
    setBusy(flag.id);
    try {
      await api.reviewSafetyFlag(flag.id, decision);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["siteSafetyFlags"] }),
        client.invalidateQueries({ queryKey: ["safety"] }),
      ]);
      notify(
        "Decision saved",
        decision === "restore"
          ? "The content has been restored."
          : decision === "remove"
            ? "The content has been removed."
            : "The flag has been dismissed.",
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };
  if (flags.isPending) return <Loading />;
  if (flags.isError)
    return (
      <ErrorState error={flags.error} onRetry={() => void flags.refetch()} />
    );
  const items = (flags.data ?? []).filter((flag) =>
    closed ? flag.status !== "open" : flag.status === "open",
  );
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="small" tone="muted">
        Serious flags across communities and flags from profile walls or direct
        messages. Reviewers decide whether to restore or remove held content. Up
        to 200 recent flags are shown.
      </Txt>
      <Button
        small
        variant="secondary"
        label={closed ? "Show waiting flags" : "Show reviewed flags"}
        onPress={() => setClosed((value) => !value)}
      />
      {!items.length ? (
        <EmptyState
          icon="shield-checkmark-outline"
          title={closed ? "No reviewed flags" : "Nothing waiting"}
          body="Refresh to check for new items."
        />
      ) : null}
      {items.map((flag) => (
        <Card key={flag.id}>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
          >
            <Chip label={flag.targetType} />
            <Chip
              label={
                flag.action === "hold" ? "Held (hidden)" : "Flagged (visible)"
              }
              tone={flag.action === "hold" ? "danger" : "default"}
            />
            {flag.severe ? <Chip label="Serious" tone="danger" /> : null}
          </View>
          <Txt variant="caption" tone="subtle">
            {flag.authorName} · {timeAgo(flag.createdAt)} ·{" "}
            {flag.communityId ?? "Profile wall or DM"}
          </Txt>
          <Txt variant="label">
            {flag.reasons.join(" · ") || "Possible rule break"}
          </Txt>
          {flag.minors ? (
            <Txt tone="danger" variant="small">
              This flag may involve minors. Media stays locked. Follow the
              platform incident reporting process. Restoration is unavailable
              here.
            </Txt>
          ) : null}
          {flag.excerpt ? <Txt tone="muted">{flag.excerpt}</Txt> : null}
          {!closed ? (
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
            >
              {!flag.minors && flag.href && flag.targetType !== "message" ? (
                <Button
                  small
                  variant="secondary"
                  label="Open context"
                  onPress={() =>
                    router.push(appHrefFromServerHref(flag.href) as never)
                  }
                />
              ) : null}
              {flag.action === "hold" ? (
                <Button
                  small
                  variant="secondary"
                  label="Restore"
                  disabled={busy !== null || flag.minors}
                  onPress={() => void decide(flag, "restore")}
                />
              ) : (
                <Button
                  small
                  variant="secondary"
                  label="Dismiss flag"
                  disabled={busy !== null}
                  onPress={() => void decide(flag, "dismiss")}
                />
              )}
              <Button
                small
                variant="danger"
                label="Remove"
                disabled={busy !== null}
                onPress={() => void decide(flag, "remove")}
              />
            </View>
          ) : (
            <Chip label={flag.status} tone="ok" />
          )}
        </Card>
      ))}
    </View>
  );
}

function SiteReports() {
  const [closed, setClosed] = useState(false);
  const reports = useInfiniteQuery({
    queryKey: ["siteReports", closed],
    queryFn: ({ pageParam }) =>
      safety.reports({ closed, ...(pageParam ? { beforeId: pageParam } : {}) }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.nextBeforeId ?? undefined,
  });
  return (
    <View style={{ gap: space.md }}>
      <Txt variant="small" tone="muted">
        Reports from members across the site. The list shows what the reporter
        supplied; it does not fetch private message bodies. Closing a report
        records your decision and leaves content unchanged.
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Chip
          label="Waiting"
          selected={!closed}
          onPress={() => setClosed(false)}
        />
        <Chip
          label="Reviewed"
          selected={closed}
          onPress={() => setClosed(true)}
        />
      </View>
      {reports.isPending ? (
        <Loading />
      ) : reports.isError ? (
        <ErrorState
          error={reports.error}
          onRetry={() => void reports.refetch()}
        />
      ) : null}
      {!reports.isPending &&
      !reports.isError &&
      !reports.data?.pages.some((page) => page.reports.length) ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title={closed ? "No reviewed reports" : "No reports waiting"}
          body="Members can report content from its menu."
        />
      ) : null}
      {reports.data?.pages
        .flatMap((page) => page.reports)
        .map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      {reports.hasNextPage ? (
        <Button
          label="Load more reports"
          variant="secondary"
          busy={reports.isFetchingNextPage}
          onPress={() => void reports.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}

function ReportCard({ report }: { report: SiteReport }) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const review = async (status: "resolved" | "dismissed") => {
    setBusy(true);
    try {
      await safety.review(report.id, status, note);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["siteReports"] }),
        client.invalidateQueries({ queryKey: ["adminDashboard"] }),
        client.invalidateQueries({ queryKey: ["mod"] }),
      ]);
      notify(
        "Report reviewed",
        "Your decision has been recorded in the platform audit.",
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Chip label={report.targetType} />
        <Chip
          label={report.status}
          tone={report.status === "open" ? "danger" : "ok"}
        />
      </View>
      <Txt variant="caption" tone="subtle">
        #{report.id} · {report.communityName || "Site report"} ·{" "}
        {timeAgo(report.createdAt)}
      </Txt>
      <Txt variant="heading">{report.reason}</Txt>
      <Txt variant="small" tone="muted">
        Target: {report.targetType} {report.targetId}
      </Txt>
      {report.details ? (
        <Txt>{report.details}</Txt>
      ) : (
        <Txt tone="muted">No extra details supplied.</Txt>
      )}
      {report.targetType === "profile_story" &&
      /^\d+$/.test(report.targetId) ? (
        <>
          <Field
            label="Story visibility reason"
            value={note}
            onChangeText={setNote}
            maxLength={1000}
          />
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
          >
            {[true, false].map((hidden) => (
              <Button
                key={String(hidden)}
                small
                variant={hidden ? "danger" : "secondary"}
                label={hidden ? "Hide story" : "Restore story"}
                disabled={busy || !note.trim()}
                onPress={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      await stories.hide(Number(report.targetId), hidden, note);
                      notify(
                        hidden ? "Story hidden" : "Story restored",
                        "The original audience and expiry still apply.",
                      );
                    } catch (e) {
                      showError(e);
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              />
            ))}
          </View>
        </>
      ) : null}
      {report.status === "open" ? (
        <>
          <Field
            label="Review note (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            placeholder="Your internal review note"
          />
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
          >
            {report.targetType === "post" &&
            report.communityId &&
            /^\d+$/.test(report.targetId) ? (
              <Button
                small
                variant="secondary"
                label="Open post"
                onPress={() =>
                  router.push(
                    `/community/${report.communityId}/post/${report.targetId}` as never,
                  )
                }
              />
            ) : null}
            <Button
              small
              label="Resolve report"
              busy={busy}
              onPress={() => void review("resolved")}
            />
            <Button
              small
              variant="ghost"
              label="Dismiss report"
              disabled={busy}
              onPress={() => void review("dismissed")}
            />
          </View>
        </>
      ) : null}
    </Card>
  );
}
