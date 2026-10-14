import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Newspaper, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { HomeToolsStrip } from '@/components/platform-tools';
import { TutorialPrompt } from '@/components/tutorial-prompt';
import { afterCheckIn, eventWhen, patchPages, uniqueById, wasOnboardingShown } from "@/components/home/home-data";
import { CommunityRow, CreatorRow, HomeSection, HomeSkeleton, StreakAndEvent } from "@/components/home/home-sections";
import { WelcomeScreen } from "@/components/home/welcome-screen";
import { useT } from "@/lib/i18n";
import { CategoryChips, EmptyHint, GradientButton, HOME_CATEGORIES, HeroCarousel, SectionHeader, TabsUnderline } from "@/components/k";
import { PostCard } from "@/components/post-card";
import { heroArt } from "@/lib/brand-art";
import { bootstrap, checkIn, joinCommunity, leaveCommunity, rsvpEvent, toggleFavorite, toggleFollowProfile, toggleLike } from "@/lib/kamino/server";
import { feed, homeOverview } from "@/lib/kamino/social";
import type { CommunityCardData, CreatorCard, FeedTab } from "@/lib/kamino/types";

/**
 * Home (mockup 03-home). Visitors who are not signed in see the Welcome screen here instead.
 *
 * Signed in: header, hero banners, category chips (they filter the cards below), Recommended and
 * Trending communities, Daily Streak + Live Event, Featured Creators, then "Your feed" with three
 * tabs (For You / Following / Communities) that loads more posts as you scroll. People who have
 * not finished onboarding are sent there once. Same order and behaviour as the phone app's Home.
 *
 * The cards above the feed are rendered on the server (fast first paint); the feed loads in the
 * browser, because post times ("3m") would otherwise differ between server and browser.
 */
export const Route = createFileRoute("/")({
  loader: async () => {
    // `bootstrap` also creates the profile on a first visit, so it runs before the Home cards.
    const boot = await bootstrap();
    if (!boot.profile) return { signedIn: false as const };
    const overview = await homeOverview({ data: {} });
    return {
      signedIn: true as const,
      userId: boot.profile.userId,
      onboardedAt: boot.profile.onboardedAt,
      overview,
    };
  },
  component: HomeRoute,
});

type Overview = Awaited<ReturnType<typeof homeOverview>>;
type FeedPage = Awaited<ReturnType<typeof feed>>;
type FeedPost = FeedPage["posts"][number];

const FEED_TABS: { key: FeedTab; label: string; icon: React.ReactNode }[] = [
  { key: "forYou", label: "home.tab.forYou", icon: <Sparkles /> },
  { key: "following", label: "home.tab.following", icon: <Users /> },
  { key: "communities", label: "home.tab.communities", icon: <Newspaper /> },
];

const FEED_EMPTY: Record<FeedTab, { icon: string; title: string; body: string; action: { label: string; to: string } }> = {
  forYou: { icon: "🌱", title: "home.empty.forYou.title", body: "home.empty.forYou.body", action: { label: "home.empty.forYou.action", to: "/explore" } },
  following: { icon: "👋", title: "home.empty.following.title", body: "home.empty.following.body", action: { label: "home.empty.following.action", to: "/explore" } },
  communities: { icon: "🏡", title: "home.empty.communities.title", body: "home.empty.communities.body", action: { label: "home.empty.communities.action", to: "/explore" } },
};

function HomeRoute() {
  const data = Route.useLoaderData();
  if (!data.signedIn) return <WelcomeScreen />;
  return <Home userId={data.userId} onboardedAt={data.onboardedAt} initial={data.overview} />;
}

function Home({ userId, onboardedAt, initial }: { userId: string; onboardedAt: string | null; initial: Overview }) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("forYou");
  const [tab, setTab] = useState<FeedTab>("forYou");
  const [busy, setBusy] = useState<string | null>(null);
  // Things that depend on the browser (time zone, saved "onboarding shown") wait until the page has loaded,
  // so the server's HTML and the browser's first render match exactly.
  const [loaded, setLoaded] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(onboardedAt === null);

  useEffect(() => {
    setLoaded(true);
    if (onboardedAt !== null) return;
    if (wasOnboardingShown(userId)) setCheckingOnboarding(false);
    else void navigate({ to: "/onboarding", replace: true });
  }, [onboardedAt, userId, navigate]);

  const interest = category === "forYou" ? undefined : category;
  const overviewKey = ["homeOverview", userId, interest ?? "forYou"] as const;
  const overview = useQuery({
    queryKey: overviewKey,
    queryFn: () => homeOverview({ data: interest ? { interest } : {} }),
    initialData: interest ? undefined : initial,
    // Keep showing the last cards while another category loads, so the page doesn't jump.
    placeholderData: keepPreviousData,
    enabled: loaded,
  });
  const feedQuery = useInfiniteQuery({
    queryKey: ["feed", userId, tab],
    queryFn: ({ pageParam }) => feed({ data: { tab, cursor: pageParam } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: loaded,
  });

  // Changes every cached copy of the Home cards (all categories) at once, so the page updates straight away.
  const patchOverview = (change: (o: Overview) => Overview) =>
    queryClient.setQueriesData<Overview>({ queryKey: ["homeOverview", userId] }, (old) => (old ? change(old) : old));
  const patchCommunity = (slug: string, joined: boolean) =>
    patchOverview((o) => {
      const fix = (c: CommunityCardData) =>
        c.id === slug ? { ...c, joined, memberCount: Math.max(0, c.memberCount + (joined ? 1 : -1)) } : c;
      return { ...o, recommended: o.recommended.map(fix), trending: o.trending.map(fix) };
    });
  const patchPost = (id: number, change: (p: FeedPost) => FeedPost) =>
    queryClient.setQueriesData<InfiniteData<FeedPage, string | null>>({ queryKey: ["feed", userId] }, (old) =>
      old ? { ...old, pages: patchPages(old.pages, id, change) } : old,
    );

  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");

  async function toggleJoin(c: CommunityCardData) {
    // Private communities ask questions first: their page has the join form.
    if (!c.joined && c.visibility === "private") return void navigate({ to: "/c/$slug", params: { slug: c.id } });
    setBusy(c.id);
    try {
      if (c.joined) {
        await leaveCommunity({ data: c.id });
        patchCommunity(c.id, false);
      } else {
        const result = await joinCommunity({ data: { slug: c.id } });
        if (result.pending) toast("Request sent", { description: "The leaders will review it. You'll get a notification when you're in." });
        else {
          patchCommunity(c.id, true);
          toast.success(`You joined ${c.name}`);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
      void queryClient.invalidateQueries({ queryKey: ["feed", userId] });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function toggleFollow(c: CreatorCard) {
    setBusy(c.userId);
    try {
      const result = await toggleFollowProfile({ data: c.userId });
      patchOverview((o) => ({
        ...o,
        featuredCreators: o.featuredCreators.map((x) =>
          x.userId === c.userId
            ? { ...x, following: result.following, requested: result.requested, followers: x.followers + (result.following ? 1 : x.following ? -1 : 0) }
            : x,
        ),
      }));
      if (result.requested) toast("Request sent", { description: "This account is private. You'll see their posts once they accept." });
      void queryClient.invalidateQueries({ queryKey: ["feed", userId, "following"] });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function doCheckIn() {
    const streak = overview.data?.streak;
    if (!streak || streak.checkedInToday) return;
    setBusy("checkin");
    patchOverview((o) => ({ ...o, streak: afterCheckIn(o.streak) }));
    try {
      const r = await checkIn();
      toast.success(r.already ? `Already checked in · ${r.streak} day streak` : `Checked in! ${r.streak} day streak`);
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: ["homeOverview", userId] });
    }
  }

  async function rsvp() {
    const event = overview.data?.liveEvent;
    if (!event) return;
    setBusy("rsvp");
    try {
      const r = await rsvpEvent({ data: { slug: event.communityId, eventId: event.id } });
      patchOverview((o) =>
        o.liveEvent && o.liveEvent.id === event.id
          ? { ...o, liveEvent: { ...o.liveEvent, going: r.going, rsvpCount: Math.max(0, event.rsvpCount + (r.going === event.going ? 0 : r.going ? 1 : -1)) } }
          : o,
      );
      if (r.going) toast.success("You're going! We'll remind you before it starts.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function like(id: number) {
    const r = await toggleLike({ data: id });
    patchPost(id, (p) => (p.liked === r.liked ? p : { ...p, liked: r.liked, likeCount: Math.max(0, p.likeCount + (r.liked ? 1 : -1)) }));
  }
  async function save(id: number) {
    const r = await toggleFavorite({ data: id });
    patchPost(id, (p) => ({ ...p, saved: r.saved }));
    toast.success(r.saved ? "Saved" : "Removed from saved");
  }

  // Until the page has loaded in the browser, draw exactly what the server sent (the loader's data). The
  // server keeps one shared query cache, so its cached copy can be older than this visit's data.
  const o = loaded ? overview.data : initial;
  const posts = loaded ? uniqueById(feedQuery.data?.pages.flatMap((p) => p.posts) ?? []) : [];
  const empty = FEED_EMPTY[tab];
  const translatedTabs = FEED_TABS.map((tabItem) => ({ ...tabItem, label: t(tabItem.label as "home.tab.forYou") }));
  const emptyText = {
    title: t(empty.title as "home.empty.forYou.title"),
    body: t(empty.body as "home.empty.forYou.body"),
    action: { ...empty.action, label: t(empty.action.label as "home.empty.forYou.action") },
  };

  // Loads the next page when the bottom of the feed comes into view (the button below does the same).
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feedQuery;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (checkingOnboarding) {
    return (
      <AppShell>
        <div className="px-4 pt-1">
          <HomeSkeleton />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="sr-only">Home</h1>
      <div className="flex flex-col gap-2.5 px-4 pt-2 lg:gap-6 lg:pt-2">
        {o ? (
          <>
            <HeroCarousel
              label="Highlights"
              slides={o.heroes.map((h, i) => ({
                id: h.id,
                title: h.title,
                text: h.text,
                cta: h.cta,
                to: h.href,
                image: heroArt[h.art] ?? heroArt[`home-${(i % 4) + 1}`],
                hue: 262 + i * 20,
              }))}
            />
            <CategoryChips
              items={HOME_CATEGORIES}
              value={category}
              onChange={setCategory}
              onMore={() => void navigate({ to: "/explore" })}
              label="Show communities about"
              className="-my-1.5"
            />
            {o.recommended.length ? (
              <HomeSection icon="✨" title="Recommended for You" seeAllTo="/explore">
                <CommunityRow label="Recommended communities" communities={o.recommended} variant="vertical" busy={busy} onJoin={(c) => void toggleJoin(c)} />
              </HomeSection>
            ) : (
              <EmptyHint
                icon="🪐"
                title="Nothing here yet"
                text="No communities in this category yet. Try another one or start your own."
                action={
                  <GradientButton to="/new" size="sm">
                    Create a community
                  </GradientButton>
                }
              />
            )}
            {o.trending.length > 0 && (
              <HomeSection icon="🔥" title="Trending Communities" seeAllTo="/explore">
                <CommunityRow label="Trending communities" communities={o.trending} variant="compact" busy={busy} />
              </HomeSection>
            )}
            <StreakAndEvent
              streak={o.streak}
              event={o.liveEvent}
              when={loaded && o.liveEvent ? eventWhen(o.liveEvent.startsAt) : ""}
              checkingIn={busy === "checkin"}
              onCheckIn={() => void doCheckIn()}
              rsvpBusy={busy === "rsvp"}
              onRsvp={() => void rsvp()}
            />
            {o.featuredCreators.length > 0 && (
              <HomeSection icon="⭐" title="Featured Creators" seeAllTo="/explore">
                <CreatorRow creators={o.featuredCreators} busy={busy} onFollow={(c) => void toggleFollow(c)} />
              </HomeSection>
            )}
          </>
        ) : overview.isError ? (
          <EmptyHint
            icon="🌧️"
            title="We couldn't load Home"
            text="Check your connection and try again."
            action={
              <GradientButton size="sm" onClick={() => void overview.refetch()}>
                Try again
              </GradientButton>
            }
          />
        ) : (
          <HomeSkeleton />
        )}

        {/* Your feed: the posts, in three tabs. */}
        <section className="mt-1.5 flex flex-col gap-3 lg:mt-2" aria-label="Your feed">
          <SectionHeader icon="💜" title="Your feed" />
          <TabsUnderline label="Feed" tabs={translatedTabs} value={tab} onChange={(k) => setTab(k as FeedTab)} className="rounded-t-tile" />
          {!loaded || feedQuery.isPending ? (
            <FeedSkeleton />
          ) : feedQuery.isError ? (
            <EmptyHint
              icon="🌧️"
              title="We couldn't load posts"
              text="Check your connection and try again."
              action={
                <GradientButton size="sm" onClick={() => void feedQuery.refetch()}>
                  Try again
                </GradientButton>
              }
            />
          ) : posts.length === 0 ? (
            <EmptyHint
              icon={empty.icon}
              title={emptyText.title}
              text={emptyText.body}
              action={
                <GradientButton to={empty.action.to} size="sm">
                  {emptyText.action.label}
                </GradientButton>
              }
            />
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} communityName={p.communityName} onLike={like} onSave={save} />
                ))}
              </div>
              <div ref={sentinel} className="flex justify-center py-2">
                {feedQuery.hasNextPage ? (
                  <GradientButton
                    size="sm"
                    disabled={feedQuery.isFetchingNextPage}
                    onClick={() => void feedQuery.fetchNextPage()}
                  >
                    {feedQuery.isFetchingNextPage ? "Loading more posts…" : "Load more posts"}
                  </GradientButton>
                ) : (
                  <p className="text-[13px] font-semibold text-subtle">You're all caught up ✨</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
          <div className="mt-6 space-y-3 px-4">
        <HomeToolsStrip />
        <TutorialPrompt />
      </div>
    </AppShell>
  );
}

/** Soft placeholder cards while the feed loads. */
function FeedSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:gap-4" role="status" aria-label="Loading posts">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="k-card flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <div className="size-10 animate-pulse rounded-full bg-surface-alt" />
            <div className="h-3.5 w-32 animate-pulse rounded-full bg-surface-alt" />
          </div>
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-surface-alt" />
          <div className="h-3 w-full animate-pulse rounded-full bg-surface-alt" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-surface-alt" />
        </div>
      ))}
    </div>
  );
}
