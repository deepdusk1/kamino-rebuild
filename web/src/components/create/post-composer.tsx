import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  FileText,
  Globe,
  Hash,
  Lock,
  Send,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet, fieldClass } from "@/components/community/sheet";
import { GradientButton, OutlineButton } from "@/components/k";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { compactNumber } from "@/lib/format-ui";
import { resizeImage } from "@/lib/image-resize";
import { HELD_MESSAGE, HELD_TITLE } from "@/lib/kamino/held";
import { createPost, deleteDraft, listDrafts, saveDraft } from "@/lib/kamino/server";
import { suggestTags } from "@/lib/kamino/social";
import type { PostType } from "@/lib/kamino/types";
import type { CreatorDraft } from "@/lib/kamino/writing";
import { cn } from "@/lib/utils";
import { CommunityAvatar, CommunityList } from "./communities";
import { useMyCommunities } from "./my-communities";
import {
  MAX_POLL_OPTIONS,
  MAX_POST_MEDIA,
  MAX_POST_TEXT,
  addTag,
  draftToQuickPost,
  emptyQuickPost,
  formatWhen,
  isQuickDraft,
  localInputToIso,
  quickPostProblem,
  quickPostRequest,
  quickPostToDraft,
  schedulePresets,
  toggleTag,
  type QuickPost,
} from "./compose";
import {
  ActionButton,
  AddMediaTile,
  InlineInput,
  MediaThumb,
  OptionRow,
  OutcomeCard,
  PollEditor,
  Problem,
  RowTitle,
  TagChips,
  ToggleRow,
  type Outcome,
} from "./parts";
import { ChoicePill } from "./sheets";

/** Post types the quick composer doesn't do; they open the full editor of the chosen community. */
export const MORE_TYPES = [
  { type: "quiz", label: "Quiz", emoji: "🧠" },
  { type: "wiki", label: "Wiki page", emoji: "📚" },
  { type: "question", label: "Question", emoji: "❓" },
  { type: "story", label: "Story", emoji: "🎞️" },
] as const satisfies readonly { type: PostType; label: string; emoji: string }[];

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

/** The value of `text` once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * The "Create a Post" card (mockup 07-create), used on the Create screen and inside a community's "New post" panel.
 * It really posts: text, up to 10 pictures, a poll, a link, a place, tags, who can see it, and (under More Options)
 * a title, a content warning, comments on/off, scheduling and drafts. Same rules as the phone app.
 */
export function PostComposer({
  slug: initialSlug,
  lockSlug = false,
  showHeading = true,
  onPublished,
  onFullEditor,
  className,
}: {
  /** Community to post to (preselected; the person can change it unless `lockSlug`). */
  slug?: string | null;
  lockSlug?: boolean;
  showHeading?: boolean;
  /** After a post goes live now. Default: open it. */
  onPublished?: (postId: number, slug: string) => void;
  /** Opens the full editor (quizzes, wiki pages, questions, stories) for a community. */
  onFullEditor: (type: PostType, slug: string, draft?: CreatorDraft) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const { list: communities, query: meQuery } = useMyCommunities();

  const [post, setPost] = useState<QuickPost>(emptyQuickPost);
  const update = (patch: Partial<QuickPost>) => setPost((p) => ({ ...p, ...patch }));
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
  // A new `?slug=` (or a new community page) switches the community (React's "adjust state while rendering").
  const [seenSlug, setSeenSlug] = useState(initialSlug);
  if (initialSlug !== seenSlug) {
    setSeenSlug(initialSlug);
    if (initialSlug) setSlug(initialSlug);
  }
  // Without a choice yet, post to your biggest community.
  const community =
    communities.find((c) => c.slug === slug) ??
    (lockSlug ? null : ([...communities].sort((a, b) => b.memberCount - a.memberCount)[0] ?? null));
  const targetSlug = community?.slug ?? (lockSlug ? slug : null);

  const [locationOpen, setLocationOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [sheet, setSheet] = useState<null | "community" | "visibility" | "tag" | "drafts">(null);
  const [tagText, setTagText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<null | "publish" | "draft" | "photo">(null);
  const draftRef = useRef<{ id: string; slug: string; revision: number } | null>(null);

  // Tag ideas from what you wrote and the community's topics (asked again a moment after you stop typing).
  const words = useDebounced(`${post.title}\n${post.text}`.trim(), 600);
  const suggestions = useQuery({
    queryKey: ["suggestTags", words, targetSlug],
    queryFn: () => suggestTags({ data: { text: words, slug: targetSlug ?? "" } }),
    enabled: !!targetSlug,
    staleTime: 60_000,
  });
  const drafts = useQuery({
    queryKey: ["drafts", targetSlug, user?.id],
    queryFn: () => listDrafts({ data: targetSlug! }),
    enabled: !!targetSlug && !!user && sheet === "drafts",
  });

  const presets = schedulePresets();
  const visibilityLabel = post.visibility === "members" ? "Members" : "Public";
  const publishLabel = scheduleOn && post.publishAt ? "Schedule Post" : "Publish Post";
  const communityName = community?.name ?? "this community";

  const addPhotos = async (files: File[]) => {
    const room = MAX_POST_MEDIA - post.media.length;
    if (room <= 0) return setProblem(`A post can have up to ${MAX_POST_MEDIA} pictures.`);
    setBusy("photo");
    setProblem(null);
    try {
      const pictures: string[] = [];
      for (const file of files.slice(0, room))
        pictures.push(await resizeImage(file, { maxSide: 1600, maxChars: 1_800_000 }));
      setPost((p) => ({ ...p, media: [...p.media, ...pictures].slice(0, MAX_POST_MEDIA) }));
      if (files.length > room)
        setProblem(
          `A post can have up to ${MAX_POST_MEDIA} pictures, so the extra ones were left out.`,
        );
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setPost(emptyQuickPost());
    setLocationOpen(false);
    setScheduleOn(false);
    setCustomTime("");
    draftRef.current = null;
  };

  const publish = async () => {
    setOutcome(null);
    if (!targetSlug) return setProblem("Join a community first, then you can post there.");
    const scheduleProblem =
      scheduleOn && !post.publishAt ? "Pick when it should go live, or turn scheduling off." : null;
    const found = scheduleProblem ?? quickPostProblem(post);
    if (found) return setProblem(found);
    setProblem(null);
    setBusy("publish");
    try {
      const created = await createPost({
        data: {
          slug: targetSlug,
          ...quickPostRequest({ ...post, publishAt: scheduleOn ? post.publishAt : null }),
        },
      });
      // The draft has done its job. If deleting it fails the post is still published, so that error is ignored.
      if (draftRef.current)
        await deleteDraft({
          data: { id: draftRef.current.id, revision: draftRef.current.revision },
        }).catch(() => undefined);
      void queryClient.invalidateQueries();
      reset();
      const to = `/c/${targetSlug}/p/${created.id}`;
      if (created.held) setOutcome({ kind: "held", title: HELD_TITLE, text: HELD_MESSAGE });
      else if (created.scheduled)
        setOutcome({
          kind: "scheduled",
          title: "Scheduled ✨",
          text: `Your post goes live in ${communityName} on ${formatWhen(created.publishAt ?? "")}. Only you can see it until then.`,
          to,
        });
      else {
        setOutcome({
          kind: "posted",
          title: "Posted! 🎉",
          text: `Your post is live in ${communityName}.`,
          to,
        });
        if (onPublished) onPublished(created.id, targetSlug);
        else
          void navigate({
            to: "/c/$slug/p/$postId",
            params: { slug: targetSlug, postId: String(created.id) },
          });
      }
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const saveAsDraft = async () => {
    if (!targetSlug) return setProblem("Join a community first; drafts are kept per community.");
    if (!post.text.trim() && !post.title.trim())
      return setProblem("Write something first, then save it as a draft.");
    setProblem(null);
    setBusy("draft");
    try {
      const current =
        draftRef.current?.slug === targetSlug
          ? draftRef.current
          : { id: crypto.randomUUID(), slug: targetSlug, revision: 0 };
      const saved = await saveDraft({
        data: {
          id: current.id,
          slug: targetSlug,
          revision: current.revision,
          content: quickPostToDraft(post),
        },
      });
      draftRef.current = { id: saved.id, slug: targetSlug, revision: saved.revision };
      void queryClient.invalidateQueries({ queryKey: ["drafts", targetSlug] });
      setOutcome({
        kind: "draft",
        title: "Draft saved",
        text: `Find it under Drafts in ${communityName}.`,
      });
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const openDraft = (draft: CreatorDraft) => {
    setSheet(null);
    if (!isQuickDraft(draft.content)) {
      // Quizzes, wiki pages and stories open in the full editor.
      onFullEditor(draft.content.type, draft.slug, draft);
      return;
    }
    draftRef.current = { id: draft.id, slug: draft.slug, revision: draft.revision };
    setPost(draftToQuickPost(draft.content));
    setMoreOpen(!!(draft.content.title || draft.content.warning || draft.content.commentsOff));
    setOutcome(null);
  };

  const addTypedTag = () => {
    update({ tags: addTag(post.tags, tagText) });
    setTagText("");
    setSheet(null);
  };

  return (
    <div className={cn("space-y-3 lg:space-y-4", className)}>
      {showHeading ? (
        <div>
          <h2 className="text-[17px] leading-[22px] font-extrabold tracking-[-0.2px] text-ink lg:text-[22px] lg:leading-7">
            Create a Post
          </h2>
          <p className="text-[11.5px] leading-[15px] text-muted lg:text-[14.5px] lg:leading-5">
            Share updates, art, thoughts, or anything with your community.
          </p>
        </div>
      ) : null}

      <div className="rounded-[12px] border border-border bg-surface px-2.5 pt-1.5 pb-1.5 focus-within:ring-2 focus-within:ring-violet lg:px-4 lg:pt-3">
        <textarea
          value={post.text}
          onChange={(e) => update({ text: e.target.value })}
          placeholder={post.poll ? "Ask your poll question…" : "What's on your mind?"}
          aria-label="What's on your mind?"
          maxLength={MAX_POST_TEXT}
          rows={2}
          className="block max-h-[220px] min-h-11 w-full resize-y bg-transparent !shadow-none !ring-0 !outline-none py-1 text-[16px] leading-[19px] text-ink outline-none placeholder:text-[14px] placeholder:text-subtle lg:min-h-20 lg:text-[16px] lg:leading-6 lg:placeholder:text-[16px]"
        />
        <p
          className="text-right text-[11px] leading-[14px] text-muted lg:text-[13px]"
          aria-label={`${post.text.length} of ${MAX_POST_TEXT} characters`}
        >
          {`${post.text.length.toLocaleString("en-US")}/${MAX_POST_TEXT.toLocaleString("en-US")}`}
        </p>
      </div>

      {/* Pictures: the dashed add tile, then each chosen picture with a ✕. */}
      <div
        className="k-row -mx-0.5 gap-1.5 px-0.5 lg:grid lg:grid-cols-6 lg:gap-2.5"
        role="list"
        aria-label="Pictures"
      >
        {post.media.length < MAX_POST_MEDIA ? (
          <AddMediaTile
            label={
              post.media.length ? `Add more (${post.media.length}/${MAX_POST_MEDIA})` : "Add Photos"
            }
            busy={busy === "photo"}
            onFiles={(files) => void addPhotos(files)}
            className="aspect-[0.91] w-[calc((100%-18px)/4)] lg:w-auto"
          />
        ) : null}
        {post.media.map((src, i) => (
          <MediaThumb
            key={`${i}-${src.length}`}
            src={src}
            index={i}
            onRemove={() => update({ media: post.media.filter((_, j) => j !== i) })}
            className="aspect-[0.91] w-[calc((100%-18px)/4)] lg:w-auto"
          />
        ))}
      </div>

      <div className="flex gap-1.5 lg:gap-3">
        <ActionButton
          icon="poll"
          label="Add Poll"
          tone="violet"
          active={!!post.poll}
          onClick={() => update({ poll: post.poll ? null : ["", ""] })}
        />
        <ActionButton
          icon="location"
          label="Add Location"
          tone="blue"
          active={locationOpen || !!post.location}
          onClick={() => setLocationOpen((o) => !o)}
        />
        <ActionButton
          icon="link"
          label="Add Link"
          tone="pink"
          active={post.link !== null}
          onClick={() => update({ link: post.link === null ? "" : null })}
        />
      </div>

      {post.poll ? (
        <PollEditor
          options={post.poll}
          max={MAX_POLL_OPTIONS}
          onChange={(poll) => update({ poll })}
          onRemove={() => update({ poll: null })}
        />
      ) : null}
      {locationOpen ? (
        <InlineInput
          icon="location"
          tone="blue"
          label="Location"
          placeholder="Where are you? e.g. Kelowna, BC"
          value={post.location}
          onChange={(location) => update({ location })}
          onRemove={() => {
            update({ location: "" });
            setLocationOpen(false);
          }}
        />
      ) : null}
      {post.link !== null ? (
        <InlineInput
          icon="link"
          tone="pink"
          label="Link"
          placeholder="https://"
          type="url"
          value={post.link}
          onChange={(link) => update({ link })}
          onRemove={() => update({ link: null })}
        />
      ) : null}

      {/* ── Post to + visibility ── */}
      <RowTitle
        icon={<Users fill="currentColor" strokeWidth={1.6} />}
        title="Post to"
        right={
          <button
            type="button"
            onClick={() => setSheet("visibility")}
            aria-label={`Who can see it: ${visibilityLabel}. Change`}
            className="k-focus k-hit inline-flex min-h-8 items-center gap-1 rounded-full px-1 text-[13px] font-semibold text-violet lg:text-[15px]"
          >
            {post.visibility === "members" ? (
              <Lock className="size-4" aria-hidden />
            ) : (
              <Globe className="size-4" aria-hidden />
            )}
            {visibilityLabel}
            <ChevronDown className="size-3.5" strokeWidth={2.6} aria-hidden />
          </button>
        }
      />
      {community ? (
        lockSlug ? (
          <div className="flex items-center gap-2.5 rounded-[14px] border border-border bg-surface p-[7px] pr-3">
            <CommunityAvatar community={community} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-ink">
                {community.name}
              </span>
              <span className="block text-[12px] text-muted">
                {compactNumber(community.memberCount)} members
              </span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSheet("community")}
            aria-label={`Posting to ${community.name}. Change community`}
            className="k-focus flex w-full items-center gap-2.5 rounded-[14px] border border-border bg-surface p-[7px] pr-3 text-left transition-colors hover:bg-surface-alt lg:p-2.5"
          >
            <CommunityAvatar community={community} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-ink lg:text-[16px]">
                {community.name}
              </span>
              <span className="block text-[12px] text-muted lg:text-[13.5px]">
                {compactNumber(community.memberCount)} members
              </span>
            </span>
            <ChevronDown className="size-[18px] text-muted" aria-hidden />
          </button>
        )
      ) : (
        <Link
          to="/explore"
          className="k-focus flex items-center gap-2.5 rounded-[14px] border border-border bg-surface p-[7px] pr-3 hover:bg-surface-alt"
        >
          <span
            className="grid size-[38px] place-items-center rounded-full bg-tint-violet text-violet"
            aria-hidden
          >
            <Compass className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-ink">
              {meQuery.isPending ? "Loading your communities…" : "Join a community first"}
            </span>
            <span className="block text-[12px] text-muted">
              Posts live inside communities. Find one you like.
            </span>
          </span>
          <ChevronRight className="size-[18px] text-muted" aria-hidden />
        </Link>
      )}

      {/* ── Tags ── */}
      <RowTitle
        icon={<Hash strokeWidth={3} />}
        title="Tags"
        subtitle="Add tags to help more people find your post."
      />
      <TagChips
        chosen={post.tags}
        suggestions={(suggestions.data ?? []).slice(0, 5)}
        onToggle={(tag) => update({ tags: toggleTag(post.tags, tag) })}
        onAdd={() => setSheet("tag")}
      />

      {/* ── More Options ── */}
      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
        className="k-focus flex w-full items-center gap-3 rounded-[12px] bg-surface-alt px-2.5 py-2 text-left lg:px-4 lg:py-3"
      >
        <Settings className="size-[22px] shrink-0 text-ink" strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-[17px] font-bold text-ink lg:text-[15.5px]">
            More Options
          </span>
          <span className="block text-[10.5px] leading-[14px] text-muted lg:text-[13px]">
            Comments, sharing, and advanced settings
          </span>
        </span>
        {moreOpen ? (
          <ChevronDown className="size-[17px] text-muted" aria-hidden />
        ) : (
          <ChevronRight className="size-[17px] text-muted" aria-hidden />
        )}
      </button>

      {moreOpen ? (
        <div className="space-y-2.5 px-0.5">
          <label className="block space-y-1">
            <span className="block text-[13px] font-bold text-ink">Title (optional)</span>
            <input
              className={fieldClass}
              value={post.title}
              onChange={(e) => update({ title: e.target.value })}
              maxLength={120}
              placeholder="We'll use your first line if you leave this empty"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-[13px] font-bold text-ink">Content warning (optional)</span>
            <input
              className={fieldClass}
              value={post.warning}
              onChange={(e) => update({ warning: e.target.value })}
              maxLength={120}
              placeholder="e.g. spoilers"
            />
          </label>
          <ToggleRow
            label="Allow comments"
            value={!post.commentsOff}
            onChange={(on) => update({ commentsOff: !on })}
          />
          <ToggleRow
            label="Schedule for later"
            hint="Posts can be scheduled up to 60 days ahead."
            value={scheduleOn}
            onChange={(on) => {
              setScheduleOn(on);
              if (!on) {
                setCustomTime("");
                update({ publishAt: null });
              }
            }}
          />
          {scheduleOn ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <ChoicePill
                    key={p.key}
                    label={p.label}
                    on={!customTime && post.publishAt === p.iso}
                    onClick={() => {
                      setCustomTime("");
                      update({ publishAt: p.iso });
                    }}
                  />
                ))}
              </div>
              <input
                type="datetime-local"
                aria-label="Or pick a date and time"
                className={fieldClass}
                value={customTime}
                onChange={(e) => {
                  setCustomTime(e.target.value);
                  update({ publishAt: localInputToIso(e.target.value) });
                }}
              />
              {post.publishAt ? (
                <p className="text-[13px] font-semibold text-violet-ink">
                  Goes live {formatWhen(post.publishAt)}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-2">
            <OutlineButton
              size="sm"
              className="flex-1"
              disabled={busy === "draft"}
              onClick={() => void saveAsDraft()}
            >
              {busy === "draft" ? "Saving…" : "Save draft"}
            </OutlineButton>
            <OutlineButton
              size="sm"
              className="flex-1"
              onClick={() =>
                targetSlug
                  ? setSheet("drafts")
                  : setProblem("Join a community first; drafts are kept per community.")
              }
            >
              Drafts
            </OutlineButton>
          </div>
          <div className="space-y-1.5">
            <p className="text-[12px] font-semibold text-muted">More post types</p>
            <div className="flex flex-wrap gap-1.5">
              {MORE_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() =>
                    targetSlug
                      ? onFullEditor(t.type, targetSlug)
                      : setProblem("Join a community first.")
                  }
                  aria-label={`New ${t.label.toLowerCase()}`}
                  className="k-focus k-hit inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-alt px-3.5 text-[13.5px] font-semibold text-ink hover:brightness-[0.98]"
                >
                  <span aria-hidden>{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {problem ? <Problem>{problem}</Problem> : null}

      <GradientButton
        gradient="publish"
        full
        disabled={busy === "publish"}
        onClick={() => void publish()}
        icon={
          <Send
            className="size-[17px] lg:size-5"
            fill="currentColor"
            strokeWidth={1.6}
            aria-hidden
          />
        }
        className="h-[33px] text-[15px] lg:h-12 lg:text-[17px]"
      >
        {busy === "publish" ? "Publishing…" : publishLabel}
      </GradientButton>

      {outcome ? (
        <OutcomeCard
          outcome={outcome}
          onOpen={() => {
            if (outcome.to) void navigate({ to: outcome.to });
            else setOutcome(null);
          }}
        />
      ) : null}

      {/* ── Sheets ── */}
      <Sheet
        open={sheet === "community"}
        onOpenChange={(o) => setSheet(o ? "community" : null)}
        title="Post to"
      >
        <CommunityList
          communities={communities}
          value={community?.slug ?? null}
          onPick={(s) => {
            setSlug(s);
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet
        open={sheet === "visibility"}
        onOpenChange={(o) => setSheet(o ? "visibility" : null)}
        title="Who can see it?"
      >
        <div className="space-y-2">
          <OptionRow
            icon={<Globe />}
            title="Public"
            text="Anyone who can see the community."
            selected={post.visibility === "public"}
            onClick={() => {
              update({ visibility: "public" });
              setSheet(null);
            }}
          />
          <OptionRow
            icon={<Lock />}
            title="Members only"
            text={`Only members of ${communityName}.`}
            selected={post.visibility === "members"}
            onClick={() => {
              update({ visibility: "members" });
              setSheet(null);
            }}
          />
        </div>
      </Sheet>

      <Sheet
        open={sheet === "tag"}
        onOpenChange={(o) => setSheet(o ? "tag" : null)}
        title="Add a tag"
        description="Letters and numbers only. Up to 10 tags per post."
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            addTypedTag();
          }}
        >
          <input
            className={fieldClass}
            aria-label="New tag"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="#FanArt"
            autoCapitalize="none"
            maxLength={31}
            autoFocus
          />
          <GradientButton type="submit" full>
            Add tag
          </GradientButton>
        </form>
      </Sheet>

      <Sheet
        open={sheet === "drafts"}
        onOpenChange={(o) => setSheet(o ? "drafts" : null)}
        title="Your drafts"
      >
        {drafts.isPending ? (
          <p className="text-[14px] text-muted">Loading your drafts…</p>
        ) : drafts.isError ? (
          <Problem>{errorText(drafts.error)}</Problem>
        ) : drafts.data?.length ? (
          <div className="space-y-2">
            {drafts.data.map((d) => (
              <OptionRow
                key={d.id}
                icon={<FileText />}
                title={d.content.title || d.content.body.split("\n")[0] || "Untitled"}
                text={`${isQuickDraft(d.content) ? "" : "Opens in the full editor · "}saved ${new Date(d.updatedAt).toLocaleDateString()}`}
                onClick={() => openDraft(d)}
                right={<ChevronRight className="size-[17px] text-muted" aria-hidden />}
              />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-muted">{`No drafts in ${communityName} yet. Tap “Save draft” to keep one for later.`}</p>
        )}
      </Sheet>
    </div>
  );
}
