import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bookmark,
  ChevronDown,
  Clock,
  Ellipsis,
  EyeOff,
  Flag,
  Flame,
  Hourglass,
  Link2,
  Lock,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Pin,
  Repeat2,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  UserRound,
  Users,
  Eye,
  Megaphone,
  Heart,
  ExternalLink,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { FormattedBody } from "@/components/formatted-body";
import {
  Avatar,
  CommentBar,
  CommentRow,
  EmptyHint,
  GradientButton,
  HashtagChips,
  IconButton,
  JoinButton,
  OutlineButton,
  Pill,
  VerifiedTick,
  compactNumber,
  timeAgo,
  useShellData,
} from "@/components/k";
import { useCommunityActions } from "@/components/community/community-context";
import { ReportDialog, type ReportTarget } from "@/components/community/community-dialogs";
import { cleanTag, isModRole, personFromChip, postPictures, splitLead, tagLabel } from "@/components/community/helpers";
import { PostCarousel } from "@/components/community/post-carousel";
import { PollView, QuizCard, WikiTools } from "@/components/community/post-extras";
import { shareLink } from "@/components/community/share";
import { ActionMenu, Sheet, SheetField, fieldClass, type MenuItem } from "@/components/community/sheet";
import { usePostActions } from "@/components/community/use-post-actions";
import { StoryViewer } from "@/components/story-viewer";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { HELD_MESSAGE, HELD_TITLE } from "@/lib/kamino/held";
import {
  addComment,
  deletePost,
  editPost,
  featurePost,
  getPostPage,
  repost,
  setPostFlags,
  toggleCommentLike,
  toggleFollowProfile,
} from "@/lib/kamino/server";
import { deleteComment, listComments, profileOverview } from "@/lib/kamino/social";
import { STICKER_PACKS } from "@/lib/kamino/stickers";
import { cn } from "@/lib/utils";
import { PostContentTools } from "@/components/content/post-tools";
import { chooseBestAnswer, postContentTools, replyToComment } from "@/lib/kamino/content-v9";

export const Route = createFileRoute("/c/$slug/p/$postId")({ component: PostPage });

type Sort = "newest" | "top" | "oldest";
const SORT_LABEL: Record<Sort, string> = { newest: "Newest", top: "Top", oldest: "Oldest" };
const QUICK_EMOJI = ["💜", "😍", "🔥", "✨", "😂", "🥹", "👏", "🌸", "🎉", "👍"];
type ListedComment = Awaited<ReturnType<typeof listComments>>[number];

/**
 * A post (mockup 06-post), the same as the phone app: author row with Follow, title, a short lead, the picture
 * carousel with thumbnails, the rest of the text, hashtags, like / comment / share / save, then comments
 * (Newest / Top / Oldest) and a comment bar fixed at the bottom.
 * Polls, quizzes, wiki tools, stories, reposts, content warnings, location and the scheduled badge work as before;
 * edit, delete, report and the moderator tools are in the ⋯ menu.
 */
function PostPage() {
  const { slug, postId } = Route.useParams();
  const id = Number(postId);
  const { user } = useCurrentUserState();
  const shell = useShellData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const community = useCommunityActions();
  const commentsRef = useRef<HTMLElement>(null);
  const inputWrap = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["post", slug, id],
    queryFn: () => getPostPage({ data: { slug, postId: id } }),
  });
  const post = q.data?.post;
  const author = useQuery({
    queryKey: ["profileOverview", post?.author.handle],
    queryFn: () => profileOverview({ data: { handle: post!.author.handle } }),
    enabled: !!post,
  });
  const [sort, setSort] = useState<Sort>("newest");
  const comments = useQuery({
    queryKey: ["comments", id, sort],
    queryFn: () => listComments({ data: { postId: id, sort } }),
    enabled: Number.isFinite(id),
  });
  const actions = usePostActions(post ?? { id, liked: false, likeCount: 0, saved: false });

  const [comment, setComment] = useState("");
  const [replyTarget, setReplyTarget] = useState<ListedComment | null>(null);
  const content = useQuery({ queryKey: ["postContent", id], queryFn: () => postContentTools({ data: { postId: id } }), enabled: !!post });
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentMenu, setCommentMenu] = useState<ListedComment | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [following, setFollowing] = useState<boolean | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteNote, setQuoteNote] = useState("");
  const [followBusy, setFollowBusy] = useState(false);

  const headerActions = (
    <>
      <Link
        to="/explore"
        hash="search"
        aria-label="Search"
        className="k-focus grid size-11 place-items-center rounded-full text-ink hover:bg-surface-alt"
      >
        <Search className="size-6" strokeWidth={2.2} aria-hidden />
      </Link>
      <IconButton label="Post options" onClick={() => setMenuOpen(true)} disabled={!post}>
        <Ellipsis className="size-7" strokeWidth={2.4} aria-hidden />
      </IconButton>
    </>
  );

  if (q.error || (!q.isPending && !q.data)) {
    return (
      <AppShell back={`/c/${slug}`} hideNav headerActions={headerActions}>
        <div className="px-4 pt-6">
          <EmptyHint
            icon="🔒"
            title="This post isn't available"
            text={q.error instanceof Error ? q.error.message : "It may have been removed."}
            action={
              <GradientButton size="sm" to={`/c/${slug}`}>
                Open the community
              </GradientButton>
            }
          />
        </div>
      </AppShell>
    );
  }
  if (!q.data || !post) {
    return (
      <AppShell back={`/c/${slug}`} hideNav headerActions={headerActions}>
        <div className="mx-auto max-w-[760px] space-y-3 px-4 pt-3" aria-busy="true" aria-label="Opening post">
          <div className="flex items-center gap-3">
            <span className="size-12 animate-pulse rounded-full bg-surface-alt" />
            <span className="h-10 flex-1 animate-pulse rounded-tile bg-surface-alt" />
          </div>
          <div className="h-8 w-2/3 animate-pulse rounded-tile bg-surface-alt" />
          <div className="aspect-[2.2] animate-pulse rounded-[18px] bg-surface-alt" />
        </div>
      </AppShell>
    );
  }

  const page = q.data;
  const member = page.member;
  const isMember = member?.status === "active";
  const isModerator = isMember && isModRole(member?.role);
  const isLeader = isMember && ["agent", "leader"].includes(member!.role);
  const isAuthor = !!user && post.author.userId === user.id;
  const formatted = post.payload.format === "markdown";
  const showBody = !post.contentWarning || revealed;
  const pictures = post.type === "story" ? [] : postPictures(post);
  const { lead, rest } = pictures.length && !formatted ? splitLead(post.body) : { lead: "", rest: post.body };
  const isFollowing = following ?? author.data?.following ?? false;
  const creator = author.data?.profile.creator;
  const list: ListedComment[] =
    comments.data ??
    page.comments.map((c) => ({ ...c, authorVerified: false, mine: c.author.userId === user?.id }));
  const commentCount = Math.max(post.commentCount, list.length);
  const canComment = !!user && isMember && !post.commentsDisabled;
  const me = shell.profile
    ? { name: shell.profile.displayName, hue: shell.profile.avatarHue, userId: shell.profile.userId, avatarV: shell.profile.avatarVersion }
    : null;
  const base = `/c/${slug}`;

  const refreshPost = () => queryClient.invalidateQueries({ queryKey: ["post", slug, id] });
  async function run(action: () => Promise<unknown>, done?: string) {
    try {
      await action();
      await refreshPost();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  async function send() {
    const body = comment.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = replyTarget ? await replyToComment({ data: { postId: id, parentId: replyTarget.id, body } }) : await addComment({ data: { postId: id, body } });
      if (res.held) toast.info(HELD_TITLE, { description: HELD_MESSAGE });
      setComment("");
      setReplyTarget(null);
      setEmojiOpen(false);
      await Promise.all([refreshPost(), queryClient.invalidateQueries({ queryKey: ["comments", id] }), queryClient.invalidateQueries({ queryKey: ["postContent", id] })]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post your comment");
    } finally {
      setSending(false);
    }
  }

  async function follow() {
    if (!user) return void navigate({ to: "/login" });
    setFollowBusy(true);
    try {
      const res = await toggleFollowProfile({ data: post!.author.userId });
      setFollowing(res.following);
      if (res.requested)
        toast.success("Request sent", {
          description: "This account is private. You'll see their posts once they accept.",
        });
      void queryClient.invalidateQueries({ queryKey: ["profileOverview", post!.author.handle] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setFollowBusy(false);
    }
  }

  // Comment likes change at once and roll back if the server says no.
  function patchComment(commentId: number) {
    queryClient.setQueriesData<ListedComment[]>({ queryKey: ["comments", id] }, (rows) =>
      rows?.map((c) =>
        c.id === commentId
          ? { ...c, liked: !c.liked, likeCount: Math.max(0, c.likeCount + (c.liked ? -1 : 1)) }
          : c,
      ),
    );
  }
  async function likeComment(c: ListedComment) {
    if (!user) return void navigate({ to: "/login" });
    patchComment(c.id);
    try {
      await toggleCommentLike({ data: c.id });
    } catch (e) {
      patchComment(c.id);
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  /** Authors can delete their own comments; community moderators can delete anyone's. */
  async function removeComment(c: ListedComment) {
    if (!confirm("Delete this comment? This can't be undone.")) return;
    try {
      await deleteComment({ data: { commentId: c.id } });
      queryClient.setQueriesData<ListedComment[]>({ queryKey: ["comments", id] }, (rows) => rows?.filter((x) => x.id !== c.id));
      await refreshPost();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the comment");
    }
  }

  async function remove() {
    if (!confirm("Delete this post? This can't be undone.")) return;
    try {
      await deletePost({ data: { slug, postId: id } });
      await queryClient.invalidateQueries({ queryKey: ["communityOverview", slug] });
      await community.refresh();
      void navigate({ to: "/c/$slug", params: { slug } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the post");
    }
  }

  const menu: MenuItem[] = [
    { key: "share", label: "Share", icon: <Share2 />, tone: "blue", onSelect: () => void shareLink(post.title, `${base}/p/${id}`) },
    { key: "save", label: actions.saved ? "Remove from saved" : "Save", icon: <Bookmark />, tone: "orange", onSelect: () => void actions.save() },
    ...(isMember && content.data?.sharingAllowed !== false ? [{key:"quote",label:"Quote repost",icon:<Repeat2/>,tone:"green" as const,onSelect:()=>setQuoteOpen(true)}] : []),
    ...(isMember && !isAuthor
      ? [{
          key: "repost",
          label: "Repost",
          icon: <Repeat2 />,
          tone: "green" as const,
          hint: "Share it with your followers here",
          onSelect: () =>
            void repost({ data: { slug, postId: id } })
              .then((r) => {
                toast.success("Reposted", { description: "Shared with your followers in this community." });
                void navigate({ to: "/c/$slug/p/$postId", params: { slug, postId: String(r.id) } });
              })
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not repost")),
        }]
      : []),
    ...(isAuthor && post.type !== "poll" && post.type !== "quiz"
      ? [{
          key: "edit",
          label: "Edit",
          icon: <Pencil />,
          onSelect: () => {
            setEditTitle(post.title);
            setEditBody(post.body);
            setEditing(true);
          },
        }]
      : []),
    ...(isAuthor && page.community.modules.includes("events")
      ? [{ key: "challenge", label: "Enter a challenge", icon: <Trophy />, tone: "orange" as const, hint: "Pick this post on the Events page", to: `${base}/events` }]
      : []),
    ...(isAuthor || isModerator
      ? [{
          key: "comments",
          label: post.commentsDisabled ? "Open comments" : "Close comments",
          icon: <MessagesSquare />,
          tone: "violet" as const,
          onSelect: () => void run(() => setPostFlags({ data: { slug, postId: id, commentsDisabled: !post.commentsDisabled } })),
        }]
      : []),
    ...(isModerator
      ? [
          { key: "pin", label: post.pinned ? "Unpin" : "Pin to top", icon: <Pin />, tone: "pink" as const, onSelect: () => void run(() => setPostFlags({ data: { slug, postId: id, pinned: !post.pinned } })) },
          { key: "feature", label: post.featured ? "Unfeature" : "Feature", icon: <Sparkles />, tone: "orange" as const, onSelect: () => void run(() => featurePost({ data: { postId: id, slug } })) },
          { key: "hide", label: post.hidden ? "Unhide" : "Hide", icon: post.hidden ? <Eye /> : <EyeOff />, tone: "blue" as const, onSelect: () => void run(() => setPostFlags({ data: { slug, postId: id, hidden: !post.hidden } })) },
        ]
      : []),
    ...(isLeader
      ? [{ key: "announce", label: post.announcement ? "Unannounce" : "Make announcement", icon: <Megaphone />, tone: "blue" as const, onSelect: () => void run(() => setPostFlags({ data: { slug, postId: id, announcement: !post.announcement } })) }]
      : []),
    { key: "community", label: `Open ${page.community.name}`, icon: <Users />, tone: "violet", to: base },
    ...(user && !isAuthor
      ? [{ key: "report", label: "Report", icon: <Flag />, destructive: true, onSelect: () => setReport({ targetType: "post", targetId: String(id), communityId: slug, label: "post" }) }]
      : []),
    ...(isAuthor || isModerator
      ? [{ key: "delete", label: "Delete", icon: <Trash2 />, destructive: true, onSelect: () => void remove() }]
      : []),
  ];

  const commentMenuItems: MenuItem[] = commentMenu
    ? [
        ...(canComment ? [{ key: "reply", label: `Reply to ${commentMenu.author.nickname}`, icon: <MessageCircle />, onSelect: () => { setReplyTarget(commentMenu); inputWrap.current?.querySelector("textarea, input")?.dispatchEvent(new Event("focus")); } }] : []),
        ...(post.type === "question" && content.data?.canChooseAnswer ? [{ key: "best", label: content.data.bestAnswerId === commentMenu.id ? "Unmark best answer" : "Mark best answer", icon: <Trophy />, onSelect: () => void run(async () => { await chooseBestAnswer({ data: { postId: id, commentId: content.data?.bestAnswerId === commentMenu.id ? null : commentMenu.id } }); await queryClient.invalidateQueries({ queryKey: ["postContent", id] }); }, "Best answer updated") }] : []),
        { key: "profile", label: `View ${commentMenu.author.nickname}'s profile`, icon: <UserRound />, to: `/u/${commentMenu.author.handle}` },
        ...(user && !commentMenu.mine
          ? [{
              key: "report",
              label: "Report comment",
              icon: <Flag />,
              destructive: true,
              onSelect: () => setReport({ targetType: "comment", targetId: `${id}/${commentMenu.id}`, communityId: slug, label: "comment" }),
            }]
          : []),
        ...(user && (commentMenu.mine || isModerator)
          ? [{ key: "delete", label: "Delete comment", icon: <Trash2 />, destructive: true, onSelect: () => void removeComment(commentMenu) }]
          : []),
      ]
    : [];

  const statusPills =
    post.scheduled || post.hidden || post.pinned || post.featured || post.announcement || post.visibility === "members" || post.originalPostId || post.type === "story";

  return (
    <AppShell back={`/c/${slug}`} hideNav headerActions={headerActions} className="pb-[calc(96px+env(safe-area-inset-bottom))]">
      <article className="mx-auto max-w-[760px] space-y-2.5 px-4 pt-1 lg:space-y-4 lg:pt-4" aria-label={post.title}>
        {/* Author: avatar, name + tick, community chip, Creator chip, time, Follow. */}
        <div className="flex items-center gap-2.5 lg:gap-3.5">
          <Link to="/u/$handle" params={{ handle: post.author.handle }} aria-label={`${post.author.nickname}'s profile`} className="k-focus shrink-0 rounded-full">
            <Avatar person={personFromChip(post.author)} size={48} className="lg:hidden" />
            <Avatar person={personFromChip(post.author)} size={60} className="hidden lg:inline-grid" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <Link
                to="/u/$handle"
                params={{ handle: post.author.handle }}
                className="k-focus truncate text-[16.5px] leading-[21px] font-extrabold text-ink hover:underline lg:text-[20px] lg:leading-7"
              >
                {post.author.nickname}
              </Link>
              {post.authorVerified ? <VerifiedTick size={16} className="lg:size-[18px]" /> : null}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Link to="/c/$slug" params={{ slug }} className="k-focus rounded-full">
                <Pill tone="violet" solid icon={<span aria-hidden>⭐</span>} className="h-[21px] px-2 text-[11.5px] lg:h-6 lg:text-[12.5px]">
                  {page.community.name}
                </Pill>
              </Link>
              {creator ? (
                <Pill tone="violet" icon={<span aria-hidden>👑</span>} className="h-[21px] px-2 text-[11.5px] lg:h-6 lg:text-[12.5px]">
                  Creator
                </Pill>
              ) : null}
              <span className="text-[12px] text-muted lg:text-[13.5px]" suppressHydrationWarning>
                · {post.scheduled ? "scheduled" : timeAgo(post.createdAt)}
                {post.editedAt ? " · edited" : ""}
              </span>
            </div>
          </div>
          {isAuthor ? null : isFollowing ? (
            <JoinButton
              joined
              tone="violet"
              size="sm"
              joinedLabel="Following"
              busy={followBusy}
              onClick={() => void follow()}
              name={post.author.nickname}
              className="h-[30px] lg:h-10 lg:px-5 lg:text-[15px]"
            />
          ) : (
            <GradientButton
              size="sm"
              disabled={followBusy}
              onClick={() => void follow()}
              aria-label={`Follow ${post.author.nickname}`}
              className="h-[30px] min-w-[76px] lg:h-10 lg:min-w-[110px] lg:text-[15px]"
            >
              Follow
            </GradientButton>
          )}
        </div>

        {statusPills ? (
          <div className="flex flex-wrap gap-1.5">
            {post.scheduled && post.publishAt ? (
              <Pill tone="orange" icon={<Clock className="size-3" aria-hidden />}>
                <span suppressHydrationWarning>
                  Scheduled ·{" "}
                  {new Date(post.publishAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </Pill>
            ) : null}
            {post.hidden ? <Pill tone="pink" icon={<EyeOff className="size-3" aria-hidden />}>Hidden from members</Pill> : null}
            {post.pinned ? <Pill tone="pink" solid icon={<Star className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />}>Pinned</Pill> : null}
            {post.featured ? <Pill tone="orange" icon={<span aria-hidden>⭐</span>}>Featured</Pill> : null}
            {post.announcement ? <Pill tone="blue" icon={<span aria-hidden>📣</span>}>Announcement</Pill> : null}
            {post.visibility === "members" ? <Pill tone="neutral" icon={<Lock className="size-3" aria-hidden />}>Members only</Pill> : null}
            {post.type === "story" ? <Pill tone="pink" icon={<Hourglass className="size-3" aria-hidden />}>Story · 24h</Pill> : null}
            {post.originalPostId ? (
              <Link to="/c/$slug/p/$postId" params={{ slug, postId: String(post.originalPostId) }} className="k-focus rounded-full">
                <Pill tone="green" icon={<Repeat2 className="size-3" aria-hidden />}>Repost · see original</Pill>
              </Link>
            ) : null}
          </div>
        ) : null}

        <h1 className="text-[24px] leading-[30px] font-extrabold tracking-[-0.5px] break-words text-ink lg:text-[34px] lg:leading-[42px]">
          {post.title}
        </h1>

        {post.type === "wiki" ? (
          <WikiTools
            post={post}
            community={page.community}
            member={member}
            isAuthor={isAuthor}
            pinned={page.wikiPinned}
            signedIn={!!user}
            onChanged={refreshPost}
          />
        ) : null}

        {!showBody ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="k-focus flex w-full items-center gap-3 rounded-tile bg-tint-violet p-4 text-left"
          >
            <EyeOff className="size-6 shrink-0 text-violet-ink" aria-hidden />
            <span>
              <span className="block text-[14px] font-bold text-violet-ink">Content warning: {post.contentWarning}</span>
              <span className="block text-[12.5px] text-muted">Tap to show</span>
            </span>
          </button>
        ) : editing ? (
          <form
            className="k-card space-y-3 rounded-card p-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const res = await editPost({ data: { slug, postId: id, title: editTitle, body: editBody } });
                if ((res as { held?: boolean } | undefined)?.held) toast.info(HELD_TITLE, { description: HELD_MESSAGE });
                setEditing(false);
              }, "Post updated");
            }}
          >
            <SheetField label="Title">
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={120} className={fieldClass} />
            </SheetField>
            <SheetField label="Text">
              <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={7} maxLength={8000} className={fieldClass} />
            </SheetField>
            <div className="flex items-center gap-2">
              <GradientButton type="submit" size="sm">
                Save
              </GradientButton>
              <OutlineButton size="sm" onClick={() => setEditing(false)}>
                Cancel
              </OutlineButton>
            </div>
          </form>
        ) : (
          <>
            {post.contentWarning ? (
              <p className="text-[12px] font-bold text-orange-ink">Content warning: {post.contentWarning}</p>
            ) : null}
            {lead ? (
              <p className="text-[13.5px] leading-5 whitespace-pre-wrap break-words text-body lg:text-[16px] lg:leading-[25px]">{lead}</p>
            ) : null}
            {post.type === "story" && post.cover ? (
              <StoryViewer scenes={postPictures(post)} captions={post.payload.captions} />
            ) : pictures.length ? (
              <PostCarousel images={pictures} title={post.title} className="-mx-1.5 lg:mx-0" />
            ) : null}
            {rest ? <FormattedBody body={rest} formatted={formatted} /> : null}
            {post.type === "link" && post.payload.url ? (
              <a
                href={post.payload.url}
                target="_blank"
                rel="noopener noreferrer"
                className="k-focus flex items-center gap-2.5 rounded-tile bg-tint-blue p-3 text-blue-ink"
              >
                <Link2 className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{post.payload.url}</span>
                <ExternalLink className="size-[18px] shrink-0" aria-hidden />
              </a>
            ) : null}
          </>
        )}

        {showBody && post.type === "poll" && page.poll ? (
          <PollView postId={id} poll={page.poll} canVote={!!user && isMember} onVoted={() => void refreshPost()} />
        ) : null}
        {showBody && post.type === "quiz" ? (
          <QuizCard
            postId={id}
            payload={post.payload}
            myQuiz={page.myQuiz}
            quizRun={page.quizRun}
            board={page.quizBoard}
            canPlay={!!user && isMember}
            onDone={() => void refreshPost()}
          />
        ) : null}

        {post.location ? (
          <Pill tone="blue" icon={<span aria-hidden>📍</span>} className="h-7 px-3 text-[13px]">
            {post.location}
          </Pill>
        ) : null}
        {post.hashtags.length ? (
          <HashtagChips
            tags={post.hashtags.map(tagLabel)}
            onTagClick={(t) => void navigate({ to: "/explore", search: { q: `#${cleanTag(t)}` } })}
          />
        ) : null}

        {showBody ? <PostContentTools postId={id} story={post.type === "story"} /> : null}
        {/* Like, comment, share … and Save on the right. */}
        <div className="flex items-center gap-5 border-b border-border pt-1 pb-3 lg:gap-7">
          <button
            type="button"
            onClick={() => void actions.like()}
            aria-pressed={actions.liked}
            aria-label={`${actions.liked ? "Unlike" : "Like"}, ${actions.likeCount} likes`}
            className="k-focus k-hit inline-flex items-center gap-1.5 rounded-full text-[15px] font-semibold text-body"
          >
            <Heart
              className={cn("size-[25px] transition-transform active:scale-90", actions.liked ? "text-pink" : "text-body")}
              fill={actions.liked ? "currentColor" : "none"}
              strokeWidth={actions.liked ? 0 : 2}
              aria-hidden
            />
            {compactNumber(actions.likeCount)}
          </button>
          <button
            type="button"
            onClick={() => commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            aria-label={`${commentCount} comments`}
            className="k-focus k-hit inline-flex items-center gap-1.5 rounded-full text-[15px] font-semibold text-body"
          >
            <MessageCircle className="size-[23px]" strokeWidth={2} aria-hidden />
            {compactNumber(commentCount)}
          </button>
          <button
            type="button"
            onClick={() => void shareLink(post.title, `${base}/p/${id}`)}
            className="k-focus k-hit inline-flex items-center gap-1.5 rounded-full text-[15px] font-semibold text-body"
          >
            <Share2 className="size-[22px]" strokeWidth={2} aria-hidden />
            Share
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void actions.save()}
            aria-pressed={actions.saved}
            aria-label={actions.saved ? "Remove from saved" : "Save"}
            className={cn(
              "k-focus k-hit inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[14px] font-bold text-violet shadow-card transition-colors",
              actions.saved ? "bg-tint-violet" : "bg-surface hover:bg-surface-alt",
            )}
          >
            <Bookmark className="size-[18px]" fill={actions.saved ? "currentColor" : "none"} strokeWidth={2.2} aria-hidden />
            {actions.saved ? "Saved" : "Save"}
          </button>
        </div>

        {/* Comments */}
        <section ref={commentsRef} aria-label="Comments" className="scroll-mt-20 space-y-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[17px] leading-[22px] font-extrabold text-ink lg:text-[20px]">
              {post.type === "question" ? "Answers" : "Comments"}
            </h2>
            <span className="text-[13px] font-semibold text-muted">{compactNumber(commentCount)}</span>
            <span className="flex-1" />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                className="k-focus k-hit inline-flex min-h-8 items-center gap-1 rounded-full px-1.5 text-[13.5px] font-semibold text-body"
                aria-label={`Sort comments: ${SORT_LABEL[sort]}`}
              >
                {SORT_LABEL[sort]}
                <ChevronDown className="size-[15px]" strokeWidth={2.6} aria-hidden />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-[170px] rounded-card border border-border bg-surface p-1.5 shadow-lift"
                >
                  {(["newest", "top", "oldest"] as const).map((s) => (
                    <DropdownMenu.Item
                      key={s}
                      onSelect={() => setSort(s)}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[14.5px] font-semibold outline-none data-[highlighted]:bg-surface-alt",
                        s === sort ? "text-violet" : "text-ink",
                      )}
                    >
                      {s === "top" ? <Flame className="size-4" aria-hidden /> : s === "newest" ? <Clock className="size-4" aria-hidden /> : <Hourglass className="size-4" aria-hidden />}
                      {SORT_LABEL[s]}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
          {comments.isPending && !page.comments.length ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-14 animate-pulse rounded-tile bg-surface-alt" />
              <div className="h-14 animate-pulse rounded-tile bg-surface-alt" />
            </div>
          ) : list.length ? (
            <div className="divide-y divide-transparent">
              {list.map((c) => (
                <div key={c.id} className={content.data?.parents.find(p => p.id === c.id)?.parentId ? "ml-5 border-l-2 border-border pl-2" : ""}>
                {content.data?.bestAnswerId === c.id ? <Pill tone="green" icon={<Trophy className="size-3" />}>Accepted answer</Pill> : null}
                {content.data?.parents.find(p => p.id === c.id)?.parentId ? <p className="px-2 text-xs text-muted">↳ Reply to {list.find(p => p.id === content.data?.parents.find(p => p.id === c.id)?.parentId)?.author.nickname ?? "a comment"}</p> : null}
                <CommentRow
                  key={c.id}
                  author={personFromChip(c.author)}
                  name={c.author.nickname}
                  to={`/u/${c.author.handle}`}
                  time={timeAgo(c.createdAt)}
                  text={<span className="whitespace-pre-wrap break-words">{c.body}</span>}
                  likes={c.likeCount}
                  liked={c.liked}
                  onLike={() => void likeComment(c)}
                  onMore={() => setCommentMenu(c)}
                />
                {canComment ? <button className="k-focus ml-12 min-h-8 rounded-full px-2 text-xs font-semibold text-accent" onClick={() => setReplyTarget(c)}>Reply</button> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyHint
              icon="💬"
              title="No comments yet"
              text={canComment ? "Say something nice to start the conversation." : undefined}
              className="py-6"
            />
          )}
        </section>
      </article>

      {/* The comment bar stays at the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div ref={inputWrap} className="mx-auto max-w-[760px]">
          {replyTarget ? <div className="flex items-center justify-between px-4 pt-2 text-sm text-muted"><span>Replying to {replyTarget.author.nickname}</span><button className="k-focus min-h-9 rounded-full px-3 font-bold text-accent" onClick={() => setReplyTarget(null)}>Cancel</button></div> : null}
          {emojiOpen ? (
            <div className="k-row gap-1 px-3 pt-1.5" role="group" aria-label="Quick emoji">
              {QUICK_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setComment((t) => `${t}${e}`)}
                  aria-label={`Add ${e}`}
                  className="k-focus grid size-11 shrink-0 place-items-center rounded-full text-[24px] hover:bg-surface-alt"
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}
          {canComment ? (
            <CommentBar
              me={me}
              value={comment}
              onChange={setComment}
              onSubmit={() => void send()}
              onPickImage={() => setStickersOpen(true)}
              onEmoji={() => setEmojiOpen((o) => !o)}
              sending={sending}
              placeholder={post.type === "question" ? "Write an answer…" : "Add a comment…"}
              className="px-4 py-2.5"
            />
          ) : (
            <div className="flex items-center gap-2.5 px-4 py-2.5">
              {me ? <Avatar person={me} size={30} /> : null}
              <p className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-surface-alt px-3.5 text-[14px] text-subtle">
                {post.commentsDisabled
                  ? "Comments are closed"
                  : !user
                    ? "Sign in to comment"
                    : "Join the community to comment"}
              </p>
              {!user ? (
                <GradientButton size="sm" to="/login">
                  Sign in
                </GradientButton>
              ) : !isMember && !post.commentsDisabled ? (
                <GradientButton size="sm" onClick={community.openJoin}>
                  Join
                </GradientButton>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <ActionMenu open={menuOpen} onOpenChange={setMenuOpen} title="Post options" items={menu} />
      <Sheet open={quoteOpen} onOpenChange={setQuoteOpen} title="Quote this post">
        <div className="space-y-4"><p className="text-sm text-muted">Add your thoughts and share the original with your community.</p><textarea className={fieldClass} value={quoteNote} onChange={e=>setQuoteNote(e.target.value)} maxLength={400} aria-label="Quote repost text"/><GradientButton full disabled={!quoteNote.trim()} onClick={()=>void run(async()=>{const result=await repost({data:{slug,postId:id,note:quoteNote}});setQuoteOpen(false);void navigate({to:"/c/$slug/p/$postId",params:{slug,postId:String(result.id)}});})}>Publish quote repost</GradientButton></div>
      </Sheet>
      <ActionMenu
        open={!!commentMenu}
        onOpenChange={(o) => !o && setCommentMenu(null)}
        title="Comment"
        items={commentMenuItems}
      />
      <ReportDialog target={report} onClose={() => setReport(null)} />
      <Sheet open={stickersOpen} onOpenChange={setStickersOpen} title="Stickers" description="Comments are words, so a sticker goes in as its emoji.">
        {STICKER_PACKS.map((pack) => (
          <div key={pack.id} className="space-y-1.5">
            <p className="text-[13px] font-bold text-muted">{pack.label}</p>
            <div className="grid grid-cols-6 gap-1">
              {pack.stickers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={s.label}
                  onClick={() => {
                    setComment((t) => `${t}${s.emoji}`);
                    setStickersOpen(false);
                  }}
                  className="k-focus grid aspect-square place-items-center rounded-tile text-[28px] hover:bg-surface-alt"
                >
                  {s.emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Sheet>
    </AppShell>
  );
}
