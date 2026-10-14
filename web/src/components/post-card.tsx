import { Link, useNavigate } from "@tanstack/react-router";
import { Bookmark, EyeOff, Heart, Images, Link2, Lock, MessageCircle, Repeat2, Share2, Star } from "lucide-react";
import { useState } from "react";
import { Avatar, HashtagChips, Pill, VerifiedTick } from "@/components/k";
import { cleanTag, personFromChip, plainPreview, postTypeMeta, tagLabel } from "@/components/community/helpers";
import { shareLink } from "@/components/community/share";
import { usePostActions } from "@/components/community/use-post-actions";
import { compactNumber, timeAgo } from "@/lib/format-ui";
import type { Post } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

/**
 * A post in a feed (Home, Saved, Search, Profile, community lists), the same card as the phone app: author row
 * with the post type, title, a short preview, the picture (with "+4" when there are more), a few hashtags, and
 * like / comment / share / save. The whole card opens the post.
 *
 * Props stay as before: pass `communityName` to show where the post is from. `onLike` / `onSave` are optional:
 * when given they are called (older pages reload their list from them); otherwise the card talks to the server
 * itself. Either way the heart and bookmark change straight away.
 */
export function PostCard({
  post,
  communityName,
  onLike,
  onSave,
  className,
}: {
  post: Post & { communityName?: string };
  communityName?: string;
  onLike?: (id: number) => unknown;
  onSave?: (id: number) => unknown;
  className?: string;
}) {
  const navigate = useNavigate();
  const { liked, likeCount, saved, like, save } = usePostActions(post, { onLike, onSave });
  const [revealed, setRevealed] = useState(!post.contentWarning);
  const meta = postTypeMeta(post.type);
  const extraPictures = post.payload.albumCount ?? 0;
  const preview = post.body ? plainPreview(post.body) : "";
  const where = communityName ?? post.communityName;
  const href = `/c/${post.communityId}/p/${post.id}`;

  return (
    <article
      className={cn(
        "k-card relative flex min-w-0 flex-col gap-2 rounded-card p-3 lg:gap-2.5 lg:p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <Link
          to="/u/$handle"
          params={{ handle: post.author.handle }}
          aria-label={`Open ${post.author.nickname}'s profile`}
          className="k-focus relative z-10 shrink-0 rounded-full"
        >
          <Avatar person={personFromChip(post.author)} size={38} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1">
            <span className="truncate text-[14px] leading-[18px] font-extrabold text-ink lg:text-[15px]">
              {post.author.nickname}
            </span>
            {post.authorVerified ? <VerifiedTick size={13} /> : null}
          </p>
          {/* "5m ago" can tick over between the server render and the browser: that difference is expected. */}
          <p className="truncate text-[12px] leading-4 text-muted lg:text-[13px]" suppressHydrationWarning>
            {where ? <span className="font-semibold text-violet">{where} · </span> : null}
            {post.scheduled && post.publishAt
              ? `Scheduled for ${new Date(post.publishAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : timeAgo(post.createdAt)}
            {post.editedAt ? " · edited" : ""}
          </p>
        </div>
        <Pill tone={meta.tone} className="shrink-0">
          {meta.label}
        </Pill>
      </div>

      {post.pinned || post.featured || post.announcement || post.visibility === "members" || post.originalPostId ? (
        <div className="flex flex-wrap gap-1.5">
          {post.pinned ? (
            <Pill tone="pink" solid icon={<Star className="size-3" fill="currentColor" strokeWidth={0} aria-hidden />}>
              Pinned
            </Pill>
          ) : null}
          {post.announcement ? <Pill tone="blue" icon={<span aria-hidden>📣</span>}>Announcement</Pill> : null}
          {post.featured ? <Pill tone="orange" icon={<span aria-hidden>⭐</span>}>Featured</Pill> : null}
          {post.visibility === "members" ? (
            <Pill tone="neutral" icon={<Lock className="size-3" aria-hidden />}>Members only</Pill>
          ) : null}
          {post.originalPostId ? (
            <Pill tone="green" icon={<Repeat2 className="size-3" aria-hidden />}>Repost</Pill>
          ) : null}
        </div>
      ) : null}

      <h3 className="line-clamp-2 text-[15.5px] leading-[21px] font-extrabold break-words text-ink lg:text-[17px] lg:leading-6">
        {/* The title link covers the whole card, so a click anywhere opens the post. */}
        <Link
          to="/c/$slug/p/$postId"
          params={{ slug: post.communityId, postId: String(post.id) }}
          className="k-focus after:absolute after:inset-0 after:rounded-card after:content-['']"
        >
          {post.title}
        </Link>
      </h3>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="k-focus relative z-10 flex w-full items-center gap-2.5 rounded-tile bg-tint-violet p-3 text-left"
        >
          <EyeOff className="size-5 shrink-0 text-violet-ink" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[13px] leading-[17px] font-bold text-violet-ink">
              Content warning: {post.contentWarning}
            </span>
            <span className="block text-[12px] text-muted">Tap to show</span>
          </span>
        </button>
      ) : (
        <>
          {preview ? (
            <p className="line-clamp-2 text-[13.5px] leading-[19px] break-words text-muted lg:text-[14.5px] lg:leading-[21px]">
              {preview}
            </p>
          ) : null}
          {post.type === "link" && post.payload.url ? (
            <p className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-blue-ink">
              <Link2 className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{post.payload.url}</span>
            </p>
          ) : null}
          {post.cover ? (
            <div className="relative aspect-[1.75] overflow-hidden rounded-tile bg-surface-alt">
              <img src={post.cover} alt="" className="size-full object-cover" loading="lazy" draggable={false} />
              {extraPictures ? (
                <span className="absolute top-2 right-2 inline-flex h-5 items-center gap-1 rounded-full bg-[#0f0b2a9e] px-[7px] text-[11px] font-bold text-white backdrop-blur-sm">
                  <Images className="size-3" aria-hidden />+{extraPictures}
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {post.hashtags.length ? (
        <HashtagChips
          tags={post.hashtags.slice(0, 3).map(tagLabel)}
          onTagClick={(t) => void navigate({ to: "/explore", search: { q: `#${cleanTag(t)}` } })}
          className="relative z-10"
        />
      ) : null}

      <div className="relative z-10 flex items-center gap-[18px] pt-0.5">
        <button
          type="button"
          onClick={() => void like()}
          aria-pressed={liked}
          aria-label={`${liked ? "Unlike" : "Like"} ${post.title}, ${likeCount} likes`}
          className="k-focus k-hit inline-flex min-h-7 items-center gap-1.5 rounded-full text-[13px] font-semibold text-body"
        >
          <Heart
            className={cn("size-5 transition-transform active:scale-90", liked ? "text-pink" : "text-muted")}
            fill={liked ? "currentColor" : "none"}
            strokeWidth={liked ? 0 : 2}
            aria-hidden
          />
          {compactNumber(likeCount)}
        </button>
        <Link
          to="/c/$slug/p/$postId"
          params={{ slug: post.communityId, postId: String(post.id) }}
          aria-label={`${post.commentCount} comments`}
          className="k-focus k-hit inline-flex min-h-7 items-center gap-1.5 rounded-full text-[13px] font-semibold text-body"
        >
          <MessageCircle className="size-5 text-muted" strokeWidth={2} aria-hidden />
          {compactNumber(post.commentCount)}
        </Link>
        <button
          type="button"
          onClick={() => void shareLink(post.title, href)}
          aria-label={`Share ${post.title}`}
          className="k-focus k-hit inline-flex min-h-7 items-center rounded-full text-muted"
        >
          <Share2 className="size-5" strokeWidth={2} aria-hidden />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void save()}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save"}
          className={cn("k-focus k-hit inline-flex min-h-7 items-center rounded-full", saved ? "text-violet" : "text-muted")}
        >
          <Bookmark className="size-5" fill={saved ? "currentColor" : "none"} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </article>
  );
}
