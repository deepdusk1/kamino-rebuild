import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from "react-native";
import { api } from "@/api/endpoints";
import type { ListedComment } from "@/api/models";
import { StickerPicker } from "@/components/chat/StickerPicker";
import { ActionMenu, type MenuItem } from "@/components/community/ActionMenu";
import { cleanTag, splitLead, tagLabel } from "@/components/community/helpers";
import { postPictures } from "@/components/community/media";
import { confirmAction, notify, shareLink } from "@/components/community/platform";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { FormattedBody } from "@/components/FormattedBody";
import {
  AppHeader, CommentBar, CommentRow, EmptyHint, GradientButton, HashtagChips, ImageCarousel, JoinButton, Pill, PersonAvatar, ThumbnailStrip, VerifiedTick,
  personFromChip, personFromProfile,
} from "@/components/k";
import { LikeButton } from "@/components/LikeButton";
import { PollView, QuizView } from "@/components/PollAndQuiz";
import { ReportSheet, type ReportTarget } from "@/components/ReportSheet";
import { StoryViewer } from "@/components/StoryViewer";
import { ErrorState, Field, Loading, PressableScale, SkeletonList, Txt, Sheet, Button } from "@/components/ui";
import { WikiTools } from "@/components/WikiTools";
import { showError, useAction } from "@/lib/errors";
import { compactNumber, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { HELD_MESSAGE, HELD_TITLE } from "@/lib/held";
import { STICKER_PACKS } from "@/lib/stickers";
import { usePostActions } from "@/lib/usePostActions";
import { font, radius, useTheme } from "@/theme";
import { PostContentTools } from "@/components/content/PostContentTools";
import { contentApi } from "@/lib/content-v9";
import * as Clipboard from "expo-clipboard";
import { assetUrl } from "@/api/client";

type Sort = "newest" | "top" | "oldest";
const SORT_LABEL: Record<Sort, string> = { newest: "Newest", top: "Top", oldest: "Oldest" };
const QUICK_EMOJI = ["💜", "😍", "🔥", "✨", "😂", "🥹", "👏", "🌸", "🎉", "👍"];

/** Tells the person (in the browser too) that what they posted is waiting for a moderator. */
function tellHeld(result: { held?: boolean } | null | undefined) {
  if (result?.held) notify(HELD_TITLE, HELD_MESSAGE);
}

/**
 * A post (mockup 06-post): author row with Follow, title, a short lead, the picture carousel with thumbnails, the
 * rest of the text, hashtags, like / comment / share / save, then comments (Newest / Top) and a sticky comment bar.
 * Polls, quizzes, wiki tools, stories, reposts, content warnings, location and scheduled badges work as before;
 * edit / delete / report / moderator actions are in the ⋯ menu.
 */
function PostScreen() {
  const theme = useTheme();
  const { slug, postId } = useLocalSearchParams<{ slug: string; postId: string }>();
  const id = Number(postId);
  const queryClient = useQueryClient();
  const scroller = useRef<ScrollView>(null);
  const q = useQuery({ queryKey: ["post", id], queryFn: () => api.post(slug!, id), enabled: !!slug && Number.isFinite(id) });
  const me = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });
  const post = q.data?.post;
  const myId = me.data?.profile?.userId;
  const isAuthor = !!post && post.author.userId === myId;

  const author = useQuery({
    queryKey: ["profileOverview", post?.author.handle],
    queryFn: () => api.profileOverview(post!.author.handle),
    enabled: !!post,
  });
  const [sort, setSort] = useState<Sort>("newest");
  const comments = useQuery({ queryKey: ["comments", id, sort], queryFn: () => api.listComments(id, sort), enabled: Number.isFinite(id) });

  const [picture, setPicture] = useState(0);
  const [comment, setComment] = useState("");
  const [replyTarget, setReplyTarget] = useState<ListedComment | null>(null);
  const content = useQuery({ queryKey: ["postContent", id], queryFn: () => contentApi.post(id), enabled: !!post });
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [commentMenu, setCommentMenu] = useState<ListedComment | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [following, setFollowing] = useState<boolean | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteNote, setQuoteNote] = useState("");

  const refreshPost = () => queryClient.invalidateQueries({ queryKey: ["post", id] });
  const [send, sending] = useAction(async () => {
    tellHeld(replyTarget ? await contentApi.reply(id, replyTarget.id, comment.trim()) : await api.comment(id, comment.trim()));
    setComment("");
    setReplyTarget(null);
    setEmojiOpen(false);
    haptic.success();
    await Promise.all([refreshPost(), queryClient.invalidateQueries({ queryKey: ["comments", id] }), queryClient.invalidateQueries({ queryKey: ["postContent", id] })]);
  });
  const [saveEdit, savingEdit] = useAction(async () => {
    tellHeld(await api.editPost({ slug: slug!, postId: id, title: editTitle, body: editBody }));
    setEditing(false);
    await refreshPost();
  });
  const [remove, removing] = useAction(async () => {
    if (!(await confirmAction("Delete this post?", "This can't be undone.", "Delete", true))) return;
    await api.deletePost(slug!, id);
    await queryClient.invalidateQueries();
    if (router.canGoBack()) router.back();
    else router.replace(`/community/${slug}`);
  });
  const [flag] = useAction(async (flags: Parameters<typeof api.setPostFlags>[0]) => {
    await api.setPostFlags(flags);
    await refreshPost();
  });
  const [feature] = useAction(async () => {
    await api.featurePost(slug!, id);
    await refreshPost();
  });
  const [repost] = useAction(async () => {
    await api.repost(slug!, id);
    notify("Reposted", "Shared to your followers in this community.");
  });
  const [follow, followBusy] = useAction(async () => {
    const result = await api.followProfile(post!.author.userId);
    setFollowing(result.following);
    if (result.requested) notify("Request sent", "This account is private. You'll see their posts once they accept.");
    else if (result.following) haptic.success();
    void queryClient.invalidateQueries({ queryKey: ["profileOverview", post!.author.handle] });
  });

  // Comment likes change at once and roll back if the server says no.
  const patchComment = (commentId: number, change: (c: ListedComment) => ListedComment) =>
    queryClient.setQueriesData<ListedComment[]>({ queryKey: ["comments", id] }, (list) => list?.map((c) => (c.id === commentId ? change(c) : c)));
  /** Authors can delete their own comments; community moderators can delete anyone's. */
  async function deleteComment(c: ListedComment) {
    if (!(await confirmAction("Delete this comment?", "This can't be undone.", "Delete", true))) return;
    try {
      await api.deleteComment(c.id);
      queryClient.setQueriesData<ListedComment[]>({ queryKey: ["comments", id] }, (list) => list?.filter((x) => x.id !== c.id));
      await refreshPost();
    } catch (error) {
      notify("Couldn't delete the comment", error instanceof Error ? error.message : "Please try again.");
    }
  }
  const toggle = (c: ListedComment): ListedComment => ({ ...c, liked: !c.liked, likeCount: Math.max(0, c.likeCount + (c.liked ? -1 : 1)) });
  async function likeComment(c: ListedComment) {
    patchComment(c.id, toggle);
    if (!c.liked) haptic.pop();
    try {
      await api.likeComment(c.id);
    } catch (error) {
      patchComment(c.id, toggle);
      showError(error);
    }
  }

  const actions = usePostActions(post ?? { id, liked: false, likeCount: 0, saved: false });

  if (q.isPending) return <Loading />;
  if (q.isError || !q.data || !post) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const page = q.data;
  const member = page.member;
  const isMember = member?.status === "active";
  const isModerator = isMember && ["leader", "agent", "curator"].includes(member!.role);
  const formatted = post.payload.format === "markdown";
  const showBody = !post.contentWarning || revealed;
  const pictures = post.type === "story" ? [] : postPictures(post);
  const { lead, rest } = pictures.length && !formatted ? splitLead(post.body) : { lead: "", rest: post.body };
  const isFollowing = following ?? author.data?.following ?? false;
  const creator = author.data?.profile.creator;
  const list = comments.data ?? page.comments.map((c) => ({ ...c, authorVerified: false, mine: c.author.userId === myId }));
  const commentCount = Math.max(post.commentCount, list.length);
  const viewer = me.data?.profile ? personFromProfile(me.data.profile) : undefined;
  const canComment = isMember && !post.commentsDisabled;

  const menu: MenuItem[] = [
    {key:"copy",label:"Copy link",icon:"link-outline",onPress:()=>void Clipboard.setStringAsync(assetUrl(`/c/${slug}/p/${id}`)).then(()=>notify("Link copied","The post link is on your clipboard.")).catch(showError)},
    ...(isMember && content.data?.sharingAllowed !== false ? [{key:"quote",label:"Quote repost",icon:"repeat" as const,tone:"green" as const,onPress:()=>setQuoteOpen(true)}] : []),
    { key: "share", label: "Share", icon: "share-outline", tone: "blue", onPress: () => void shareLink(post.title, `/c/${slug}/p/${id}`) },
    { key: "save", label: actions.saved ? "Remove from saved" : "Save", icon: actions.saved ? "bookmark" : "bookmark-outline", tone: "orange", onPress: () => void actions.toggleSave() },
    ...(isMember && !isAuthor ? [{ key: "repost", label: "Repost", icon: "repeat" as const, tone: "green" as const, hint: "Share it with your followers here", onPress: () => void repost() }] : []),
    ...(isAuthor && post.type !== "poll" && post.type !== "quiz"
      ? [{ key: "edit", label: "Edit", icon: "create-outline" as const, onPress: () => { setEditTitle(post.title); setEditBody(post.body); setEditing(true); } }]
      : []),
    ...(isModerator
      ? [
          { key: "pin", label: post.pinned ? "Unpin" : "Pin to top", icon: "pin-outline" as const, tone: "red" as const, onPress: () => void flag({ slug: slug!, postId: id, pinned: !post.pinned }) },
          { key: "feature", label: post.featured ? "Unfeature" : "Feature", icon: "star-outline" as const, tone: "yellow" as const, onPress: () => void feature() },
          { key: "hide", label: post.hidden ? "Unhide" : "Hide", icon: post.hidden ? ("eye-outline" as const) : ("eye-off-outline" as const), tone: "blue" as const, onPress: () => void flag({ slug: slug!, postId: id, hidden: !post.hidden }) },
          { key: "comments", label: post.commentsDisabled ? "Open comments" : "Close comments", icon: "chatbubbles-outline" as const, tone: "violet" as const, onPress: () => void flag({ slug: slug!, postId: id, commentsDisabled: !post.commentsDisabled }) },
        ]
      : []),
    { key: "community", label: `Open ${page.community.name}`, icon: "people-outline", tone: "violet", onPress: () => router.push(`/community/${slug}`) },
    ...(!isAuthor ? [{ key: "report", label: "Report", icon: "flag-outline" as const, destructive: true, onPress: () => setReport({ targetType: "post", targetId: String(id), communityId: slug, label: "post" }) }] : []),
    ...(isAuthor || isModerator ? [{ key: "delete", label: "Delete", icon: "trash-outline" as const, destructive: true, onPress: () => void remove() }] : []),
  ];

  const commentMenuItems: MenuItem[] = commentMenu
    ? [
        ...(canComment ? [{ key: "reply", label: `Reply to ${commentMenu.author.nickname}`, icon: "return-up-back" as const, onPress: () => setReplyTarget(commentMenu) }] : []),
        ...(post.type === "question" && content.data?.canChooseAnswer ? [{ key: "best", label: content.data.bestAnswerId === commentMenu.id ? "Unmark best answer" : "Mark best answer", icon: "trophy-outline" as const, onPress: () => void contentApi.best(id, content.data?.bestAnswerId === commentMenu.id ? null : commentMenu.id).then(() => queryClient.invalidateQueries({ queryKey: ["postContent", id] })).catch(showError) }] : []),
        { key: "profile", label: `View ${commentMenu.author.nickname}'s profile`, icon: "person-outline", onPress: () => router.push(`/profile/${commentMenu.author.handle}`) },
        ...(!commentMenu.mine
          ? [{ key: "report", label: "Report comment", icon: "flag-outline" as const, destructive: true, onPress: () => setReport({ targetType: "comment", targetId: `${id}/${commentMenu.id}`, communityId: slug, label: "comment" }) }]
          : []),
        ...(commentMenu.mine || isModerator
          ? [{ key: "delete", label: "Delete comment", icon: "trash-outline" as const, destructive: true, onPress: () => void deleteComment(commentMenu) }]
          : []),
      ]
    : [];

  const textStyle = { fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, color: theme.text };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scroller}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void Promise.all([q.refetch(), comments.refetch()])} tintColor={theme.accent} colors={[theme.accent]} />}
        >
          <AppHeader back onMore={() => setMenuOpen(true)} />

          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {/* Author: avatar, name + tick, community chip, Creator chip, time, Follow. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <PressableScale onPress={() => router.push(`/profile/${post.author.handle}`)} accessibilityLabel={`${post.author.nickname}'s profile`} scaleTo={0.92}>
                <PersonAvatar person={personFromChip(post.author)} size={48} />
              </PressableScale>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 16.5, lineHeight: 21, color: theme.ink, flexShrink: 1 }}>{post.author.nickname}</Txt>
                  {post.authorVerified ? <VerifiedTick size={16} /> : null}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <Pill label={page.community.name} emoji="⭐" tone="violet" variant="solid" onPress={() => router.push(`/community/${slug}`)} accessibilityLabel={`Open ${page.community.name}`} />
                  {creator ? <Pill label="Creator" emoji="👑" tone="violet" /> : null}
                  <Txt style={{ fontFamily: font.regular, fontSize: 12, color: theme.muted }}>· {post.scheduled ? "scheduled" : timeAgo(post.createdAt)}{post.editedAt ? " · edited" : ""}</Txt>
                </View>
              </View>
              {isAuthor ? null : isFollowing ? (
                <JoinButton joined color={theme.violet} joinedLabel="Following" size="md" busy={followBusy} onPress={() => void follow()} accessibilityLabel={`Unfollow ${post.author.nickname}`} style={{ height: 30 }} />
              ) : (
                <GradientButton label="Follow" size="sm" busy={followBusy} onPress={() => void follow()} accessibilityLabel={`Follow ${post.author.nickname}`} style={{ height: 30, minWidth: 76 }} />
              )}
            </View>

            {post.scheduled || post.hidden || post.pinned || post.featured || post.announcement || post.visibility === "members" || post.originalPostId || post.type === "story" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {post.scheduled && post.publishAt ? <Pill label={`Scheduled · ${new Date(post.publishAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`} icon="time-outline" tone="orange" /> : null}
                {post.hidden ? <Pill label="Hidden from members" icon="eye-off-outline" tone="red" /> : null}
                {post.pinned ? <Pill label="Pinned" icon="star" tone="red" variant="solid" /> : null}
                {post.featured ? <Pill label="Featured" emoji="⭐" tone="orange" /> : null}
                {post.announcement ? <Pill label="Announcement" emoji="📣" tone="blue" /> : null}
                {post.visibility === "members" ? <Pill label="Members only" icon="lock-closed" tone="neutral" /> : null}
                {post.type === "story" ? <Pill label="Story · 24h" icon="time-outline" tone="pink" /> : null}
                {post.originalPostId ? (
                  <Pill label="Repost · see original" icon="repeat" tone="green" onPress={() => router.push(`/community/${slug}/post/${post.originalPostId}`)} />
                ) : null}
              </View>
            ) : null}

            <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.5, color: theme.ink }}>{post.title}</Txt>

            {post.type === "wiki" ? <WikiTools page={page} isAuthor={isAuthor} isModerator={isModerator} isMember={isMember} /> : null}

            {!showBody ? (
              <PressableScale onPress={() => setRevealed(true)} accessibilityLabel={`Content warning: ${post.contentWarning}. Show content`} scaleTo={0.98} style={{ backgroundColor: theme.tints.violet, borderRadius: radius.tile, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Ionicons name="eye-off-outline" size={24} color={theme.toneText.violet} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontFamily: font.bold, fontSize: 14, color: theme.toneText.violet }}>Content warning: {post.contentWarning}</Txt>
                  <Txt style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>Tap to show</Txt>
                </View>
              </PressableScale>
            ) : editing ? (
              <View style={{ gap: 10, backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, padding: 14 }}>
                <Field label="Title" value={editTitle} onChangeText={setEditTitle} maxLength={120} />
                <Field label="Text" value={editBody} onChangeText={setEditBody} multiline maxLength={8000} style={{ minHeight: 160 }} />
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <GradientButton label="Save" icon="checkmark" busy={savingEdit} onPress={() => void saveEdit()} />
                  <PressableScale onPress={() => setEditing(false)} accessibilityLabel="Cancel editing" hitSlop={6} style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: 8 }}>
                    <Txt style={{ fontFamily: font.bold, color: theme.muted }}>Cancel</Txt>
                  </PressableScale>
                </View>
              </View>
            ) : (
              <>
                {lead ? <Txt selectable style={textStyle}>{lead}</Txt> : null}
                {post.type === "story" && post.cover ? (
                  <StoryViewer
                    scenes={postPictures(post)}
                    captions={post.payload.captions}
                  />
                ) : pictures.length ? (
                  <View style={{ gap: 8, marginHorizontal: -6 }}>
                    <ImageCarousel images={pictures} index={picture} onIndexChange={setPicture} aspectRatio={2.2} hue={post.author.hue} />
                    {pictures.length > 1 ? <ThumbnailStrip images={pictures} index={picture} onSelect={setPicture} hue={post.author.hue} /> : null}
                  </View>
                ) : null}
                {rest ? <FormattedBody body={rest} formatted={formatted} size={13.5} /> : null}
                {post.type === "link" && post.payload.url ? (
                  <PressableScale onPress={() => void Linking.openURL(post.payload.url!)} accessibilityLabel={`Open link ${post.payload.url}`} scaleTo={0.98} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.tile, backgroundColor: theme.tints.blue }}>
                    <Ionicons name="link" size={20} color={theme.toneText.blue} />
                    <Txt numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold, fontSize: 13.5, color: theme.toneText.blue }}>{post.payload.url}</Txt>
                    <Ionicons name="open-outline" size={18} color={theme.toneText.blue} />
                  </PressableScale>
                ) : null}
              </>
            )}

            {post.type === "poll" && page.poll ? <PollView postId={id} poll={page.poll} canVote={isMember} /> : null}
            {post.type === "quiz" && post.payload.questions ? (
              <QuizView postId={id} questions={post.payload.questions} timeLimitSec={post.payload.timeLimitSec ?? 0} quizRun={page.quizRun} myQuiz={page.myQuiz} board={page.quizBoard} canPlay={isMember} />
            ) : null}

            {post.location ? <Pill label={post.location} emoji="📍" tone="blue" size="md" /> : null}
            {post.hashtags.length ? <HashtagChips tags={post.hashtags.map(tagLabel)} onPress={(t) => router.push({ pathname: "/explore", params: { q: `#${cleanTag(t)}` } })} /> : null}

            {/* Like, comment, share … and Save on the right. */}
            {showBody ? <PostContentTools postId={id} story={post.type === "story"} /> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 22, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 12 }}>
              <LikeButton liked={actions.liked} count={compactNumber(actions.likeCount)} onPress={() => void actions.toggleLike()} size={25} countSize={15} />
              <PressableScale onPress={() => scroller.current?.scrollToEnd({ animated: true })} accessibilityLabel={`${commentCount} comments`} hitSlop={10} scaleTo={0.88} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 }}>
                <Ionicons name="chatbubble-outline" size={22} color={theme.text} />
                <Txt style={{ fontFamily: font.semibold, fontSize: 15, color: theme.text }}>{compactNumber(commentCount)}</Txt>
              </PressableScale>
              <PressableScale onPress={() => void shareLink(post.title, `/c/${slug}/p/${id}`)} accessibilityLabel="Share" hitSlop={10} scaleTo={0.88} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 }}>
                <Ionicons name="arrow-redo-outline" size={22} color={theme.text} />
                <Txt style={{ fontFamily: font.semibold, fontSize: 15, color: theme.text }}>Share</Txt>
              </PressableScale>
              <View style={{ flex: 1 }} />
              <PressableScale
                onPress={() => void actions.toggleSave()}
                accessibilityLabel={actions.saved ? "Remove from saved" : "Save"}
                accessibilityState={{ selected: actions.saved }}
                hitSlop={6}
                scaleTo={0.94}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.border, backgroundColor: actions.saved ? theme.tint : theme.surface }}
              >
                <Ionicons name={actions.saved ? "bookmark" : "bookmark-outline"} size={18} color={theme.accent} />
                <Txt style={{ fontFamily: font.bold, fontSize: 14, color: theme.accent }}>{actions.saved ? "Saved" : "Save"}</Txt>
              </PressableScale>
            </View>

            {/* Comments */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 17, lineHeight: 22, color: theme.ink }}>Comments</Txt>
              <Txt style={{ fontFamily: font.semibold, fontSize: 13, color: theme.muted }}>{compactNumber(commentCount)}</Txt>
              <View style={{ flex: 1 }} />
              <PressableScale onPress={() => setSortOpen(true)} accessibilityLabel={`Sort comments: ${SORT_LABEL[sort]}`} hitSlop={10} scaleTo={0.94} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 }}>
                <Txt style={{ fontFamily: font.semibold, fontSize: 13.5, color: theme.text }}>{SORT_LABEL[sort]}</Txt>
                <Ionicons name="chevron-down" size={15} color={theme.text} />
              </PressableScale>
            </View>
            {comments.isPending && !page.comments.length ? (
              <SkeletonList count={2} />
            ) : list.length ? (
              <View style={{ gap: 4 }}>
                {list.map((c) => (
                  <View key={c.id} style={content.data?.parents.find(p => p.id === c.id)?.parentId ? {marginLeft:16,borderLeftWidth:2,borderLeftColor:theme.border,paddingLeft:6}:undefined}>
                  {content.data?.bestAnswerId === c.id ? <Pill label="Accepted answer" icon="trophy-outline" tone="green" /> : null}
                  {content.data?.parents.find(p => p.id === c.id)?.parentId ? <Txt variant="caption" tone="muted">↳ Reply to {list.find(p => p.id === content.data?.parents.find(p => p.id === c.id)?.parentId)?.author.nickname ?? "a comment"}</Txt> : null}
                  <CommentRow
                    key={c.id}
                    person={personFromChip(c.author)}
                    verified={c.authorVerified}
                    time={timeAgo(c.createdAt)}
                    text={c.body}
                    likes={c.likeCount}
                    liked={c.liked}
                    onLike={() => void likeComment(c)}
                    onMore={() => setCommentMenu(c)}
                    onPressAuthor={() => router.push(`/profile/${c.author.handle}`)}
                  />
                  {canComment ? <PressableScale onPress={() => setReplyTarget(c)} accessibilityLabel={`Reply to ${c.author.nickname}`} style={{minHeight:36,paddingLeft:48,justifyContent:"center"}}><Txt variant="caption" tone="accent">Reply</Txt></PressableScale> : null}
                  </View>
                ))}
              </View>
            ) : (
              <EmptyHint emoji="💬" title="No comments yet" text={canComment ? "Say something nice to start the conversation." : undefined} />
            )}
          </View>
        </ScrollView>

        {emojiOpen ? (
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border }} contentContainerStyle={{ paddingHorizontal: 12, gap: 4, alignItems: "center" }}>
            {QUICK_EMOJI.map((e) => (
              <PressableScale key={e} onPress={() => setComment((t) => `${t}${e}`)} accessibilityLabel={`Add ${e}`} scaleTo={0.8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Txt style={{ fontSize: 24, lineHeight: 30 }}>{e}</Txt>
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}
        {replyTarget ? <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:16}}><Txt variant="small" tone="muted">Replying to {replyTarget.author.nickname}</Txt><PressableScale onPress={()=>setReplyTarget(null)} accessibilityLabel="Cancel reply" style={{minHeight:40,justifyContent:"center"}}><Txt tone="accent">Cancel</Txt></PressableScale></View> : null}
        <CommentBar
          me={viewer}
          value={comment}
          onChangeText={setComment}
          onSend={() => void send()}
          sending={sending}
          onPickImage={canComment ? () => setStickersOpen(true) : undefined}
          onEmoji={canComment ? () => setEmojiOpen((o) => !o) : undefined}
          disabled={!canComment}
          placeholder={post.commentsDisabled ? "Comments are closed" : isMember ? "Add a comment…" : "Join the community to comment"}
          safeArea
        />
      </KeyboardAvoidingView>

      {removing ? <Loading label="Deleting…" /> : null}
      <ActionMenu visible={menuOpen} title="Post options" items={menu} onClose={() => setMenuOpen(false)} />
      <ActionMenu
        visible={sortOpen}
        title="Sort comments"
        items={(["newest", "top", "oldest"] as const).map((s) => ({ key: s, label: SORT_LABEL[s], icon: s === "top" ? "flame-outline" : s === "newest" ? "time-outline" : "hourglass-outline", hint: s === sort ? "Showing now" : undefined, onPress: () => setSort(s) }))}
        onClose={() => setSortOpen(false)}
      />
      <ActionMenu visible={!!commentMenu} title="Comment" items={commentMenuItems} onClose={() => setCommentMenu(null)} />
      <StickerPicker
        visible={stickersOpen}
        onClose={() => setStickersOpen(false)}
        onPick={(stickerId) => {
          // Comments are text, so a sticker goes in as its emoji.
          const sticker = STICKER_PACKS.flatMap((p) => p.stickers).find((s) => s.id === stickerId);
          if (sticker) setComment((t) => `${t}${sticker.emoji}`);
          setStickersOpen(false);
        }}
      />
      <Sheet visible={quoteOpen} title="Quote this post" onClose={()=>setQuoteOpen(false)}><Txt tone="muted">Add your thoughts and share the original in your community.</Txt><Field label="Your thoughts" value={quoteNote} onChangeText={setQuoteNote} maxLength={400} multiline/><Button label="Publish quote repost" disabled={!quoteNote.trim()} onPress={()=>void contentApi.quote(slug!,id,quoteNote).then(r=>{setQuoteOpen(false);router.push(`/community/${slug}/post/${r.id}`);}).catch(showError)}/></Sheet>
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </View>
  );
}

export default withCommunityTheme(PostScreen);
