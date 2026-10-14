import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSafetyRole } from "@/lib/kamino/ai-features";
import { fileAppeal, getMyStanding } from "@/lib/kamino/extras";
import { listMySafetyCommunities } from "@/lib/kamino/site-reports";
import { timeAgo } from "@/lib/utils";

/** Own standing is available after a community removal; no community content is loaded to file an appeal. */
export function PersonalSafety() {
  const { user } = useCurrentUserState();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const communities = useQuery({ queryKey: ["mySafetyCommunities"], queryFn: () => listMySafetyCommunities(), enabled: !!user });
  const role = useQuery({ queryKey: ["safetyRole"], queryFn: () => getSafetyRole(), enabled: !!user });
  const [selected, setSelected] = useState("");
  if (!hydrated || !user) return null;
  const community = communities.data?.find(item => item.id === selected) ?? communities.data?.[0];
  return <section className="k-card space-y-3 rounded-card p-4">
    <h2 className="font-display text-lg font-extrabold text-ink">Your Safety Center</h2>
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-accent"><a href="/privacy-dashboard">Privacy and muted people</a><a href="/settings">Settings and blocked people</a><a href="/support">Contact support</a></div>
    <p className="text-sm text-muted">Check your warnings, mutes and removals. You can still appeal a decision after being removed from a community.</p>
    {communities.isPending ? <p className="text-sm text-muted">Loading your community records…</p> : communities.isError ? <p role="alert" className="text-sm text-danger">{communities.error.message}</p> : !communities.data?.length ? <p className="text-sm text-muted">You have no community records yet.</p> : <>
      <label className="block space-y-1 text-sm text-ink"><span>Community standing</span><select value={community?.id ?? ""} onChange={event => setSelected(event.target.value)} className="w-full rounded-xl border border-border bg-surface p-3">{communities.data.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
      {community ? <Standing key={community.id} slug={community.id} /> : null}
    </>}
    {role.data?.siteAdmin ? <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-sm font-semibold text-accent"><a href="/admin/safety">Site safety queue</a><a href="/admin/reports">Reports from members</a></div> : null}
  </section>;
}

function Standing({ slug }: { slug: string }) {
  const client = useQueryClient();
  const standing = useQuery({ queryKey: ["standing", slug], queryFn: () => getMyStanding({ data: slug }) });
  const [kind, setKind] = useState<"strike" | "mute" | "ban" | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      await fileAppeal({ data: { slug, kind, message } });
      setKind(null); setMessage("");
      await client.invalidateQueries({ queryKey: ["standing", slug] });
      toast.success("Your appeal was sent to the community leaders.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send your appeal."); }
    finally { setBusy(false); }
  };
  if (standing.isPending) return <p className="text-sm text-muted">Loading your standing…</p>;
  if (standing.isError || !standing.data) return <p role="alert" className="text-sm text-danger">{standing.error?.message || "Could not load your standing."}</p>;
  const record = standing.data;
  const options = [...(record.strikes.length ? ["strike" as const] : []), ...(record.mute ? ["mute" as const] : []), ...(record.status === "banned" ? ["ban" as const] : [])];
  return <div className="space-y-3">
    <p className="text-sm font-semibold text-ink">{record.status === "banned" ? "You were removed from this community." : !record.strikes.length && !record.mute ? "No warnings or current mutes." : "Your moderation record"}</p>
    {record.mute ? <p className="text-sm text-muted">Muted until {new Date(record.mute.until).toLocaleString()} · {record.mute.reason || "No reason supplied."}</p> : null}
    {record.strikes.map(strike => <p key={strike.id} className="text-sm text-muted">Warning: {strike.reason || "No reason supplied."} · {timeAgo(strike.createdAt)}</p>)}
    {options.length ? <div className="flex flex-wrap gap-2">{options.map(option => <Button size="sm" variant="secondary" key={option} onClick={() => setKind(option)}>Appeal {option === "ban" ? "removal" : option === "strike" ? "warning" : "mute"}</Button>)}</div> : null}
    {kind ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void send(); }}><label className="block space-y-1 text-sm text-ink"><span>Why should the leaders reconsider?</span><textarea className="w-full rounded-xl border border-border bg-surface p-3" value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={1000} required /></label><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || message.trim().length < 10}>Send appeal</Button><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={() => setKind(null)}>Cancel</Button></div></form> : null}
    {record.appeals.length ? <div className="space-y-1"><h3 className="text-sm font-semibold text-ink">Your appeals</h3>{record.appeals.map(appeal => <p key={appeal.id} className="text-sm text-muted">{appeal.kind} · {appeal.status} · {timeAgo(appeal.createdAt)}{appeal.decisionNote ? ` · ${appeal.decisionNote}` : ""}</p>)}</div> : null}
  </div>;
}
