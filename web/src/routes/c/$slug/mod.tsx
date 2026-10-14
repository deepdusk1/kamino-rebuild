import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommunityLookEditor } from "@/components/community-look-editor";
import { SafetyQueue } from "@/components/safety-queue";
import { CommunityModerationV9 } from '@/components/moderation-v9';
import { TitleChip } from "@/components/title-chip";
import {
  createTitle,
  createInvite,
  deleteTitleDef,
  getModeration,
  resolveReport,
  reviewJoin,
  sendBroadcast,
  setJoinQuestions,
  updateCommunityModules,
} from "@/lib/kamino/server";
import { COMMUNITY_MODULES, type CommunityModule } from "@/lib/kamino/types";
import { TITLE_COLORS } from "@/lib/kamino/titles";
import { timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/c/$slug/mod")({ component: Mod });

function Mod() {
  const queryClient = useQueryClient();
  const { slug } = Route.useParams();
  const q = useQuery({
    queryKey: ["mod", slug],
    queryFn: () => getModeration({ data: slug }),
  });
  const data = q.data;
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>(TITLE_COLORS[0].hex);
  const [featured, setFeatured] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState("");
  const [prompts, setPrompts] = useState("");
  const [modules, setModules] = useState<CommunityModule[]>([]);
  const [savingModules, setSavingModules] = useState(false);
  useEffect(() => {
    if (q.data) setModules(q.data.communityModules);
  }, [q.data]);

  function moveModule(module: CommunityModule, direction: -1 | 1) {
    setModules((current) => {
      const from = current.indexOf(module);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
  }

  if (q.error) {
    return (
      <p className="px-4 py-12 text-center text-sm text-muted">{(q.error as Error).message}</p>
    );
  }
  if (!data) return <p className="px-4 py-12 text-center text-sm text-muted">Loading tools…</p>;

  return (
    <div className="space-y-8 px-4 py-5">
      <p className="text-sm text-muted">
        People decide: the safety check only pauses things for you to review. Titles are granted by leaders, colored by this hall, and pinned by the
        member. No paid titles.
      </p>
      <SafetyQueue slug={slug} />
      <CommunityModerationV9 slug={slug}/>
      {["agent", "leader"].includes(data.role) && <CommunityLookEditor slug={slug} />}
      {["agent", "leader"].includes(data.role) && (
        <section className="glass-card rounded-2xl p-4">
          <h2 className="font-display text-lg font-semibold">Community navigation</h2>
          <p className="mb-3 text-sm text-muted">
            Choose which tabs appear and move them into the order your members need. Home and
            moderation stay available.
          </p>
          <div className="grid gap-2">
            {[...modules, ...COMMUNITY_MODULES.filter((module) => !modules.includes(module))].map(
              (module) => (
                <div
                  key={module}
                  className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2"
                >
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold capitalize">
                    <input
                      type="checkbox"
                      checked={modules.includes(module)}
                      onChange={(event) =>
                        setModules((current) =>
                          event.target.checked
                            ? [...current, module]
                            : current.filter((item) => item !== module),
                        )
                      }
                    />
                    {module === "files" ? "Folder" : module === "roleplay" ? "Stories (role-play)" : module}
                  </label>
                  <button
                    type="button"
                    aria-label={`Move ${module} up`}
                    disabled={!modules.includes(module) || modules.indexOf(module) === 0}
                    onClick={() => moveModule(module, -1)}
                    className="rounded-lg bg-elevated px-2 py-1 text-sm disabled:opacity-35"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${module} down`}
                    disabled={
                      !modules.includes(module) || modules.indexOf(module) === modules.length - 1
                    }
                    onClick={() => moveModule(module, 1)}
                    className="rounded-lg bg-elevated px-2 py-1 text-sm disabled:opacity-35"
                  >
                    ↓
                  </button>
                </div>
              ),
            )}
          </div>
          <Button
            className="mt-3"
            disabled={savingModules}
            onClick={async () => {
              setSavingModules(true);
              setErr(null);
              try {
                await updateCommunityModules({ data: { slug, modules } });
                await Promise.all([
                  q.refetch(),
                  queryClient.invalidateQueries({ queryKey: ["community", slug] }),
                ]);
              } catch (error) {
                setErr(error instanceof Error ? error.message : "Could not save navigation.");
              } finally {
                setSavingModules(false);
              }
            }}
          >
            Save navigation
          </Button>
        </section>
      )}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Titles</h2>
        <p className="mb-3 text-sm text-muted">
          Create a title, pick a color, then grant it from Members. Members can pin one as their
          featured rank.
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(data.titleDefs ?? []).map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <TitleChip label={t.label} color={t.color} />
              <button
                type="button"
                className="text-xs text-subtle"
                onClick={() =>
                  void deleteTitleDef({ data: { slug, id: t.id } }).then(() => q.refetch())
                }
              >
                Remove
              </button>
            </span>
          ))}
        </div>
        <form
          className="space-y-2 rounded-xl bg-surface p-4 shadow-border"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            void createTitle({ data: { slug, label, color, featured } })
              .then(() => {
                setLabel("");
                setFeatured(false);
                void q.refetch();
              })
              .catch((e) => setErr(e instanceof Error ? e.message : "Could not create"));
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Title name — Champion, Archivist…"
            className="h-11 w-full rounded-lg bg-elevated px-3 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {TITLE_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.hex)}
                className="size-8 rounded-full"
                style={{
                  background: c.hex,
                  outline: color === c.hex ? "2px solid white" : "none",
                  outlineOffset: 2,
                }}
                aria-label={c.id}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            Featured rank (shows with level if they don’t pin another)
          </label>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Button type="submit" className="w-full">
            Add title
          </Button>
        </form>
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Join requests</h2>
        <ul className="space-y-2">
          {data.pending.map((p) => (
            <li
              key={p.userId}
              className="flex items-center justify-between rounded-xl bg-surface px-4 py-3"
            >
              <div>
                <p className="font-medium">{p.nickname}</p>
                <p className="text-xs text-subtle">{timeAgo(p.joinedAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    void reviewJoin({ data: { slug, userId: p.userId, allow: true } }).then(() =>
                      q.refetch(),
                    )
                  }
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void reviewJoin({ data: { slug, userId: p.userId, allow: false } }).then(() =>
                      q.refetch(),
                    )
                  }
                >
                  Deny
                </Button>
              </div>
            </li>
          ))}
          {data.pending.length === 0 && <p className="text-sm text-muted">Queue is clear.</p>}
        </ul>
        {(data.joinAnswers ?? []).length > 0 && (
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {data.joinAnswers.map((a) => (
              <li key={a.userId}>
                {a.userId}: {a.answers.join(" · ")}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Join questions</h2>
        <p className="mb-2 text-sm text-muted">
          Private halls can ask up to five questions. One per line.
        </p>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void setJoinQuestions({
              data: {
                slug,
                prompts: (
                  prompts || (data.joinQuestions ?? []).map((j) => j.prompt).join("\n")
                ).split("\n"),
              },
            }).then(() => q.refetch());
          }}
        >
          <textarea
            value={prompts || (data.joinQuestions ?? []).map((j) => j.prompt).join("\n")}
            onChange={(e) => setPrompts(e.target.value)}
            rows={4}
            className="w-full rounded-lg bg-elevated px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm">
            Save questions
          </Button>
        </form>
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Invite codes</h2>
        <ul className="mb-2 space-y-1 text-sm">
          {(data.invites ?? []).map((inv) => (
            <li key={inv.code} className="flex justify-between rounded-xl bg-surface px-4 py-2">
              <span className="font-mono font-bold">{inv.code}</span>
              <span className="text-subtle">
                {inv.uses}/{inv.maxUses || "∞"}
              </span>
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void createInvite({ data: { slug, maxUses: 20 } }).then(() => q.refetch())}
        >
          New code
        </Button>
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Broadcast</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!broadcast.trim()) return;
            void sendBroadcast({ data: { slug, body: broadcast } }).then(() => {
              setBroadcast("");
              void q.refetch();
            });
          }}
        >
          <input
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            placeholder="Message every member"
            className="h-11 flex-1 rounded-lg bg-elevated px-3 text-sm"
          />
          <Button type="submit">Send</Button>
        </form>
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Strikes</h2>
        <ul className="space-y-1 text-sm text-muted">
          {(data.strikes ?? []).map((s) => (
            <li key={s.id}>
              {s.userId} · {s.reason} · {timeAgo(s.createdAt)}
            </li>
          ))}
          {(data.strikes ?? []).length === 0 && <p className="text-sm text-muted">No strikes.</p>}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Reports</h2>
        <ul className="space-y-2">
          {data.reports.map((r) => (
            <li key={r.id} className="rounded-xl bg-surface px-4 py-3">
              <p className="text-sm font-medium">
                {r.reason} · {r.targetType} {r.targetId}
              </p>
              <p className="text-xs text-muted">{r.details}</p>
              <p className="mt-1 text-xs text-subtle">
                {r.status} · {timeAgo(r.createdAt)}
              </p>
              {r.status === "open" && (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      void resolveReport({ data: { id: r.id, slug, status: "resolved" } }).then(
                        () => q.refetch(),
                      )
                    }
                  >
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void resolveReport({ data: { id: r.id, slug, status: "dismissed" } }).then(
                        () => q.refetch(),
                      )
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </li>
          ))}
          {data.reports.length === 0 && <p className="text-sm text-muted">No reports.</p>}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Audit</h2>
        <ul className="space-y-1 text-sm text-muted">
          {data.audit.map((a) => (
            <li key={a.id} className="flex justify-between gap-3">
              <span>
                {a.action} · {a.detail}
              </span>
              <span className="text-xs text-subtle">{timeAgo(String(a.created_at))}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
