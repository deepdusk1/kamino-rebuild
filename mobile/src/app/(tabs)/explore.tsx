// ===== FILE: mobile/src/app/(tabs)/explore.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import type { ExploreOverview, HomeOverview } from "@/api/models";
import { platform } from "@/api/platform-v9";
import type { CommunityCardData, CreatorCard, HallEvent } from "@/api/types";
import {
  FilterSheet,
  RecentSearches,
  SearchResults,
} from "@/components/community/ExploreSearch";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  cleanTag,
  type SearchFilters,
} from "@/components/community/helpers";
import { serverImage } from "@/components/community/media";
import { notify } from "@/components/community/platform";
import {
  AppHeader,
  EmptyHint,
  GradientButton,
  JoinButton,
  Picture,
  PersonAvatar,
  SectionHeader,
  VerifiedTick,
} from "@/components/k";
import {
  ErrorState,
  Field,
  PressableScale,
  Sheet,
  SkeletonList,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { defaultCover, heroArt, interestArt } from "@/lib/brandArt";
import { errorMessage, showError } from "@/lib/errors";
import { compactNumber } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useDebounced } from "@/lib/useDebounced";
import { font, joinColor, radius, shadow, useTheme, type Tone } from "@/theme";

type DiscoverTab = "trending" | "fandoms" | "creators" | "events" | "aiPicks";

const DISCOVER_TABS: readonly { key: DiscoverTab; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "fandoms", label: "Fandoms" },
  { key: "creators", label: "Creators" },
  { key: "events", label: "Events" },
  { key: "aiPicks", label: "AI Picks" },
];

type MoodPreset = {
  key: string;
  label: string;
  emoji: string;
  tone: Tone;
  category: string;
  prompt: string;
};

const MOOD_ITEMS: readonly MoodPreset[] = [
  {
    key: "feelGood",
    label: "Feel Good",
    emoji: "☀️",
    tone: "yellow",
    category: "pets",
    prompt: "uplifting, cozy and feel-good communities",
  },
  {
    key: "chill",
    label: "Chill",
    emoji: "🌙",
    tone: "violet",
    category: "music",
    prompt: "chill late-night music, lo-fi and hangout communities",
  },
  {
    key: "hype",
    label: "Hype",
    emoji: "🔥",
    tone: "orange",
    category: "gaming",
    prompt: "high-energy anime, gaming and competitive hype communities",
  },
  {
    key: "wholesome",
    label: "Wholesome",
    emoji: "💗",
    tone: "pink",
    category: "art",
    prompt: "kind, supportive art and wholesome creative fandoms",
  },
  {
    key: "emotional",
    label: "Emotional",
    emoji: "🌧️",
    tone: "blue",
    category: "writing",
    prompt: "storytelling, emotional anime and deep lore communities",
  },
  {
    key: "discover",
    label: "Discover",
    emoji: "⭐",
    tone: "yellow",
    category: "forYou",
    prompt: "hidden gem communities and rising fandoms",
  },
];

const RING_COLORS: readonly [string, string][] = [
  ["#EC4899", "#8B5CF6"],
  ["#3B82F6", "#8B5CF6"],
  ["#F43F5E", "#EC4899"],
  ["#F59E0B", "#EC4899"],
  ["#06B6D4", "#8B5CF6"],
];

const MONTHS_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

type JoinCommunityRpcResult = {
  pending?: boolean;
  joined?: boolean;
};

type ListEventsRpcResult = {
  community?: {
    id: string;
    name: string;
    cover: string | null;
    hue?: number;
  };
  events: HallEvent[];
};

type CommunityRankEntry = {
  userId: string;
  nickname: string;
  handle: string;
  hue: number;
  avatarV: number;
  role: string;
  rep: number;
  weekPosts: number;
  weekLikes: number;
  weekScore: number;
};

type CommunityRankRpcResult = {
  rank: CommunityRankEntry[];
};

type AiAssistantRpcResult = {
  text: string;
};

/**
 * Explore & Discover Screen — Pixel-faithful to Mockup 9 (Explore & Discover):
 * - Top AppHeader with gift/rewards action, notification bell, and profile avatar
 * - Search bar with inline `✨ AI` button + filter sliders button (or full search view)
 * - 5 horizontal tabs: Trending · Fandoms · Creators · Events · AI Picks
 * - Popular Communities portrait cards with color-cycled Join buttons wired to `rpc("joinCommunity", ...)` / `api.leave`
 * - "Discover with AI BETA" card wired to `rpc("aiAssistant", { task: "discover", text })` (`platform.ai("discover", ...)`)
 * - "Explore by Mood" 6 pastel rounded tiles (Feel Good, Chill, Hype, Wholesome, Emotional, Discover)
 * - "Trending Challenges" horizontal cards with `#Tag` + `🔥 X.XK posts`
 * - "Featured Creators" circular gradient-ring avatars (combining `homeOverview.featuredCreators` and `rpc("communityRank", ...)` top members)
 * - "Upcoming Fan Events" horizontal cards wired to `rpc("listEvents", { slug })` (`api.events`) with date badge, location, interested count, and bookmark RSVP (`api.rsvp`)
 * - Skeleton shimmer loading states and illustrated empty states
 */
export default function Explore() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const scroller = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{ q?: string; search?: string }>();

  const [query, setQuery] = useState(params.q ?? "");
  const [searching, setSearching] = useState(
    Boolean(params.q) || params.search === "1",
  );
  const [focusKey, setFocusKey] = useState(params.search === "1" ? 1 : 0);
  const [activeTab, setActiveTab] = useState<DiscoverTab>("trending");
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Discover with AI sheet state
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [aiMoodInput, setAiMoodInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Sync deep-link query params (`?q=#tag` or `?search=1`)
  const incomingKey = `${params.q ?? ""}|${params.search ?? ""}`;
  const [handledKey, setHandledKey] = useState(incomingKey);
  if (incomingKey !== handledKey) {
    setHandledKey(incomingKey);
    if (params.q) setQuery(params.q);
    if (params.q || params.search === "1") setSearching(true);
    if (params.search === "1") setFocusKey((k) => k + 1);
  }

  useEffect(() => {
    if (params.q || params.search) {
      router.setParams({ q: undefined, search: undefined });
    }
  }, [params.q, params.search]);

  const activeMoodObj = MOOD_ITEMS.find((m) => m.key === selectedMood);
  const categoryKey =
    activeMoodObj && activeMoodObj.category !== "forYou"
      ? activeMoodObj.category
      : undefined;

  // 1. Explore Overview (Recommended, Growing, Newest, Joined, Trending Tags)
  const overview = useQuery({
    queryKey: ["exploreOverview", categoryKey ?? "forYou"],
    queryFn: () => api.exploreOverview(categoryKey),
    placeholderData: keepPreviousData,
  });

  // 2. Home Overview (Featured Creators, Live Event, Heroes)
  const homeOverview = useQuery({
    queryKey: ["homeOverview", categoryKey ?? "forYou"],
    queryFn: () => api.homeOverview(categoryKey),
    placeholderData: keepPreviousData,
  });

  // 3. Discovery Hub (Platform events & related communities)
  const hub = useQuery({
    queryKey: ["discoveryHub", "", ""],
    queryFn: () => platform.hub({}),
    staleTime: 60_000,
  });

  const primarySlug =
    overview.data?.recommended[0]?.id ??
    overview.data?.joined[0]?.id ??
    homeOverview.data?.recommended[0]?.id ??
    null;

  // 4. Upcoming Fan Events via exact `listEvents` RPC (`api.events`)
  const communityEvents = useQuery({
    queryKey: ["events", primarySlug],
    queryFn: async (): Promise<ListEventsRpcResult> => {
      if (!primarySlug) return { events: [] };
      try {
        return await rpc<ListEventsRpcResult>("listEvents", {
          slug: primarySlug,
        });
      } catch {
        return await api.events(primarySlug);
      }
    },
    enabled: Boolean(primarySlug),
    staleTime: 60_000,
  });

  // 5. Community Leaderboard top contributors via exact `communityRank` RPC (`api.board`)
  const topCommunityRank = useQuery({
    queryKey: ["rank", primarySlug, "activity", "week"],
    queryFn: async (): Promise<CommunityRankRpcResult> => {
      if (!primarySlug) return { rank: [] };
      try {
        return await rpc<CommunityRankRpcResult>("communityRank", {
          slug: primarySlug,
          metric: "activity",
          window: "week",
        });
      } catch {
        return await api.board(primarySlug, "activity", "week");
      }
    },
    enabled: Boolean(primarySlug),
    staleTime: 60_000,
  });

  const term = useDebounced(query.trim(), 350);
  const filterCount = activeFilterCount(filters);
  const showResults =
    term.replace(/^#/, "").length >= 2 || (!term && filterCount > 0);

  const startSearch = () => {
    setSearching(true);
    setFocusKey((k) => k + 1);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };

  const stopSearch = () => {
    Keyboard.dismiss();
    setQuery("");
    setFilters(DEFAULT_FILTERS);
    setSearching(false);
  };

  const pickQuery = (q: string) => {
    setQuery(q);
    setSearching(true);
    Keyboard.dismiss();
  };

  const browseAll = (sort: SearchFilters["sort"] = "trending") => {
    setQuery("");
    setFilters({ ...DEFAULT_FILTERS, category: categoryKey ?? "", sort });
    setSearching(true);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };

  // Optimistic patch across both exploreOverview and homeOverview caches
  const patchCommunityEverywhere = (slug: string, joined: boolean) => {
    queryClient.setQueriesData<ExploreOverview>(
      { queryKey: ["exploreOverview"] },
      (old) => {
        if (!old) return old;
        const fix = (c: CommunityCardData): CommunityCardData =>
          c.id === slug
            ? {
                ...c,
                joined,
                memberCount: Math.max(0, c.memberCount + (joined ? 1 : -1)),
              }
            : c;
        return {
          ...old,
          recommended: old.recommended.map(fix),
          newest: old.newest.map(fix),
          growing: old.growing.map(fix),
          joined: old.joined.map(fix),
        };
      },
    );
    queryClient.setQueriesData<HomeOverview>(
      { queryKey: ["homeOverview"] },
      (old) => {
        if (!old) return old;
        const fix = (c: CommunityCardData): CommunityCardData =>
          c.id === slug
            ? {
                ...c,
                joined,
                memberCount: Math.max(0, c.memberCount + (joined ? 1 : -1)),
              }
            : c;
        return {
          ...old,
          recommended: old.recommended.map(fix),
          trending: old.trending.map(fix),
        };
      },
    );
  };

  /**
   * Joins or leaves a community, wired directly to `rpc("joinCommunity", { slug })`.
   */
  async function toggleJoin(c: CommunityCardData): Promise<void> {
    if (!c.joined && c.visibility === "private") {
      router.push(`/community/${c.id}`);
      return;
    }
    setBusyKey(`join:${c.id}`);
    try {
      if (c.joined) {
        await api.leave(c.id);
        patchCommunityEverywhere(c.id, false);
      } else {
        const result = await rpc<JoinCommunityRpcResult>("joinCommunity", {
          slug: c.id,
        });
        if (result.pending) {
          notify(
            "Request sent",
            "The leaders will review your request. You'll get a notification when you're in.",
          );
        } else {
          haptic.success();
          patchCommunityEverywhere(c.id, true);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["exploreOverview"] });
    } catch (error) {
      showError(error);
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleFollow(creator: CreatorCard): Promise<void> {
    setBusyKey(`follow:${creator.userId}`);
    try {
      const result = await api.followProfile(creator.userId);
      queryClient.setQueriesData<HomeOverview>(
        { queryKey: ["homeOverview"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            featuredCreators: old.featuredCreators.map((c) =>
              c.userId === creator.userId
                ? {
                    ...c,
                    following: result.following,
                    requested: result.requested,
                    followers: Math.max(
                      0,
                      c.followers +
                        (result.following ? 1 : c.following ? -1 : 0),
                    ),
                  }
                : c,
            ),
          };
        },
      );
      if (result.requested) {
        notify(
          "Request sent",
          "This account is private. You'll see their posts once they accept.",
        );
      } else if (result.following) {
        haptic.success();
      }
      void queryClient.invalidateQueries({ queryKey: ["feed", "following"] });
    } catch (error) {
      showError(error);
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleEventRsvp(slug: string, eventId: number): Promise<void> {
    if (!slug || !eventId) return;
    setBusyKey(`rsvp:${eventId}`);
    try {
      await api.rsvp(slug, eventId);
      haptic.success();
      void queryClient.invalidateQueries({ queryKey: ["events", slug] });
      void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["discoveryHub"] });
    } catch (error) {
      showError(error);
    } finally {
      setBusyKey(null);
    }
  }

  /**
   * Executes the "Discover with AI" recommendation task via `rpc("aiAssistant", { task: "discover", text })`.
   */
  async function runAiDiscover(customPrompt?: string): Promise<void> {
    const promptText =
      (customPrompt ?? aiMoodInput).trim() ||
      activeMoodObj?.prompt ||
      "Recommend vibrant communities, fandoms, and creators based on my interests and current mood.";
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
        task: "discover",
        text: promptText,
      });
      setAiResult(res.text);
    } catch (err) {
      try {
        const fallback = await platform.ai("discover", promptText);
        setAiResult(fallback.text);
      } catch {
        setAiError(errorMessage(err));
      }
    } finally {
      setAiBusy(false);
    }
  }

  // Compute Popular Communities list according to selected tab
  const popularCommunities = useMemo((): CommunityCardData[] => {
    const data = overview.data;
    if (!data) return [];
    if (activeTab === "fandoms") {
      return [...data.growing, ...data.recommended].filter(
        (c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx,
      );
    }
    if (activeTab === "aiPicks") {
      return [...data.recommended, ...data.newest].filter(
        (c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx,
      );
    }
    return [...data.recommended, ...data.growing].filter(
      (c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx,
    );
  }, [overview.data, activeTab]);

  // Compute Trending Challenges from trending tags + any challenge events from `listEvents`
  const trendingChallenges = useMemo(() => {
    const tags = overview.data?.trendingTags ?? [];
    const challengeEvents = (communityEvents.data?.events ?? []).filter(
      (e) => e.kind === "challenge",
    );
    const items: {
      key: string;
      tag: string;
      count: number;
      art: number;
      href?: string;
    }[] = [];

    challengeEvents.forEach((ev, idx) => {
      items.push({
        key: `ev-${ev.id}`,
        tag: `#${ev.title.replace(/\s+/g, "")}`,
        count: Math.max(1, ev.entryCount || ev.rsvpCount),
        art: idx,
        href: `/community/${ev.communityId}/events`,
      });
    });

    tags.forEach((t, idx) => {
      const cleaned = cleanTag(t.tag);
      if (!cleaned) return;
      items.push({
        key: `tag-${cleaned}`,
        tag: `#${cleaned}`,
        count: t.count,
        art: idx + challengeEvents.length,
      });
    });

    return items.slice(0, 8);
  }, [overview.data?.trendingTags, communityEvents.data?.events]);

  // Compute Featured Creators combining `homeOverview.featuredCreators` and `communityRank` leaders
  const creators = useMemo((): CreatorCard[] => {
    const base = homeOverview.data?.featuredCreators ?? [];
    const seen = new Set<string>(base.map((c) => c.userId));
    const merged: CreatorCard[] = [...base];

    for (const entry of topCommunityRank.data?.rank ?? []) {
      if (seen.has(entry.userId)) continue;
      seen.add(entry.userId);
      merged.push({
        userId: entry.userId,
        handle: entry.handle,
        displayName: entry.nickname,
        avatarHue: entry.hue,
        avatarV: entry.avatarV,
        verified: entry.role === "leader" || entry.role === "agent",
        headline: `${compactNumber(entry.rep)} rep`,
        followers: entry.weekLikes,
        following: false,
        requested: false,
      });
    }
    return merged;
  }, [homeOverview.data?.featuredCreators, topCommunityRank.data?.rank]);

  // Compute Upcoming Fan Events combining `listEvents`, `homeOverview.liveEvent`, and `hub.events`
  const fanEvents = useMemo(() => {
    const list: {
      id: number;
      slug: string;
      title: string;
      startsAt: string;
      location: string;
      interested: number;
      going: boolean;
      hue: number;
      cover: string | null;
    }[] = [];
    const seen = new Set<number>();

    const liveEv = homeOverview.data?.liveEvent;
    if (liveEv && !seen.has(liveEv.id)) {
      seen.add(liveEv.id);
      list.push({
        id: liveEv.id,
        slug: liveEv.communityId,
        title: liveEv.title,
        startsAt: liveEv.startsAt,
        location: liveEv.communityName || "Online Community Event",
        interested: liveEv.rsvpCount,
        going: liveEv.going,
        hue: liveEv.communityHue ?? 260,
        cover: liveEv.communityCover || null,
      });
    }

    (communityEvents.data?.events ?? []).forEach((ev: HallEvent, idx) => {
      if (seen.has(ev.id)) return;
      seen.add(ev.id);
      list.push({
        id: ev.id,
        slug: ev.communityId,
        title: ev.title,
        startsAt: ev.startsAt,
        location:
          communityEvents.data?.community?.name || "Community Event Hall",
        interested: ev.rsvpCount,
        going: ev.going,
        hue: (idx * 55 + 220) % 360,
        cover: communityEvents.data?.community?.cover ?? null,
      });
    });

    (hub.data?.events ?? []).forEach((row, idx) => {
      const id = Number(row.id);
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({
        id,
        slug: String(row.community_id ?? ""),
        title: String(row.title ?? "Community Fan Event"),
        startsAt: String(row.starts_at ?? new Date().toISOString()),
        location: String(row.location || row.community_name || "Online"),
        interested: Number(row.rsvp_count ?? 120),
        going: false,
        hue: (idx * 65 + 280) % 360,
        cover: null,
      });
    });

    return list;
  }, [
    homeOverview.data?.liveEvent,
    communityEvents.data,
    hub.data?.events,
  ]);

  const isInitialLoading = overview.isPending && !overview.data;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        ref={scroller}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: tabSpace + 20 }}
        refreshControl={
          <RefreshControl
            refreshing={
              overview.isRefetching && !overview.isPlaceholderData
            }
            onRefresh={() => {
              void overview.refetch();
              void homeOverview.refetch();
              void hub.refetch();
              if (primarySlug) {
                void communityEvents.refetch();
                void topCommunityRank.refetch();
              }
            }}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {/* Top AppHeader: Kamino logo + gift/referral icon, notification bell, profile avatar */}
        <AppHeader
          actions={[
            {
              key: "gift",
              icon: "gift-outline",
              label: "Rewards & Referrals",
              onPress: () => router.push("/operations"),
            },
            "bell",
            "avatar",
          ]}
        />

        {/* Search Bar + Inline ✨ AI Button + Filter Sliders Button (Mockup 9) */}
        <View style={styles.searchBarRow}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: theme.surface,
                borderColor: searching ? theme.accent : theme.border,
              },
              shadow.card,
            ]}
          >
            <Ionicons name="search-outline" size={19} color={theme.muted} />
            <TextInput
              key={focusKey}
              autoFocus={focusKey > 0}
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                if (text) setSearching(true);
              }}
              onFocus={() => setSearching(true)}
              onSubmitEditing={() => {
                Keyboard.dismiss();
                if (query.trim().length >= 2) {
                  router.push({
                    pathname: "/search",
                    params: { q: query.trim() },
                  });
                }
              }}
              placeholder="Search communities, fans, posts, or creators…"
              placeholderTextColor={theme.subtle}
              returnKeyType="search"
              autoCorrect={false}
              selectionColor={theme.accent}
              accessibilityLabel="Search communities, fans, posts, or creators"
              style={[styles.searchInput, { color: theme.ink }]}
            />
            {query ? (
              <PressableScale
                onPress={() => setQuery("")}
                accessibilityLabel="Clear search"
                hitSlop={8}
                scaleTo={0.88}
              >
                <Ionicons
                  name="close-circle"
                  size={19}
                  color={theme.subtle}
                />
              </PressableScale>
            ) : null}

            {/* Inline ✨ AI Pill Button inside the search bar */}
            <PressableScale
              onPress={() => {
                setAiSheetOpen(true);
                if (!aiResult && !aiBusy) {
                  void runAiDiscover(query.trim() || undefined);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Ask AI Discovery Assistant"
              hitSlop={6}
              scaleTo={0.93}
              style={[
                styles.aiSearchPill,
                { backgroundColor: theme.tints.violet },
              ]}
            >
              <Ionicons name="sparkles" size={13} color={theme.violet} />
              <Txt
                style={{
                  fontFamily: font.heavy,
                  fontSize: 12,
                  lineHeight: 15,
                  color: theme.toneText.violet,
                }}
              >
                AI
              </Txt>
            </PressableScale>
          </View>

          {/* Filter Sliders Circle Button */}
          <PressableScale
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={
              filterCount > 0 ? `Filters (${filterCount} active)` : "Filters"
            }
            scaleTo={0.92}
            style={[
              styles.filterCircleBtn,
              {
                backgroundColor: theme.surface,
                borderColor: filterCount > 0 ? theme.violet : theme.border,
              },
              shadow.card,
            ]}
          >
            <Ionicons name="options-outline" size={20} color={theme.ink} />
            {filterCount > 0 ? (
              <View
                style={[
                  styles.filterActiveDot,
                  { backgroundColor: theme.violet },
                ]}
              />
            ) : null}
          </PressableScale>

          {searching ? (
            <PressableScale
              onPress={stopSearch}
              accessibilityRole="button"
              accessibilityLabel="Cancel search"
              hitSlop={8}
              scaleTo={0.94}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 13.5,
                  color: theme.accent,
                }}
              >
                Cancel
              </Txt>
            </PressableScale>
          ) : null}
        </View>

        {/* Active Search Results View vs Explore & Discover View */}
        {searching ? (
          <View style={{ marginTop: 12 }}>
            {showResults ? (
              <SearchResults
                term={term}
                filters={filters}
                onPickQuery={pickQuery}
              />
            ) : (
              <RecentSearches
                tags={overview.data?.trendingTags ?? []}
                onPick={pickQuery}
              />
            )}
          </View>
        ) : (
          <>
            {/* 5 Filter Tabs: Trending · Fandoms · Creators · Events · AI Picks */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {DISCOVER_TABS.map((t) => {
                const selected = activeTab === t.key;
                return (
                  <PressableScale
                    key={t.key}
                    onPress={() => {
                      haptic.tap();
                      setActiveTab(t.key);
                      if (t.key === "aiPicks" && !aiResult && !aiBusy) {
                        void runAiDiscover();
                      }
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t.label}
                    scaleTo={0.95}
                    style={[
                      styles.tabPill,
                      {
                        backgroundColor: selected
                          ? "transparent"
                          : theme.surface,
                        borderColor: selected ? "transparent" : theme.border,
                      },
                      selected ? shadow.glow(theme.violet, 0.3) : null,
                    ]}
                  >
                    {selected ? (
                      <LinearGradient
                        colors={theme.gradPrimary}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={[
                          StyleSheet.absoluteFill,
                          { borderRadius: radius.pill },
                        ]}
                      />
                    ) : null}
                    <Txt
                      style={{
                        fontFamily: selected ? font.bold : font.semibold,
                        fontSize: 13,
                        lineHeight: 17,
                        color: selected ? "#FFFFFF" : theme.ink,
                      }}
                    >
                      {t.label}
                    </Txt>
                  </PressableScale>
                );
              })}
            </ScrollView>

            {isInitialLoading ? (
              <ExploreShimmerSkeleton />
            ) : overview.isError || !overview.data ? (
              <ErrorState
                error={overview.error}
                onRetry={() => void overview.refetch()}
              />
            ) : (
              <View style={{ gap: 16, marginTop: 4 }}>
                {/* 1. Popular Communities Section */}
                {activeTab !== "creators" && activeTab !== "events" ? (
                  <View style={{ gap: 8 }}>
                    <SectionHeader
                      title={
                        activeTab === "fandoms"
                          ? "Top Fandoms"
                          : activeTab === "aiPicks"
                            ? "AI Picks for You"
                            : "Popular Communities"
                      }
                      onAction={() =>
                        browseAll(
                          activeTab === "fandoms" ? "growing" : "trending",
                        )
                      }
                      actionIcon="chevron"
                      style={{ paddingHorizontal: 16 }}
                    />
                    {popularCommunities.length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{
                          paddingHorizontal: 16,
                          gap: 10,
                          paddingVertical: 2,
                        }}
                      >
                        {popularCommunities.slice(0, 10).map((c, idx) => (
                          <PopularCommunityPortraitCard
                            key={c.id}
                            community={c}
                            index={idx}
                            busy={busyKey === `join:${c.id}`}
                            onPress={() => router.push(`/community/${c.id}`)}
                            onJoin={() => void toggleJoin(c)}
                          />
                        ))}
                      </ScrollView>
                    ) : (
                      <EmptyHint
                        emoji="🌌"
                        title="No communities in this mood yet"
                        text="Be the pioneer and launch the first community for this topic!"
                        actionLabel="Create a Community"
                        onAction={() => router.push("/new-community")}
                        style={{ marginHorizontal: 16 }}
                      />
                    )}
                  </View>
                ) : null}

                {/* 2. "Discover with AI BETA" Banner Card (Mockup 9) */}
                <View style={{ paddingHorizontal: 16 }}>
                  <LinearGradient
                    colors={theme.gradAiCard}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.aiBannerCard,
                      { borderColor: theme.border },
                      shadow.card,
                    ]}
                  >
                    {/* Stylized AI Bot Avatar */}
                    <View
                      style={[
                        styles.aiBotCircle,
                        { backgroundColor: theme.surface },
                      ]}
                    >
                      <View style={styles.aiBotAntenna} />
                      <View style={styles.aiBotVisor}>
                        <View style={styles.aiBotEye} />
                        <View style={styles.aiBotEye} />
                      </View>
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Txt
                          style={{
                            fontFamily: font.heavy,
                            fontSize: 15,
                            lineHeight: 19,
                            color: theme.ink,
                          }}
                        >
                          Discover with AI
                        </Txt>
                        <LinearGradient
                          colors={["#A855F7", "#EC4899"]}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={styles.betaBadge}
                        >
                          <Txt style={styles.betaBadgeText}>BETA</Txt>
                        </LinearGradient>
                      </View>
                      <Txt
                        numberOfLines={2}
                        style={{
                          fontFamily: font.regular,
                          fontSize: 11.5,
                          lineHeight: 15.5,
                          color: theme.muted,
                        }}
                      >
                        Get personalized fandom recommendations based on your
                        interests, activity, and mood.
                      </Txt>
                    </View>

                    <PressableScale
                      onPress={() => {
                        setAiSheetOpen(true);
                        if (!aiResult && !aiBusy) {
                          void runAiDiscover();
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Explore for Me with AI"
                      scaleTo={0.95}
                      style={[
                        styles.exploreForMeBtn,
                        shadow.glow(theme.violet, 0.32),
                      ]}
                    >
                      <LinearGradient
                        colors={theme.gradHero}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={[
                          StyleSheet.absoluteFill,
                          { borderRadius: radius.pill },
                        ]}
                      />
                      <Ionicons name="sparkles" size={13} color="#FFFFFF" />
                      <Txt
                        style={{
                          fontFamily: font.bold,
                          fontSize: 12,
                          lineHeight: 15,
                          color: "#FFFFFF",
                        }}
                      >
                        Explore for Me
                      </Txt>
                      <Ionicons
                        name="chevron-forward"
                        size={13}
                        color="#FFFFFF"
                      />
                    </PressableScale>
                  </LinearGradient>
                </View>

                {/* 3. Explore by Mood (6 Pastel Tiles) */}
                <View style={{ gap: 8 }}>
                  <SectionHeader
                    title="Explore by Mood"
                    onAction={() => {
                      setSelectedMood(null);
                      setAiSheetOpen(true);
                      void runAiDiscover();
                    }}
                    actionIcon="chevron"
                    style={{ paddingHorizontal: 16 }}
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                      paddingHorizontal: 16,
                      gap: 8,
                    }}
                  >
                    {MOOD_ITEMS.map((mood) => {
                      const active = selectedMood === mood.key;
                      return (
                        <PressableScale
                          key={mood.key}
                          onPress={() => {
                            haptic.tap();
                            if (mood.key === "discover") {
                              setSelectedMood(null);
                              return;
                            }
                            setSelectedMood(active ? null : mood.key);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`Mood: ${mood.label}`}
                          scaleTo={0.94}
                          style={[
                            styles.moodTile,
                            {
                              backgroundColor: theme.tints[mood.tone],
                              borderColor: active
                                ? theme[mood.tone]
                                : theme.border,
                              borderWidth: active ? 2 : 1,
                            },
                          ]}
                        >
                          <Txt style={{ fontSize: 22, lineHeight: 26 }}>
                            {mood.emoji}
                          </Txt>
                          <Txt
                            numberOfLines={1}
                            style={{
                              fontFamily: active ? font.heavy : font.bold,
                              fontSize: 11,
                              lineHeight: 14,
                              color: theme.ink,
                            }}
                          >
                            {mood.label}
                          </Txt>
                        </PressableScale>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* 4. Trending Challenges */}
                <View style={{ gap: 8 }}>
                  <SectionHeader
                    title="Trending Challenges"
                    onAction={startSearch}
                    actionIcon="chevron"
                    style={{ paddingHorizontal: 16 }}
                  />
                  {trendingChallenges.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{
                        paddingHorizontal: 16,
                        gap: 10,
                      }}
                    >
                      {trendingChallenges.map((ch, idx) => {
                        const coverSrc =
                          idx % 3 === 0
                            ? heroArt["explore-1"]
                            : idx % 3 === 1
                              ? interestArt.art
                              : interestArt.kpop;
                        return (
                          <PressableScale
                            key={ch.key}
                            onPress={() => {
                              if (ch.href) {
                                router.push(ch.href as never);
                              } else {
                                pickQuery(ch.tag);
                              }
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Challenge ${ch.tag}, ${compactNumber(ch.count)} posts`}
                            scaleTo={0.96}
                            style={[
                              styles.challengeCard,
                              { borderColor: theme.border },
                              shadow.card,
                            ]}
                          >
                            <Picture
                              source={coverSrc ?? defaultCover(idx)}
                              hue={(idx * 60 + 250) % 360}
                              style={StyleSheet.absoluteFill}
                            />
                            <LinearGradient
                              colors={[
                                "rgba(15, 11, 42, 0.05)",
                                "rgba(15, 11, 42, 0.85)",
                              ]}
                              style={StyleSheet.absoluteFill}
                            />
                            <View style={styles.challengeCardFooter}>
                              <Txt
                                numberOfLines={1}
                                style={styles.challengeTagText}
                              >
                                {ch.tag}
                              </Txt>
                              <View style={styles.challengeCountRow}>
                                <Txt style={{ fontSize: 11, lineHeight: 14 }}>
                                  🔥
                                </Txt>
                                <Txt style={styles.challengeCountText}>
                                  {compactNumber(ch.count)} posts
                                </Txt>
                              </View>
                            </View>
                          </PressableScale>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <EmptyHint
                      emoji="🔥"
                      title="No active challenges yet"
                      text="Post with a #hashtag in your community to start a trend."
                      style={{ marginHorizontal: 16 }}
                    />
                  )}
                </View>

                {/* 5. Featured Creators */}
                {activeTab !== "events" ? (
                  <View style={{ gap: 8 }}>
                    <SectionHeader
                      title="Featured Creators"
                      onAction={() => {
                        setSearching(true);
                        setFocusKey((k) => k + 1);
                      }}
                      actionIcon="chevron"
                      style={{ paddingHorizontal: 16 }}
                    />
                    {creators.length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{
                          paddingHorizontal: 16,
                          gap: 14,
                          paddingVertical: 4,
                        }}
                      >
                        {creators.map((c, idx) => {
                          const ring =
                            RING_COLORS[idx % RING_COLORS.length]!;
                          const isFollowing = c.following || c.requested;
                          const isBusy = busyKey === `follow:${c.userId}`;
                          return (
                            <PressableScale
                              key={c.userId}
                              onPress={() =>
                                router.push(`/profile/${c.handle}`)
                              }
                              accessibilityRole="button"
                              accessibilityLabel={`${c.displayName}${c.verified ? ", verified" : ""}, ${c.headline || `@${c.handle}`}`}
                              scaleTo={0.96}
                              style={styles.creatorColumn}
                            >
                              <LinearGradient
                                colors={ring}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.creatorRing}
                              >
                                <View
                                  style={[
                                    styles.creatorRingInner,
                                    { backgroundColor: theme.bg },
                                  ]}
                                >
                                  <PersonAvatar
                                    person={{
                                      name: c.displayName,
                                      hue: c.avatarHue,
                                      userId: c.userId,
                                      avatarV: c.avatarV,
                                    }}
                                    size={54}
                                  />
                                </View>
                              </LinearGradient>

                              <View style={styles.creatorNameRow}>
                                <Txt
                                  numberOfLines={1}
                                  style={{
                                    fontFamily: font.heavy,
                                    fontSize: 12.5,
                                    lineHeight: 16,
                                    color: theme.ink,
                                    maxWidth: 68,
                                  }}
                                >
                                  {c.displayName}
                                </Txt>
                                {c.verified ? (
                                  <VerifiedTick size={12} />
                                ) : null}
                              </View>

                              <Txt
                                numberOfLines={1}
                                style={{
                                  fontFamily: font.regular,
                                  fontSize: 10.5,
                                  lineHeight: 13.5,
                                  color: theme.muted,
                                  maxWidth: 78,
                                  textAlign: "center",
                                }}
                              >
                                {c.headline || `@${c.handle}`}
                              </Txt>

                              <PressableScale
                                onPress={() => void toggleFollow(c)}
                                disabled={isBusy}
                                accessibilityRole="button"
                                accessibilityLabel={
                                  isFollowing
                                    ? `Following ${c.displayName}`
                                    : `Follow ${c.displayName}`
                                }
                                hitSlop={6}
                                scaleTo={0.92}
                                style={[
                                  styles.creatorFollowPill,
                                  {
                                    backgroundColor: isFollowing
                                      ? theme.surface
                                      : theme.tints.violet,
                                    borderColor: isFollowing
                                      ? theme.border
                                      : "transparent",
                                    borderWidth: isFollowing ? 1 : 0,
                                  },
                                ]}
                              >
                                {isBusy ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={theme.violet}
                                  />
                                ) : (
                                  <Txt
                                    style={{
                                      fontFamily: font.bold,
                                      fontSize: 11.5,
                                      lineHeight: 15,
                                      color: isFollowing
                                        ? theme.muted
                                        : theme.toneText.violet,
                                    }}
                                  >
                                    {c.requested
                                      ? "Requested"
                                      : isFollowing
                                        ? "Following"
                                        : "Follow"}
                                  </Txt>
                                )}
                              </PressableScale>
                            </PressableScale>
                          );
                        })}
                      </ScrollView>
                    ) : (
                      <EmptyHint
                        emoji="⭐"
                        title="Discover creators"
                        text="Creators from communities you explore will appear here."
                        style={{ marginHorizontal: 16 }}
                      />
                    )}
                  </View>
                ) : null}

                {/* 6. Upcoming Fan Events */}
                <View style={{ gap: 8 }}>
                  <SectionHeader
                    title="Upcoming Fan Events"
                    onAction={() => {
                      if (primarySlug) {
                        router.push(`/community/${primarySlug}/events`);
                      } else {
                        browseAll("trending");
                      }
                    }}
                    actionIcon="chevron"
                    style={{ paddingHorizontal: 16 }}
                  />
                  {fanEvents.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{
                        paddingHorizontal: 16,
                        gap: 10,
                        paddingVertical: 2,
                      }}
                    >
                      {fanEvents.map((ev) => {
                        const dt = new Date(ev.startsAt);
                        const validDate = !Number.isNaN(dt.getTime());
                        const monthStr = validDate
                          ? MONTHS_SHORT[dt.getMonth()]!
                          : "OCT";
                        const dayStr = validDate
                          ? String(dt.getDate()).padStart(2, "0")
                          : "15";
                        const rsvpBusy = busyKey === `rsvp:${ev.id}`;
                        return (
                          <PressableScale
                            key={ev.id}
                            onPress={() => {
                              if (ev.slug) {
                                router.push(`/community/${ev.slug}/events`);
                              }
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${ev.title}, ${ev.location}, ${compactNumber(ev.interested)} interested`}
                            scaleTo={0.97}
                            style={[
                              styles.fanEventCard,
                              {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                              },
                              shadow.card,
                            ]}
                          >
                            <Picture
                              source={
                                ev.cover
                                  ? serverImage(ev.cover)
                                  : defaultCover(ev.hue)
                              }
                              hue={ev.hue}
                              radius={12}
                              style={styles.fanEventThumb}
                            >
                              <View
                                style={[
                                  styles.dateBadge,
                                  {
                                    backgroundColor: theme.dark
                                      ? "rgba(22, 19, 46, 0.94)"
                                      : "rgba(255, 255, 255, 0.94)",
                                  },
                                ]}
                              >
                                <Txt
                                  style={[
                                    styles.dateBadgeMonth,
                                    { color: theme.blue },
                                  ]}
                                >
                                  {monthStr}
                                </Txt>
                                <Txt
                                  style={[
                                    styles.dateBadgeDay,
                                    { color: theme.ink },
                                  ]}
                                >
                                  {dayStr}
                                </Txt>
                              </View>
                            </Picture>

                            <View style={{ flex: 1, gap: 3 }}>
                              <Txt
                                numberOfLines={1}
                                style={{
                                  fontFamily: font.heavy,
                                  fontSize: 13.5,
                                  lineHeight: 17,
                                  color: theme.ink,
                                }}
                              >
                                {ev.title}
                              </Txt>
                              <View style={styles.eventMetaRow}>
                                <Ionicons
                                  name="location-outline"
                                  size={12}
                                  color={theme.muted}
                                />
                                <Txt
                                  numberOfLines={1}
                                  style={{
                                    fontFamily: font.regular,
                                    fontSize: 11,
                                    lineHeight: 14,
                                    color: theme.muted,
                                    flex: 1,
                                  }}
                                >
                                  {ev.location}
                                </Txt>
                              </View>
                              <View style={styles.eventMetaRow}>
                                <Ionicons
                                  name="people-outline"
                                  size={12}
                                  color={theme.subtle}
                                />
                                <Txt
                                  style={{
                                    fontFamily: font.semibold,
                                    fontSize: 11,
                                    lineHeight: 14,
                                    color: theme.subtle,
                                  }}
                                >
                                  {compactNumber(ev.interested)} interested
                                </Txt>
                              </View>
                            </View>

                            <PressableScale
                              onPress={() =>
                                void toggleEventRsvp(ev.slug, ev.id)
                              }
                              disabled={rsvpBusy || !ev.slug}
                              accessibilityRole="button"
                              accessibilityLabel={
                                ev.going
                                  ? `Remove RSVP for ${ev.title}`
                                  : `Bookmark and RSVP to ${ev.title}`
                              }
                              hitSlop={10}
                              scaleTo={0.88}
                              style={styles.bookmarkBtn}
                            >
                              {rsvpBusy ? (
                                <ActivityIndicator
                                  size="small"
                                  color={theme.violet}
                                />
                              ) : (
                                <Ionicons
                                  name={
                                    ev.going ? "bookmark" : "bookmark-outline"
                                  }
                                  size={19}
                                  color={
                                    ev.going ? theme.violet : theme.muted
                                  }
                                />
                              )}
                            </PressableScale>
                          </PressableScale>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <EmptyHint
                      emoji="📅"
                      title="No upcoming fan events yet"
                      text="Community watch parties, trivia nights and meetups will appear here."
                      style={{ marginHorizontal: 16 }}
                    />
                  )}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Search Filters Sheet */}
      <FilterSheet
        visible={filtersOpen}
        value={filters}
        onApply={(f) => {
          setFilters(f);
          setSearching(true);
        }}
        onClose={() => setFiltersOpen(false)}
      />

      {/* "Discover with AI" Interactive Assistant Sheet (`rpc("aiAssistant", { task: "discover", text })`) */}
      <Sheet
        visible={aiSheetOpen}
        title="Discover with AI ✨"
        onClose={() => setAiSheetOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13.5,
            lineHeight: 19,
            color: theme.muted,
          }}
        >
          Tell Kamino’s AI what fandoms, vibes, or topics you’re in the mood
          for, and we’ll curate personalized recommendations.
        </Txt>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
        >
          {MOOD_ITEMS.map((m) => (
            <PressableScale
              key={m.key}
              onPress={() => {
                setAiMoodInput(m.prompt);
                void runAiDiscover(m.prompt);
              }}
              accessibilityLabel={`Ask AI for ${m.label}`}
              scaleTo={0.95}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 12,
                height: 32,
                borderRadius: radius.pill,
                backgroundColor: theme.tints[m.tone],
              }}
            >
              <Txt style={{ fontSize: 14 }}>{m.emoji}</Txt>
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 12,
                  color: theme.ink,
                }}
              >
                {m.label}
              </Txt>
            </PressableScale>
          ))}
        </ScrollView>

        <Field
          label="What are you in the mood for?"
          value={aiMoodInput}
          onChangeText={setAiMoodInput}
          placeholder="e.g. Cozy anime art communities, late night gaming…"
          maxLength={400}
        />

        <GradientButton
          label={aiBusy ? "Thinking…" : "Explore for Me"}
          icon="sparkles"
          gradient="hero"
          size="lg"
          full
          busy={aiBusy}
          onPress={() => void runAiDiscover()}
        />

        {aiError ? (
          <View
            style={{
              padding: 12,
              borderRadius: radius.tile,
              backgroundColor: theme.tints.red,
            }}
          >
            <Txt
              style={{
                fontFamily: font.semibold,
                fontSize: 13,
                color: theme.danger,
              }}
            >
              {aiError}
            </Txt>
          </View>
        ) : null}

        {aiResult ? (
          <View
            style={{
              padding: 14,
              borderRadius: radius.card,
              backgroundColor: theme.surfaceAi,
              borderWidth: 1,
              borderColor: theme.border,
              gap: 8,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Ionicons name="sparkles" size={16} color={theme.violet} />
              <Txt
                style={{
                  fontFamily: font.heavy,
                  fontSize: 14,
                  color: theme.toneText.violet,
                }}
              >
                AI Fandom Picks
              </Txt>
            </View>
            <Txt
              selectable
              style={{
                fontFamily: font.regular,
                fontSize: 13.5,
                lineHeight: 20,
                color: theme.ink,
              }}
            >
              {aiResult}
            </Txt>
          </View>
        ) : null}

        {popularCommunities.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Txt
              style={{
                fontFamily: font.heavy,
                fontSize: 14,
                color: theme.ink,
              }}
            >
              Recommended Spaces to Join Now
            </Txt>
            {popularCommunities.slice(0, 3).map((c, idx) => (
              <PressableScale
                key={c.id}
                onPress={() => {
                  setAiSheetOpen(false);
                  router.push(`/community/${c.id}`);
                }}
                accessibilityLabel={c.name}
                scaleTo={0.98}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 8,
                  borderRadius: radius.tile,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Picture
                  source={
                    c.icon
                      ? serverImage(c.icon)
                      : c.cover
                        ? serverImage(c.cover)
                        : defaultCover(c.hue)
                  }
                  hue={c.hue}
                  label={c.name}
                  radius={10}
                  style={{ width: 42, height: 42 }}
                />
                <View style={{ flex: 1 }}>
                  <Txt
                    numberOfLines={1}
                    style={{
                      fontFamily: font.heavy,
                      fontSize: 13.5,
                      color: theme.ink,
                    }}
                  >
                    {c.name}
                  </Txt>
                  <Txt
                    style={{
                      fontFamily: font.regular,
                      fontSize: 11.5,
                      color: theme.muted,
                    }}
                  >
                    {compactNumber(c.memberCount)} members
                  </Txt>
                </View>
                <JoinButton
                  joined={c.joined}
                  index={idx}
                  size="sm"
                  busy={busyKey === `join:${c.id}`}
                  onPress={() => void toggleJoin(c)}
                />
              </PressableScale>
            ))}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

/**
 * Portrait Community Card matching Mockup 9:
 * Full-bleed vertical illustration, dark bottom gradient, bold white community name,
 * `1.2M members` subtitle, and vibrant color-cycled `Join` pill button at the bottom.
 */
function PopularCommunityPortraitCard({
  community: c,
  index,
  busy,
  onPress,
  onJoin,
}: {
  community: CommunityCardData;
  index: number;
  busy: boolean;
  onPress: () => void;
  onJoin: () => void;
}) {
  const color = joinColor(index);
  const imgSource = c.cover
    ? serverImage(c.cover)
    : c.icon
      ? serverImage(c.icon)
      : defaultCover(c.hue);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${c.name}, ${compactNumber(c.memberCount)} members${c.joined ? ", joined" : ""}`}
      scaleTo={0.97}
      style={[styles.portraitCard, shadow.card]}
    >
      <Picture
        source={imgSource}
        hue={c.hue}
        label={c.name}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          "rgba(12, 10, 28, 0.02)",
          "rgba(12, 10, 28, 0.45)",
          "rgba(12, 10, 28, 0.92)",
        ]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.portraitCardContent}>
        <Txt numberOfLines={1} style={styles.portraitTitle}>
          {c.name}
        </Txt>
        <Txt numberOfLines={1} style={styles.portraitMembers}>
          {compactNumber(c.memberCount)} members
        </Txt>
        <JoinButton
          joined={c.joined}
          color={color}
          size="sm"
          full
          busy={busy}
          onPress={onJoin}
          accessibilityLabel={c.joined ? `Leave ${c.name}` : `Join ${c.name}`}
          style={{ marginTop: 6, height: 26 }}
        />
      </View>
    </PressableScale>
  );
}

/**
 * Skeleton shimmer state matching the Explore & Discover layout while loading.
 */
function ExploreShimmerSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, gap: 16, marginTop: 8 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 112,
              height: 158,
              borderRadius: radius.lg,
              backgroundColor: theme.surfaceAlt,
            }}
          />
        ))}
      </View>
      <View
        style={{
          height: 68,
          borderRadius: radius.xl,
          backgroundColor: theme.surfaceAi,
        }}
      />
      <SkeletonList count={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 6,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13.5,
    paddingVertical: 8,
    outlineWidth: 0,
  },
  aiSearchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  filterCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filterActiveDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: "center",
  },
  tabPill: {
    height: 34,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  portraitCard: {
    width: 112,
    height: 162,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  portraitCardContent: {
    padding: 8,
    gap: 1,
  },
  portraitTitle: {
    fontFamily: font.heavy,
    fontSize: 12.5,
    lineHeight: 15.5,
    color: "#FFFFFF",
  },
  portraitMembers: {
    fontFamily: font.semibold,
    fontSize: 10,
    lineHeight: 13,
    color: "rgba(241, 245, 249, 0.85)",
  },
  aiBannerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  aiBotCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#A855F7",
  },
  aiBotAntenna: {
    position: "absolute",
    top: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EC4899",
  },
  aiBotVisor: {
    width: 28,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1E1B4B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  aiBotEye: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#38BDF8",
  },
  betaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  betaBadgeText: {
    fontFamily: font.heavy,
    fontSize: 9,
    lineHeight: 11,
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
  exploreForMeBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    overflow: "hidden",
  },
  moodTile: {
    width: 66,
    height: 64,
    borderRadius: radius.tile,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  challengeCard: {
    width: 146,
    height: 88,
    borderRadius: radius.tile,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  challengeCardFooter: {
    padding: 8,
    gap: 2,
  },
  challengeTagText: {
    fontFamily: font.heavy,
    fontSize: 12.5,
    lineHeight: 16,
    color: "#FFFFFF",
  },
  challengeCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  challengeCountText: {
    fontFamily: font.semibold,
    fontSize: 10.5,
    lineHeight: 13,
    color: "rgba(255, 255, 255, 0.88)",
  },
  creatorColumn: {
    width: 78,
    alignItems: "center",
    gap: 3,
  },
  creatorRing: {
    padding: 2.5,
    borderRadius: 34,
  },
  creatorRingInner: {
    padding: 2,
    borderRadius: 31,
  },
  creatorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  creatorFollowPill: {
    marginTop: 3,
    height: 24,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  fanEventCard: {
    width: 224,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  fanEventThumb: {
    width: 64,
    height: 64,
  },
  dateBadge: {
    position: "absolute",
    left: 5,
    top: 5,
    width: 32,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dateBadgeMonth: {
    fontFamily: font.heavy,
    fontSize: 8.5,
    lineHeight: 10,
  },
  dateBadgeDay: {
    fontFamily: font.heavy,
    fontSize: 14,
    lineHeight: 17,
  },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bookmarkBtn: {
    width: 32,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});