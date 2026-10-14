import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { api } from "@/api/endpoints";
import type { FeedPost, HomeOverview } from "@/api/models";
import type { CommunityCardData, FeedTab } from "@/api/types";
import { PostCard } from "@/components/PostCard";
import {HomeToolsStrip} from '@/components/HomeToolsStrip';
import { TutorialPrompt } from '@/components/TutorialPrompt';
import { afterCheckIn } from "@/components/home/homeData";
import { CommunityRow, CreatorRow, HomeHero, HomeSection, HomeSkeleton, StreakAndEvent } from "@/components/home/HomeSections";
import { AppHeader, CategoryChips, SectionHeader, TabsUnderline } from "@/components/k";
import { EmptyState, ErrorState, Loading, SkeletonList, useTabBarSpace } from "@/components/ui";
import { showError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";

/**
 * Home (mockup 03-home): header, hero banners, category chips (they filter the cards below), Recommended and
 * Trending communities, Daily Streak + Live Event, Featured Creators, then "Your feed" with three tabs
 * (For You / Following / Communities) that loads more posts as you scroll.
 */

const FEED_TABS: { key: FeedTab; label: string; icon: "sparkles-outline" | "people-outline" | "planet-outline" }[] = [
  { key: "forYou", label: "For You", icon: "sparkles-outline" },
  { key: "following", label: "Following", icon: "people-outline" },
  { key: "communities", label: "Communities", icon: "planet-outline" },
];

const FEED_EMPTY: Record<FeedTab, { title: string; body: string; action: { label: string; href: string } }> = {
  forYou: { title: "Your feed is quiet", body: "Join a few communities and their posts will show up here.", action: { label: "Find communities", href: "/explore" } },
  following: { title: "No posts from people you follow", body: "Follow creators you like to see their posts here.", action: { label: "Find people", href: "/explore?search=1" } },
  communities: { title: "Nothing new in your communities", body: "Join communities to see their newest posts here.", action: { label: "Explore communities", href: "/explore" } },
};

export default function Home() {
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const list = useRef<FlatList<FeedPost>>(null);
  const [category, setCategory] = useState("forYou");
  const [tab, setTab] = useState<FeedTab>("forYou");
  const [busy, setBusy] = useState<string | null>(null);

  const interest = category === "forYou" ? undefined : category;
  const overview = useQuery({
    queryKey: ["homeOverview", interest ?? "forYou"],
    queryFn: () => api.homeOverview(interest),
    // Keep showing the last cards while another category loads, so the screen doesn't jump.
    placeholderData: keepPreviousData,
  });
  const feed = useInfiniteQuery({
    queryKey: ["feed", tab],
    queryFn: ({ pageParam }) => api.feed(tab, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
  });

  // Changes every cached copy of the Home cards (all categories) at once, so the screen updates straight away.
  const patchOverview = (change: (o: HomeOverview) => HomeOverview) =>
    queryClient.setQueriesData<HomeOverview>({ queryKey: ["homeOverview"] }, (old) => (old ? change(old) : old));
  const patchCommunity = (slug: string, joined: boolean) =>
    patchOverview((o) => {
      const fix = (c: CommunityCardData) => (c.id === slug ? { ...c, joined, memberCount: Math.max(0, c.memberCount + (joined ? 1 : -1)) } : c);
      return { ...o, recommended: o.recommended.map(fix), trending: o.trending.map(fix) };
    });

  async function toggleJoin(c: CommunityCardData) {
    // Private communities ask questions first: their page has the join form.
    if (!c.joined && c.visibility === "private") return router.push(`/community/${c.id}`);
    setBusy(c.id);
    try {
      if (c.joined) {
        await api.leave(c.id);
        patchCommunity(c.id, false);
      } else {
        const result = await api.join({ slug: c.id });
        if (result.pending) Alert.alert("Request sent", "The leaders will review your request. You'll get a notification when you're in.");
        else {
          haptic.success();
          patchCommunity(c.id, true);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function toggleFollow(userId: string) {
    setBusy(userId);
    try {
      const result = await api.followProfile(userId);
      patchOverview((o) => ({
        ...o,
        featuredCreators: o.featuredCreators.map((c) => (c.userId === userId ? { ...c, following: result.following, requested: result.requested, followers: c.followers + (result.following ? 1 : c.following ? -1 : 0) } : c)),
      }));
      if (result.requested) Alert.alert("Request sent", "This account is private. You'll see their posts once they accept.");
      void queryClient.invalidateQueries({ queryKey: ["feed", "following"] });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function checkIn() {
    const streak = overview.data?.streak;
    if (!streak || streak.checkedInToday) return;
    setBusy("checkin");
    patchOverview((o) => ({ ...o, streak: afterCheckIn(o.streak) }));
    try {
      await api.checkIn();
      haptic.success();
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
    }
  }

  async function rsvp() {
    const event = overview.data?.liveEvent;
    if (!event) return;
    setBusy("rsvp");
    try {
      await api.rsvp(event.communityId, event.id);
      patchOverview((o) =>
        o.liveEvent && o.liveEvent.id === event.id
          ? { ...o, liveEvent: { ...o.liveEvent, going: !event.going, rsvpCount: Math.max(0, event.rsvpCount + (event.going ? -1 : 1)) } }
          : o,
      );
      if (!event.going) haptic.success();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  const data = overview.data;
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  // A post can show up on two pages if new ones arrive while scrolling: keep the first copy.
  const seen = new Set<number>();
  const uniquePosts = posts.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const empty = FEED_EMPTY[tab];

  const header = (
    <View style={{ gap: 10, paddingBottom: 12 }}>
      <AppHeader onLogoPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} />
      <HomeToolsStrip/>
      <TutorialPrompt />
      {data ? (
        <>
          <HomeHero heroes={data.heroes} />
          <CategoryChips
            value={category}
            onChange={(key) => (key === "more" ? router.push("/explore") : setCategory(key))}
            style={{ marginTop: -4, marginBottom: -2 }}
          />
          {data.recommended.length ? (
            <HomeSection emoji="✨" title="Recommended for You" onSeeAll={() => router.push("/explore")}>
              <CommunityRow communities={data.recommended} variant="vertical" busy={busy} onJoin={(c) => void toggleJoin(c)} />
            </HomeSection>
          ) : (
            <View style={{ paddingHorizontal: 16 }}>
              <EmptyState icon="planet-outline" title="Nothing here yet" body="No communities in this category yet. Try another one or start your own." action={{ label: "Create a community", onPress: () => router.push("/new-community") }} />
            </View>
          )}
          {data.trending.length ? (
            <HomeSection emoji="🔥" title="Trending Communities" onSeeAll={() => router.push("/explore")}>
              <CommunityRow communities={data.trending} variant="compact" busy={busy} />
            </HomeSection>
          ) : null}
          <StreakAndEvent streak={data.streak} event={data.liveEvent} checkingIn={busy === "checkin"} onCheckIn={() => void checkIn()} rsvpBusy={busy === "rsvp"} onRsvp={() => void rsvp()} />
          {data.featuredCreators.length ? (
            <HomeSection emoji="⭐" title="Featured Creators" onSeeAll={() => router.push("/explore?search=1")}>
              <CreatorRow creators={data.featuredCreators} busy={busy} onFollow={(id) => void toggleFollow(id)} />
            </HomeSection>
          ) : null}
        </>
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <HomeSkeleton />
      )}

      <View style={{ gap: 6, marginTop: 6 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <SectionHeader emoji="💜" title="Your feed" />
        </View>
        <TabsUnderline tabs={FEED_TABS} value={tab} onChange={(k) => setTab(k as FeedTab)} style={{ marginHorizontal: 16 }} />
      </View>
    </View>
  );

  return (
    <FlatList
      ref={list}
      data={uniquePosts}
      keyExtractor={(p) => String(p.id)}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <PostCard post={item} showCommunity index={Math.min(index, 6)} />
        </View>
      )}
      contentContainerStyle={{ paddingBottom: tabSpace + 16 }}
      onEndReached={() => {
        if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshing={overview.isRefetching && !overview.isPlaceholderData}
      onRefresh={() => {
        void overview.refetch();
        void feed.refetch();
        void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      }}
      ListFooterComponent={feed.isFetchingNextPage ? <Loading label="Loading more posts…" /> : null}
      ListEmptyComponent={
        <View style={{ paddingHorizontal: 16 }}>
          {feed.isPending ? (
            <SkeletonList />
          ) : feed.isError ? (
            <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
          ) : (
            <EmptyState icon="newspaper-outline" title={empty.title} body={empty.body} action={{ label: empty.action.label, onPress: () => router.push(empty.action.href as never) }} />
          )}
        </View>
      }
    />
  );
}
