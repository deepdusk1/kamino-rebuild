import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import {
  Screen,
  Card,
  Txt,
  Button,
  Field,
  Chip,
  Loading,
} from "@/components/ui";
import {
  operations,
  type OperationRow,
  type ProgressionSeason,
  type CaseDecision,
  type SeasonInput,
} from "@/api/operations-v10";
import { confirmAction } from "@/components/community/platform";
import { communityV9, type Cosmetic } from "@/api/community-v9";

function useSave() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    client = useQueryClient();
  return {
    busy,
    error,
    run: async (work: () => Promise<unknown>, done?: () => void) => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        await work();
        await client.invalidateQueries({ queryKey: ["operations"] });
        done?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      } finally {
        setBusy(false);
      }
    },
  };
}
function SaveError({ message }: { message: string }) {
  return message ? <Txt tone="danger">{message}</Txt> : null;
}
function SeasonCard({
  season,
  admin = false,
}: {
  season: ProgressionSeason;
  admin?: boolean;
}) {
  const save = useSave();
  return (
    <Card style={{ gap: 12 }}>
      <Txt variant="heading">{season.title}</Txt>
      <Txt tone="muted">
        {season.status} · {new Date(season.startsAt).toLocaleDateString()}–
        {new Date(season.endsAt).toLocaleDateString()}
      </Txt>
      <Txt>
        {season.points} points · Level {season.level}
      </Txt>
      <Txt tone="muted">
        Daily caps: five published posts × 10, ten replies × 2, one check-in ×
        5. Each new season starts fresh; your reputation and earned colours
        stay.
      </Txt>
      {season.sets.map((item) => (
        <View key={Number(item.id)} style={{ gap: 8 }}>
          <Txt variant="heading">
            {String(item.title)} · {String(item.cosmetic)}
          </Txt>
          <Txt>{String(item.description)}</Txt>
          <Txt tone="muted">
            {Number(item.required_points)} points required ·{" "}
            {Number(item.supply) - Number(item.awarded)} of{" "}
            {Number(item.supply)} available
          </Txt>
          <Button
            label={item.claimed ? "Claimed" : "Claim earned colour"}
            disabled={
              save.busy ||
              !!item.claimed ||
              season.status !== "active" ||
              season.points < Number(item.required_points) ||
              Number(item.awarded) >= Number(item.supply)
            }
            onPress={() =>
              void save.run(() => operations.claim(Number(item.id)))
            }
          />
          {item.claimed ? (
            <Button
              variant="secondary"
              label="Use earned colour"
              busy={save.busy}
              onPress={() =>
                void save.run(() =>
                  communityV9.equipCosmetic(String(item.cosmetic) as Cosmetic),
                )
              }
            />
          ) : null}
        </View>
      ))}
      {admin && season.status !== "ended" ? (
        <Button
          variant="danger"
          busy={save.busy}
          label="End season"
          onPress={() =>
            void (async () => {
              if (
                await confirmAction(
                  "End season?",
                  "Progress and earned colours remain in history.",
                  "End season",
                  true,
                )
              )
                await save.run(() => operations.endSeason(season.id));
            })()
          }
        />
      ) : null}
      <SaveError message={save.error} />
    </Card>
  );
}
function MemberCase({
  item,
  appeal,
  events,
}: {
  item: OperationRow;
  appeal?: OperationRow;
  events: OperationRow[];
}) {
  const save = useSave(),
    [message, setMessage] = useState("");
  return (
    <Card style={{ gap: 10 }}>
      <Txt variant="heading">Case #{item.id}</Txt>
      <Txt>
        {String(item.status)} · {String(item.decision) || "Under review"}
      </Txt>
      <Txt>
        {String(item.public_reason) || "A moderator is reviewing this case."}
      </Txt>
      {events.map((event, index) => (
        <Txt variant="small" key={index}>
          {String(event.kind)}: {String(event.note)}
        </Txt>
      ))}
      {appeal ? (
        <>
          <Txt>Appeal: {String(appeal.status)}</Txt>
          <Txt>{String(appeal.message)}</Txt>
          <Txt>{String(appeal.decision_note)}</Txt>
        </>
      ) : ["decided", "closed"].includes(String(item.status)) &&
        item.decision !== "no_action" ? (
        <>
          <Field
            label="Why should the decision change?"
            multiline
            value={message}
            onChangeText={setMessage}
            maxLength={3000}
          />
          <Button
            label="Submit appeal"
            busy={save.busy}
            disabled={message.trim().length < 20}
            onPress={() =>
              void save.run(
                () => operations.appeal(Number(item.id), message),
                () => setMessage(""),
              )
            }
          />
        </>
      ) : null}
      <SaveError message={save.error} />
    </Card>
  );
}
export function OperationsScreen() {
  const q = useQuery({
      queryKey: ["operations", "member"],
      queryFn: operations.center,
    }),
    save = useSave();
  return (
    <Screen>
      <Txt variant="title">Notifications & seasons</Txt>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <Txt tone="danger">{q.error.message}</Txt>
      ) : q.data ? (
        <>
          <Card style={{ gap: 12 }}>
            <Txt variant="heading">Weekly email digest</Txt>
            <Txt>
              Receive weekly community activity totals at your verified email
              address. Turn this off whenever you like.
            </Txt>
            <Txt tone="muted">
              {q.data.emailConfigured
                ? "Email service connected."
                : "Email service awaits configuration; your preference is saved."}
            </Txt>
            <Button
              label={
                q.data.emailDigest
                  ? "Turn off email digest"
                  : "Enable email digest"
              }
              busy={save.busy}
              onPress={() =>
                void save.run(() => operations.digest(!q.data!.emailDigest))
              }
            />
            <Txt tone="muted">
              Phone delivery:{" "}
              {q.data.pushConfigured ? "enabled" : "awaiting configuration"}.
            </Txt>
            {q.data.deliveries.map((row) => (
              <Txt variant="small" key={Number(row.id)}>
                Week of {String(row.week_start)} · {String(row.status)} ·{" "}
                {Number(row.attempts)} attempts
              </Txt>
            ))}
            <SaveError message={save.error} />
          </Card>
          <Button
            variant="secondary"
            label="Email-verified appeal access"
            onPress={() => router.push("/appeal")}
          />
          {q.data.isAdmin ? (
            <Button
              label="Administrator operations"
              variant="secondary"
              onPress={() => router.push("/admin-operations")}
            />
          ) : null}
          <Txt variant="heading">Seasons & limited collectibles</Txt>
          {q.data.seasons.length ? (
            q.data.seasons.map((season) => (
              <SeasonCard key={season.id} season={season} />
            ))
          ) : (
            <Txt tone="muted">No seasons announced yet.</Txt>
          )}
          <Txt variant="heading">Your moderation cases</Txt>
          {q.data.cases.length ? (
            q.data.cases.map((item) => (
              <MemberCase
                key={Number(item.id)}
                item={item}
                appeal={q.data!.appeals.find((a) => a.case_id === item.id)}
                events={q.data!.events.filter((e) => e.case_id === item.id)}
              />
            ))
          ) : (
            <Txt tone="muted">No cases on your account.</Txt>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function CaseCard({
  item,
  events,
}: {
  item: OperationRow;
  events: OperationRow[];
}) {
  const save = useSave(),
    [note, setNote] = useState(""),
    [visible, setVisible] = useState(false),
    [decision, setDecision] = useState<CaseDecision>("warning"),
    [days, setDays] = useState("7");
  return (
    <Card style={{ gap: 10 }}>
      <Txt variant="heading">
        Case #{item.id} · {String(item.display_name || item.subject_id)}
      </Txt>
      <Txt tone="muted">
        {String(item.status)} · {String(item.priority)} · Assigned:{" "}
        {String(item.assigned_to ?? "Unassigned")}
      </Txt>
      <Txt>{String(item.summary)}</Txt>
      <Txt>{String(item.public_reason)}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["claim", "unassign"] as const).map((action) => (
          <Button
            small
            key={action}
            variant="secondary"
            label={action === "claim" ? "Assign to me" : "Unassign"}
            busy={save.busy}
            onPress={() =>
              void save.run(() =>
                operations.updateCase({ id: Number(item.id), action }),
              )
            }
          />
        ))}
        {["open", "investigating"].includes(String(item.status)) ? (
          <Button
            small
            variant="secondary"
            label="Investigating"
            busy={save.busy}
            onPress={() =>
              void save.run(() =>
                operations.updateCase({
                  id: Number(item.id),
                  action: "investigating",
                }),
              )
            }
          />
        ) : item.status === "decided" ? (
          <Button
            small
            variant="secondary"
            label="Close case"
            busy={save.busy}
            onPress={() =>
              void save.run(() =>
                operations.updateCase({ id: Number(item.id), action: "close" }),
              )
            }
          />
        ) : null}
      </View>
      <Field
        label="Note or public decision reason"
        multiline
        maxLength={2000}
        value={note}
        onChangeText={setNote}
      />
      <Button
        variant="ghost"
        label={visible ? "Note visible to member" : "Note internal"}
        onPress={() => setVisible((v) => !v)}
      />
      <Button
        label="Add case note"
        variant="secondary"
        busy={save.busy}
        disabled={note.trim().length < 5}
        onPress={() =>
          void save.run(
            () =>
              operations.updateCase({
                id: Number(item.id),
                action: "note",
                note,
                memberVisible: visible,
              }),
            () => setNote(""),
          )
        }
      />
      {["open", "investigating"].includes(String(item.status)) ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["no_action", "warning", "suspended", "banned"] as const).map(
              (d) => (
                <Chip
                  key={d}
                  label={d.replace("_", " ")}
                  selected={decision === d}
                  onPress={() => setDecision(d)}
                />
              ),
            )}
          </View>
          {decision === "suspended" ? (
            <Field
              label="Suspension days"
              keyboardType="number-pad"
              value={days}
              onChangeText={setDays}
            />
          ) : null}
          <Button
            label="Record decision"
            variant={
              ["suspended", "banned"].includes(decision) ? "danger" : "primary"
            }
            busy={save.busy}
            disabled={note.trim().length < 5}
            onPress={() =>
              void (async () => {
                if (
                  await confirmAction(
                    "Record account decision?",
                    `${decision.replace("_", " ")}. Your reason is shared with the member.`,
                    "Record",
                    true,
                  )
                )
                  await save.run(
                    () =>
                      operations.decide({
                        id: Number(item.id),
                        decision,
                        reason: note,
                        days: Number(days),
                      }),
                    () => setNote(""),
                  );
              })()
            }
          />
        </>
      ) : null}
      {events.slice(0, 20).map((event) => (
        <Txt variant="small" key={Number(event.id)}>
          {String(event.kind)} (
          {event.member_visible ? "member visible" : "internal"}):{" "}
          {String(event.note)}
        </Txt>
      ))}
      <SaveError message={save.error} />
    </Card>
  );
}
function AppealCard({ item }: { item: OperationRow }) {
  const save = useSave(),
    [note, setNote] = useState("");
  return (
    <Card style={{ gap: 10 }}>
      <Txt variant="heading">
        Appeal #{item.id} · Case #{item.case_id}
      </Txt>
      <Txt>{String(item.message)}</Txt>
      <Txt tone="muted">
        {String(item.status)} · Original decision: {String(item.decision)}
      </Txt>
      <Txt>{String(item.decision_note)}</Txt>
      {item.status === "open" ? (
        <>
          <Field
            label="Appeal decision reason"
            multiline
            value={note}
            onChangeText={setNote}
            maxLength={2000}
          />
          {(["upheld", "overturned"] as const).map((d) => (
            <Button
              key={d}
              label={d === "upheld" ? "Uphold decision" : "Overturn decision"}
              variant="secondary"
              busy={save.busy}
              disabled={note.trim().length < 5}
              onPress={() =>
                void save.run(() =>
                  operations.reviewAppeal(Number(item.id), d, note),
                )
              }
            />
          ))}
        </>
      ) : null}
      <SaveError message={save.error} />
    </Card>
  );
}
function CaseForm({ reports }: { reports: OperationRow[] }) {
  const [report, setReport] = useState<number | undefined>(),
    [subject, setSubject] = useState(""),
    [summary, setSummary] = useState(""),
    [priority, setPriority] = useState<"normal" | "urgent">("normal"),
    save = useSave();
  return (
    <Card style={{ gap: 10 }}>
      <Txt variant="heading">Open a moderation case</Txt>
      <Txt tone="muted">
        Select an open report, or enter a member account ID.
      </Txt>
      <View style={{ gap: 8 }}>
        <Chip
          label="Direct account review"
          selected={!report}
          onPress={() => setReport(undefined)}
        />
        {reports.slice(0, 20).map((r) => (
          <Chip
            key={Number(r.id)}
            label={`#${r.id} ${String(r.reason).slice(0, 80)}`}
            selected={report === Number(r.id)}
            onPress={() => {
              setReport(Number(r.id));
              setSummary(String(r.reason));
            }}
          />
        ))}
      </View>
      {report ? (
        <Txt>
          {String(reports.find((r) => Number(r.id) === report)?.details ?? "")}
        </Txt>
      ) : (
        <Field
          label="Member account ID"
          value={subject}
          onChangeText={setSubject}
          maxLength={100}
        />
      )}
      <Field
        label="Internal summary"
        multiline
        value={summary}
        onChangeText={setSummary}
        maxLength={2000}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["normal", "urgent"] as const).map((p) => (
          <Chip
            key={p}
            label={p}
            selected={priority === p}
            onPress={() => setPriority(p)}
          />
        ))}
      </View>
      <Button
        label="Open case"
        busy={save.busy}
        disabled={summary.trim().length < 5 || (!report && !subject)}
        onPress={() =>
          void save.run(
            () =>
              operations.openCase({
                reportId: report,
                subjectId: report ? undefined : subject,
                summary,
                priority,
              }),
            () => {
              setSummary("");
              setSubject("");
              setReport(undefined);
            },
          )
        }
      />
      <SaveError message={save.error} />
    </Card>
  );
}
function ExperimentForm({ items }: { items: OperationRow[] }) {
  const save = useSave(),
    [key, setKey] = useState(""),
    [title, setTitle] = useState(""),
    [feature, setFeature] = useState<
      "related_discovery" | "discovery_assistant"
    >("related_discovery"),
    [percent, setPercent] = useState("50");
  return (
    <Card style={{ gap: 10 }}>
      <Txt variant="heading">Feature experiments</Txt>
      <Txt tone="muted">
        Stable account assignment. Control switches the feature off; treatment
        switches it on. Rates describe observations, not proven causal uplift.
      </Txt>
      <Field
        label="Experiment key"
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        maxLength={60}
      />
      <Field
        label="Title"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <View style={{ gap: 8 }}>
        {(["related_discovery", "discovery_assistant"] as const).map((f) => (
          <Chip
            key={f}
            label={f.replace("_", " ")}
            selected={feature === f}
            onPress={() => setFeature(f)}
          />
        ))}
      </View>
      <Field
        label="Treatment allocation (%)"
        value={percent}
        onChangeText={setPercent}
        keyboardType="number-pad"
      />
      <Button
        label="Create draft experiment"
        busy={save.busy}
        disabled={!key || title.length < 3}
        onPress={() =>
          void save.run(
            () =>
              operations.experiment({
                key,
                title,
                featureKey: feature,
                treatmentPercent: Number(percent),
                status: "draft",
              }),
            () => {
              setKey("");
              setTitle("");
            },
          )
        }
      />
      {items.map((item) => (
        <View key={Number(item.id)} style={{ gap: 8 }}>
          <Txt variant="heading">
            {String(item.title)} · {String(item.status)}
          </Txt>
          {(["control", "treatment"] as const).map((v) => (
            <Txt key={v}>
              {v}: {Number(item[`${v}_exposures`])} exposed ·{" "}
              {Number(item[`${v}_conversions`])} outcomes ·{" "}
              {Number(item[`${v}_exposures`])
                ? `${Math.round((Number(item[`${v}_conversions`]) / Number(item[`${v}_exposures`])) * 100)}%`
                : "No rate yet"}
            </Txt>
          ))}
          {item.status !== "ended" ? (
            <Button
              variant="secondary"
              busy={save.busy}
              label={
                item.status === "draft" ? "Start experiment" : "End experiment"
              }
              onPress={() =>
                void save.run(() =>
                  operations.experiment({
                    id: Number(item.id),
                    key: String(item.key),
                    title: String(item.title),
                    featureKey: String(item.feature_key) as typeof feature,
                    treatmentPercent: Number(item.treatment_percent),
                    status: item.status === "draft" ? "running" : "ended",
                  }),
                )
              }
            />
          ) : null}
        </View>
      ))}
      <SaveError message={save.error} />
    </Card>
  );
}
function SeasonForm() {
  const save = useSave(),
    [title, setTitle] = useState(""),
    [start, setStart] = useState(() => new Date().toISOString()),
    [end, setEnd] = useState(() =>
      new Date(Date.now() + 30 * 86400000).toISOString(),
    ),
    [sets, setSets] = useState<SeasonInput["sets"]>([
      {
        title: "Season colour",
        description: "Earned through participation.",
        cosmetic: "aurora",
        requiredPoints: 100,
        supply: 1000,
      },
    ]);
  return (
    <Card style={{ gap: 10 }}>
      <Txt variant="heading">Announce a season</Txt>
      <Field
        label="Season title"
        value={title}
        onChangeText={setTitle}
        maxLength={100}
      />
      <Field
        label="Starts (UTC ISO date)"
        value={start}
        onChangeText={setStart}
        placeholder="2026-10-05T00:00:00Z"
      />
      <Field label="Ends (UTC ISO date)" value={end} onChangeText={setEnd} />
      {sets.map((item, index) => (
        <View key={index} style={{ gap: 8 }}>
          <Field
            label="Collectible name"
            value={item.title}
            onChangeText={(value) =>
              setSets((rows) =>
                rows.map((r, i) => (i === index ? { ...r, title: value } : r)),
              )
            }
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["aurora", "sunrise", "ocean", "forest"] as const).map((c) => (
              <Chip
                key={c}
                label={c}
                selected={item.cosmetic === c}
                onPress={() =>
                  setSets((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, cosmetic: c } : r,
                    ),
                  )
                }
              />
            ))}
          </View>
          <Field
            label="Points required"
            keyboardType="number-pad"
            value={String(item.requiredPoints)}
            onChangeText={(value) =>
              setSets((rows) =>
                rows.map((r, i) =>
                  i === index ? { ...r, requiredPoints: Number(value) } : r,
                ),
              )
            }
          />
          <Field
            label="Total supply"
            keyboardType="number-pad"
            value={String(item.supply)}
            onChangeText={(value) =>
              setSets((rows) =>
                rows.map((r, i) =>
                  i === index ? { ...r, supply: Number(value) } : r,
                ),
              )
            }
          />
          {sets.length > 1 ? (
            <Button
              variant="ghost"
              label="Remove set"
              onPress={() =>
                setSets((rows) => rows.filter((_, i) => i !== index))
              }
            />
          ) : null}
        </View>
      ))}
      <Button
        variant="secondary"
        label="Add collectible set"
        disabled={sets.length >= 4}
        onPress={() =>
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
      />
      <Button
        label="Publish season"
        busy={save.busy}
        disabled={title.length < 3}
        onPress={() =>
          void save.run(
            () =>
              operations.season({
                title,
                startsAt: new Date(start || Date.now()).toISOString(),
                endsAt: new Date(end || Date.now() + 30 * 86400000).toISOString(),
                sets,
              }),
            () => setTitle(""),
          )
        }
      />
      <SaveError message={save.error} />
    </Card>
  );
}
export function AdminOperationsScreen() {
  const q = useQuery({
    queryKey: ["operations", "admin"],
    queryFn: operations.admin,
  });
  return (
    <Screen>
      <Txt variant="title">Operations & cases</Txt>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <Txt tone="danger">{q.error.message}</Txt>
      ) : q.data ? (
        <>
          <Card style={{ gap: 10 }}>
            <Txt variant="heading">Delivery health</Txt>
            <Txt>
              Email: {q.data.emailConfigured ? "connected" : "not configured"} ·
              Push: {q.data.pushConfigured ? "enabled" : "not configured"}
            </Txt>
            <Txt tone="muted">
              Push “delivered” means Apple/Google accepted the message. It does
              not prove device display.
            </Txt>
            {q.data.deliveryStats.map((item) => (
              <Txt key={`${item.channel}:${item.status}`}>
                {String(item.channel)} · {String(item.status)}:{" "}
                {Number(item.count)}
              </Txt>
            ))}
          </Card>
          <CaseForm reports={q.data.reports} />
          <Txt variant="heading">Appeals</Txt>
          {q.data.appeals.length ? (
            q.data.appeals.map((item) => (
              <AppealCard key={Number(item.id)} item={item} />
            ))
          ) : (
            <Txt tone="muted">No appeals yet.</Txt>
          )}
          <Txt variant="heading">Moderation cases</Txt>
          {q.data.cases.map((item) => (
            <CaseCard
              key={Number(item.id)}
              item={item}
              events={q.data!.events.filter((e) => e.case_id === item.id)}
            />
          ))}
          <ExperimentForm items={q.data.experiments} />
          <SeasonForm />
          {q.data.seasons.map((season) => (
            <SeasonCard key={season.id} season={season} admin />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
