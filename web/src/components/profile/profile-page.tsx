import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  BadgeCheck,
  Ban,
  Bell,
  BellOff,
  Bookmark,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  CirclePlus,
  Clock,
  Flag,
  Link2,
  LogOut,
  MapPin,
  MessageCircle,
  Phone,
  Settings,
  Share2,
  ShieldCheck,
  SquarePen,
  Star,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AchievementBanner } from "@/components/achievement-banner";
import { AppShell } from "@/components/app-shell";
import { ProfileContent } from '@/components/content/profile-content';
import { ProfileIdentity } from './profile-identity';
import { ReportDialog, type ReportTarget } from "@/components/community/community-dialogs";
import { shareLink } from "@/components/community/share";
import { ActionMenu, Sheet, type MenuItem } from "@/components/community/sheet";
import {
  CardRow,
  EmptyHint,
  GradientButton,
  OutlineButton,
  Pill,
  ProfileCategoryTile,
  SectionHeader,
  ShowcaseBanner,
  VerifiedTick,
  type Tone,
} from "@/components/k";
import { signOut } from "@/lib/auth/client";
import { defaultCover } from "@/lib/brand-art";
import {
  blockUser,
  getPublicProfile,
  joinCommunity,
  openDm,
  ringCall,
  setRoomPreference,
  setShowcase,
  toggleFollowProfile,
} from "@/lib/kamino/server";
import { adminSetVerified, mutePerson, profileOverview } from "@/lib/kamino/social";
import { getSafetyRole } from "@/lib/kamino/ai-features";
import type { CommunityCardData } from "@/lib/kamino/types";
import { cn, levelFromRep } from "@/lib/utils";
import { followButtonLabel, joinedLabel, pronounsLabel, websiteLabel } from "./helpers";
import { OlderProfileParts } from "./older-parts";
import { BadgeRow, CommunityTile, PrivateNotice, ProfileCover, ProfilePostTile, StatsRow } from "./profile-parts";
import {
  AchievementsSheet,
  CommunitiesSheet,
  CoverSheet,
  FollowListSheet,
  ProfilePostsSheet,
  SafetySheet,
  type ListKind,
} from "./profile-sheets";
import { useShellData } from "@/components/k/use-shell-data";

export type ProfileOverviewData = Awaited<ReturnType<typeof profileOverview>>;

/** Tile colours for the profile categories, in the mockup's order (orange, violet, blue, green, pink, orange). */
const TILE_TONES: Tone[] = ["orange", "violet", "blue", "green", "pink", "orange"];

type Confirm = { title: string; text: string; action: string; destructive?: boolean; run: () => Promise<unknown> };

const fail = (e: unknown, fallback = "Something went wrong. Please try again.") =>
  toast.error(e instanceof Error ? e.message : fallback);

/**
 * A profile page (mockup 10-profile): cover, avatar, name, chips, Follow, bio, stats, category tiles, showcase
 * banners, badges, recent posts and communities. Further down: titles, pinned wiki pages, characters and the
 * wall. Used for other people (`/u/$handle`) and for yourself (`/me`). Same sections and menus as the phone app.
 */
export function ProfilePage({
  handle,
  initial,
  inTabs = false,
}: {
  handle: string;
  /** Loaded on the server (fast first paint). */
  initial?: ProfileOverviewData;
  /** Your own profile from the Profile tab: no back button. */
  inTabs?: boolean;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, profile: viewer } = useShellData();
  const viewerId = viewer?.userId;

  const overview = useQuery({
    queryKey: ["profileOverview", handle],
    queryFn: () => profileOverview({ data: { handle } }),
    initialData: initial,
  });
  // The older profile call still carries the wall, titles, characters, pinned wiki and the full achievement list.
  const legacy = useQuery({ queryKey: ["profile", handle], queryFn: () => getPublicProfile({ data: handle }) });
  // Site owners get "verified" and "creator" switches on other people's profiles.
  const role = useQuery({ queryKey: ["safetyRole"], queryFn: () => getSafetyRole(), enabled: !!user, staleTime: 10 * 60_000 });

  const [menu, setMenu] = useState(false);
  const [lists, setLists] = useState<ListKind | null>(null);
  const [posts, setPosts] = useState<{ tag?: string; title: string } | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [communitiesOpen, setCommunitiesOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["profileOverview", handle] }),
      queryClient.invalidateQueries({ queryKey: ["profile", handle] }),
    ]);

  /** Runs an action with a busy marker and a friendly message when it fails. */
  async function run(key: string, work: () => Promise<unknown>) {
    setBusy(key);
    try {
      await work();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  if (overview.isPending) {
    return (
      <AppShell>
        <div className="space-y-3 px-4 pt-2" aria-busy="true" aria-label="Loading profile">
          <div className="h-[150px] animate-pulse rounded-t-[22px] bg-surface-alt lg:h-[260px]" />
          <div className="h-6 w-48 animate-pulse rounded-full bg-surface-alt" />
          <div className="h-4 w-72 animate-pulse rounded-full bg-surface-alt" />
        </div>
      </AppShell>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <AppShell padded>
        <EmptyHint
          icon="🔎"
          title="We couldn't open this profile"
          text={overview.error?.message ?? "Please try again."}
          action={
            <GradientButton size="sm" onClick={() => void overview.refetch()}>
              Try again
            </GradientButton>
          }
          className="mt-6"
        />
      </AppShell>
    );
  }

  const d = overview.data;
  const old = legacy.data;
  const p = d.profile;
  const isSelf = d.isSelf;
  const person = { name: p.displayName || p.handle, hue: p.avatarHue, userId: p.userId, avatarV: p.avatarVersion };
  const locked = d.locked && !isSelf;
  const top = d.showcase[0] ?? null;
  const streakDays = d.streak.days;
  const followLabel = followButtonLabel({
    following: d.following,
    requested: d.requested,
    privateAccount: p.privateAccount,
    followsYou: d.followsYou,
  });
  const share = () => void shareLink(`${p.displayName} on Kamino`, `/u/${p.handle}`);
  const needSignIn = () => void navigate({ to: "/login" });

  // ── Actions ──
  async function doFollow() {
    const result = await toggleFollowProfile({ data: p.userId });
    // Show the new state straight away, then refresh the counts.
    queryClient.setQueryData<ProfileOverviewData>(["profileOverview", handle], (prev) =>
      prev ? { ...prev, following: result.following, requested: result.requested } : prev,
    );
    if (result.requested) toast("Request sent", { description: "This account is private. You'll see more once they accept." });
    await refresh();
    void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
  }
  function follow() {
    if (!user) return needSignIn();
    if (d.following || d.requested) {
      setConfirm({
        title: d.following ? `Unfollow ${p.displayName}?` : "Cancel your request?",
        text: d.following ? "Their posts won't show in your Following feed any more." : "You can ask again any time.",
        action: d.following ? "Unfollow" : "Cancel request",
        destructive: true,
        run: doFollow,
      });
      return;
    }
    void run("follow", doFollow);
  }

  const message = () =>
    run("message", async () => {
      if (!user) return needSignIn();
      const { roomId } = await openDm({ data: p.userId });
      await navigate({ to: "/chats/$roomId", params: { roomId: String(roomId) } });
    });

  const call = () =>
    run("call", async () => {
      if (!user) return needSignIn();
      const { roomId } = await openDm({ data: p.userId });
      await ringCall({ data: roomId }).catch(() => undefined);
      sessionStorage.setItem("kamino-call", String(roomId));
      await navigate({ to: "/chats/$roomId", params: { roomId: String(roomId) } });
    });

  /** A personal mute: their posts, comments and alerts disappear for you; they are not told. */
  const mute = () =>
    run("mute", async () => {
      const next = !d.muted;
      await mutePerson({ data: { userId: p.userId, muted: next } });
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
      toast.success(next ? "Muted" : "Unmuted", {
        description: next ? `You won't see posts or alerts from ${p.displayName}. They aren't told.` : `You'll see ${p.displayName}'s posts and alerts again.`,
      });
    });

  const toggleBlock = () =>
    setConfirm({
      title: d.blocked ? `Unblock @${p.handle}?` : `Block @${p.handle}?`,
      text: d.blocked
        ? "They'll be able to see your posts and message you again."
        : "You won't see their posts or messages, and they can't message you.",
      action: d.blocked ? "Unblock" : "Block",
      destructive: !d.blocked,
      run: async () => {
        await blockUser({ data: p.userId });
        await queryClient.invalidateQueries();
      },
    });

  function joinTile(c: CommunityCardData) {
    if (c.joined || c.visibility === "private" || !user) {
      void navigate({ to: "/c/$slug", params: { slug: c.id } });
      return;
    }
    void run(c.id, async () => {
      try {
        const result = await joinCommunity({ data: { slug: c.id } });
        if (result.pending) toast("Request sent", { description: `A leader of ${c.name} will look at your request soon.` });
        else toast.success(`You joined ${c.name}`);
      } catch {
        // Communities with join questions or rules explain how to join on their own page.
        await navigate({ to: "/c/$slug", params: { slug: c.id } });
        return;
      }
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
    });
  }

  const changeShowcase = (ids: string[]) =>
    run("showcase", async () => {
      await setShowcase({ data: { ids } });
      await refresh();
    });

  const menuItems: MenuItem[] = isSelf
    ? [
        { key: "edit", label: "Edit profile", icon: <SquarePen />, hint: "Name, headline, bio, categories, look", to: "/settings" },
        { key: "cover", label: "Cover and photo", icon: <Camera />, tone: "blue", onSelect: () => setCoverOpen(true) },
        { key: "notifications", label: "Notifications", icon: <Bell />, tone: "orange", to: "/notifications" },
        { key: "settings", label: "Settings", icon: <Settings />, tone: "blue", hint: "Privacy, notifications and your account", to: "/settings" },
        { key: "saved", label: "Saved", icon: <Bookmark />, tone: "green", to: "/saved" },
        { key: "safety", label: "Safety", icon: <ShieldCheck />, tone: "violet", onSelect: () => setSafetyOpen(true) },
        {
          key: "signout",
          label: "Sign out",
          icon: <LogOut />,
          destructive: true,
          onSelect: () =>
            setConfirm({ title: "Sign out?", text: "You can sign back in any time.", action: "Sign out", run: () => signOut("/") }),
        },
      ]
    : [
        { key: "message", label: "Message", icon: <MessageCircle />, onSelect: () => void message() },
        { key: "call", label: "Voice call", icon: <Phone />, tone: "green", onSelect: () => void call() },
        { key: "share", label: "Share profile", icon: <Share2 />, tone: "blue", onSelect: share },
        ...(user
          ? ([
              { key: "mute", label: d.muted ? "Unmute" : "Mute", icon: <BellOff />, tone: "orange", hint: d.muted ? "See their posts and alerts again" : "Hide their posts and alerts. They aren\u2019t told.", onSelect: () => void mute() },
              { key: "block", label: d.blocked ? "Unblock" : "Block", icon: <Ban />, destructive: !d.blocked, onSelect: toggleBlock },
              {
                key: "report",
                label: "Report",
                icon: <Flag />,
                destructive: true,
                onSelect: () => setReport({ targetType: "user", targetId: p.userId, label: "account" }),
              },
            ] satisfies MenuItem[])
          : []),
        ...(role.data?.siteAdmin
          ? ([
              { key: "verify", label: p.verified ? "Remove verified tick" : "Mark as verified", icon: <BadgeCheck />, tone: "blue", hint: "Site owner", onSelect: () => void run("verify", async () => { await adminSetVerified({ data: { userId: p.userId, verified: !p.verified } }); await refresh(); }) },
              { key: "creator", label: p.creator ? "Remove Creator badge" : "Give Creator badge", icon: <Star />, tone: "violet", hint: "Site owner", onSelect: () => void run("creator", async () => { await adminSetVerified({ data: { userId: p.userId, creator: !p.creator } }); await refresh(); }) },
            ] satisfies MenuItem[])
          : []),
      ];

  const level = levelFromRep(p.rep);
  const featuredTitle = old?.featuredTitle ?? null;

  return (
    <AppShell>
      <div className="lg:mx-auto lg:max-w-[1000px] lg:pt-2">
        {isSelf?<a className="mx-4 inline-block py-3 font-bold text-violet" href="/creator">Creator studio & analytics →</a>:null}
        <ProfileCover
          cover={p.cover || defaultCover(p.avatarHue)}
          hue={p.avatarHue}
          person={person}
          online={p.online}
          onBack={
            inTabs
              ? undefined
              : () => {
                  if (window.history.length > 1) router.history.back();
                  else void navigate({ to: "/" });
                }
          }
          onShare={share}
          onMore={() => setMenu(true)}
          onAvatarClick={isSelf ? () => setCoverOpen(true) : undefined}
        />

        {/* ── Name, handle, chips and the Follow button ── */}
        <div className="relative -mt-4 px-[15px] lg:-mt-6 lg:px-8">
          <h1 className="flex items-center gap-1.5 text-[25px] leading-[31px] font-extrabold tracking-[-0.5px] text-ink lg:text-[38px] lg:leading-tight">
            <span className="truncate">{p.displayName}</span>
            {p.verified ? <VerifiedTick size={19} className="lg:hidden" /> : null}
            {p.verified ? <VerifiedTick size={26} className="hidden lg:inline-grid" /> : null}
          </h1>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-[12.5px] text-muted lg:text-[15px]">
                @{p.handle}
                <span className="text-subtle"> · Lv {level}</span>
                {d.followsYou && !isSelf ? <span className="font-semibold text-violet-ink">  ·  Follows you</span> : null}
              </p>
              <div className="flex flex-wrap gap-[3px] lg:gap-1.5">
                {p.creator ? (
                  <Pill tone="violet" solid className="h-5 gap-0.5 px-[6px] text-[10.5px] lg:h-7 lg:gap-1 lg:px-2.5 lg:text-[13px]">
                    ⭐ Creator
                  </Pill>
                ) : null}
                {p.headline ? (
                  <Pill tone="violet" className="h-5 gap-0.5 px-[6px] text-[10.5px] lg:h-7 lg:gap-1 lg:px-2.5 lg:text-[13px]" icon={<span className="size-2 rounded-full border-[1.5px] border-current lg:size-2.5" aria-hidden />}>
                    {p.headline}
                  </Pill>
                ) : null}
                {p.pronouns ? (
                  <Pill tone="violet" className="h-5 gap-0.5 px-[6px] text-[10.5px] lg:h-7 lg:gap-1 lg:px-2.5 lg:text-[13px]">
                    {pronounsLabel(p.pronouns)}
                  </Pill>
                ) : null}
                {featuredTitle ? (
                  <Pill tone="pink" className="h-5 gap-0.5 px-[6px] text-[10.5px] lg:h-7 lg:gap-1 lg:px-2.5 lg:text-[13px]">
                    🏷️ {featuredTitle.label}
                  </Pill>
                ) : null}
              </div>
            </div>
            {isSelf ? (
              <OutlineButton
                to="/settings"
                size="sm"
                icon={<SquarePen className="size-4 text-violet" aria-hidden />}
                className="h-8 gap-1.5 px-3.5 text-ink lg:h-11 lg:px-6 lg:text-[15px]"
              >
                Edit profile
              </OutlineButton>
            ) : d.following || d.requested ? (
              <button
                type="button"
                onClick={follow}
                disabled={busy === "follow"}
                aria-label={d.following ? `Following ${p.displayName}. Unfollow` : "Follow request sent. Cancel it"}
                className="k-focus k-hit relative inline-flex h-8 w-[118px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-tint-violet text-[14px] font-bold text-violet-ink lg:h-11 lg:w-40 lg:text-[16px]"
              >
                {d.following ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Clock className="size-4" aria-hidden />}
                {followLabel}
              </button>
            ) : (
              <GradientButton
                size="sm"
                onClick={follow}
                disabled={busy === "follow"}
                icon={<UserPlus className="size-[17px]" strokeWidth={2.4} aria-hidden />}
                aria-label={`${followLabel} ${p.displayName}`}
                className="h-8 w-[118px] text-[15px] lg:h-11 lg:w-40 lg:text-[16px]"
              >
                {followLabel}
              </GradientButton>
            )}
            <button
              type="button"
              onClick={() => setMenu(true)}
              aria-label={isSelf ? "Profile menu" : `More for ${p.displayName}`}
              className="k-focus k-hit relative grid size-8 shrink-0 place-items-center rounded-[10px] border border-border bg-surface text-ink shadow-card hover:bg-surface-alt lg:size-11 lg:rounded-[14px]"
            >
              <ChevronDown className="size-[18px] lg:size-5" strokeWidth={2.4} aria-hidden />
            </button>
          </div>

          {/* ── Bio, location, link, joined ── */}
          {p.bio ? (
            <p className="mt-2 text-[13.5px] leading-[17px] whitespace-pre-line text-body lg:max-w-[720px] lg:text-[16px] lg:leading-snug">{p.bio}</p>
          ) : null}
          <ProfileIdentity handle={p.handle} />
          {p.mood || p.status ? (
            <p className="mt-1 text-[12px] font-semibold text-violet-ink lg:text-[14px]">{[p.mood, p.status].filter(Boolean).join(" · ")}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted lg:text-[15px]">
            {p.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-[15px]" aria-hidden />
                {p.location}
              </span>
            ) : null}
            {p.website ? (
              <a
                href={p.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="k-focus inline-flex max-w-[180px] items-center gap-1 font-semibold text-violet hover:underline lg:max-w-none"
              >
                <Link2 className="size-[15px] shrink-0" aria-hidden />
                <span className="truncate">{websiteLabel(p.website)}</span>
              </a>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-[14px]" aria-hidden />
              {joinedLabel(p.createdAt)}
            </span>
          </div>

          <div className="mt-1.5">
            <StatsRow
              items={[
                { value: d.stats.posts, label: "Posts", onClick: locked ? undefined : () => setPosts({ title: "Posts" }) },
                { value: d.stats.followers, label: "Followers", onClick: () => setLists("followers") },
                { value: d.stats.following, label: "Following", onClick: () => setLists("following") },
              ]}
            />
          </div>
        </div>

        {locked ? (
          <div className="mt-3">
            <PrivateNotice requested={d.requested} />
          </div>
        ) : (
          <div className="mt-1 space-y-2 px-2.5 lg:mt-3 lg:space-y-4 lg:px-8">
            {/* ── Profile categories ── */}
            {p.profileCategories.length ? (
              <div className="grid grid-cols-6 gap-1.5 lg:gap-3">
                {p.profileCategories.slice(0, 6).map((c, i) => (
                  <ProfileCategoryTile
                    key={c.key}
                    emoji={c.emoji}
                    label={c.label}
                    tone={TILE_TONES[i % TILE_TONES.length]}
                    count={d.categoryCounts[c.key] ?? 0}
                    onClick={() => setPosts({ tag: c.key, title: `${c.emoji} ${c.label}` })}
                  />
                ))}
              </div>
            ) : isSelf ? (
              <Link
                to="/settings"
                hash="profile"
                className="k-focus flex min-h-11 items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-dashed border-violet text-[13px] font-semibold text-violet"
              >
                <CirclePlus className="size-[18px]" aria-hidden /> Pick up to 6 categories for your posts
              </Link>
            ) : null}

            {/* ── Showcase banners: top achievement + streak ── */}
            <div className="flex gap-[7px] lg:gap-3">
              {top ? (
                <AchievementBanner achievement={top} onClick={() => setAchievementsOpen(true)} className="flex-[1.2]" />
              ) : (
                <ShowcaseBanner
                  variant="achievement"
                  icon="🏆"
                  title={isSelf ? "Show off a badge" : "Achievements"}
                  text={isSelf ? "Pick a top achievement for your profile" : `${d.badges.length} unlocked so far`}
                  onClick={() => setAchievementsOpen(true)}
                  className="flex-[1.2]"
                />
              )}
              <ShowcaseBanner
                variant="streak"
                icon="🔥"
                title={streakDays > 0 ? `${streakDays} Day Streak` : "Daily Streak"}
                text={
                  streakDays > 0
                    ? "Creating, sharing, and lifting others up!"
                    : d.streak.best > 0
                      ? `Best streak: ${d.streak.best} days`
                      : "Check in daily to start a streak"
                }
                to={isSelf ? "/" : undefined}
                onClick={isSelf ? undefined : () => setAchievementsOpen(true)}
                className="flex-1"
              />
            </div>

            {/* ── Badges ── */}
            <BadgeRow
              badges={d.badges}
              onSeeAll={() => setAchievementsOpen(true)}
              emptyText={isSelf ? "Post, chat and play to earn badges." : "No badges yet."}
            />

            {/* ── Recent posts ── */}
            <SectionHeader
              icon={<Video className="text-violet" fill="currentColor" strokeWidth={2} />}
              title="Recent Posts"
              onSeeAll={() => setPosts({ title: "Posts" })}
              seeAllIcon="chevron"
              className="pt-1"
            />
            {d.recentPosts.length ? (
              <div className="grid grid-cols-3 gap-1.5 lg:gap-3">
                {d.recentPosts.slice(0, 3).map((post) => (
                  <ProfilePostTile key={post.id} post={post} hue={p.avatarHue + post.id * 23} />
                ))}
              </div>
            ) : (
              <EmptyHint
                icon="📝"
                title="No posts yet"
                text={isSelf ? "Share something in one of your communities." : "Their posts will show up here."}
              />
            )}

            {/* ── Communities ── */}
            {d.communities.length ? (
              <>
                <SectionHeader
                  icon={<Users className="text-violet" fill="currentColor" strokeWidth={1.8} />}
                  title="Communities"
                  onSeeAll={() => setCommunitiesOpen(true)}
                  seeAllIcon="chevron"
                  className="pt-1"
                />
                <CardRow perRow={4} desktopCols={4} gap={6} label="Communities" className="-mx-2.5 px-2.5">
                  {d.communities.map((c, i) => (
                    <CommunityTile key={c.id} community={c} index={i} busy={busy === c.id} onJoin={() => joinTile(c)} />
                  ))}
                </CardRow>
              </>
            ) : null}

            {/* ── Everything the older profile had: titles, pinned wiki, characters, wall ── */}
            {old ? (
              <div className="pt-3">
                <OlderProfileParts data={old} viewerId={viewerId} refresh={refresh} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <ActionMenu open={menu} onOpenChange={setMenu} title={isSelf ? "Your profile" : `@${p.handle}`} items={menuItems} />
      <ReportDialog target={report} onClose={() => setReport(null)} />
      <FollowListSheet handle={p.handle} kind={lists} onKind={setLists} onClose={() => setLists(null)} viewerId={viewerId} />
      <ProfilePostsSheet
        handle={p.handle}
        open={!!posts}
        tag={posts?.tag}
        title={posts?.title ?? "Posts"}
        hue={p.avatarHue}
        onClose={() => setPosts(null)}
      />
      <AchievementsSheet
        open={achievementsOpen}
        achievements={old?.achievements ?? d.badges}
        showcase={(old?.showcase ?? d.showcase).map((a) => a.id)}
        isSelf={isSelf}
        loading={legacy.isPending}
        onShowcase={(ids) => void changeShowcase(ids)}
        onClose={() => setAchievementsOpen(false)}
      />
      <div className="mx-auto max-w-[1000px] px-4"><ProfileContent userId={p.userId}/></div>
      <CommunitiesSheet
        open={communitiesOpen}
        handle={p.handle}
        communities={d.communities}
        busy={busy}
        onJoin={joinTile}
        onClose={() => setCommunitiesOpen(false)}
      />
      {isSelf ? (
        <>
          <SafetySheet open={safetyOpen} onClose={() => setSafetyOpen(false)} communities={d.communities.filter((c) => c.joined)} />
          <CoverSheet
            open={coverOpen}
            onClose={() => setCoverOpen(false)}
            hasCover={!!p.cover}
            hasPhoto={p.avatarVersion > 0}
            currentCover={p.cover}
            onChanged={() => {
              setCoverOpen(false);
              void queryClient.invalidateQueries();
            }}
          />
        </>
      ) : null}
      <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} />

    </AppShell>
  );
}

/** "Are you sure?" panel (unfollow, block, sign out). */
function ConfirmSheet({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={!!confirm} onOpenChange={(o) => !o && onClose()} title={confirm?.title ?? ""} description={confirm?.text}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="k-focus h-11 flex-1 rounded-full border border-border bg-surface text-[15px] font-bold text-ink hover:bg-surface-alt"
        >
          Not now
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!confirm) return;
            setBusy(true);
            try {
              await confirm.run();
              onClose();
            } catch (e) {
              fail(e);
            } finally {
              setBusy(false);
            }
          }}
          className={cn(
            "k-focus h-11 flex-1 rounded-full text-[15px] font-bold text-white disabled:opacity-60",
            confirm?.destructive ? "bg-red-strong" : "bg-grad-primary",
          )}
        >
          {busy ? "One moment…" : confirm?.action}
        </button>
      </div>
    </Sheet>
  );
}
