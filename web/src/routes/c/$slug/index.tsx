import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AudioLines,
  Bookmark,
  CalendarDays,
  ExternalLink,
  FileText,
  Flag,
  ImageIcon,
  Megaphone,
  Share,
  Shield,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { recordCommunityVisit } from '@/lib/kamino/platform-v9';
import { toast } from "sonner";
import { CardRow, EmptyHint, FilterPills, GradientButton, SectionHeader, TabsUnderline } from "@/components/k";
import { useCommunityActions } from "@/components/community/community-context";
import { ReportDialog, StartRoomDialog, type ReportTarget } from "@/components/community/community-dialogs";
import {
  CheckInBanner,
  CommunityStats,
  EventsPanel,
  MediaGrid,
  ModeratorsRow,
  PostTile,
  RecentPostRow,
  RoomsPanel,
  StoriesRow,
  TopicChips,
} from "@/components/community/community-parts";
import { TagChip } from "@/components/community/explore-search";
import { isLeaderRole } from "@/components/community/helpers";
import { ActionMenu, type MenuItem } from "@/components/community/sheet";
import { shareLink } from "@/components/community/share";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { checkInCommunity } from "@/lib/kamino/engagement";
import { getCommunityPage, rsvpEvent, toggleFavorite } from "@/lib/kamino/server";
import { communityOverview } from "@/lib/kamino/social";
import type { HallEvent, Post } from "@/lib/kamino/types";
import { timeAgo } from "@/lib/format-ui";

export const Route = createFileRoute("/c/$slug/")({ component: CommunityHome });

type Tab = "posts" | "rooms" | "events" | "media";
const TABS = [
  { key: "posts", label: "Posts", icon: <FileText /> },
  { key: "rooms", label: "Rooms", icon: <AudioLines /> },
  { key: "events", label: "Events", icon: <CalendarDays /> },
  { key: "media", label: "Media", icon: <ImageIcon /> },
];

/**
 * A community's home (mockup 05-community), under the big header drawn by the `/c/$slug` layout: topic chips,
 * three stat cards, moderators, then tabs Posts / Rooms / Events / Media. Posts has the broadcast, stories,
 * announcements, "Featured Posts" and "Recent Posts" (latest, or from people you follow).
 * On computers the stat cards and moderators sit in a column beside the posts.
 */
function CommunityHome() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUserState();
  useEffect(() => { if (user) void recordCommunityVisit({data:{communityId:slug}}).catch(()=>{}); }, [slug,user]);
  const actions = useCommunityActions();
  const page = useQuery({
    queryKey: ["community", slug],
    queryFn: () => getCommunityPage({ data: { slug } }),
  });
  const overview = useQuery({
    queryKey: ["communityOverview", slug],
    queryFn: () => communityOverview({ data: { slug } }),
  });

  const [tab, setTab] = useState<Tab>("posts");
  const [feed, setFeed] = useState<"latest" | "following">("latest");
  const [showAll, setShowAll] = useState(false);
  const [postMenu, setPostMenu] = useState<Post | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [roomOpen, setRoomOpen] = useState(false);
  const [rsvpBusy, setRsvpBusy] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const following = useQuery({
    queryKey: ["community", slug, "following"],
    queryFn: () => getCommunityPage({ data: { slug, tab: "following" } }),
    enabled: feed === "following",
  });

  const data = page.data;
  if (!data) {
    return (
      <div className="space-y-3 px-4 pt-4" aria-busy="true" aria-label="Loading">
        <div className="h-20 animate-pulse rounded-card bg-surface-alt" />
        <div className="h-40 animate-pulse rounded-card bg-surface-alt" />
      </div>
    );
  }

  const { community, member, stories, announcements, broadcasts } = data;
  const ov = overview.data;
  const active = member?.status === "active";
  const isLeader = active && isLeaderRole(member?.role);
  const has = (m: string) => community.modules.includes(m as never);
  const base = `/c/${slug}`;
  const featured = ov?.featured ?? [];
  const recentAll =
    feed === "following"
      ? (following.data?.posts ?? []).filter((p) => !p.announcement)
      : (ov?.recent ?? data.posts).filter((p) => !p.announcement);
  const recent = showAll ? recentAll : recentAll.slice(0, 8);
  const topics = ov?.community.topics ?? community.topics;

  async function checkIn() {
    setChecking(true);
    try {
      const res = await checkInCommunity({ data: { slug } });
      if (!res.already)
        toast.success(`${res.streak}-day streak! 🔥`, { description: "Checked in. See you tomorrow!" });
      await actions.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check in");
    } finally {
      setChecking(false);
    }
  }

  async function rsvp(e: HallEvent) {
    setRsvpBusy(e.id);
    try {
      await rsvpEvent({ data: { slug, eventId: e.id } });
      await queryClient.invalidateQueries({ queryKey: ["communityOverview", slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your RSVP");
    } finally {
      setRsvpBusy(null);
    }
  }

  const postMenuItems: MenuItem[] = postMenu
    ? [
        { key: "open", label: "Open post", icon: <ExternalLink />, to: `${base}/p/${postMenu.id}` },
        {
          key: "share",
          label: "Share",
          icon: <Share />,
          tone: "blue",
          onSelect: () => void shareLink(postMenu.title, `${base}/p/${postMenu.id}`),
        },
        ...(user
          ? [
              {
                key: "save",
                label: postMenu.saved ? "Remove from saved" : "Save",
                icon: <Bookmark />,
                tone: "orange" as const,
                onSelect: () =>
                  void toggleFavorite({ data: postMenu.id })
                    .then(() => actions.refresh())
                    .then(() => toast.success(postMenu.saved ? "Removed from saved" : "Saved"))
                    .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Please try again.")),
              },
            ]
          : []),
        {
          key: "profile",
          label: `View ${postMenu.author.nickname}'s profile`,
          icon: <UserRound />,
          tone: "green",
          to: `/u/${postMenu.author.handle}`,
        },
        ...(user && postMenu.author.userId !== user.id
          ? [
              {
                key: "report",
                label: "Report",
                icon: <Flag />,
                destructive: true,
                onSelect: () =>
                  setReport({ targetType: "post", targetId: String(postMenu.id), communityId: slug, label: "post" }),
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="grid grid-cols-1 gap-3 px-4 pt-3 pb-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-8 lg:gap-y-5 lg:pt-6">
      {/* Topics (and content notes) */}
      <div className="space-y-2 lg:col-start-1 lg:row-start-1">
        <a className="inline-block rounded-full border border-border px-4 py-2 text-sm font-bold text-violet" href={`/c/${slug}/tools`}>Community tools, boards & FAQs</a>
        <TopicChips topics={topics} onEdit={isLeader ? actions.openTopics : undefined} />
        {community.contentWarnings.length > 0 && (
          <p className="rounded-tile bg-tint-orange px-3 py-2 text-[12.5px] font-semibold text-orange-ink">
            Content notes: {community.contentWarnings.join(" · ")} · Age {community.ageGate}+
          </p>
        )}
      </div>

      {/* Stats, check-in and moderators (beside the posts on computers) */}
      <aside className="min-w-0 space-y-3 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:space-y-5">
        <CommunityStats
          memberCount={ov?.community.memberCount ?? community.memberCount}
          memberFaces={ov?.memberFaces ?? []}
          onlineCount={ov?.onlineCount ?? 0}
          onlineFaces={ov?.onlineFaces ?? []}
          rankPercent={ov?.rankPercent ?? 100}
          category={community.category}
          membersTo={has("members") ? `${base}/members` : undefined}
          rankTo={has("rank") ? `${base}/rank` : undefined}
          className="lg:hidden"
        />
        <CommunityStats
          vertical
          memberCount={ov?.community.memberCount ?? community.memberCount}
          memberFaces={ov?.memberFaces ?? []}
          onlineCount={ov?.onlineCount ?? 0}
          onlineFaces={ov?.onlineFaces ?? []}
          rankPercent={ov?.rankPercent ?? 100}
          category={community.category}
          membersTo={has("members") ? `${base}/members` : undefined}
          rankTo={has("rank") ? `${base}/rank` : undefined}
          className="hidden lg:grid"
        />
        {active && !member!.checkedInToday ? (
          <div className="lg:hidden">
            <CheckInBanner streak={member!.streak} busy={checking} onCheckIn={() => void checkIn()} />
          </div>
        ) : null}
        {ov?.moderators.length ? (
          <section className="space-y-1.5 lg:space-y-3" aria-label="Moderators">
            <SectionHeader
              icon={<Shield className="text-violet" fill="currentColor" strokeWidth={1.6} />}
              title="Moderators"
              seeAllTo={has("members") ? `${base}/members` : undefined}
              seeAllIcon="chevron"
              className="[&_h2]:text-[14.5px] lg:[&_h2]:text-[18px]"
            />
            <ModeratorsRow moderators={ov.moderators} className="lg:grid-cols-4" />
          </section>
        ) : null}
        {ov?.trendingTags.length ? (
          <section className="hidden space-y-3 lg:block" aria-label="Trending here">
            <SectionHeader icon={<TrendingUp className="text-pink" strokeWidth={2.6} />} title="Trending here" />
            <div className="flex flex-wrap gap-2">
              {ov.trendingTags.map((t, i) => (
                <TagChip
                  key={t.tag}
                  tag={t.tag}
                  index={i}
                  count={t.count}
                  onPick={(q) => void navigate({ to: "/explore", search: { q } })}
                />
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      {/* Tabs */}
      <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-2 lg:space-y-5">
        <div className="-mx-1 overflow-hidden rounded-tile bg-surface pt-1 shadow-card lg:mx-0 lg:rounded-card">
          <TabsUnderline
            tabs={TABS}
            value={tab}
            onChange={(k) => setTab(k as Tab)}
            label="Community sections"
            className="border-b-0 [&_[role=tab]]:h-10 lg:[&_[role=tab]]:h-12"
          />
        </div>

        {tab === "posts" ? (
          <div className="space-y-4 lg:space-y-6">
            {broadcasts[0] ? (
              <div className="flex items-center gap-2.5 rounded-tile bg-tint-blue p-3">
                <Megaphone className="size-5 shrink-0 text-blue-ink" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-blue-ink" suppressHydrationWarning>
                    Broadcast · {timeAgo(broadcasts[0].createdAt)}
                  </p>
                  <p className="text-[13.5px] leading-5 text-body">{broadcasts[0].body}</p>
                </div>
              </div>
            ) : null}

            {stories.length ? (
              <section className="space-y-2" aria-label="Stories">
                <SectionHeader icon="⏳" title="Stories" />
                <StoriesRow stories={stories} slug={slug} />
              </section>
            ) : null}

            {announcements.length ? (
              <section className="space-y-2" aria-label="Announcements">
                <SectionHeader icon="📣" title="Announcements" />
                <div className="space-y-2">
                  {announcements.map((a) => (
                    <RecentPostRow key={a.id} post={a} slug={slug} onMore={() => setPostMenu(a)} />
                  ))}
                </div>
              </section>
            ) : null}

            {featured.length ? (
              <section className="space-y-1.5 lg:space-y-3" aria-label="Featured posts">
                <SectionHeader
                  icon="⭐"
                  title="Featured Posts"
                  onSeeAll={() => setShowAll(true)}
                  seeAllIcon="chevron"
                />
                <CardRow perRow={2.9} desktopCols={3} gap={8} label="Featured posts">
                  {featured.map((p) => (
                    <PostTile key={p.id} post={p} slug={slug} />
                  ))}
                </CardRow>
              </section>
            ) : null}

            <section className="space-y-2 lg:space-y-3" aria-label="Recent posts">
              <SectionHeader
                icon={
                  <span className="grid size-[22px] place-items-center rounded-[7px] bg-violet-strong text-white lg:size-7">
                    <FileText className="!size-3.5 lg:!size-[18px]" strokeWidth={2.6} />
                  </span>
                }
                title="Recent Posts"
                onSeeAll={showAll ? undefined : () => setShowAll(true)}
                seeAllIcon="chevron"
              />
              {active ? (
                <FilterPills
                  label="Which posts"
                  value={feed}
                  onChange={(k) => setFeed(k as "latest" | "following")}
                  items={[
                    { key: "latest", label: "Latest" },
                    { key: "following", label: "People I follow" },
                  ]}
                  className="-my-1"
                />
              ) : null}
              {(feed === "latest" ? overview.isPending && !data.posts.length : following.isPending) ? (
                <div className="space-y-2" aria-busy="true">
                  <div className="h-[74px] animate-pulse rounded-card bg-surface-alt" />
                  <div className="h-[74px] animate-pulse rounded-card bg-surface-alt" />
                </div>
              ) : recent.length ? (
                <div className="space-y-2 lg:space-y-3">
                  {recent.map((p) => (
                    <RecentPostRow key={p.id} post={p} slug={slug} onMore={() => setPostMenu(p)} />
                  ))}
                  {!showAll && recentAll.length > recent.length ? (
                    <div className="flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="k-focus k-hit rounded-full px-3 py-1.5 text-[14px] font-bold text-violet hover:underline"
                      >
                        Show more posts
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyHint
                  icon={feed === "following" ? "👀" : "✏️"}
                  title={feed === "following" ? "Nothing from people you follow" : "No posts yet"}
                  text={
                    feed === "following"
                      ? "Follow members to build this feed."
                      : active
                        ? "Be the first to post here."
                        : "Join to start posting."
                  }
                  action={
                    active && feed === "latest" ? (
                      <GradientButton size="sm" onClick={actions.openComposer}>
                        Write a post
                      </GradientButton>
                    ) : undefined
                  }
                />
              )}
            </section>
          </div>
        ) : tab === "rooms" ? (
          <RoomsPanel slug={slug} rooms={ov?.rooms ?? []} canStart={!!active} onStart={() => setRoomOpen(true)} />
        ) : tab === "events" ? (
          <EventsPanel
            slug={slug}
            events={ov?.events ?? data.events}
            canRsvp={!!active}
            busyId={rsvpBusy}
            onRsvp={(e) => void rsvp(e)}
          />
        ) : (
          <MediaGrid slug={slug} media={ov?.media ?? []} />
        )}
      </div>

      <ActionMenu
        open={!!postMenu}
        onOpenChange={(o) => !o && setPostMenu(null)}
        title="Post options"
        items={postMenuItems}
      />
      <ReportDialog target={report} onClose={() => setReport(null)} />
      <StartRoomDialog
        open={roomOpen}
        onOpenChange={setRoomOpen}
        slug={slug}
        communityName={community.name}
        onStarted={(roomId) => void navigate({ to: "/chats/$roomId", params: { roomId: String(roomId) } })}
      />
    </div>
  );
}
