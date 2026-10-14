import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "./app-shell";
import { Button } from "./ui/button";
import * as api from "@/lib/kamino/operations-v10";
import { indexSemanticContentV10 } from "@/lib/kamino/search-v10";
import { equipEarnedCosmetic } from "@/lib/kamino/community-v9";

type Row = Record<string, string | number | boolean | null>;
const card =
  "min-w-0 space-y-3 rounded-2xl border border-border bg-surface p-4 [overflow-wrap:anywhere]";
const input =
  "w-full rounded-xl border border-border bg-surface p-3 text-fg focus:outline-2 focus:outline-accent";
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
    </label>
  );
}
function useSave() {
  const client = useQueryClient(),
    [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (work: () => Promise<unknown>, done?: () => void) => {
      if (busy) return;
      setBusy(true);
      try {
        await work();
        await client.invalidateQueries({ queryKey: ["operations"] });
        toast.success("Saved");
        done?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save.");
      } finally {
        setBusy(false);
      }
    },
  };
}
type Season = Awaited<ReturnType<typeof api.getOperationsCenter>>["seasons"][number];
function SeasonCard({ season, admin = false }: { season: Season; admin?: boolean }) {
  const save = useSave();
  return (
    <Panel title={season.title}>
      <p className="text-sm text-muted">
        {season.status} · {new Date(season.startsAt).toLocaleDateString()}–
        {new Date(season.endsAt).toLocaleDateString()}
      </p>
      <p>
        <strong>
          {season.points} points · Level {season.level}
        </strong>
      </p>
      <p className="text-sm text-muted">
        Each UTC day earns up to 50 points for five published posts, 20 for ten replies and 5 for
        one check-in. A new season starts your season progress at zero. Your reputation and earned
        colours stay with you.
      </p>
      {season.sets.map((set) => (
        <div className="rounded-xl bg-elevated p-3 space-y-2" key={Number(set.id)}>
          <h3 className="font-semibold">
            {String(set.title)} · {String(set.cosmetic)}
          </h3>
          <p className="text-sm">{String(set.description)}</p>
          <p className="text-sm text-muted">
            {Number(set.required_points)} points required ·{" "}
            {Number(set.supply) - Number(set.awarded)} of {Number(set.supply)} available
          </p>
          <progress
            className="w-full accent-violet"
            aria-label={`${set.title} progress`}
            value={Math.min(season.points, Number(set.required_points))}
            max={Number(set.required_points)}
          />
          {set.claimed ? (
            <>
              <p>Claimed ✓</p>
              <Button
                variant="secondary"
                disabled={save.busy}
                onClick={() =>
                  void save.run(() =>
                    equipEarnedCosmetic({
                      data: {
                        cosmetic: String(set.cosmetic) as "aurora" | "sunrise" | "ocean" | "forest",
                      },
                    }),
                  )
                }
              >
                Use earned colour
              </Button>
            </>
          ) : (
            <Button
              disabled={
                save.busy ||
                season.status !== "active" ||
                season.points < Number(set.required_points) ||
                Number(set.awarded) >= Number(set.supply)
              }
              onClick={() =>
                void save.run(() => api.claimSeasonCollectible({ data: Number(set.id) }))
              }
            >
              Claim earned colour
            </Button>
          )}
        </div>
      ))}
      {admin && season.status !== "ended" ? (
        <Button
          variant="danger"
          disabled={save.busy}
          onClick={() => {
            if (
              window.confirm(
                "End this season now? Its progress and earned collectibles remain in history.",
              )
            )
              void save.run(() => api.endProgressionSeason({ data: season.id }));
          }}
        >
          End season
        </Button>
      ) : null}
    </Panel>
  );
}
function MemberCase({ item, appeal, events }: { item: Row; appeal?: Row; events: Row[] }) {
  const [message, setMessage] = useState(""),
    save = useSave();
  return (
    <Panel title={`Case #${item.id}`}>
      <p className="text-sm">
        {String(item.status)} · {String(item.decision) || "Under review"}
      </p>
      <p>{String(item.public_reason) || "A moderator is reviewing this case."}</p>
      {events.map((event, index) => (
        <p key={index} className="text-sm text-muted">
          {String(event.kind)}: {String(event.note)}
        </p>
      ))}
      {appeal ? (
        <div className="rounded-xl bg-elevated p-3">
          <p>Appeal: {String(appeal.status)}</p>
          <p>{String(appeal.message)}</p>
          <p>{String(appeal.decision_note)}</p>
        </div>
      ) : ["decided", "closed"].includes(String(item.status)) && item.decision !== "no_action" ? (
        <>
          <Field label="Why should this decision change?">
            <textarea
              className={input}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={3000}
              rows={4}
            />
          </Field>
          <Button
            disabled={save.busy || message.trim().length < 20}
            onClick={() =>
              void save.run(
                () => api.submitCaseAppeal({ data: { caseId: Number(item.id), message } }),
                () => setMessage(""),
              )
            }
          >
            Submit appeal
          </Button>
        </>
      ) : null}
    </Panel>
  );
}
export function OperationsCenter() {
  const q = useQuery({
      queryKey: ["operations", "member"],
      queryFn: () => api.getOperationsCenter(),
    }),
    save = useSave();
  return (
    <AppShell padded back title="Notifications & seasons">
      <div className="space-y-4">
        {q.isPending ? (
          <p role="status">Loading your activity…</p>
        ) : q.error ? (
          <p role="alert">{q.error.message}</p>
        ) : q.data ? (
          <>
            <Panel title="Weekly email digest">
              <p>
                Get a weekly activity summary for your communities. Your email address must be
                verified. You can turn this off at any time.
              </p>
              <p className="text-sm text-muted">
                {q.data.emailConfigured
                  ? "Email service connected."
                  : "Email service awaits configuration; preferences are saved and messages stay queued."}
              </p>
              <Button
                disabled={save.busy}
                variant={q.data.emailDigest ? "secondary" : "primary"}
                onClick={() =>
                  void save.run(() => api.setEmailDigest({ data: !q.data!.emailDigest }))
                }
              >
                {q.data.emailDigest ? "Turn off email digest" : "Enable email digest"}
              </Button>
              <p className="text-sm">
                Phone delivery:{" "}
                {q.data.pushConfigured ? "enabled" : "awaiting operator configuration"}.
              </p>
              {q.data.deliveries.map((row) => (
                <p className="text-xs text-muted" key={Number(row.id)}>
                  Week of {String(row.week_start)} · {String(row.status)} · {Number(row.attempts)}{" "}
                  attempts{row.last_error ? ` · ${row.last_error}` : ""}
                </p>
              ))}
            </Panel>
            <div className="flex flex-wrap gap-2">
              <a className="text-accent underline" href="/appeal">
                Email-verified appeal access
              </a>
              {q.data.isAdmin ? (
                <a className="text-accent underline" href="/admin/operations">
                  Administrator operations
                </a>
              ) : null}
            </div>
            <h2 className="text-xl font-bold">Seasons & limited collectibles</h2>
            {!q.data.seasons.length ? (
              <p className="text-muted">No seasons have been announced yet.</p>
            ) : (
              q.data.seasons.map((season) => <SeasonCard key={season.id} season={season} />)
            )}
            <h2 className="text-xl font-bold">Your moderation cases</h2>
            {q.data.cases.length ? (
              q.data.cases.map((item) => (
                <MemberCase
                  key={Number(item.id)}
                  item={item}
                  appeal={q.data.appeals.find((a) => a.case_id === item.id)}
                  events={q.data.events.filter((event) => event.case_id === item.id)}
                />
              ))
            ) : (
              <p className="text-muted">No cases on your account.</p>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

type Admin = Awaited<ReturnType<typeof api.getAdminOperations>>;
function AdminCase({ item, events }: { item: Row; events: Row[] }) {
  const save = useSave(),
    [note, setNote] = useState(""),
    [visible, setVisible] = useState(false),
    [decision, setDecision] = useState<"no_action" | "warning" | "suspended" | "banned">("warning"),
    [days, setDays] = useState("7");
  return (
    <Panel title={`Case #${item.id} · ${item.display_name || item.subject_id}`}>
      <p className="text-xs text-muted">
        {String(item.status)} · {String(item.priority)} · Assigned:{" "}
        {String(item.assigned_to ?? "Unassigned")}
      </p>
      <p>{String(item.summary)}</p>
      <p>{String(item.public_reason)}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={save.busy}
          onClick={() =>
            void save.run(() =>
              api.updateModerationCase({ data: { id: Number(item.id), action: "claim" } }),
            )
          }
        >
          Assign to me
        </Button>
        <Button
          variant="ghost"
          disabled={save.busy}
          onClick={() =>
            void save.run(() =>
              api.updateModerationCase({ data: { id: Number(item.id), action: "unassign" } }),
            )
          }
        >
          Unassign
        </Button>
        {["open", "investigating"].includes(String(item.status)) ? (
          <Button
            variant="secondary"
            disabled={save.busy}
            onClick={() =>
              void save.run(() =>
                api.updateModerationCase({
                  data: { id: Number(item.id), action: "investigating" },
                }),
              )
            }
          >
            Investigating
          </Button>
        ) : item.status === "decided" ? (
          <Button
            variant="secondary"
            disabled={save.busy}
            onClick={() =>
              void save.run(() =>
                api.updateModerationCase({ data: { id: Number(item.id), action: "close" } }),
              )
            }
          >
            Close case
          </Button>
        ) : null}
      </div>
      <Field label="Case note or decision reason">
        <textarea
          className={input}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </Field>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Show this note to the member
      </label>
      <Button
        variant="secondary"
        disabled={save.busy || note.trim().length < 5}
        onClick={() =>
          void save.run(
            () =>
              api.updateModerationCase({
                data: { id: Number(item.id), action: "note", note, memberVisible: visible },
              }),
            () => setNote(""),
          )
        }
      >
        Add note
      </Button>
      {["open", "investigating"].includes(String(item.status)) ? (
        <>
          <Field label="Decision">
            <select
              className={input}
              value={decision}
              onChange={(e) => setDecision(e.target.value as typeof decision)}
            >
              <option value="no_action">No action</option>
              <option value="warning">Warning</option>
              <option value="suspended">Suspend account</option>
              <option value="banned">Ban account</option>
            </select>
          </Field>
          {decision === "suspended" ? (
            <Field label="Suspension days">
              <input
                className={input}
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </Field>
          ) : null}
          <p className="text-sm text-muted">
            The decision reason is shared with the member. Another administrator must review an
            appeal.
          </p>
          <Button
            variant={decision === "banned" || decision === "suspended" ? "danger" : "primary"}
            disabled={save.busy || note.trim().length < 5}
            onClick={() => {
              if (window.confirm(`Record ${decision.replace("_", " ")} for this account?`))
                void save.run(
                  () =>
                    api.decideModerationCase({
                      data: { id: Number(item.id), decision, reason: note, days: Number(days) },
                    }),
                  () => setNote(""),
                );
            }}
          >
            Record decision
          </Button>
        </>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Case history ({events.length})
        </summary>
        {events.map((event) => (
          <div className="mt-2 rounded-lg bg-elevated p-2 text-sm" key={Number(event.id)}>
            <p>
              {String(event.kind)} · {event.member_visible ? "Visible to member" : "Internal"}
            </p>
            <p>{String(event.note)}</p>
          </div>
        ))}
      </details>
    </Panel>
  );
}
function AdminAppeal({ item }: { item: Row }) {
  const save = useSave(),
    [note, setNote] = useState("");
  return (
    <Panel title={`Appeal #${item.id} · Case #${item.case_id}`}>
      <p>{String(item.message)}</p>
      <p className="text-sm text-muted">
        Decision: {String(item.decision)} · {String(item.status)}
      </p>
      <p>{String(item.decision_note)}</p>
      {item.status === "open" ? (
        <>
          <Field label="Appeal decision reason">
            <textarea
              className={input}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {(["upheld", "overturned"] as const).map((decision) => (
              <Button
                key={decision}
                variant="secondary"
                disabled={save.busy || note.trim().length < 5}
                onClick={() =>
                  void save.run(() =>
                    api.reviewCaseAppeal({ data: { id: Number(item.id), decision, note } }),
                  )
                }
              >
                {decision === "upheld" ? "Uphold decision" : "Overturn decision"}
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </Panel>
  );
}
function OpenCase({ reports }: { reports: Admin["reports"] }) {
  const save = useSave(),
    [report, setReport] = useState(""),
    [subject, setSubject] = useState(""),
    [summary, setSummary] = useState(""),
    [priority, setPriority] = useState<"normal" | "urgent">("normal");
  return (
    <Panel title="Open a moderation case">
      <Field label="Member report">
        <select
          className={input}
          value={report}
          onChange={(e) => {
            setReport(e.target.value);
            const chosen = reports.find((r) => String(r.id) === e.target.value);
            if (chosen) setSummary(String(chosen.reason));
          }}
        >
          <option value="">Direct account review</option>
          {reports.map((r) => (
            <option key={Number(r.id)} value={String(r.id)}>
              #{r.id} · {r.target_type} · {String(r.reason).slice(0, 80)}
            </option>
          ))}
        </select>
      </Field>
      {!report ? (
        <Field label="Member account ID">
          <input
            className={input}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={100}
          />
        </Field>
      ) : (
        <p className="whitespace-pre-wrap text-sm">
          {String(reports.find((r) => String(r.id) === report)?.details ?? "")}
        </p>
      )}
      <Field label="Internal case summary">
        <textarea
          className={input}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={2000}
        />
      </Field>
      <Field label="Priority">
        <select
          className={input}
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
        >
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </select>
      </Field>
      <Button
        disabled={save.busy || summary.trim().length < 5 || (!report && !subject)}
        onClick={() =>
          void save.run(
            () =>
              api.openModerationCase({
                data: {
                  ...(report ? { reportId: Number(report) } : { subjectId: subject }),
                  summary,
                  priority,
                },
              }),
            () => {
              setSummary("");
              setReport("");
              setSubject("");
            },
          )
        }
      >
        Open case
      </Button>
    </Panel>
  );
}
function Experiments({ items }: { items: Row[] }) {
  const save = useSave(),
    [key, setKey] = useState(""),
    [title, setTitle] = useState(""),
    [feature, setFeature] = useState<"related_discovery" | "discovery_assistant">(
      "related_discovery",
    ),
    [percent, setPercent] = useState("50");
  return (
    <Panel title="Feature experiments">
      <p className="text-sm text-muted">
        Control has the selected feature off; treatment has it on. Assignment is stable per account.
        Exposures come from the real server feature consumer. Outcomes count one successful
        discovery interaction or assistant answer per exposed member. Existing platform switches
        remain the master off control. Rates describe observed users; they do not establish
        causation.
      </p>
      <Field label="Experiment key">
        <input
          className={input}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="related-discovery-v1"
          maxLength={60}
        />
      </Field>
      <Field label="Title">
        <input
          className={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
        />
      </Field>
      <Field label="Feature">
        <select
          className={input}
          value={feature}
          onChange={(e) => setFeature(e.target.value as typeof feature)}
        >
          <option value="related_discovery">Related discovery</option>
          <option value="discovery_assistant">Discovery assistant</option>
        </select>
      </Field>
      <Field label="Treatment allocation (%)">
        <input
          className={input}
          type="number"
          min={1}
          max={99}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
        />
      </Field>
      <Button
        disabled={save.busy || !key || title.length < 3}
        onClick={() =>
          void save.run(
            () =>
              api.savePlatformExperiment({
                data: {
                  key,
                  title,
                  featureKey: feature,
                  treatmentPercent: Number(percent),
                  status: "draft",
                },
              }),
            () => {
              setKey("");
              setTitle("");
            },
          )
        }
      >
        Create draft
      </Button>
      {items.map((item) => (
        <div className="space-y-2 rounded-xl bg-elevated p-3" key={Number(item.id)}>
          <h3 className="font-semibold">
            {String(item.title)} · {String(item.status)}
          </h3>
          <p className="text-xs text-muted">
            {String(item.feature_key)} · {Number(item.treatment_percent)}% treatment
          </p>
          {(["control", "treatment"] as const).map((variant) => {
            const exposed = Number(item[`${variant}_exposures`]),
              converted = Number(item[`${variant}_conversions`]);
            return (
              <p className="text-sm" key={variant}>
                {variant}: {exposed} exposed · {converted} outcomes ·{" "}
                {exposed ? `${Math.round((converted / exposed) * 100)}%` : "No rate yet"}
              </p>
            );
          })}
          {item.status !== "ended" ? (
            <Button
              variant="secondary"
              disabled={save.busy}
              onClick={() =>
                void save.run(() =>
                  api.savePlatformExperiment({
                    data: {
                      id: Number(item.id),
                      key: String(item.key),
                      title: String(item.title),
                      featureKey: String(item.feature_key) as typeof feature,
                      treatmentPercent: Number(item.treatment_percent),
                      status: item.status === "draft" ? "running" : "ended",
                    },
                  }),
                )
              }
            >
              {item.status === "draft" ? "Start experiment" : "End experiment"}
            </Button>
          ) : null}
        </div>
      ))}
    </Panel>
  );
}
function CreateSeason() {
  const save = useSave(),
    [title, setTitle] = useState(""),
    [start, setStart] = useState(() => new Date().toISOString().slice(0, 16)),
    [end, setEnd] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16)),
    [sets, setSets] = useState([
      {
        title: "Season colour",
        description: "Earned through participation.",
        cosmetic: "aurora" as "aurora" | "sunrise" | "ocean" | "forest",
        requiredPoints: 100,
        supply: 1000,
      },
    ]);
  return (
    <Panel title="Announce a new season">
      <Field label="Season title">
        <input
          className={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
        />
      </Field>
      <p className="text-xs text-muted">
        Dates below are UTC. Existing earned collectibles remain after the season ends.
      </p>
      <Field label="Starts (UTC)">
        <input
          className={input}
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </Field>
      <Field label="Ends (UTC)">
        <input
          className={input}
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </Field>
      {sets.map((item, index) => (
        <div className="space-y-2 rounded-xl bg-elevated p-3" key={index}>
          <Field label="Collectible name">
            <input
              className={input}
              value={item.title}
              onChange={(e) =>
                setSets((rows) =>
                  rows.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)),
                )
              }
            />
          </Field>
          <Field label="Colour">
            <select
              className={input}
              value={item.cosmetic}
              onChange={(e) =>
                setSets((rows) =>
                  rows.map((r, i) =>
                    i === index ? { ...r, cosmetic: e.target.value as typeof item.cosmetic } : r,
                  ),
                )
              }
            >
              {["aurora", "sunrise", "ocean", "forest"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Points required">
            <input
              className={input}
              type="number"
              min={1}
              value={item.requiredPoints}
              onChange={(e) =>
                setSets((rows) =>
                  rows.map((r, i) =>
                    i === index ? { ...r, requiredPoints: Number(e.target.value) } : r,
                  ),
                )
              }
            />
          </Field>
          <Field label="Total supply">
            <input
              className={input}
              type="number"
              min={1}
              value={item.supply}
              onChange={(e) =>
                setSets((rows) =>
                  rows.map((r, i) => (i === index ? { ...r, supply: Number(e.target.value) } : r)),
                )
              }
            />
          </Field>
          {sets.length > 1 ? (
            <Button
              variant="ghost"
              onClick={() => setSets((rows) => rows.filter((_, i) => i !== index))}
            >
              Remove set
            </Button>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={sets.length >= 4}
          onClick={() =>
            setSets((rows) => [
              ...rows,
              {
                title: "Earned colour",
                description: "Earned through participation.",
                cosmetic: "ocean",
                requiredPoints: 200,
                supply: 500,
              },
            ])
          }
        >
          Add collectible set
        </Button>
        <Button
          disabled={save.busy || title.length < 3 || !start || !end}
          onClick={() =>
            void save.run(
              () =>
                api.createProgressionSeason({
                  data: {
                    title,
                    startsAt: new Date(`${start}:00Z`).toISOString(),
                    endsAt: new Date(`${end}:00Z`).toISOString(),
                    sets,
                  },
                }),
              () => setTitle(""),
            )
          }
        >
          Publish season
        </Button>
      </div>
    </Panel>
  );
}
function ReindexSearch() {
  const save = useSave();
  return (
    <div className="space-y-1">
      <Button variant="secondary" disabled={save.busy} onClick={() => void save.run(() => indexSemanticContentV10({ data: { consent: true } }))}>
        Reindex semantic search now
      </Button>
      <p className="text-xs text-muted">
        The background job indexes new content every minute; this forces an extra pass (needs a configured
        embedding provider).
      </p>
    </div>
  );
}

export function AdminOperations() {
  const q = useQuery({
    queryKey: ["operations", "admin"],
    queryFn: () => api.getAdminOperations(),
  });
  return (
    <AppShell padded back title="Operations & case management">
      <div className="space-y-4">
        {q.isPending ? (
          <p role="status">Loading operations…</p>
        ) : q.error ? (
          <p role="alert">{q.error.message}</p>
        ) : q.data ? (
          <>
            <Panel title="Delivery health">
              <p>
                Email: {q.data.emailConfigured ? "connected" : "not configured"} · Push:{" "}
                {q.data.pushConfigured ? "enabled" : "not configured"}
              </p>
              <p className="text-sm text-muted">
                Push status “delivered” means Apple/Google accepted the message, as confirmed by a
                provider receipt. It does not prove the device displayed it. Retries are bounded and
                quiet hours are respected.
              </p>
              {q.data.deliveryStats.map((row) => (
                <p key={`${row.channel}:${row.status}`}>
                  {String(row.channel)} · {String(row.status)}: {Number(row.count)}
                </p>
              ))}
            </Panel>
            <OpenCase reports={q.data.reports} />
            <h2 className="text-xl font-bold">Appeals</h2>
            {q.data.appeals.length ? (
              q.data.appeals.map((item) => <AdminAppeal key={Number(item.id)} item={item} />)
            ) : (
              <p>No appeals waiting.</p>
            )}
            <h2 className="text-xl font-bold">Moderation cases</h2>
            {q.data.cases.map((item) => (
              <AdminCase
                key={Number(item.id)}
                item={item}
                events={q.data!.events.filter((e) => e.case_id === item.id)}
              />
            ))}
            <Experiments items={q.data.experiments} />
            <CreateSeason />
            {q.data.seasons.map((season) => (
              <SeasonCard key={season.id} season={season} admin />
            ))}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
