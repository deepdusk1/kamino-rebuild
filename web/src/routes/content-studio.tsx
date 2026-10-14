import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { GradientButton, OutlineButton } from "@/components/k";
import { fieldClass } from "@/components/community/sheet";
import { useMyCommunities } from "@/components/create/my-communities";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
import {
  getUploadAllowance,
  createMediaPost,
  profileContent,
  saveProfileHighlight,
  savePortfolioItem,
  removeProfileContent,
} from "@/lib/kamino/content-v9";
import { checkedContentMedia } from "@/lib/kamino/content-rules";
import { detectDuplicatePostsV10 } from "@/lib/kamino/search-v10";
import { MediaLibraryPicker } from "@/components/media-v10-library";
import { GifPicker } from "@/components/gif-picker";
import { DuplicateCheck } from "@/components/duplicate-check-v10";

export const Route = createFileRoute("/content-studio")({ component: ContentStudio });
const KINDS = [
  { key: "video", icon: "🎬", name: "Video" },
  { key: "short", icon: "⚡", name: "Short video" },
  { key: "audio", icon: "🎧", name: "Audio" },
  { key: "gif", icon: "✨", name: "Animated GIF" },
  { key: "article", icon: "📝", name: "Article" },
  { key: "story", icon: "🌈", name: "Story" },
] as const;
type Kind = (typeof KINDS)[number]["key"];
export type Media = {
  kind: "image" | "video" | "short" | "audio" | "gif";
  dataUrl: string;
  filename: string;
  altText: string;
  captions: string;
};

function ContentStudio() {
  const { user, isPending } = useCurrentUserState(),
    { list } = useMyCommunities(),
    client = useQueryClient();
  const [kind, setKind] = useState<Kind>("video"),
    [slug, setSlug] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [media, setMedia] = useState<Media | null>(null),
    [images,setImages]=useState<(Media&{kind:"image"})[]>([]),
    [busy, setBusy] = useState(false),
    [published, setPublished] = useState<{ id: number; slug: string; held: boolean } | null>(null);
  const [audience, setAudience] = useState<"public" | "members">("public"),
    [comments, setComments] = useState<"members" | "followers" | "none">("members"),
    [sharing, setSharing] = useState(true),
    [warning, setWarning] = useState(""),
    [schedule, setSchedule] = useState("");
  const [scope, setScope] = useState<"community" | "profile">("community"),
    [background, setBackground] = useState("#7548df"),
    [sticker, setSticker] = useState("✨"),
    [overlay, setOverlay] = useState(""),
    [mentions, setMentions] = useState(""),
    [question, setQuestion] = useState(""),
    [poll, setPoll] = useState("");
  const [collection, setCollection] = useState(""),
    [storyIds, setStoryIds] = useState<number[]>([]),
    [workTitle, setWorkTitle] = useState(""),
    [description, setDescription] = useState(""),
    [url, setUrl] = useState("");
  const [dupes, setDupes] = useState<{ kind: string; id: string; title: string; excerpt: string; href: string; score: number }[] | null>(null),
    [dupeNote, setDupeNote] = useState(""),
    [dupeBusy, setDupeBusy] = useState(false);
  async function checkOriginality() {
    if (!slug) { setDupeNote("Pick a community first — the check compares against that community."); return; }
    if (body.trim().length < 10) { setDupeNote("Write a little more first (at least 10 characters)."); return; }
    setDupeBusy(true); setDupeNote("");
    try {
      const result = await detectDuplicatePostsV10({ data: { communityId: slug, text: body, consent: true } });
      setDupes(result.matches);
      if (!result.matches.length) setDupeNote("No close matches — this looks original for this community.");
    } catch (error) {
      setDupeNote(error instanceof Error ? error.message : "Originality check is unavailable right now.");
      setDupes(null);
    } finally {
      setDupeBusy(false);
    }
  }
  const library = useQuery({
    queryKey: ["profileContent", user?.id],
    queryFn: () => profileContent({ data: { userId: user!.id } }),
    enabled: !!user,
  });
  const allowance = useQuery({
    queryKey: ["uploadAllowance"],
    queryFn: () => getUploadAllowance(),
    enabled: !!user,
  });
  const chosen = slug || list[0]?.slug || "";
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["profileContent"] });
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function attach(file: File) {
    if (file.size > (allowance.data?.limits.video ?? 12_000_000))
      return toast.error(
        `Choose a file under ${(allowance.data?.limits.video ?? 12_000_000) / 1_000_000} MB.`,
      );
    const mediaKind =
      kind === "story" || kind === "article"
        ? file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "audio"
            : file.type === "image/gif"
              ? "gif"
              : "image"
        : kind;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = String(reader.result);
        checkedContentMedia(mediaKind, dataUrl, allowance.data?.premium);
        if(kind==="article"){
          if(mediaKind!=="image")throw new Error("Article blocks accept pictures.");
          if(images.length>=6)throw new Error("Use up to six image blocks per article.");
          setImages(previous=>[...previous,{kind:"image",dataUrl,filename:file.name,altText:"",captions:""}]);
          setBody(previous=>`${previous}\n\n[image:${images.length+1}]`);
        }else setMedia({ kind: mediaKind, dataUrl, filename: file.name, altText: "", captions: "" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unsupported file.");
      }
    };
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsDataURL(file);
  }
  async function publish() {
    if (!chosen) return toast.error("Join a community first.");
    setBusy(true);
    try {
      const result = await createMediaPost({
        data: {
          slug: chosen,
          title,
          body,
          kind,
          media: media ?? undefined,
          images:kind==="article"?images:[],
          visibility: audience,
          sharingAllowed: sharing,
          commentRule: comments,
          contentWarning: warning,
          publishAt: schedule ? new Date(schedule).toISOString() : null,
          story:
            kind === "story"
              ? {
                  scope,
                  background,
                  overlayText: overlay,
                  sticker,
                  mentions: mentions
                    .split(/[ ,]+/)
                    .map((s) => s.replace(/^@/, ""))
                    .filter(Boolean),
                  question,
                  pollOptions: poll
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : undefined,
        },
      });
      setPublished(result);
      await client.invalidateQueries();
      toast.success(
        result.held ? "Saved for moderator review" : schedule ? "Post scheduled" : "Published",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }
  if (!isPending && !user) return <RedirectToSignIn />;
  return (
    <AppShell>
      <main className="mx-auto max-w-[920px] space-y-6 px-4 py-5 pb-28">
        <header className="rounded-card bg-gradient-to-br from-violet-600 via-purple-600 to-blue-500 p-6 text-white shadow-card">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-white/80">
            Your creative space
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">Content studio</h1>
          <p className="mt-2 max-w-[540px] text-sm leading-6 text-white/90">
            Share clips, sounds, articles and interactive stories. Keep your favourite stories and
            showcase your best work.
          </p>
        </header>
        <a className="inline-block min-h-11 py-3 font-bold text-accent" href="/profile-stories">Publish a profile story without a community →</a>
        <div className="flex flex-wrap gap-4"><a className="inline-block min-h-11 py-3 font-bold text-accent" href="/short-videos">Watch short videos →</a><a className="inline-block min-h-11 py-3 font-bold text-accent" href="/media-library">Manage your GIF and music library →</a></div>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
          role="group"
          aria-label="Content type"
        >
          {KINDS.map((k) => (
            <button
              key={k.key}
              aria-pressed={kind === k.key}
              className={`k-focus min-h-[90px] rounded-card border p-3 text-left ${kind === k.key ? "border-accent bg-accent/10" : "border-border bg-surface"}`}
              onClick={() => {
                setKind(k.key);
                setMedia(null);
                setImages([]);
                setPublished(null);
              }}
            >
              <span className="text-2xl">{k.icon}</span>
              <span className="mt-2 block text-sm font-bold">{k.name}</span>
            </button>
          ))}
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
          <section className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-extrabold">
              Create {KINDS.find((k) => k.key === kind)?.name.toLowerCase()}
            </h2>
            <label className="block text-sm font-semibold">
              Community
              <select
                className={`${fieldClass} mt-2`}
                value={chosen}
                onChange={(e) => setSlug(e.target.value)}
              >
                {list.map((c) => (
                  <option value={c.slug} key={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!list.length ? (
              <p className="text-sm text-muted">Join a community in Explore before publishing.</p>
            ) : null}
            <label className="block text-sm font-semibold">
              Title
              <input
                className={`${fieldClass} mt-2`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                placeholder="Give your creation a title"
              />
            </label>
            <label className="block text-sm font-semibold">
              {kind === "article" ? "Article" : "Description"}
              <textarea
                className={`${fieldClass} mt-2 min-h-[160px]`}
                maxLength={30000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  kind === "article"
                    ? "# A heading\nTell your story. Add up to six images below, then move their [image:1] markers between paragraphs. Use ||text|| to hide a spoiler."
                    : "Tell your community about this"
                }
              />
            </label>
            {scope === "community" && (kind === "article" || kind === "video" || kind === "audio") && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void checkOriginality()}
                  disabled={dupeBusy}
                  className="k-focus rounded-full bg-surface-alt px-4 py-2 text-[13px] font-bold text-ink disabled:opacity-50"
                >
                  {dupeBusy ? "Checking…" : "Check originality"}
                </button>
                {dupeNote ? <p className="text-xs text-muted">{dupeNote}</p> : null}
                {dupes && dupes.length > 0 && (
                  <div className="rounded-tile border border-warn/40 bg-tint-warn/30 p-3 text-sm">
                    <p className="font-bold text-ink">
                      {dupes.length} similar {dupes.length === 1 ? "post" : "posts"} already in this
                      community — consider commenting there instead:
                    </p>
                    <ul className="mt-1 space-y-1">
                      {dupes.slice(0, 5).map((d) => (
                        <li key={`${d.kind}-${d.id}`}>
                          <a href={d.href} className="font-semibold text-accent underline">
                            {d.title}
                          </a>{" "}
                          <span className="text-muted">({Math.round(d.score * 100)}% similar)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <label className="k-focus flex min-h-[90px] cursor-pointer flex-col justify-center rounded-card border-2 border-dashed border-border p-4 text-center">
              <span className="font-bold text-accent">
                {media
                  ? media.filename
                  : kind === "article"?`Add image block (${images.length}/6)`:kind === "story"
                    ? "Add a picture, video or music (optional)"
                    : "Choose media"}
              </span>
              <span className="mt-1 text-xs text-muted">
                Video {(allowance.data?.limits.video ?? 12_000_000) / 1_000_000} MB · Audio{" "}
                {(allowance.data?.limits.audio ?? 8_000_000) / 1_000_000} MB · GIF{" "}
                {(allowance.data?.limits.gif ?? 4_000_000) / 1_000_000} MB · Picture{" "}
                {(allowance.data?.limits.image ?? 2_000_000) / 1_000_000} MB
              </span>
              <input
                type="file"
                className="sr-only"
                accept={
                  kind === "gif"
                    ? "image/gif"
                    : kind === "audio"
                      ? "audio/*"
                      : kind === "video" || kind === "short"
                        ? "video/*"
                        : kind === "article"
                          ? "image/jpeg,image/png,image/webp"
                          : "image/*,video/*,audio/*"
                }
                onChange={(e) => {
                  if (e.target.files?.[0]) void attach(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {kind==="article"?images.map((image,index)=><div key={`${image.filename}-${index}`} className="space-y-2 rounded-xl border border-border p-3"><img src={image.dataUrl} alt={image.altText||`Article image ${index+1}`} className="max-h-40 w-full object-contain"/><p className="text-sm font-bold">Image {index+1}: [image:{index+1}]</p><label className="block text-sm">Describe this image<input className={fieldClass} value={image.altText} maxLength={600} onChange={e=>setImages(previous=>previous.map((item,i)=>i===index?{...item,altText:e.target.value}:item))}/></label><OutlineButton onClick={()=>{setImages(previous=>previous.filter((_,i)=>i!==index));setBody(previous=>previous.replace(/\[image:(\d+)\]/g,(marker,n)=>Number(n)===index+1?"":Number(n)>index+1?`[image:${Number(n)-1}]`:marker));}}>Remove image {index+1}</OutlineButton></div>):null}
            <DuplicateCheck communityId={chosen} text={title+'\n'+body}/>
            {kind==="gif"?<MediaLibraryPicker kind="gif" onSelect={setMedia}/>:null}
            {kind==="gif"?<GifPicker onSelect={setMedia}/>:null}
            {kind==="audio"?<MediaLibraryPicker kind="audio" onSelect={setMedia}/>:null}
            {media ? (
              <div className="space-y-3">
                <label className="block text-sm font-semibold">
                  Alt text / description
                  <input
                    className={`${fieldClass} mt-2`}
                    maxLength={600}
                    value={media.altText}
                    onChange={(e) => setMedia({ ...media, altText: e.target.value })}
                    placeholder="Describe what someone sees or hears"
                  />
                </label>
                {["audio", "video", "short"].includes(media.kind) ? (
                  <label className="block text-sm font-semibold">
                    Captions / transcript
                    <textarea
                      className={`${fieldClass} mt-2`}
                      value={media.captions}
                      onChange={(e) => setMedia({ ...media, captions: e.target.value })}
                      placeholder="Write spoken words and useful sound descriptions"
                      maxLength={12000}
                    />
                  </label>
                ) : null}
                <OutlineButton onClick={() => setMedia(null)}>Remove media</OutlineButton>
              </div>
            ) : null}
            {kind === "story" ? (
              <fieldset className="space-y-3 rounded-card bg-surface-alt p-4">
                <legend className="px-2 font-bold">Story overlays & interactions</legend>
                <label className="block text-sm">
                  Appears on
                  <select
                    className={`${fieldClass} mt-1`}
                    value={scope}
                    onChange={(e) => setScope(e.target.value as typeof scope)}
                  >
                    <option value="community">Community story</option>
                    <option value="profile">My profile story</option>
                  </select>
                </label>
                <p className="text-xs text-muted">
                  Stories use the selected community's access rules and expire after 24 hours.
                  Highlights preserve the story for your profile.
                </p>
                <textarea
                  className={fieldClass}
                  aria-label="Story overlay text"
                  value={overlay}
                  onChange={(e) => setOverlay(e.target.value)}
                  maxLength={400}
                  placeholder="Text on your story"
                />
                <div className="flex items-center gap-3">
                  <label className="text-sm">
                    Background{" "}
                    <input
                      type="color"
                      value={background}
                      onChange={(e) => setBackground(e.target.value)}
                    />
                  </label>
                  <input
                    className={fieldClass}
                    aria-label="Story sticker"
                    value={sticker}
                    onChange={(e) => setSticker(e.target.value)}
                    maxLength={32}
                  />
                </div>
                <input
                  className={fieldClass}
                  aria-label="Mention stickers"
                  value={mentions}
                  onChange={(e) => setMentions(e.target.value)}
                  placeholder="Mention stickers: @mira @jun"
                />
                <input
                  className={fieldClass}
                  aria-label="Question sticker"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={200}
                  placeholder="Ask your viewers a question"
                />
                <textarea
                  className={fieldClass}
                  aria-label="Poll options"
                  value={poll}
                  onChange={(e) => setPoll(e.target.value)}
                  placeholder="Poll choices, one per line (2–4)"
                />
              </fieldset>
            ) : null}
            <GradientButton
              full
              disabled={busy || title.trim().length < 3 || !chosen}
              onClick={() => void publish()}
            >
              {busy ? "Saving…" : schedule ? "Schedule" : "Publish"}
            </GradientButton>
            {published ? (
              <div role="status" className="rounded-card bg-tint-violet p-4">
                <p className="font-bold">
                  {published.held ? "Waiting for moderator review" : "Your creation is saved"}
                </p>
                <a
                  className="mt-1 inline-block min-h-10 py-2 font-semibold text-accent"
                  href={`/c/${published.slug}/p/${published.id}`}
                >
                  Open your post →
                </a>
              </div>
            ) : null}
          </section>
          <aside className="space-y-4 rounded-card border border-border bg-surface p-5">
            <h2 className="font-extrabold">Audience & permissions</h2>
            <label className="block text-sm font-semibold">
              Who can see it
              <select
                className={`${fieldClass} mt-2`}
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
              >
                <option value="public">Everyone who can read this community</option>
                <option value="members">Community members only</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Comments
              <select
                className={`${fieldClass} mt-2`}
                value={comments}
                onChange={(e) => setComments(e.target.value as typeof comments)}
              >
                <option value="members">Community members</option>
                <option value="followers">My followers</option>
                <option value="none">Closed</option>
              </select>
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={sharing}
                onChange={(e) => setSharing(e.target.checked)}
              />
              Allow reposts & in-chat sharing
            </label>
            <label className="block text-sm font-semibold">
              Content warning
              <input
                className={`${fieldClass} mt-2`}
                value={warning}
                onChange={(e) => setWarning(e.target.value)}
                maxLength={160}
                placeholder="Optional"
              />
            </label>
            <label className="block text-sm font-semibold">
              Publish later
              <input
                type="datetime-local"
                className={`${fieldClass} mt-2`}
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
            </label>
            <p className="text-xs leading-5 text-muted">
              Uploaded media is private storage. Every view checks the community and post
              permissions.
            </p>
          </aside>
        </div>
        <section className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3 rounded-card border border-border bg-surface p-5">
            <h2 className="text-lg font-extrabold">Story highlights</h2>
            <input
              className={fieldClass}
              aria-label="Highlight collection title"
              placeholder="Collection title"
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              maxLength={40}
            />
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {library.data?.media
                .filter((p) => p.type === "story")
                .map((p) => (
                  <label key={p.id} className="flex min-h-10 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={storyIds.includes(p.id)}
                      onChange={(e) =>
                        setStoryIds(
                          e.target.checked
                            ? [...storyIds, p.id]
                            : storyIds.filter((id) => id !== p.id),
                        )
                      }
                    />
                    {p.title}
                  </label>
                ))}
            </div>
            <GradientButton
              disabled={busy || !collection.trim() || !storyIds.length}
              onClick={() =>
                void run(
                  () => saveProfileHighlight({ data: { title: collection, postIds: storyIds } }),
                  "Highlight saved",
                )
              }
            >
              Save highlight
            </GradientButton>
            {library.data?.highlights.map((h) => (
              <div
                className="flex items-center justify-between rounded-tile bg-surface-alt p-3"
                key={h.id}
              >
                <span>
                  {h.title} · {h.postIds.length} stories
                </span>
                <button
                  className="min-h-9 text-danger"
                  onClick={() =>
                    void run(
                      () => removeProfileContent({ data: { kind: "highlight", id: h.id } }),
                      "Highlight removed",
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-3 rounded-card border border-border bg-surface p-5">
            <h2 className="text-lg font-extrabold">Your portfolio</h2>
            <input
              className={fieldClass}
              aria-label="Portfolio title"
              placeholder="Project title"
              value={workTitle}
              onChange={(e) => setWorkTitle(e.target.value)}
            />
            <textarea
              className={fieldClass}
              aria-label="Portfolio description"
              placeholder="Tell people what you made"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              className={fieldClass}
              aria-label="Portfolio link"
              placeholder="https://your-work.example"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <GradientButton
              disabled={busy || workTitle.trim().length < 3}
              onClick={() =>
                void run(
                  () =>
                    savePortfolioItem({
                      data: { title: workTitle, description, url: url || undefined },
                    }),
                  "Portfolio item saved",
                )
              }
            >
              Add project
            </GradientButton>
            {library.data?.portfolio.map((p) => (
              <div
                className="flex items-center justify-between gap-2 rounded-tile bg-surface-alt p-3"
                key={p.id}
              >
                <span className="font-semibold">{p.title}</span>
                <button
                  className="min-h-9 text-danger"
                  onClick={() =>
                    void run(
                      () => removeProfileContent({ data: { kind: "portfolio", id: p.id } }),
                      "Project removed",
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
