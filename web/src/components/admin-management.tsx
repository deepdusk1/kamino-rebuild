import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getAdminDashboard,
  adminSaveCommunity,
  adminFeatureCreator,
  decideVerification,
  adminPublishCampaign,
  adminSaveTaxonomy,
} from "@/lib/kamino/platform-v9";
import { adminListAccounts, adminSetAccountStatus } from "@/lib/kamino/identity-v9";
const box = "rounded-2xl border border-border bg-surface p-4 space-y-3";
const field = "w-full rounded-xl border border-border bg-bg px-3 py-2";
const btn = "rounded-full border border-border px-3 py-2 text-sm font-semibold disabled:opacity-40";
type Row = Record<string, string | number | boolean | null | Date>;
export function AdminManagement() {
  const q = useQuery({ queryKey: ["adminDashboard"], queryFn: () => getAdminDashboard() }),
    [search, setSearch] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [href, setHref] = useState("/"),
    [taxKey, setTaxKey] = useState(""),
    [taxLabel, setTaxLabel] = useState(""),
    [busy, setBusy] = useState(false);
  const users = useQuery({
    queryKey: ["adminUsers", search],
    queryFn: () => adminListAccounts({ data: search }),
    enabled: !!q.data,
  });
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success("Saved");
      void q.refetch();
      void users.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };
  if (!q.data) return null;
  return (
    <div className="space-y-4">
      <section className={box}>
        <h2 className="font-bold text-lg">Verification requests</h2>
        {q.data.verification.map((r) => (
          <article className="rounded-xl bg-bg p-3 space-y-2" key={Number(r.id)}>
            <strong>
              {String(r.target_type)} · {String(r.target_id)}
            </strong>
            <p>{String(r.reason)}</p>
            <div className="flex gap-2">
              <button
                className={btn}
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    decideVerification({
                      data: {
                        id: Number(r.id),
                        approve: true,
                        note: "Approved by platform administrator.",
                      },
                    }),
                  )
                }
              >
                Approve
              </button>
              <button
                className={btn}
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    decideVerification({
                      data: {
                        id: Number(r.id),
                        approve: false,
                        note: "Verification could not be established.",
                      },
                    }),
                  )
                }
              >
                Decline
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className={box}>
        <h2 className="font-bold text-lg">Community management & growth</h2>
        {q.data.communities.map((c) => (
          <CommunityRow key={String(c.id)} c={c} run={run} />
        ))}
      </section>
      <section className={box}>
        <h2 className="font-bold text-lg">Creator performance & featuring</h2>
        {q.data.creators.map((p) => (
          <div
            key={String(p.user_id)}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-bg p-3"
          >
            <a href={`/u/${p.handle}`} className="font-bold">
              @{String(p.handle)}
            </a>
            <span>
              {Number(p.followers)} followers · {Number(p.engagement)} interactions
            </span>
            <button
              className={btn}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  adminFeatureCreator({
                    data: { userId: String(p.user_id), featured: !p.featured_creator },
                  }),
                )
              }
            >
              {p.featured_creator ? "Remove from featured" : "Feature creator"}
            </button>
          </div>
        ))}
      </section>
      <section className={box}>
        <h2 className="font-bold text-lg">Account management</h2>
        <label>
          Search accounts
          <input
            className={field}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
          />
        </label>
        {users.error ? <p role="alert">{users.error.message}</p> : null}
        {users.data?.map((u) => (
          <AccountRow key={u.userId} u={u} run={run} />
        ))}
      </section>
      <section className={box}>
        <h2 className="font-bold text-lg">Community categories</h2>
        <label>
          Key
          <input
            className={field}
            value={taxKey}
            onChange={(e) => setTaxKey(e.target.value)}
            placeholder="animation"
          />
        </label>
        <label>
          Label
          <input
            className={field}
            value={taxLabel}
            onChange={(e) => setTaxLabel(e.target.value)}
            placeholder="Animation"
          />
        </label>
        <button
          className={btn}
          disabled={busy}
          onClick={() =>
            void run(() => adminSaveTaxonomy({ data: { key: taxKey, label: taxLabel } }))
          }
        >
          Save category
        </button>
        {q.data.taxonomy.map((t) => (
          <div key={String(t.key)} className="flex flex-wrap gap-2 items-center">
            <span>
              {String(t.icon)} {String(t.label)}
            </span>
            <button
              className={btn}
              onClick={() =>
                void run(() =>
                  adminSaveTaxonomy({
                    data: {
                      key: String(t.key),
                      label: String(t.label),
                      icon: String(t.icon),
                      active: !t.active,
                    },
                  }),
                )
              }
            >
              {t.active ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
      </section>
      <section className={box}>
        <h2 className="font-bold text-lg">Notification campaign</h2>
        <p className="text-sm text-muted">
          The background worker delivers published campaigns to active members who allow community
          notifications. Review this preview before publishing.
        </p>
        <label>
          Title
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
          />
        </label>
        <label>
          Message
          <textarea
            className={field}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={160}
          />
        </label>
        <label>
          App link
          <input className={field} value={href} onChange={(e) => setHref(e.target.value)} />
        </label>
        <div className="rounded-xl bg-bg p-3">
          <strong>{title || "Campaign title"}</strong>
          <p>{body || "Campaign message"}</p>
          <code>{href}</code>
        </div>
        <button
          className={btn}
          disabled={busy || title.length < 3 || body.length < 3}
          onClick={() => void run(() => adminPublishCampaign({ data: { title, body, href } }))}
        >
          Publish campaign
        </button>
      </section>
    </div>
  );
}
function CommunityRow({ c, run }: { c: Row; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [category, setCategory] = useState(String(c.category)),
    [language, setLanguage] = useState(String(c.language)),
    [verified, setVerified] = useState(Boolean(c.verified));
  return (
    <article className="grid gap-3 rounded-xl bg-bg p-3 sm:grid-cols-[1fr_1fr_100px_auto]">
      <div>
        <a href={`/c/${c.id}`} className="font-bold">
          {String(c.name)}
        </a>
        <p className="text-sm">
          {Number(c.member_count)} members · {Number(c.new_members)} joined this week ·{" "}
          {Number(c.reports)} reports
        </p>
      </div>
      <label>
        Category
        <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} />
      </label>
      <label>
        Language
        <input className={field} value={language} onChange={(e) => setLanguage(e.target.value)} />
      </label>
      <div>
        <label className="block">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />{" "}
          Verified
        </label>
        <button
          className={btn}
          onClick={() =>
            void run(() =>
              adminSaveCommunity({
                data: { communityId: String(c.id), category, language, verified },
              }),
            )
          }
        >
          Save
        </button>
      </div>
    </article>
  );
}
function AccountRow({
  u,
  run,
}: {
  u: Awaited<ReturnType<typeof adminListAccounts>>[number];
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [reason, setReason] = useState(""),
    [status, setStatus] = useState<"active" | "suspended" | "banned">("active");
  return (
    <article className="rounded-xl bg-bg p-3 space-y-2">
      <strong>
        @{u.handle} · {u.name}
      </strong>
      <p className="text-sm">
        {u.status} · Email {u.emailVerified ? "verified" : "unverified"}
      </p>
      <label>
        Action
        <select
          className={field}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="active">Restore access</option>
          <option value="suspended">Suspend for 7 days</option>
          <option value="banned">Ban account</option>
        </select>
      </label>
      <label>
        Reason
        <input
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={5}
          maxLength={500}
        />
      </label>
      <button
        className={btn}
        disabled={reason.trim().length < 5}
        onClick={() =>
          void run(() =>
            adminSetAccountStatus({ data: { userId: u.userId, status, reason, days: 7 } }),
          )
        }
      >
        Apply account action
      </button>
    </article>
  );
}
