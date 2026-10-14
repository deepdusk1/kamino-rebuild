import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { fieldClass } from "@/components/community/sheet";
import {
  getProfileStories,
  publishProfileStory,
  setProfileStoryHighlight,
  deleteProfileStory,
  getProfileStoryResponses,
  respondToProfileStory,
  reportProfileStory,
} from "@/lib/kamino/profile-stories";
import { checkedContentMedia } from "@/lib/kamino/content-rules";
import { StoryLayerEditor, StoryLayers } from "@/components/media-v10-story-editor";
import { MediaLibraryPicker } from "@/components/media-v10-library";
import type { StoryLayer } from "@/lib/kamino/media-v10-rules";
export const Route = createFileRoute("/profile-stories")({
  validateSearch: (s: Record<string, unknown>) => ({
    userId: typeof s.userId === "string" ? s.userId : undefined,
  }),
  component: Stories,
});
type Story = Awaited<ReturnType<typeof getProfileStories>>["stories"][number];
type Media = {
  kind: "image" | "gif" | "video" | "audio";
  dataUrl: string;
  filename: string;
  altText: string;
  captions: string;
};
const backgrounds: Record<string, string> = {
  violet: "linear-gradient(135deg,#6145c4,#34267c)",
  ocean: "linear-gradient(135deg,#086c8d,#1741a0)",
  rose: "linear-gradient(135deg,#a62e65,#732464)",
  midnight: "linear-gradient(135deg,#222c47,#111725)",
};
function Stories() {
  const { userId } = Route.useSearch(),
    q = useQuery({
      queryKey: ["profileStories", userId ?? "me"],
      queryFn: () => getProfileStories({ data: { userId } }),
    });
  return (
    <AppShell padded back title="Profile stories">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-bold text-accent">YOUR DAY, YOUR SPACE</p>
          <h1 className="mt-2 text-2xl font-extrabold">
            {q.data && !q.data.mine ? `${q.data.displayName}’s stories` : "Profile stories"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Share a moment from your profile. Stories last 24 hours; highlights stay until you
            remove them.
          </p>
        </header>
        {q.isPending ? (
          <p role="status">Loading stories…</p>
        ) : q.error ? (
          <p role="alert">{q.error.message}</p>
        ) : q.data ? (
          <>
            {q.data.mine ? <Composer /> : null}
            <section className="space-y-4" aria-label="Stories">
              {q.data.stories.length ? (
                q.data.stories.map((s) => <StoryCard key={s.id} story={s} mine={q.data.mine} />)
              ) : (
                <p className="rounded-card border border-border bg-surface p-5 text-muted">
                  No stories to show yet.
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
function Composer() {
  const client = useQueryClient(),
    [caption, setCaption] = useState(""),
    [audience, setAudience] = useState<"public" | "followers" | "close_friends">("public"),
    [background, setBackground] = useState<"violet" | "ocean" | "rose" | "midnight">("violet"),
    [age, setAge] = useState<13 | 16 | 18>(13),
    [warning, setWarning] = useState(""),
    [question, setQuestion] = useState(""),
    [poll, setPoll] = useState(""),
    [layers, setLayers] = useState<StoryLayer[]>([]),
    [media, setMedia] = useState<Media | null>(null),
    [music,setMusic]=useState<(Media&{kind:"audio"})|null>(null),
    [busy, setBusy] = useState(false);
  async function pick(file: File) {
    setBusy(true);
    try {
      const kind: Media["kind"] =
        file.type === "image/gif"
          ? "gif"
          : file.type.startsWith("image/")
            ? "image"
            : file.type.startsWith("video/")
              ? "video"
              : "audio";
      if (
        file.size >
        (kind === "video"
          ? 12_000_000
          : kind === "gif"
            ? 4_000_000
            : kind === "image"
              ? 2_000_000
              : 8_000_000)
      )
        throw new Error("This file is too large. Choose a smaller file.");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read this file."));
        reader.readAsDataURL(file);
      });
      checkedContentMedia(kind, dataUrl);
      if(kind==="audio")setMusic({kind:"audio",dataUrl,filename:file.name,altText:"",captions:""});
      else setMedia({ kind, dataUrl, filename: file.name, altText: "", captions: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add media.");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    try {
      await publishProfileStory({
        data: {
          caption,
          audience,
          background,
          minimumAge: age,
          contentWarning: warning,
          question,
          pollOptions: poll
            .split("\n")
            .map((p) => p.trim())
            .filter(Boolean),
          media: media ?? undefined,
          music:music??undefined,
          layers,
        },
      });
      setCaption("");
      setMedia(null);
      setMusic(null);
      setQuestion("");
      setPoll("");
      setLayers([]);
      await client.invalidateQueries({ queryKey: ["profileStories"] });
      toast.success("Your story is live for 24 hours.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-card border border-border bg-surface p-5"
      aria-label="Publish a story"
    >
      <h2 className="text-lg font-extrabold">Share a moment</h2>
      <label className="block space-y-2 text-sm font-semibold">
        Story text
        <textarea
          className={fieldClass}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={1500}
          placeholder="What’s happening in your world?"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-2 text-sm">
          Who can see it
          <select
            className={fieldClass}
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
          >
            <option value="public">Everyone</option>
            <option value="followers">Followers</option>
            <option value="close_friends">Close friends</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          Background
          <select
            className={fieldClass}
            value={background}
            onChange={(e) => setBackground(e.target.value as typeof background)}
          >
            {Object.keys(backgrounds).map((b) => (
              <option key={b} value={b}>
                {b.charAt(0).toUpperCase() + b.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          Age rating
          <select
            className={fieldClass}
            value={age}
            onChange={(e) => setAge(Number(e.target.value) as typeof age)}
          >
            <option value={13}>13+</option>
            <option value={16}>16+</option>
            <option value={18}>18+</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">
        A private profile stays visible to approved followers. Manage close friends in your privacy
        dashboard.
      </p>
      <label className="block space-y-2 text-sm">
        Content note
        <input
          className={fieldClass}
          value={warning}
          onChange={(e) => setWarning(e.target.value)}
          maxLength={120}
          placeholder="Optional, such as flashing lights"
        />
      </label>
      <label className="block space-y-2 text-sm">
        Photo, GIF, video or music
        <input
          className="block w-full min-h-11 text-sm"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/*"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-muted">
        Photos up to 2 MB, GIFs 4 MB, video 12 MB and audio 8 MB. Choose media you have permission
        to share.
      </p>
      {media ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="break-words text-sm font-bold">{media.filename}</p>
          <label className="block text-sm">
            Media description
            <input
              className={fieldClass}
              value={media.altText}
              maxLength={600}
              onChange={(e) => setMedia({ ...media, altText: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Captions or transcript
            <textarea
              className={fieldClass}
              value={media.captions}
              maxLength={12000}
              onChange={(e) => setMedia({ ...media, captions: e.target.value })}
            />
          </label>
          <Button variant="ghost" onClick={() => setMedia(null)}>
            Remove attachment
          </Button>
        </div>
      ) : null}
      <StoryLayerEditor layers={layers} onChange={setLayers} background={backgrounds[background]!}/>
      <details className="rounded-xl border border-border p-3"><summary className="min-h-11 cursor-pointer font-bold">Choose a GIF or soundtrack from your library</summary><div className="space-y-3"><MediaLibraryPicker kind="gif" onSelect={setMedia}/><MediaLibraryPicker kind="audio" onSelect={file=>setMusic({...file,kind:"audio"})}/></div></details>
      {music?<div className="space-y-2 rounded-xl border border-border p-3"><p className="text-sm font-bold">Soundtrack: {music.filename}</p><audio controls src={music.dataUrl} className="w-full" aria-label={music.altText||music.filename}/><label className="block text-sm">Audio description<input className={fieldClass} maxLength={600} value={music.altText} onChange={e=>setMusic({...music,altText:e.target.value})}/></label><label className="block text-sm">Lyrics or transcript<textarea className={fieldClass} maxLength={12000} value={music.captions} onChange={e=>setMusic({...music,captions:e.target.value})}/></label><Button variant="secondary" onClick={()=>setMusic(null)}>Remove soundtrack</Button></div>:null}
      <details className="rounded-xl border border-border p-3">
        <summary className="min-h-10 cursor-pointer text-sm font-bold">
          Add a question or poll
        </summary>
        <label className="block text-sm">
          Question
          <input
            className={fieldClass}
            value={question}
            maxLength={200}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm">
          Poll choices, one per line
          <textarea
            className={fieldClass}
            value={poll}
            onChange={(e) => setPoll(e.target.value)}
            maxLength={324}
            placeholder="Two to four choices"
          />
        </label>
      </details>
      <Button disabled={busy || (!caption.trim() && !media && !music && !layers.length)||!!music&&media?.kind==="audio"} onClick={() => void publish()}>
        {busy ? "Saving…" : "Publish story"}
      </Button>
    </section>
  );
}
function StoryCard({ story: s, mine }: { story: Story; mine: boolean }) {
  const { user } = useCurrentUserState();
  const client = useQueryClient(),
    [revealed, setRevealed] = useState(!s.blur),
    [answer, setAnswer] = useState(""),
    [report, setReport] = useState(""),
    [busy, setBusy] = useState(false);
  const responses = useQuery({
    queryKey: ["profileStoryResponses", s.id],
    queryFn: () => getProfileStoryResponses({ data: { storyId: s.id } }),
    enabled: !!user && revealed && (!!s.question || !!s.pollOptions.length),
  });
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["profileStories"] }),
        client.invalidateQueries({ queryKey: ["profileStoryResponses", s.id] }),
      ]);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface">
      <div
        className="p-5 text-white"
        style={{ background: backgrounds[s.background] ?? backgrounds.violet }}
      >
        <p className="text-xs font-semibold">
          {s.highlighted
            ? "✦ Highlight"
            : s.expired
              ? "Expired · visible only to you"
              : "Live for 24 hours"}{" "}
          · {s.minimumAge}+ · {s.audience.replace("_", " ")}
        </p>
        {s.hidden ? <p className="mt-2 font-bold">Hidden by site moderation</p> : null}
        {s.contentWarning ? <p className="mt-3 text-sm">Content note: {s.contentWarning}</p> : null}
        {revealed ? (
          <div className="relative mt-4 aspect-[9/16] overflow-hidden rounded-xl" style={{background:backgrounds[s.background]??backgrounds.violet}}>
          <div className="flex h-full flex-col justify-center p-4">
            <p className="mt-4 whitespace-pre-wrap break-words text-lg font-bold">{s.caption}</p>
            {s.media ? (
              <div className="mt-4 overflow-hidden rounded-xl">
                {s.media.kind === "image" || s.media.kind === "gif" ? (
                  <img
                    src={s.media.url}
                    alt={s.media.altText || "Story image"}
                    className="max-h-[480px] w-full object-contain"
                  />
                ) : s.media.kind === "video" ? (
                  <video
                    src={s.media.url}
                    muted={!!s.music}
                    controls
                    preload="metadata"
                    className="max-h-[480px] w-full"
                    aria-label={s.media.altText || "Story video"}
                  >
                    {s.media.captions ? (
                      <track kind="captions" src={`${s.media.url}?captions`} default />
                    ) : null}
                  </video>
                ) : (
                  <audio
                    src={s.media.url}
                    controls
                    preload="metadata"
                    className="w-full"
                    aria-label={s.media.altText || s.media.filename}
                  />
                )}
              </div>
            ) : null}
            {s.media?.captions ? (
              <p className="mt-3 whitespace-pre-wrap text-sm">{s.media.captions}</p>
            ) : null}
          </div><StoryLayers layers={s.layers}/></div>
        ) : (
          <Button className="mt-3" variant="secondary" onClick={() => setRevealed(true)}>
            Show story
          </Button>
        )}
      </div>
      <div className="space-y-3 p-4">
        {revealed&&s.music?<figure><p className="text-sm font-bold">Soundtrack</p><audio src={s.music.url} controls preload="metadata" className="w-full" aria-label={s.music.altText||s.music.filename}/>{s.music.captions?<p className="whitespace-pre-wrap text-sm">{s.music.captions}</p>:null}</figure>:null}
        {responses.isError ? (
          <p role="alert" className="text-sm text-danger">
            {responses.error.message}
          </p>
        ) : user && responses.isPending && (s.question || s.pollOptions.length) ? (
          <p role="status" className="text-sm text-muted">
            Loading responses…
          </p>
        ) : null}
        {revealed && !s.hidden ? (
          <>
            {s.pollOptions.map((o, i) => (
              <Button
                key={i}
                className="max-w-full whitespace-normal [overflow-wrap:anywhere] text-left"
                variant={responses.data?.mine?.optionIndex === i ? "primary" : "secondary"}
                disabled={!user || busy || s.expired || !responses.isSuccess}
                onClick={() =>
                  void run(
                    () => respondToProfileStory({ data: { storyId: s.id, optionIndex: i } }),
                    "Vote saved",
                  )
                }
              >
                {o} · {responses.data?.votes.find((v) => v.optionIndex === i)?.count ?? 0}
              </Button>
            ))}
            {s.question ? (
              <>
                <p className="font-bold">{s.question}</p>
                <label className="block text-sm">
                  Your answer
                  <textarea
                    className={fieldClass}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    maxLength={1000}
                  />
                </label>
                <Button
                  disabled={!user || busy || s.expired || !answer.trim() || !responses.isSuccess}
                  onClick={() =>
                    void run(
                      () => respondToProfileStory({ data: { storyId: s.id, answer } }),
                      "Answer saved",
                    )
                  }
                >
                  Send answer
                </Button>
              </>
            ) : null}
            {mine && responses.data?.answers.length ? (
              <details>
                <summary className="min-h-10 cursor-pointer font-bold">
                  Answers ({responses.data.answers.length})
                </summary>
                {responses.data.answers.map((a, i) => (
                  <p key={i} className="my-2 whitespace-pre-wrap text-sm">
                    {a}
                  </p>
                ))}
              </details>
            ) : null}
          </>
        ) : null}
        {mine ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy || s.hidden}
              onClick={() =>
                void run(
                  () =>
                    setProfileStoryHighlight({
                      data: { storyId: s.id, highlighted: !s.highlighted },
                    }),
                  s.highlighted ? "Highlight removed" : "Highlight saved",
                )
              }
            >
              {s.highlighted ? "Remove highlight" : "Keep as highlight"}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Delete this story and its replies?"))
                  void run(() => deleteProfileStory({ data: { storyId: s.id } }), "Story deleted");
              }}
            >
              Delete story
            </Button>
          </div>
        ) : (
          <details>
            <summary className="min-h-10 cursor-pointer text-sm text-muted">Report story</summary>
            <label className="block text-sm">
              Reason
              <input
                className={fieldClass}
                value={report}
                maxLength={300}
                onChange={(e) => setReport(e.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              disabled={busy || !report.trim()}
              onClick={() =>
                void run(
                  () =>
                    reportProfileStory({ data: { storyId: s.id, reason: report, details: "" } }),
                  "Report sent to the site team",
                )
              }
            >
              Send report
            </Button>
          </details>
        )}
      </div>
    </article>
  );
}
