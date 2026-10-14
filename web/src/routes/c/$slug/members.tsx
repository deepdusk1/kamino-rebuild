import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Face } from "@/components/face";
import { TitleChip } from "@/components/title-chip";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { followMember, getCommunityPage, grantTitle, issueStrike, revokeTitle, setMemberRole } from "@/lib/kamino/server";
import { canLead } from "@/lib/kamino/safety";
import type { MemberTitle } from "@/lib/kamino/types";
import { levelFromRep } from "@/lib/utils";

export const Route = createFileRoute("/c/$slug/members")({
  loader: ({ params }) => getCommunityPage({ data: { slug: params.slug } }),
  component: Members,
});

function Members() {
  const { slug } = Route.useParams();
  const { user } = useCurrentUserState();
  const q = useQuery({
    queryKey: ["community", slug],
    queryFn: () => getCommunityPage({ data: { slug } }),
    initialData: Route.useLoaderData(),
  });
  const members = q.data?.members ?? [];
  const following = new Set(q.data?.followingIds ?? []);
  const requested = new Set((q.data as { requestedIds?: string[] })?.requestedIds ?? []);
  const me = q.data?.member;
  const lead = canLead(me?.role);
  const titleDefs = q.data?.titleDefs ?? [];
  const granted = new Map((q.data?.grantedTitles ?? []).map((g) => [g.userId, g.titles as MemberTitle[]]));
  const [pick, setPick] = useState<Record<string, number>>({});
  const [qtext, setQtext] = useState("");
  const [strikeFor, setStrikeFor] = useState<string | null>(null);
  const [strikeReason, setStrikeReason] = useState("");

  const filtered = members.filter((m) => {
    if (!qtext.trim()) return true;
    const t = qtext.toLowerCase();
    return m.nickname.toLowerCase().includes(t) || (m.handle ?? "").toLowerCase().includes(t);
  });

  return (
    <div className="px-4 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm text-muted">
          Rank is rep earned here. Leaders give colored titles — they show on the member’s profile.
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void navigator.clipboard.writeText(window.location.origin + `/c/${slug}`)}
        >
          <Copy className="size-3.5" />
          Invite
        </Button>
      </div>
      <input
        value={qtext}
        onChange={(e) => setQtext(e.target.value)}
        placeholder="Search members"
        className="mb-4 h-11 w-full rounded-full bg-elevated px-4 text-sm"
      />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-border">
        {filtered.map((m, i) => {
          const titles = granted.get(m.userId) ?? [];
          return (
            <li key={m.userId} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-6 text-right text-xs font-extrabold tabular-nums text-accent">{i + 1}</span>
                <Link
                  to="/u/$handle"
                  params={{ handle: m.handle || m.userId }}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Face name={m.nickname} hue={m.personaHue} level={levelFromRep(m.rep)} ring={i < 3} />
                  <div className="min-w-0">
                    <p className="truncate font-bold">{m.nickname}</p>
                    <p className="text-xs font-semibold text-subtle capitalize">
                      Lv {levelFromRep(m.rep)} · {m.role} · {m.rep} rep
                    </p>
                  </div>
                </Link>
                {user && user.id !== m.userId && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={requested.has(m.userId)}
                    onClick={() => void followMember({ data: { slug, userId: m.userId } }).then(() => q.refetch())}
                  >
                    {following.has(m.userId) ? "Following" : requested.has(m.userId) ? "Requested" : "Follow"}
                  </Button>
                )}
              </div>
              {titles.length > 0 && (
                <div className="mt-2 ml-9 flex flex-wrap gap-1.5">
                  {titles.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1">
                      <TitleChip label={t.label} color={t.color} />
                      {lead && (
                        <button
                          type="button"
                          className="text-[10px] text-subtle"
                          onClick={() =>
                            void revokeTitle({ data: { slug, userId: m.userId, titleId: t.titleId } }).then(() => q.refetch())
                          }
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {lead && titleDefs.length > 0 && user?.id !== m.userId && (
                <form
                  className="mt-2 ml-9 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const titleId = pick[m.userId] ?? titleDefs[0]?.id;
                    if (!titleId) return;
                    void grantTitle({ data: { slug, userId: m.userId, titleId } }).then(() => q.refetch());
                  }}
                >
                  <select
                    value={pick[m.userId] ?? titleDefs[0]?.id}
                    onChange={(e) => setPick((s) => ({ ...s, [m.userId]: Number(e.target.value) }))}
                    className="h-9 flex-1 rounded-full bg-elevated px-3 text-xs"
                  >
                    {titleDefs.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" type="submit">
                    Give title
                  </Button>
                </form>
              )}
              {lead && user?.id !== m.userId && (
                <>
                  <button
                    type="button"
                    className="mt-1 ml-9 text-xs text-warn"
                    onClick={() => setStrikeFor(m.userId)}
                  >
                    Strike
                  </button>
                  <button
                    type="button"
                    className="mt-1 ml-9 text-xs text-danger"
                    onClick={() => {
                      if (confirm(`Ban ${m.nickname} from this community?`)) {
                        void setMemberRole({ data: { slug, userId: m.userId, action: "ban" } }).then(() => q.refetch());
                      }
                    }}
                  >
                    Ban
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {strikeFor && (
        <form
          className="mt-4 space-y-2 rounded-2xl bg-surface p-4 shadow-border"
          onSubmit={(e) => {
            e.preventDefault();
            void issueStrike({ data: { slug, userId: strikeFor, reason: strikeReason } }).then(() => {
              setStrikeFor(null);
              setStrikeReason("");
              void q.refetch();
            });
          }}
        >
          <p className="text-sm font-bold">Issue a strike. Three strikes remove them from this hall.</p>
          <input
            value={strikeReason}
            onChange={(e) => setStrikeReason(e.target.value)}
            placeholder="Reason"
            className="h-11 w-full rounded-lg bg-elevated px-3 text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit">Issue</Button>
            <Button type="button" variant="secondary" onClick={() => setStrikeFor(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
