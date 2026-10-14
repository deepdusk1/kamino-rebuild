import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Collaborations } from "./collaborations";
import { toast } from "sonner";
import { AppShell } from "./app-shell";
import * as api from "@/lib/kamino/platform-v9";
import { PeopleMatching } from "./people-matching";
import { AdminManagement } from "./admin-management";
import { BillingPanel, TestCheckout } from "./billing-panel";
import { getPaidResourceChoices } from "@/lib/kamino/billing-v9";
import { getIdentityDashboard } from "@/lib/kamino/identity-v9";
type Mode = "discovery" | "creator" | "marketplace" | "admin" | "support";
const titles: Record<Mode, string> = {
  discovery: "Find your next community",
  creator: "Creator studio",
  marketplace: "Marketplace",
  admin: "Platform dashboard",
  support: "Help & support",
};
const card = "min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm [overflow-wrap:anywhere]";
const input =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-body focus:outline-2 focus:outline-violet";
const button = "k-focus rounded-full bg-violet-strong px-4 py-2 text-sm font-bold text-white disabled:opacity-40";
const secondary =
  "rounded-full border border-border px-3 py-2 text-sm font-semibold hover:bg-violet/10";
export function ToolSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${card} space-y-3`}>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}
export function PlatformTools({ mode }: { mode: Mode }) {
  const identity = useQuery({ queryKey: ["identityDashboard"], queryFn: () => getIdentityDashboard() });
  return (
    <AppShell padded back title={titles[mode]}>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="More tools">
        {Object.entries({'/connections':'Connections','/smart-search':'Smart search','/short-videos':'Short videos','/media-library':'Media library','/operations':'Activity & safety'}).map(([href,label])=><a key={href} className={secondary} href={href}>{label}</a>)}
        {Object.entries(titles).filter(([key]) => key !== "admin" || identity.data?.isAdmin === true).map(([key, title]) => (
          <a
            key={key}
            className={secondary}
            href={key === "discovery" ? "/discover-plus" : `/${key}`}
          >
            {title}
          </a>
        ))}
      </nav>
      {mode === "discovery" ? (
        <Discovery />
      ) : mode === "creator" ? (
        <Creator />
      ) : mode === "marketplace" ? (
        <Market />
      ) : mode === "admin" ? (
        <Admin />
      ) : (
        <Support />
      )}
    </AppShell>
  );
}
function QueryState({ query }: { query: { isPending: boolean; error: Error | null } }) {
  return query.isPending ? (
    <p role="status">Loading your tools…</p>
  ) : query.error ? (
    <p role="alert" className="text-red-600">
      {query.error.message}
    </p>
  ) : null;
}
function useAction() {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (work: () => Promise<unknown>, done?: () => void) => {
      setBusy(true);
      try {
        await work();
        toast.success("Saved");
        done?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save.");
      } finally {
        setBusy(false);
      }
    },
  };
}
function Discovery() {
  const [text, setText] = useState(""),
    [area, setArea] = useState(""),
    [contextCommunityId, setContextCommunityId] = useState(""),
    [aiText, setAiText] = useState(""),
    [task, setTask] = useState<
      "discover" | "caption" | "description" | "summarize" | "translate" | "onboard" | "duplicate"
    >("discover"),
    [answer, setAnswer] = useState("");
  const q = useQuery({
    queryKey: ["discoveryHub", text, area, contextCommunityId],
    queryFn: () => api.getDiscoveryHub({ data: { query: text, localArea: area, contextCommunityId: contextCommunityId || undefined } }),
  });
  const suggest = useQuery({
    queryKey: ["suggest", text],
    queryFn: () => api.searchSuggestions({ data: { query: text } }),
    enabled: text.trim().length > 1,
  });
  const a = useAction(),
    cache = useQueryClient();
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["discoveryHub"] });
    void cache.invalidateQueries({ queryKey: ["feed"] });
  };
  const feedback = (targetId: string, preference: "more" | "less" | "hide") =>
    a.run(
      () => api.setDiscoveryFeedback({ data: { targetType: "community", targetId, preference } }),
      refresh,
    );
  return (
    <div className="space-y-4">
      <ToolSection title="Discover together">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            Search
            <input
              value={text}
              onChange={(e) => { setText(e.target.value); setContextCommunityId(""); }}
              className={input}
              placeholder="A name, topic or interest"
              maxLength={100}
            />
          </label>
          <label>
            Local area
            <input
              className={input}
              value={area}
              onChange={(e) => { setArea(e.target.value); setContextCommunityId(""); }}
              placeholder="City or region"
              maxLength={100}
            />
          </label>
        </div>
        {text.length > 1 && suggest.data ? (
          <ul aria-label="Search suggestions" className="space-y-1">
            {suggest.data.communities.map((c) => (
              <li key={String(c.id)}>
                <a href={`/c/${c.id}`} className="text-violet">
                  {String(c.name)}
                </a>
              </li>
            ))}
            {suggest.data.people.map((p) => (
              <li key={String(p.handle)}>
                <a href={`/u/${p.handle}`}>
                  @{String(p.handle)} · {String(p.display_name)}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          className={secondary}
          disabled={a.busy}
          onClick={() => void a.run(() => api.resetDiscovery(), refresh)}
        >
          Reset personalization & history
        </button>
        <QueryState query={q} />
      </ToolSection>
      {q.data ? (
        <>
          <ToolSection title="Communities you may like">
            <p className="text-sm text-muted">
              Recommendations use shared communities. Refine them below.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {q.data.communities.map((c) => (
                <article className="rounded-xl bg-bg p-3" key={String(c.id)}>
                  <a href={`/c/${c.id}`} className="font-bold text-violet">
                    {String(c.name)}
                  </a>
                  <p className="text-sm text-muted">
                    {String(c.category)} · {String(c.language)} · {Number(c.member_count)} members
                  </p>
                  <p className="line-clamp-2 my-2 text-sm">{String(c.description)}</p>
                  <div className="flex flex-wrap gap-1">
                    {(["more", "less", "hide"] as const).map((p) => (
                      <button
                        disabled={a.busy}
                        key={p}
                        className={secondary}
                        onClick={() => void feedback(String(c.id), p)}
                      >
                        {p === "hide" ? "Not interested" : p === "more" ? "More" : "Less"}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {!q.data.communities.length ? (
              <p>No matching communities yet. Try another area or search.</p>
            ) : null}
          </ToolSection>
          {q.data.relatedEnabled ? <>
            <ToolSection title="Related posts & creators">
              <p className="text-sm text-muted">Suggestions use community categories and your search. Choose a space to explore related work.</p>
              <label className="block text-sm font-semibold">Related to
                <select className={input} value={contextCommunityId} onChange={e => setContextCommunityId(e.target.value)}>
                  <option value="">Your current discovery results</option>
                  {q.data.communities.map(c => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {q.data.relatedPosts.map(p => <a key={Number(p.id)} href={`/c/${p.community_id}/p/${p.id}`} className="rounded-xl border border-border bg-bg p-3"><h3 className="font-bold text-ink">{String(p.title)}</h3><p className="mt-1 text-sm text-muted">{String(p.community_name)} · {String(p.category)}</p></a>)}
              </div>
              {!q.data.relatedPosts.length ? <p className="text-sm text-muted">No related posts yet. Try another space or search.</p> : null}
              <h3 className="font-bold text-ink">Related creators</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {q.data.relatedCreators.map(c => <a key={String(c.user_id)} href={`/u/${c.handle}`} className="rounded-xl border border-border bg-bg p-3"><p className="font-bold text-ink">{String(c.display_name)} · @{String(c.handle)}</p><p className="mt-1 text-sm text-muted">{Number(c.related_posts)} related posts{c.headline ? ` · ${String(c.headline)}` : ""}</p></a>)}
              </div>
              {!q.data.relatedCreators.length ? <p className="text-sm text-muted">No related creators yet. Their public work will appear here as the community grows.</p> : null}
            </ToolSection>
          </> : null}
          <ToolSection title="Trending posts">
            <div className="grid gap-2 sm:grid-cols-2">
              {q.data.posts.map((p) => (
                <a
                  className="rounded-xl bg-bg p-3"
                  key={Number(p.id)}
                  href={`/c/${p.community_id}/p/${p.id}`}
                >
                  <strong>{String(p.title)}</strong>
                  <p className="text-sm text-muted">
                    {String(p.community_name)} · {Number(p.like_count)} likes ·{" "}
                    {Number(p.comment_count)} replies
                  </p>
                </a>
              ))}
            </div>
            {!q.data.posts.length ? <p>New activity will appear here.</p> : null}
          </ToolSection>
          <div className="grid gap-4 md:grid-cols-2">
            <ToolSection title="Upcoming events">
              {q.data.events.map((e) => (
                <a
                  key={Number(e.id)}
                  className="block rounded-xl bg-bg p-3"
                  href={`/c/${e.community_id}/events`}
                >
                  <strong>{String(e.title)}</strong>
                  <p className="text-sm">{new Date(String(e.starts_at)).toLocaleString()}</p>
                </a>
              ))}
            </ToolSection>
            <ToolSection title="Continue conversations">
              {q.data.chats.map((c) => (
                <a className="block py-2 text-violet" key={Number(c.id)} href={`/chats/${c.id}`}>
                  {String(c.name)}
                </a>
              ))}
              <a href="/saved" className={secondary}>
                Open saved posts
              </a>
            </ToolSection>
          </div>
          <ToolSection title="Live now">
            {q.data.live.length ? (
              q.data.live.map((c) => (
                <a className="block py-2" key={Number(c.id)} href={`/chats/${c.id}`}>
                  {String(c.name)} · {Number(c.listeners)} listening
                </a>
              ))
            ) : (
              <p>No active rooms right now.</p>
            )}
          </ToolSection>
          <ToolSection title="Recently visited">
            {q.data.visits.length ? (
              q.data.visits.map((c) => (
                <a key={String(c.id)} className="mr-3 text-violet" href={`/c/${c.id}`}>
                  {String(c.name)}
                </a>
              ))
            ) : (
              <p>Communities you open will appear here.</p>
            )}
          </ToolSection>
          <ToolSection title="Featured collections">
            {q.data.collections.length ? (
              q.data.collections.map((c) => (
                <div key={c.id}>
                  <h3 className="font-bold">{c.title}</h3>
                  <p>{c.description}</p>
                  {c.communities.map((i) => (
                    <a key={String(i.id)} className="mr-3 text-violet" href={`/c/${i.id}`}>
                      {String(i.name)}
                    </a>
                  ))}
                </div>
              ))
            ) : (
              <p>Editors can publish collections from the platform dashboard.</p>
            )}
          </ToolSection>
          <ToolSection title="Trending searches">
            {q.data.trending.length ? (
              q.data.trending.map((t) => (
                <button
                  className={secondary}
                  key={String(t.query)}
                  onClick={() => setText(String(t.query))}
                >
                  {String(t.query)}
                </button>
              ))
            ) : (
              <p>Search trends appear once at least five members search the same term.</p>
            )}
          </ToolSection>
        </>
      ) : null}
      <PeopleMatching />
      <ToolSection title="AI assistant">
        <p className="text-sm text-muted">
          {q.data?.aiAvailable
            ? "Ask for suggestions or writing help. Review generated text before publishing."
            : "Connect an AI provider to use these tools."}
        </p>
        <label>
          Task
          <select
            className={input}
            value={task}
            onChange={(e) => setTask(e.target.value as typeof task)}
          >
            {[
              "discover",
              "caption",
              "description",
              "summarize",
              "translate",
              "onboard",
              "duplicate",
            ].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Your request
          <textarea
            className={input}
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={4}
            maxLength={8000}
          />
        </label>
        <button
          className={button}
          disabled={!q.data?.aiAvailable || a.busy || !aiText.trim()}
          onClick={() =>
            void a.run(async () => {
              const r = await api.aiAssistant({ data: { task, text: aiText } });
              setAnswer(r.text);
            })
          }
        >
          Ask assistant
        </button>
        {answer ? (
          <p className="whitespace-pre-wrap" aria-live="polite">
            {answer}
          </p>
        ) : null}
      </ToolSection>
    </div>
  );
}
function Creator() {
  const q = useQuery({ queryKey: ["creatorDashboard"], queryFn: () => api.getCreatorDashboard() });
  const choices = useQuery({ queryKey: ["paidChoices"], queryFn: () => getPaidResourceChoices() });
  const a = useAction();
  const [communityId, setCommunityId] = useState("");
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [kind, setKind] = useState<
      | "membership"
      | "tip"
      | "gift"
      | "ticket"
      | "marketplace"
      | "premium"
      | "boost"
      | "advertisement"
    >("membership"),
    [price, setPrice] = useState("5.00");
  return (
    <div className="space-y-4">
      <QueryState query={q} />
      {q.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(q.data.stats ?? {}).map(([k, v]) => (
              <div className={card} key={k}>
                <strong className="text-2xl">{Number(v)}</strong>
                <p className="capitalize text-muted">{k.replaceAll("_", " ")}</p>
              </div>
            ))}
          </div>
          <ToolSection title="Top content">
            {q.data.topPosts.map((p) => (
              <a key={Number(p.id)} href={`/c/${p.community_id}/p/${p.id}`} className="block py-2">
                {String(p.title)} · {Number(p.like_count)} likes · {Number(p.comment_count)} replies
              </a>
            ))}
          </ToolSection>
          <ToolSection title="30-day publishing activity">
            <div className="overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Posts</th>
                    <th>Likes</th>
                    <th>Replies</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.daily.map((d) => (
                    <tr key={String(d.day)}>
                      <td>{String(d.day)}</td>
                      <td>{Number(d.posts)}</td>
                      <td>{Number(d.likes)}</td>
                      <td>{Number(d.comments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolSection>
          <ToolSection title="Audience language">
            <p className="text-sm text-muted">Only groups of at least five followers appear.</p>
            {q.data.audience.map((d) => (
              <p key={String(d.language)}>
                {String(d.language)}: {Number(d.followers)} followers
              </p>
            ))}
          </ToolSection>
          <Collaborations />
          <BillingPanel creator />
          <ToolSection title="Paid offers">
            <p className="rounded-xl bg-violet/10 p-3">{q.data.payments.reason}</p>
            {q.data.offers.map((o) => (
              <div key={Number(o.id)} className="rounded-xl bg-bg p-3">
                <strong>{String(o.title)}</strong>
                <p>
                  {String(o.kind)} · {(Number(o.price_minor) / 100).toFixed(2)}{" "}
                  {String(o.currency).toUpperCase()} · {o.published ? "Listed" : "Draft"}
                </p>
                <button
                  className={secondary}
                  onClick={() =>
                    void a.run(
                      () =>
                        api.saveCreatorOffer({
                          data: {
                            id: Number(o.id),
                            title: String(o.title),
                            kind: o.kind as typeof kind,
                            description: String(o.description),
                            priceMinor: Number(o.price_minor),
                            currency: o.currency as "usd",
                            published: !o.published,
                          },
                        }),
                      () => void q.refetch(),
                    )
                  }
                >
                  {o.published ? "Unlist" : "List offer"}
                </button>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void a.run(
                  () =>
                    api.saveCreatorOffer({
                      data: {
                        title,
                        description,
                        kind,
                        priceMinor: Math.round(Number(price) * 100),
                        ...(communityId ? { communityId } : {}),
                      },
                    }),
                  () => {
                    setTitle("");
                    setDescription("");
                    void q.refetch();
                  },
                );
              }}
              className="space-y-3"
            >
              <label>
                Community
                <select
                  className={input}
                  value={communityId}
                  onChange={(e) => setCommunityId(e.target.value)}
                >
                  <option value="">Independent offer</option>
                  {choices.data?.resources
                    .filter((r) => r.kind === "community")
                    .map((r) => (
                      <option key={r.resourceId} value={r.resourceId}>
                        {r.title}
                      </option>
                    ))}
                </select>
              </label>
              <p className="text-xs text-muted">
                Choose the same community as the content or event that this offer will unlock.
                Memberships renew monthly.
              </p>
              <label>
                Offer type
                <select
                  className={input}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  {[
                    "membership",
                    "tip",
                    "gift",
                    "ticket",
                    "marketplace",
                    ...(q.data?.isAdmin ? ["premium", "boost", "advertisement"] : []),
                  ].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input
                  className={input}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={100}
                />
              </label>
              <label>
                Description
                <textarea
                  className={input}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <label>
                Price (USD)
                <input
                  className={input}
                  type="number"
                  min="0.50"
                  max="10000"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </label>
              <button className={button} disabled={a.busy}>
                Save draft offer
              </button>
            </form>
          </ToolSection>
        </>
      ) : null}
    </div>
  );
}
function Market() {
  const q = useQuery({ queryKey: ["marketplace"], queryFn: () => api.getMarketplace() });
  return (
    <div className="space-y-4">
      <p className={`${card} text-muted`}>
        {q.data?.paymentsEnabled
          ? "Sandbox offers. Test purchases do not move real money."
          : "Browse creator offers. Purchases are unavailable until payments are configured."}
      </p>
      <QueryState query={q} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {q.data?.offers.map((o) => (
          <div className={card} key={Number(o.id)}>
            <p className="text-sm uppercase text-violet">{String(o.kind)}</p>
            <h2 className="font-bold">{String(o.title)}</h2>
            <p>{String(o.description)}</p>
            <a href={`/u/${o.handle}`} className="text-sm text-muted">
              @{String(o.handle)}
            </a>
            <p className="my-3 font-bold">
              {(Number(o.price_minor) / 100).toFixed(2)} {String(o.currency).toUpperCase()}
            </p>
            <TestCheckout
              offerId={Number(o.id)}
              kind={String(o.kind)}
              enabled={q.data?.paymentsEnabled === true}
            />
          </div>
        ))}
      </div>
      {q.data && !q.data.offers.length ? <p>No offers are listed yet.</p> : null}
      <BillingPanel />
      <Collaborations browse />
    </div>
  );
}
function Support() {
  const q = useQuery({ queryKey: ["support"], queryFn: () => api.getMySupportTickets() }),
    a = useAction();
  const [subject, setSubject] = useState(""),
    [body, setBody] = useState("");
  return (
    <div className="space-y-4">
      <ToolSection title="Contact support">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(
              () => api.submitSupportTicket({ data: { subject, body } }),
              () => {
                setSubject("");
                setBody("");
                void q.refetch();
              },
            );
          }}
        >
          <label>
            Subject
            <input
              className={input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={3}
              maxLength={100}
            />
          </label>
          <label>
            How can we help?
            <textarea
              className={input}
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={10}
              maxLength={5000}
            />
          </label>
          <button className={button} disabled={a.busy}>
            Submit ticket
          </button>
        </form>
      </ToolSection>
      <QueryState query={q} />
      <ToolSection title="Your requests">
        {q.data?.map((t) => (
          <article key={Number(t.id)} className="rounded-xl bg-bg p-3">
            <h3 className="font-bold">
              #{Number(t.id)} · {String(t.subject)}
            </h3>
            <p>{String(t.status).replaceAll("_", " ")}</p>
            <p className="whitespace-pre-wrap">{String(t.body)}</p>
            {t.response ? <p className="mt-3 text-violet">Support: {String(t.response)}</p> : null}
          </article>
        ))}
      </ToolSection>
    </div>
  );
}
function Admin() {
  const q = useQuery({ queryKey: ["adminDashboard"], queryFn: () => api.getAdminDashboard() }),
    a = useAction();
  const [title, setTitle] = useState(""),
    [ids, setIds] = useState(""),
    [key, setKey] = useState(""),
    [rollout, setRollout] = useState("100");
  return (
    <div className="space-y-4">
      <QueryState query={q} />
      {q.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(q.data.metrics ?? {}).map(([k, v]) => (
              <div className={card} key={k}>
                <strong className="text-2xl">{Number(v)}</strong>
                <p>{k.replaceAll("_", " ")}</p>
              </div>
            ))}
          </div>
          <a href="/admin-analytics" className={secondary}>Open activity & signup-cohort analytics</a>
          <ToolSection title="Featured collections">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void a.run(
                  () =>
                    api.saveEditorialCollection({
                      data: {
                        title,
                        communityIds: ids
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                        published: true,
                      },
                    }),
                  () => {
                    setTitle("");
                    setIds("");
                    void q.refetch();
                  },
                );
              }}
            >
              <label>
                Collection title
                <input
                  className={input}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={3}
                />
              </label>
              <label>
                Community IDs, separated by commas
                <input className={input} value={ids} onChange={(e) => setIds(e.target.value)} />
              </label>
              <button className={button} disabled={a.busy}>
                Publish collection
              </button>
            </form>
            {q.data.collections.map((c) => (
              <div key={Number(c.id)}>
                {String(c.title)} · {c.published ? "Published" : "Draft"}
              </div>
            ))}
          </ToolSection>
          <ToolSection title="Feature experiments">
            <p className="text-sm text-muted">
              Stable assignments use each member's account ID. Recognized keys: discovery_assistant and related_discovery.
              Other keys are stored for future integration. These switches do not grant permissions or payment access, and do not measure experiment outcomes.
            </p>
            <label>
              Feature key
              <input
                className={input}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="related_discovery"
              />
            </label>
            <label>
              Rollout percentage
              <input
                className={input}
                type="number"
                min="0"
                max="100"
                value={rollout}
                onChange={(e) => setRollout(e.target.value)}
              />
            </label>
            <button
              className={button}
              disabled={a.busy}
              onClick={() =>
                void a.run(
                  () =>
                    api.setPlatformFlag({
                      data: { key, enabled: true, rolloutPercent: Number(rollout) },
                    }),
                  () => void q.refetch(),
                )
              }
            >
              Save rollout
            </button>
            {q.data.flags.map((f) => (
              <div key={String(f.key)} className="flex flex-wrap items-center gap-2">
                <strong>{String(f.key)}</strong>
                <span>{Number(f.rollout_percent)}%</span>
                <button
                  className={secondary}
                  onClick={() =>
                    void a.run(
                      () =>
                        api.setPlatformFlag({
                          data: {
                            key: String(f.key),
                            enabled: !f.enabled,
                            rolloutPercent: Number(f.rollout_percent),
                            description: String(f.description),
                          },
                        }),
                      () => void q.refetch(),
                    )
                  }
                >
                  {f.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </ToolSection>
          <AdminManagement />
          <ToolSection title="Support queue">
            {q.data.tickets.map((t) => (
              <Ticket key={Number(t.id)} ticket={t} refresh={() => void q.refetch()} />
            ))}
          </ToolSection>
          <ToolSection title="Audit history">
            {q.data.audit.map((r) => (
              <p key={Number(r.id)} className="text-sm">
                {String(r.action)} · {String(r.detail)}
              </p>
            ))}
          </ToolSection>
        </>
      ) : null}
    </div>
  );
}
function Ticket({ ticket: t, refresh }: { ticket: Record<string, unknown>; refresh: () => void }) {
  const [text, setText] = useState(String(t.response)),
    a = useAction();
  return (
    <article className="rounded-xl bg-bg p-3 space-y-2">
      <h3 className="font-bold">
        #{Number(t.id)} · {String(t.subject)} · @{String(t.handle)}
      </h3>
      <p>{String(t.body)}</p>
      <label>
        Reply
        <textarea
          className={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
        />
      </label>
      <button
        className={secondary}
        disabled={a.busy}
        onClick={() =>
          void a.run(
            () =>
              api.respondSupportTicket({
                data: { id: Number(t.id), status: "resolved", response: text },
              }),
            refresh,
          )
        }
      >
        Respond & resolve
      </button>
    </article>
  );
}

export function HomeToolsStrip() {
  const q = useQuery({
    queryKey: ["discoveryHub", "", ""],
    queryFn: () => api.getDiscoveryHub({ data: {} }),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a className={secondary} href="/discover-plus">
          Discover & feed controls
        </a>
        <a className={secondary} href="/saved">
          Saved posts
        </a>
        <a className={secondary} href="/creator">
          Creator studio
        </a>
      </div>
      {q.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={card}>
            <h2 className="font-bold">Upcoming events</h2>
            {q.data.events.slice(0, 3).map((e) => (
              <a
                key={Number(e.id)}
                href={`/c/${e.community_id}/events`}
                className="mt-2 block text-sm text-violet"
              >
                {String(e.title)}
              </a>
            ))}
          </div>
          <div className={card}>
            <h2 className="font-bold">Live now</h2>
            {q.data.live.length ? (
              q.data.live.slice(0, 3).map((r) => (
                <a
                  key={Number(r.id)}
                  href={`/chats/${r.id}`}
                  className="mt-2 block text-sm text-violet"
                >
                  {String(r.name)}
                </a>
              ))
            ) : (
              <p className="text-sm text-muted">No active rooms</p>
            )}
          </div>
          <div className={card}>
            <h2 className="font-bold">Continue conversations</h2>
            {q.data.chats.slice(0, 3).map((r) => (
              <a
                key={Number(r.id)}
                href={`/chats/${r.id}`}
                className="mt-2 block text-sm text-violet"
              >
                {String(r.name)}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
