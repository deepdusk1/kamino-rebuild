import { AdminManagement } from "@/components/AdminManagement";
import { BillingPanel } from "@/components/BillingPanel";
import { Collaborations } from "@/components/Collaborations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { platform, type Row } from "@/api/platform-v9";
import { identityApi } from "@/lib/identity-v9";
import {
  Screen,
  Card,
  Txt,
  Button,
  Field,
  Chip,
  Loading,
} from "@/components/ui";
import { PeopleMatching } from "@/components/PeopleMatching";
type Tab = "discovery" | "creator" | "marketplace" | "support" | "admin";
const tabs: Tab[] = ["discovery", "creator", "marketplace", "support", "admin"];
export default function Tools() {
  const identity = useQuery({ queryKey: ["identityDashboard"], queryFn: identityApi.dashboard });
  const p = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    tabs.includes(p.tab as Tab) ? (p.tab as Tab) : "discovery",
  );
  return (
    <Screen>
      <Txt variant="title">More from Kamino</Txt>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {Object.entries({'/connections':'Connections','/smart-search':'Smart search','/short-videos':'Short videos','/media-library':'Media library','/operations':'Activity & safety'}).map(([href,label])=><Button key={href} small variant="secondary" label={label} onPress={()=>router.push(href as never)}/>)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {tabs.filter(t => t !== "admin" || identity.data?.isAdmin === true).map((t) => (
          <Chip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </View>
      {tab === "discovery" ? (
        <Discovery />
      ) : tab === "creator" ? (
        <Creator />
      ) : tab === "marketplace" ? (
        <Market />
      ) : tab === "support" ? (
        <Support />
      ) : (
        <Admin />
      )}
    </Screen>
  );
}
function useAction() {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (fn: () => Promise<unknown>, done?: () => void) => {
      setBusy(true);
      try {
        await fn();
        done?.();
      } catch (e) {
        Alert.alert(
          "Could not complete request",
          e instanceof Error ? e.message : "Try again.",
        );
      } finally {
        setBusy(false);
      }
    },
  };
}
function ErrorText({ error }: { error: Error | null }) {
  return error ? <Txt tone="danger">{error.message}</Txt> : null;
}
function Discovery() {
  const [text, setText] = useState(""),
    [area, setArea] = useState(""),
    [contextCommunityId, setContextCommunityId] = useState(""),
    [prompt, setPrompt] = useState(""),
    [answer, setAnswer] = useState(""),
    [task, setTask] = useState("discover");
  const q = useQuery({
      queryKey: ["discoveryHub", text, area, contextCommunityId],
      queryFn: () => platform.hub({ query: text, localArea: area, contextCommunityId: contextCommunityId || undefined }),
    }),
    a = useAction(),
    cache = useQueryClient();
  const refresh = () => {
    void q.refetch();
    void cache.invalidateQueries({ queryKey: ["feed"] });
  };
  return (
    <>
      <Card>
        <Field
          label="Search communities"
          value={text}
          onChangeText={value => { setText(value); setContextCommunityId(""); }}
          maxLength={100}
        />
        <Field
          label="Local area"
          value={area}
          onChangeText={value => { setArea(value); setContextCommunityId(""); }}
          placeholder="City or region"
          maxLength={100}
        />
        <Button
          label="Reset personalization & history"
          variant="secondary"
          busy={a.busy}
          onPress={() => void a.run(() => platform.reset(), refresh)}
        />
      </Card>
      {q.isPending ? <Loading /> : null}
      <ErrorText error={q.error} />
      {q.data ? (
        <>
          <Txt variant="heading">Communities you may like</Txt>
          {q.data.communities.map((c) => (
            <Card key={String(c.id)}>
              <Txt
                variant="cardTitle"
                onPress={() => router.push(`/community/${c.id}` as never)}
              >
                {String(c.name)}
              </Txt>
              <Txt tone="muted">
                {String(c.category)} · {String(c.language)} ·{" "}
                {Number(c.member_count)} members
              </Txt>
              <Txt>{String(c.description)}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(["more", "less", "hide"] as const).map((p) => (
                  <Button
                    small
                    variant="secondary"
                    key={p}
                    label={
                      p === "hide"
                        ? "Not interested"
                        : p === "more"
                          ? "More"
                          : "Less"
                    }
                    disabled={a.busy}
                    onPress={() =>
                      void a.run(
                        () => platform.feedback(String(c.id), p),
                        refresh,
                      )
                    }
                  />
                ))}
              </View>
            </Card>
          ))}
          {q.data.relatedEnabled ? <Card>
            <Txt variant="heading">Related posts & creators</Txt>
            <Txt tone="muted">Suggestions use community categories and your search. Choose a space to explore related work.</Txt>
            <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
              <Chip label="Current results" selected={!contextCommunityId} onPress={() => setContextCommunityId("")}/>
              {q.data.communities.slice(0,8).map(c => <Chip key={String(c.id)} label={String(c.name)} selected={contextCommunityId === String(c.id)} onPress={() => setContextCommunityId(String(c.id))}/>)}
            </View>
            {q.data.relatedPosts.map(p => <Button key={Number(p.id)} label={`${p.title} · ${p.community_name}`} variant="ghost" onPress={() => router.push(`/community/${p.community_id}/post/${p.id}` as never)}/>)}
            {!q.data.relatedPosts.length ? <Txt tone="muted">No related posts yet. Try another space or search.</Txt> : null}
            <Txt variant="cardTitle">Related creators</Txt>
            {q.data.relatedCreators.map(c => <Button key={String(c.user_id)} label={`${c.display_name} · @${c.handle} · ${c.related_posts} related posts`} variant="ghost" onPress={() => router.push(`/profile/${c.handle}` as never)}/>)}
            {!q.data.relatedCreators.length ? <Txt tone="muted">No related creators yet. Public work will appear as the community grows.</Txt> : null}
          </Card> : null}
          <Txt variant="heading">Trending posts</Txt>
          {q.data.posts.map((p) => (
            <Card
              key={Number(p.id)}
              onPress={() =>
                router.push(
                  `/community/${p.community_id}/post/${p.id}` as never,
                )
              }
            >
              <Txt variant="cardTitle">{String(p.title)}</Txt>
              <Txt tone="muted">
                {String(p.community_name)} · {Number(p.like_count)} likes ·{" "}
                {Number(p.comment_count)} replies
              </Txt>
            </Card>
          ))}
          <Card>
            <Txt variant="heading">Upcoming events</Txt>
            {q.data.events.map((e) => (
              <Button
                key={Number(e.id)}
                variant="ghost"
                label={`${e.title} · ${new Date(String(e.starts_at)).toLocaleDateString()}`}
                onPress={() =>
                  router.push(`/community/${e.community_id}/events` as never)
                }
              />
            ))}
          </Card>
          <Card>
            <Txt variant="heading">Continue conversations</Txt>
            {q.data.chats.map((c) => (
              <Button
                key={Number(c.id)}
                label={String(c.name)}
                variant="ghost"
                onPress={() => router.push(`/chat/${c.id}` as never)}
              />
            ))}
            <Button
              label="Saved posts"
              variant="secondary"
              onPress={() => router.push("/saved")}
            />
          </Card>
          <Card>
            <Txt variant="heading">Live now</Txt>
            {q.data.live.length ? (
              q.data.live.map((r) => (
                <Button
                  key={Number(r.id)}
                  label={`${r.name} · ${r.listeners} listeners`}
                  variant="ghost"
                  onPress={() => router.push(`/chat/${r.id}` as never)}
                />
              ))
            ) : (
              <Txt tone="muted">No active rooms right now.</Txt>
            )}
          </Card>
          <Card>
            <Txt variant="heading">Recently visited</Txt>
            {q.data.visits.map((c) => (
              <Button
                key={String(c.id)}
                label={String(c.name)}
                variant="ghost"
                onPress={() => router.push(`/community/${c.id}` as never)}
              />
            ))}
          </Card>
          <Card>
            <Txt variant="heading">Featured collections</Txt>
            {q.data.collections.map((c) => (
              <View key={c.id}>
                <Txt variant="cardTitle">{c.title}</Txt>
                <Txt>{c.description}</Txt>
                {c.communities.map((i) => (
                  <Button
                    key={String(i.id)}
                    label={String(i.name)}
                    variant="ghost"
                    onPress={() => router.push(`/community/${i.id}` as never)}
                  />
                ))}
              </View>
            ))}
          </Card>
          <Card>
            <Txt variant="heading">Trending searches</Txt>
            {q.data.trending.length ? (
              q.data.trending.map((t) => (
                <Chip
                  key={String(t.query)}
                  label={String(t.query)}
                  onPress={() => setText(String(t.query))}
                />
              ))
            ) : (
              <Txt tone="muted">
                Search trends appear after five members search the same term.
              </Txt>
            )}
          </Card>
        </>
      ) : null}
      <PeopleMatching />
      <Card>
        <Txt variant="heading">AI assistant</Txt>
        <Txt tone="muted">
          {q.data?.aiAvailable
            ? "Review generated text before using it."
            : "The assistant is temporarily unavailable."}
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            "discover",
            "caption",
            "description",
            "summarize",
            "translate",
            "onboard",
            "duplicate",
          ].map((t) => (
            <Chip
              key={t}
              label={t}
              selected={task === t}
              onPress={() => setTask(t)}
            />
          ))}
        </View>
        <Field
          label="Your request"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={8000}
        />
        <Button
          label="Ask assistant"
          busy={a.busy}
          disabled={!q.data?.aiAvailable || !prompt.trim()}
          onPress={() =>
            void a.run(async () => {
              const r = await platform.ai(task, prompt);
              setAnswer(r.text);
            })
          }
        />
        {answer ? <Txt>{answer}</Txt> : null}
      </Card>
    </>
  );
}
function Creator() {
  const q = useQuery({
      queryKey: ["creatorDashboard"],
      queryFn: platform.creator,
    }),
    choices = useQuery({
      queryKey: ["paidChoices"],
      queryFn: platform.paidChoices,
    }),
    a = useAction();
  const [communityId, setCommunityId] = useState("");
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [kind, setKind] = useState("membership"),
    [price, setPrice] = useState("5.00");
  return (
    <>
      {q.isPending ? <Loading /> : null}
      <ErrorText error={q.error} />
      {q.data ? (
        <>
          <Card>
            <Txt variant="heading">Your performance</Txt>
            {Object.entries(q.data.stats ?? {}).map(([k, v]) => (
              <Txt key={k}>
                {k}: {Number(v)}
              </Txt>
            ))}
          </Card>
          <Card>
            <Txt variant="heading">Top content</Txt>
            {q.data.topPosts.map((p) => (
              <Button
                key={Number(p.id)}
                variant="ghost"
                label={`${p.title} · ${p.like_count} likes · ${p.comment_count} replies`}
                onPress={() =>
                  router.push(
                    `/community/${p.community_id}/post/${p.id}` as never,
                  )
                }
              />
            ))}
          </Card>
          <Card>
            <Txt variant="heading">Publishing activity</Txt>
            {q.data.daily.map((d) => (
              <Txt key={String(d.day)}>
                {d.day}: {d.posts} posts · {d.likes} likes · {d.comments}{" "}
                replies
              </Txt>
            ))}
          </Card>
          <Card>
            <Txt variant="heading">Audience language</Txt>
            <Txt tone="muted">
              Only groups of at least five followers appear.
            </Txt>
            {q.data.audience.map((d) => (
              <Txt key={String(d.language)}>
                {d.language}: {d.followers} followers
              </Txt>
            ))}
          </Card>
          <Collaborations />
          <BillingPanel creator />
          <Card>
            <Txt variant="heading">Paid offers</Txt>
            <Txt tone="muted">{q.data.payments.reason}</Txt>
            {q.data.offers.map((o) => (
              <View key={Number(o.id)}>
                <Txt variant="cardTitle">{String(o.title)}</Txt>
                <Txt>
                  {String(o.kind)} · {(Number(o.price_minor) / 100).toFixed(2)}{" "}
                  {String(o.currency).toUpperCase()}
                </Txt>
                <Button
                  small
                  label={o.published ? "Unlist" : "List offer"}
                  variant="secondary"
                  onPress={() =>
                    void a.run(
                      () =>
                        platform.offer({
                          id: Number(o.id),
                          kind: String(o.kind),
                          title: String(o.title),
                          description: String(o.description),
                          priceMinor: Number(o.price_minor),
                          currency: String(o.currency),
                          published: !o.published,
                        }),
                      () => void q.refetch(),
                    )
                  }
                />
              </View>
            ))}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {["membership", "tip", "gift", "ticket", "marketplace",...(q.data?.isAdmin?['premium','boost','advertisement']:[])].map(
                (t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={kind === t}
                    onPress={() => setKind(t)}
                  />
                ),
              )}
            </View>
            <Txt variant="cardTitle">Community</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              <Chip
                label="Independent offer"
                selected={!communityId}
                onPress={() => setCommunityId("")}
              />
              {choices.data?.resources
                .filter((r) => r.kind === "community")
                .map((r) => (
                  <Chip
                    key={r.resourceId}
                    label={r.title}
                    selected={communityId === r.resourceId}
                    onPress={() => setCommunityId(r.resourceId)}
                  />
                ))}
            </View>
            <Txt variant="caption" tone="muted">
              Choose the community this offer unlocks. Memberships renew
              monthly.
            </Txt>
            <Field
              label="Offer title"
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={2000}
            />
            <Field
              label="Price (USD)"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
            <Button
              label="Save draft offer"
              busy={a.busy}
              disabled={title.trim().length < 3}
              onPress={() =>
                void a.run(
                  () =>
                    platform.offer({
                      title,
                      description,
                      kind,
                      priceMinor: Math.round(Number(price) * 100),
                      ...(communityId ? { communityId } : {}),
                    }),
                  () => {
                    setTitle("");
                    setDescription("");
                    void q.refetch();
                  },
                )
              }
            />
          </Card>
        </>
      ) : null}
    </>
  );
}
function Market() {
  const q = useQuery({ queryKey: ["marketplace"], queryFn: platform.market });
  return (
    <>
      <Card>
        <Txt>Purchases are unavailable for now.</Txt>
      </Card>
      <ErrorText error={q.error} />
      {q.data?.offers.map((o) => (
        <Card key={Number(o.id)}>
          <Txt variant="cardTitle">{String(o.title)}</Txt>
          <Txt>{String(o.description)}</Txt>
          <Txt tone="muted">
            {String(o.kind)} · @{String(o.handle)}
          </Txt>
          <Txt>
            {(Number(o.price_minor) / 100).toFixed(2)}{" "}
            {String(o.currency).toUpperCase()}
          </Txt>
          <Button label="Payments unavailable" disabled onPress={() => {}} />
        </Card>
      ))}
      <BillingPanel />
      <Collaborations browse />
    </>
  );
}
function Support() {
  const q = useQuery({ queryKey: ["support"], queryFn: platform.support }),
    a = useAction();
  const [subject, setSubject] = useState(""),
    [body, setBody] = useState("");
  return (
    <>
      <Card>
        <Txt variant="heading">Contact support</Txt>
        <Field
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          maxLength={100}
        />
        <Field
          label="How can we help?"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={5000}
        />
        <Button
          label="Submit ticket"
          busy={a.busy}
          disabled={subject.trim().length < 3 || body.trim().length < 10}
          onPress={() =>
            void a.run(
              () => platform.submit(subject, body),
              () => {
                setSubject("");
                setBody("");
                void q.refetch();
              },
            )
          }
        />
      </Card>
      <ErrorText error={q.error} />
      {q.data?.map((t) => (
        <Card key={Number(t.id)}>
          <Txt variant="cardTitle">
            #{Number(t.id)} · {String(t.subject)}
          </Txt>
          <Txt tone="muted">{String(t.status)}</Txt>
          <Txt>{String(t.body)}</Txt>
          {t.response ? <Txt>Support: {String(t.response)}</Txt> : null}
        </Card>
      ))}
    </>
  );
}
function Admin() {
  const q = useQuery({ queryKey: ["adminDashboard"], queryFn: platform.admin }),
    a = useAction();
  const [title, setTitle] = useState(""),
    [ids, setIds] = useState(""),
    [key, setKey] = useState(""),
    [percent, setPercent] = useState("100");
  return (
    <>
      <ErrorText error={q.error} />
      {q.data ? (
        <>
          <Card>
            <Txt variant="heading">Platform activity</Txt>
            <Button label="Open activity & signup-cohort analytics" variant="secondary" onPress={() => router.push("/admin-analytics" as never)}/>
            {Object.entries(q.data.metrics).map(([k, v]) => (
              <Txt key={k}>
                {k.replaceAll("_", " ")}: {Number(v)}
              </Txt>
            ))}
          </Card>
          <Card>
            <Txt variant="heading">Featured collections</Txt>
            <Field label="Title" value={title} onChangeText={setTitle} />
            <Field
              label="Community IDs, separated by commas"
              value={ids}
              onChangeText={setIds}
            />
            <Button
              label="Publish collection"
              busy={a.busy}
              onPress={() =>
                void a.run(
                  () =>
                    platform.collection(
                      title,
                      ids
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    ),
                  () => void q.refetch(),
                )
              }
            />
            {q.data.collections.map((c) => (
              <Txt key={Number(c.id)}>{String(c.title)}</Txt>
            ))}
          </Card>
          <Card>
            <Txt variant="heading">Feature experiments</Txt>
            <Txt tone="muted">Recognized keys: discovery_assistant and related_discovery. Other keys are saved for future integration. Stable rollout assignments do not grant payment access or measure experiment outcomes.</Txt>
            <Field label="Feature key" value={key} onChangeText={setKey} placeholder="related_discovery"/>
            <Field
              label="Rollout percentage"
              value={percent}
              onChangeText={setPercent}
              keyboardType="number-pad"
            />
            <Button
              label="Save rollout"
              busy={a.busy}
              onPress={() =>
                void a.run(
                  () => platform.flag(key, true, Number(percent)),
                  () => void q.refetch(),
                )
              }
            />
            {q.data.flags.map((f) => (
              <Button
                key={String(f.key)}
                variant="secondary"
                label={`${f.key} · ${f.enabled ? "Disable" : "Enable"}`}
                onPress={() =>
                  void a.run(
                    () =>
                      platform.flag(
                        String(f.key),
                        !f.enabled,
                        Number(f.rollout_percent),
                      ),
                    () => void q.refetch(),
                  )
                }
              />
            ))}
          </Card>
          <AdminManagement data={q.data} refresh={() => void q.refetch()} />
          <Txt variant="heading">Support queue</Txt>
          {q.data.tickets.map((t) => (
            <Ticket key={Number(t.id)} t={t} refresh={() => void q.refetch()} />
          ))}
          <Card>
            <Txt variant="heading">Audit history</Txt>
            {q.data.audit.map((r) => (
              <Txt key={Number(r.id)}>
                {r.action} · {r.detail}
              </Txt>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}
function Ticket({ t, refresh }: { t: Row; refresh: () => void }) {
  const [text, setText] = useState(String(t.response)),
    a = useAction();
  return (
    <Card>
      <Txt variant="cardTitle">
        #{Number(t.id)} · {String(t.subject)}
      </Txt>
      <Txt>{String(t.body)}</Txt>
      <Field
        label="Support response"
        value={text}
        onChangeText={setText}
        multiline
      />
      <Button
        label="Respond & resolve"
        busy={a.busy}
        onPress={() =>
          void a.run(() => platform.reply(Number(t.id), text), refresh)
        }
      />
    </Card>
  );
}
