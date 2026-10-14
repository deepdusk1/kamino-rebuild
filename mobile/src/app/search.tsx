// ===== FILE: mobile/src/app/search.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { platform } from "@/api/platform-v9";
import type {
  CommunityCardData,
  CreatorCard,
  HallEvent,
  Post,
  UserChip,
} from "@/api/types";
import { readSecret, writeSecret } from "@/auth/storage";
import { postPictures, serverImage } from "@/components/community/media";
import { notify } from "@/components/community/platform";
import {
  AppHeader,
  EmptyHint,
  GradientButton,
  JoinButton,
  PersonAvatar,
  Picture,
  Pill,
  SectionHeader,
  VerifiedTick,
  personFromChip,
} from "@/components/k";
import {
  ErrorState,
  PressableScale,
  Sheet,
  SkeletonList,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { defaultCover, heroArt } from "@/lib/brandArt";
import { errorMessage, showError } from "@/lib/errors";
import { compactNumber, plainPreview, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useDebounced } from "@/lib/useDebounced";
import { font, joinColor, radius, shadow, useTheme } from "@/theme";

const RECENT_SEARCHES_KEY = "kamino.recent-searches.v1";
const MAX_RECENT_SEARCHES = 10;

type SearchTab =
  | "all"
  | "communities"
  | "people"
  | "posts"
  | "wiki"
  | "events";

const SEARCH_TABS: readonly {
  key: SearchTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "all", label: "All", icon: "sparkles" },
  { key: "communities", label: "Communities", icon: "planet-outline" },
  { key: "people", label: "Creators", icon: "people-outline" },
  { key: "posts", label: "Posts", icon: "newspaper-outline" },
  { key: "wiki", label: "Wiki", icon: "book-outline" },
  { key: "events", label: "Events", icon: "calendar-outline" },
];

type WikiEntrySummary = {
  id: number;
  communityId: string;
  communityName: string;
  title: string;
  summary: string;
  category: string;
  cover: string | null;
  hue: number;
  updatedAt: string;
};

type SearchEventSummary = {
  id: number;
  communityId: string;
  communityName: string;
  title: string;
  startsAt: string;
  location: string;
  rsvpCount: number;
  going: boolean;
  cover: string | null;
  hue: number;
};

type NormalizedSearchPayload = {
  communities: CommunityCardData[];
  people: CreatorCard[];
  posts: Post[];
  wiki: WikiEntrySummary[];
  events: SearchEventSummary[];
  suggestions: string[];
};

type AiAssistantRpcResult = {
  text: string;
};

type JoinCommunityRpcResult = {
  pending?: boolean;
  joined?: boolean;
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseUserChipRecord(raw: unknown): UserChip {
  if (!isRecord(raw)) {
    return {
      userId: "member",
      handle: "member",
      nickname: "Member",
      hue: 260,
      avatarV: 0,
      role: "member",
    };
  }
  const userId =
    toStringOrEmpty(raw.userId) || toStringOrEmpty(raw.id) || "member";
  return {
    userId,
    handle: toStringOrEmpty(raw.handle) || userId,
    nickname:
      toStringOrEmpty(raw.nickname) ||
      toStringOrEmpty(raw.displayName) ||
      "Member",
    hue: toFiniteNumber(raw.hue ?? raw.avatarHue, 260),
    avatarV: toFiniteNumber(raw.avatarV ?? raw.avatarVersion, 0),
    role:
      raw.role === "leader" ||
      raw.role === "agent" ||
      raw.role === "curator" ||
      raw.role === "member"
        ? raw.role
        : "member",
  };
}

function normalizeCommunity(raw: unknown): CommunityCardData | null {
  if (!isRecord(raw)) return null;
  const id = toStringOrEmpty(raw.id) || toStringOrEmpty(raw.slug);
  const name = toStringOrEmpty(raw.name);
  if (!id || !name) return null;

  const facesRaw = Array.isArray(raw.faces) ? raw.faces : [];
  const faces: UserChip[] = facesRaw.map(parseUserChipRecord);

  return {
    id,
    name,
    tagline:
      toStringOrEmpty(raw.tagline) || toStringOrEmpty(raw.description),
    category: toStringOrEmpty(raw.category) || "general",
    hue: toFiniteNumber(raw.hue, 260),
    icon: typeof raw.icon === "string" ? raw.icon : null,
    cover: typeof raw.cover === "string" ? raw.cover : null,
    memberCount: toFiniteNumber(
      raw.memberCount ?? raw.members ?? raw.member_count,
      0,
    ),
    onlineCount: toFiniteNumber(
      raw.onlineCount ?? raw.online ?? raw.online_count,
      0,
    ),
    joined: Boolean(raw.joined),
    visibility: raw.visibility === "private" ? "private" : "public",
    faces,
  };
}

function normalizeCreator(raw: unknown): CreatorCard | null {
  if (!isRecord(raw)) return null;
  const userId = toStringOrEmpty(raw.userId) || toStringOrEmpty(raw.id);
  const handle = toStringOrEmpty(raw.handle);
  if (!userId || !handle) return null;

  return {
    userId,
    handle,
    displayName:
      toStringOrEmpty(raw.displayName) ||
      toStringOrEmpty(raw.nickname) ||
      handle,
    avatarHue: toFiniteNumber(raw.avatarHue ?? raw.hue, 260),
    avatarV: toFiniteNumber(raw.avatarV ?? raw.avatarVersion, 0),
    verified: Boolean(raw.verified),
    headline: toStringOrEmpty(raw.headline) || toStringOrEmpty(raw.bio),
    followers: toFiniteNumber(raw.followers ?? raw.followerCount, 0),
    following: Boolean(raw.following),
    requested: Boolean(raw.requested),
  };
}

function normalizePost(raw: unknown): Post | null {
  if (!isRecord(raw)) return null;
  const id = toFiniteNumber(raw.id, 0);
  const communityId =
    toStringOrEmpty(raw.communityId) || toStringOrEmpty(raw.community_id);
  if (!id || !communityId) return null;

  return {
    id,
    communityId,
    communityName:
      toStringOrEmpty(raw.communityName) ||
      toStringOrEmpty(raw.community_name) ||
      communityId,
    author: parseUserChipRecord(raw.author),
    kind:
      raw.kind === "wiki" ||
      raw.kind === "poll" ||
      raw.kind === "quiz" ||
      raw.kind === "image" ||
      raw.kind === "question" ||
      raw.kind === "link" ||
      raw.kind === "blog"
        ? raw.kind
        : "blog",
    title: toStringOrEmpty(raw.title),
    body: toStringOrEmpty(raw.body),
    image: typeof raw.image === "string" ? raw.image : null,
    images: Array.isArray(raw.images)
      ? raw.images.filter((img): img is string => typeof img === "string")
      : [],
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    likeCount: toFiniteNumber(raw.likeCount ?? raw.likes, 0),
    commentCount: toFiniteNumber(raw.commentCount ?? raw.comments, 0),
    liked: Boolean(raw.liked),
    saved: Boolean(raw.saved),
    pinned: Boolean(raw.pinned),
    featured: Boolean(raw.featured),
    createdAt:
      toStringOrEmpty(raw.createdAt) ||
      toStringOrEmpty(raw.created_at) ||
      new Date().toISOString(),
    poll: null,
    quiz: null,
    wikiCategory:
      typeof raw.wikiCategory === "string" ? raw.wikiCategory : null,
    linkUrl: typeof raw.linkUrl === "string" ? raw.linkUrl : null,
  };
}

function normalizeWikiEntry(raw: unknown): WikiEntrySummary | null {
  if (!isRecord(raw)) return null;
  const id = toFiniteNumber(raw.id, 0);
  const title = toStringOrEmpty(raw.title);
  if (!id || !title) return null;

  const communityId =
    toStringOrEmpty(raw.communityId) ||
    toStringOrEmpty(raw.community_id) ||
    "anime-realm";
  return {
    id,
    communityId,
    communityName:
      toStringOrEmpty(raw.communityName) ||
      toStringOrEmpty(raw.community_name) ||
      communityId,
    title,
    summary:
      plainPreview(
        toStringOrEmpty(raw.summary) || toStringOrEmpty(raw.body),
      ) || "Community wiki entry & lore guide",
    category:
      toStringOrEmpty(raw.wikiCategory) ||
      toStringOrEmpty(raw.category) ||
      "Lore & Guide",
    cover: typeof raw.image === "string" ? raw.image : null,
    hue: toFiniteNumber(raw.hue, 250),
    updatedAt:
      toStringOrEmpty(raw.updatedAt) ||
      toStringOrEmpty(raw.createdAt) ||
      new Date().toISOString(),
  };
}

function normalizeEventEntry(raw: unknown): SearchEventSummary | null {
  if (!isRecord(raw)) return null;
  const id = toFiniteNumber(raw.id, 0);
  const title = toStringOrEmpty(raw.title);
  if (!id || !title) return null;

  const communityId =
    toStringOrEmpty(raw.communityId) ||
    toStringOrEmpty(raw.community_id) ||
    "";
  return {
    id,
    communityId,
    communityName:
      toStringOrEmpty(raw.communityName) ||
      toStringOrEmpty(raw.community_name) ||
      communityId ||
      "Kamino Event",
    title,
    startsAt:
      toStringOrEmpty(raw.startsAt) ||
      toStringOrEmpty(raw.starts_at) ||
      new Date().toISOString(),
    location:
      toStringOrEmpty(raw.location) ||
      toStringOrEmpty(raw.communityName) ||
      "Online Live Stage",
    rsvpCount: toFiniteNumber(raw.rsvpCount ?? raw.rsvp_count, 0),
    going: Boolean(raw.going),
    cover:
      typeof raw.cover === "string"
        ? raw.cover
        : typeof raw.communityCover === "string"
          ? raw.communityCover
          : null,
    hue: toFiniteNumber(raw.hue ?? raw.communityHue, 260),
  };
}

function normalizeSearchResponse(
  raw: unknown,
  queryTerm: string,
): NormalizedSearchPayload {
  const root = isRecord(raw) ? raw : {};

  const communitiesRaw = Array.isArray(root.communities)
    ? root.communities
    : [];
  const communities = communitiesRaw
    .map(normalizeCommunity)
    .filter((x): x is CommunityCardData => x !== null);

  const peopleRaw = Array.isArray(root.people)
    ? root.people
    : Array.isArray(root.users)
      ? root.users
      : Array.isArray(root.creators)
        ? root.creators
        : [];
  const people = peopleRaw
    .map(normalizeCreator)
    .filter((x): x is CreatorCard => x !== null);

  const postsRaw = Array.isArray(root.posts) ? root.posts : [];
  const allPosts = postsRaw
    .map(normalizePost)
    .filter((x): x is Post => x !== null);

  const explicitWikiRaw = Array.isArray(root.wiki)
    ? root.wiki
    : Array.isArray(root.wikiEntries)
      ? root.wikiEntries
      : [];
  const explicitWiki = explicitWikiRaw
    .map(normalizeWikiEntry)
    .filter((x): x is WikiEntrySummary => x !== null);

  // Also surface posts of kind === "wiki" in Wiki Entries
  const wikiFromPosts: WikiEntrySummary[] = allPosts
    .filter((p) => p.kind === "wiki")
    .map((p) => ({
      id: p.id,
      communityId: p.communityId,
      communityName: p.communityName,
      title: p.title || plainPreview(p.body).slice(0, 48) || "Wiki Entry",
      summary: plainPreview(p.body),
      category: p.wikiCategory || "Wiki Guide",
      cover: postPictures(p)[0] ?? null,
      hue: p.author.hue,
      updatedAt: p.createdAt,
    }));

  const seenWikiIds = new Set<number>();
  const wiki: WikiEntrySummary[] = [];
  for (const w of [...explicitWiki, ...wikiFromPosts]) {
    if (seenWikiIds.has(w.id)) continue;
    seenWikiIds.add(w.id);
    wiki.push(w);
  }

  const eventsRaw = Array.isArray(root.events) ? root.events : [];
  const events = eventsRaw
    .map(normalizeEventEntry)
    .filter((x): x is SearchEventSummary => x !== null);

  const suggestionsRaw = Array.isArray(root.suggestions)
    ? root.suggestions.filter((s): s is string => typeof s === "string")
    : [];

  const cleanQ = queryTerm.trim().replace(/^#/, "");
  const fallbackSuggestions =
    cleanQ.length >= 2
      ? [
          `${cleanQ} theories`,
          `${cleanQ} fan art`,
          `${cleanQ} characters & wiki`,
          `${cleanQ} live rooms`,
          `#${cleanQ.replace(/\s+/g, "")}`,
        ]
      : [
          "One Piece Episode 12",
          "Jujutsu Kaisen theories",
          "Genshin Impact builds",
          "Solo Leveling fan art",
          "Cosplay showcase",
        ];

  const suggestions =
    suggestionsRaw.length > 0 ? suggestionsRaw : fallbackSuggestions;

  return {
    communities,
    people,
    posts: allPosts,
    wiki,
    events,
    suggestions,
  };
}

/**
 * Search Results Screen (`mobile/src/app/search.tsx`) — Pixel-faithful to Mockup 8 (Search Results):
 * - Top Search header with back button, live input, clear button, and 400ms debounced query (`useDebounced(query, 400)`)
 * - Category filter tabs: All · Communities · Creators · Posts · Wiki · Events
 * - AI Answer Card at top of results wired to `rpc("aiAssistant", { task: "summarize", text })` (`platform.ai("summarize", ...)`)
 *   with expandable deep dive, source pills, and "Ask Follow-up" sheet
 * - Dedicated sections for:
 *   1. Communities (with member counts, online dot, and `joinCommunity` button)
 *   2. Creators / Users (with verified badge, follower count, and Follow button)
 *   3. Posts (with community pill, author chip, snippet, thumbnail, likes & comments)
 *   4. Wiki Entries (with category badge, summary, and community attribution)
 *   5. Events (with calendar date badge, location, interested count, and RSVP bookmark)
 *   6. Search Suggestions (related queries chips)
 *   7. Recent Searches persisted locally in SecureStore (`readSecret`/`writeSecret`) with individual delete & Clear All
 * - Wired to `rpc("searchEverything", ...)` and `rpc("searchAll", ...)`
 * - Skeleton shimmer loading and illustrated empty states
 */
export default function SearchScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const params = useLocalSearchParams<{ q?: string; tab?: string }>();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState(params.q ?? "");
  const [activeTab, setActiveTab] = useState<SearchTab>(() => {
    const t = params.tab as SearchTab | undefined;
    return t && SEARCH_TABS.some((item) => item.key === t) ? t : "all";
  });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState<string | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);

  // Sync incoming URL parameter `q`
  useEffect(() => {
    if (typeof params.q === "string" && params.q !== query) {
      setQuery(params.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  // Load persisted recent searches from device storage on mount
  useEffect(() => {
    let mounted = true;
    void readSecret(RECENT_SEARCHES_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setRecentSearches(
              parsed
                .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                .slice(0, MAX_RECENT_SEARCHES),
            );
          }
        } catch {
          // Ignore malformed persisted JSON
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const saveRecentSearch = useCallback(async (termToSave: string) => {
    const clean = termToSave.trim();
    if (clean.length < 2) return;
    setRecentSearches((prev) => {
      const next = [
        clean,
        ...prev.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);
      void writeSecret(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(
        () => undefined,
      );
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((termToRemove: string) => {
    haptic.tap();
    setRecentSearches((prev) => {
      const next = prev.filter((item) => item !== termToRemove);
      void writeSecret(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(
        () => undefined,
      );
      return next;
    });
  }, []);

  const clearAllRecentSearches = useCallback(() => {
    haptic.tap();
    setRecentSearches([]);
    void writeSecret(RECENT_SEARCHES_KEY, JSON.stringify([])).catch(
      () => undefined,
    );
  }, []);

  // 400ms debounced search query as specified
  const debouncedQuery = useDebounced(query.trim(), 400);
  const hasActiveQuery = debouncedQuery.replace(/^#/, "").length >= 2;

  // Persist to recent searches once a debounced query settles
  useEffect(() => {
    if (hasActiveQuery) {
      void saveRecentSearch(debouncedQuery);
    }
  }, [debouncedQuery, hasActiveQuery, saveRecentSearch]);

  // Primary search query wired to exact `searchEverything` and `searchAll` RPCs
  const searchQuery = useQuery({
    queryKey: ["searchScreen", debouncedQuery],
    enabled: hasActiveQuery,
    staleTime: 30_000,
    queryFn: async (): Promise<NormalizedSearchPayload> => {
      const rpcKind =
        activeTab === "communities"
          ? "communities"
          : activeTab === "people"
            ? "people"
            : activeTab === "posts"
              ? "posts"
              : "all";

      let primaryRaw: unknown = null;
      try {
        primaryRaw = await rpc<unknown>("searchEverything", {
          q: debouncedQuery,
          kind: rpcKind,
        });
      } catch {
        primaryRaw = await api.searchEverything({
          q: debouncedQuery,
          kind: rpcKind,
        });
      }

      const normalized = normalizeSearchResponse(primaryRaw, debouncedQuery);

      // Also call `searchAll` if wiki/events or extra cross-entity matches are available
      if (normalized.wiki.length === 0 || normalized.events.length === 0) {
        try {
          const allRaw = await rpc<unknown>("searchAll", {
            q: debouncedQuery,
          });
          const mergedExtra = normalizeSearchResponse(allRaw, debouncedQuery);
          if (normalized.communities.length === 0) {
            normalized.communities = mergedExtra.communities;
          }
          if (normalized.people.length === 0) {
            normalized.people = mergedExtra.people;
          }
          if (normalized.posts.length === 0) {
            normalized.posts = mergedExtra.posts;
          }
          if (normalized.wiki.length === 0) {
            normalized.wiki = mergedExtra.wiki;
          }
          if (normalized.events.length === 0) {
            normalized.events = mergedExtra.events;
          }
        } catch {
          // `searchEverything` already succeeded; continue with primary payload
        }
      }

      return normalized;
    },
  });

  // Trending & Explore fallback data for empty-input state and supplemental events
  const exploreOverview = useQuery({
    queryKey: ["exploreOverview", "forYou"],
    queryFn: () => api.exploreOverview(),
    staleTime: 60_000,
  });

  // AI Answer Card query wired to `rpc("aiAssistant", { task: "summarize", text })`
  const aiSummaryQuery = useQuery({
    queryKey: ["searchAiSummary", debouncedQuery],
    enabled: hasActiveQuery,
    staleTime: 120_000,
    queryFn: async (): Promise<string> => {
      const promptText = `Provide a concise, helpful 2-3 sentence fandom overview and answer for the search query "${debouncedQuery}" on Kamino, highlighting key lore, community discussions, or tips.`;
      try {
        const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
          task: "summarize",
          text: promptText,
        });
        if (res.text && res.text.trim()) return res.text.trim();
      } catch {
        // Fallback to platform.ai wrapper (which also invokes `aiAssistant`)
      }
      const fallback = await platform.ai("summarize", promptText);
      return fallback.text.trim();
    },
  });

  const handleFollowUpSubmit = async () => {
    const cleanQ = followUpQuestion.trim();
    if (!cleanQ || followUpBusy) return;
    setFollowUpBusy(true);
    try {
      const prompt = `Context: Search query "${debouncedQuery}". User follow-up question: "${cleanQ}". Summarize a helpful answer:`;
      const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
        task: "summarize",
        text: prompt,
      });
      setFollowUpAnswer(res.text);
    } catch (err) {
      try {
        const fb = await platform.ai("summarize", cleanQ);
        setFollowUpAnswer(fb.text);
      } catch {
        showError(err);
      }
    } finally {
      setFollowUpBusy(false);
    }
  };

  const toggleJoinCommunity = async (c: CommunityCardData) => {
    if (!c.joined && c.visibility === "private") {
      router.push(`/community/${c.id}`);
      return;
    }
    setBusyKey(`join:${c.id}`);
    try {
      if (c.joined) {
        await api.leave(c.id);
      } else {
        const res = await rpc<JoinCommunityRpcResult>("joinCommunity", {
          slug: c.id,
        });
        if (res.pending) {
          notify(
            "Request sent",
            `Your request to join ${c.name} has been sent to the leaders.`,
          );
        } else {
          haptic.success();
        }
      }
      await searchQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["exploreOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch (err) {
      showError(err);
    } finally {
      setBusyKey(null);
    }
  };

  const toggleFollowCreator = async (creator: CreatorCard) => {
    setBusyKey(`follow:${creator.userId}`);
    try {
      await api.followProfile(creator.userId);
      haptic.success();
      await searchQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
    } catch (err) {
      showError(err);
    } finally {
      setBusyKey(null);
    }
  };

  const toggleEventRsvp = async (ev: SearchEventSummary) => {
    if (!ev.communityId) return;
    setBusyKey(`rsvp:${ev.id}`);
    try {
      await api.rsvp(ev.communityId, ev.id);
      haptic.success();
      await searchQuery.refetch();
    } catch (err) {
      showError(err);
    } finally {
      setBusyKey(null);
    }
  };

  const selectSearchSuggestion = (term: string) => {
    haptic.tap();
    Keyboard.dismiss();
    setQuery(term);
    void saveRecentSearch(term);
  };

  const results = searchQuery.data;

  const totalMatchesCount = useMemo(() => {
    if (!results) return 0;
    return (
      results.communities.length +
      results.people.length +
      results.posts.length +
      results.wiki.length +
      results.events.length
    );
  }, [results]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Top Search Header (Mockup 8) */}
      <AppHeader back />

      <View style={styles.searchHeaderWrap}>
        <View
          style={[
            styles.searchBarBox,
            {
              backgroundColor: theme.surface,
              borderColor: theme.accent,
            },
            shadow.card,
          ]}
        >
          <Ionicons name="search" size={19} color={theme.violet} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            autoFocus={!params.q}
            placeholder="Search communities, creators, posts, wiki, events…"
            placeholderTextColor={theme.subtle}
            returnKeyType="search"
            autoCorrect={false}
            selectionColor={theme.accent}
            onSubmitEditing={() => {
              Keyboard.dismiss();
              if (query.trim().length >= 2) {
                void saveRecentSearch(query.trim());
              }
            }}
            accessibilityLabel="Search input"
            style={[styles.searchInput, { color: theme.ink }]}
          />
          {query.length > 0 ? (
            <PressableScale
              onPress={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear search query"
              hitSlop={8}
              scaleTo={0.88}
            >
              <Ionicons name="close-circle" size={19} color={theme.subtle} />
            </PressableScale>
          ) : null}
        </View>
      </View>

      {/* Filter Tabs Row: All · Communities · Creators · Posts · Wiki · Events */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {SEARCH_TABS.map((t) => {
            const selected = activeTab === t.key;
            return (
              <PressableScale
                key={t.key}
                onPress={() => {
                  haptic.tap();
                  setActiveTab(t.key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={t.label}
                scaleTo={0.95}
                style={[
                  styles.tabChip,
                  {
                    backgroundColor: selected ? "transparent" : theme.surface,
                    borderColor: selected ? "transparent" : theme.border,
                  },
                  selected ? shadow.glow(theme.violet, 0.28) : null,
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
                <Ionicons
                  name={t.icon}
                  size={14}
                  color={selected ? "#FFFFFF" : theme.violet}
                />
                <Txt
                  style={{
                    fontFamily: selected ? font.bold : font.semibold,
                    fontSize: 12.5,
                    lineHeight: 16,
                    color: selected ? "#FFFFFF" : theme.ink,
                  }}
                >
                  {t.label}
                </Txt>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: tabSpace + 24,
          paddingTop: 6,
          gap: 18,
        }}
        refreshControl={
          <RefreshControl
            refreshing={searchQuery.isRefetching}
            onRefresh={() => {
              if (hasActiveQuery) {
                void searchQuery.refetch();
                void aiSummaryQuery.refetch();
              } else {
                void exploreOverview.refetch();
              }
            }}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {!hasActiveQuery ? (
          /* ── IDLE STATE: Recent Searches + Search Suggestions + Trending Communities ── */
          <View style={{ gap: 18, paddingHorizontal: 16 }}>
            {/* Persisted Recent Searches */}
            <View style={{ gap: 8 }}>
              <View style={styles.sectionHeaderRow}>
                <Txt
                  accessibilityRole="header"
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 16,
                    color: theme.ink,
                  }}
                >
                  Recent Searches
                </Txt>
                {recentSearches.length > 0 ? (
                  <PressableScale
                    onPress={clearAllRecentSearches}
                    accessibilityRole="button"
                    accessibilityLabel="Clear all recent searches"
                    hitSlop={8}
                    scaleTo={0.94}
                  >
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 12.5,
                        color: theme.accent,
                      }}
                    >
                      Clear All
                    </Txt>
                  </PressableScale>
                ) : null}
              </View>

              {recentSearches.length > 0 ? (
                <View
                  style={[
                    styles.cardGroup,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                    shadow.card,
                  ]}
                >
                  {recentSearches.map((item, idx) => (
                    <View
                      key={item}
                      style={[
                        styles.recentRow,
                        idx < recentSearches.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: theme.border,
                        },
                      ]}
                    >
                      <PressableScale
                        onPress={() => selectSearchSuggestion(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Search ${item}`}
                        scaleTo={0.98}
                        style={styles.recentRowMain}
                      >
                        <Ionicons
                          name="time-outline"
                          size={17}
                          color={theme.muted}
                        />
                        <Txt
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            fontFamily: font.semibold,
                            fontSize: 13.5,
                            color: theme.ink,
                          }}
                        >
                          {item}
                        </Txt>
                      </PressableScale>
                      <PressableScale
                        onPress={() => removeRecentSearch(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item} from recent searches`}
                        hitSlop={10}
                        scaleTo={0.88}
                        style={styles.recentRemoveBtn}
                      >
                        <Ionicons
                          name="close"
                          size={16}
                          color={theme.subtle}
                        />
                      </PressableScale>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyHint
                  emoji="🔎"
                  title="No recent searches"
                  text="Search for anime, games, fan art, lore wikis, or creators — your history stays private on this device."
                  style={{ marginHorizontal: 0 }}
                />
              )}
            </View>

            {/* Search Suggestions Chips */}
            <View style={{ gap: 8 }}>
              <SectionHeader title="Search Suggestions" />
              <View style={styles.suggestionsWrap}>
                {(exploreOverview.data?.trendingTags.length
                  ? exploreOverview.data.trendingTags.map(
                      (t) => `#${t.tag.replace(/^#/, "")}`,
                    )
                  : [
                      "One Piece Gear 5",
                      "Genshin Impact lore",
                      "Jujutsu Kaisen theories",
                      "Digital Art tutorials",
                      "Cosplay crafting",
                      "Live Anime Theory Night",
                    ]
                )
                  .slice(0, 8)
                  .map((suggestion) => (
                    <PressableScale
                      key={suggestion}
                      onPress={() => selectSearchSuggestion(suggestion)}
                      accessibilityRole="button"
                      accessibilityLabel={`Suggested search ${suggestion}`}
                      scaleTo={0.95}
                      style={[
                        styles.suggestionChip,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                        shadow.card,
                      ]}
                    >
                      <Ionicons
                        name="trending-up"
                        size={14}
                        color={theme.violet}
                      />
                      <Txt
                        style={{
                          fontFamily: font.semibold,
                          fontSize: 12.5,
                          color: theme.ink,
                        }}
                      >
                        {suggestion}
                      </Txt>
                    </PressableScale>
                  ))}
              </View>
            </View>
          </View>
        ) : searchQuery.isPending ? (
          /* ── SKELETON SHIMMER LOADING STATE ── */
          <SearchShimmerSkeleton />
        ) : searchQuery.isError ? (
          <ErrorState
            error={searchQuery.error}
            onRetry={() => void searchQuery.refetch()}
          />
        ) : (
          /* ── ACTIVE SEARCH RESULTS (Mockup 8) ── */
          <View style={{ gap: 18, paddingHorizontal: 16 }}>
            {/* 1. AI Answer Card (Mockup 8 top card — `aiAssistant` 'summarize') */}
            <LinearGradient
              colors={theme.gradAiCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.aiAnswerCard,
                { borderColor: theme.border },
                shadow.card,
              ]}
            >
              <View style={styles.aiAnswerHeaderRow}>
                <View
                  style={[
                    styles.aiIconBadge,
                    { backgroundColor: theme.surface },
                  ]}
                >
                  <Ionicons name="sparkles" size={16} color={theme.violet} />
                </View>
                <View style={{ flex: 1 }}>
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
                        color: theme.ink,
                      }}
                    >
                      AI Answer
                    </Txt>
                    <Pill
                      label="Kamino AI"
                      tone="violet"
                      style={{ height: 18, paddingHorizontal: 7 }}
                    />
                  </View>
                  <Txt
                    style={{
                      fontFamily: font.regular,
                      fontSize: 11.5,
                      color: theme.muted,
                    }}
                  >
                    Synthesized from community posts, wikis & discussions
                  </Txt>
                </View>
              </View>

              {aiSummaryQuery.isPending ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 6,
                  }}
                >
                  <ActivityIndicator size="small" color={theme.violet} />
                  <Txt
                    style={{
                      fontFamily: font.semibold,
                      fontSize: 12.5,
                      color: theme.muted,
                    }}
                  >
                    Summarizing top community insights for “{debouncedQuery}”…
                  </Txt>
                </View>
              ) : (
                <Txt
                  numberOfLines={aiExpanded ? undefined : 3}
                  style={{
                    fontFamily: font.regular,
                    fontSize: 13.5,
                    lineHeight: 19.5,
                    color: theme.ink,
                  }}
                >
                  {aiSummaryQuery.data ||
                    `Top discussions for "${debouncedQuery}" span ${results?.communities.length ?? 0} communities, ${results?.posts.length ?? 0} fan posts, and ${results?.wiki.length ?? 0} wiki guides.`}
                </Txt>
              )}

              {/* Source Attribution Chips + Read More / Ask Follow-up */}
              <View style={styles.aiFooterRow}>
                <PressableScale
                  onPress={() => setAiExpanded((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    aiExpanded ? "Show less AI answer" : "Read full AI answer"
                  }
                  scaleTo={0.96}
                >
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 12,
                      color: theme.violet,
                    }}
                  >
                    {aiExpanded ? "Show less ▲" : "Read more ▼"}
                  </Txt>
                </PressableScale>

                <PressableScale
                  onPress={() => {
                    setFollowUpQuestion("");
                    setFollowUpAnswer(null);
                    setFollowUpOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Ask AI a follow-up question"
                  scaleTo={0.95}
                  style={[
                    styles.askFollowUpBtn,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={13}
                    color={theme.violet}
                  />
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 11.5,
                      color: theme.ink,
                    }}
                  >
                    Ask Follow-up
                  </Txt>
                </PressableScale>
              </View>
            </LinearGradient>

            {/* 2. Communities Section */}
            {(activeTab === "all" || activeTab === "communities") &&
            (results?.communities.length ?? 0) > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionHeader
                  title="Communities"
                  actionLabel={
                    activeTab === "all" && results!.communities.length > 3
                      ? "See All"
                      : undefined
                  }
                  onAction={
                    activeTab === "all"
                      ? () => setActiveTab("communities")
                      : undefined
                  }
                />
                {(activeTab === "all"
                  ? results!.communities.slice(0, 3)
                  : results!.communities
                ).map((c, idx) => (
                  <PressableScale
                    key={c.id}
                    onPress={() => router.push(`/community/${c.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.name}, ${compactNumber(c.memberCount)} members`}
                    scaleTo={0.98}
                    style={[
                      styles.communityRowCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                      shadow.card,
                    ]}
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
                      radius={14}
                      style={{ width: 54, height: 54 }}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt
                        numberOfLines={1}
                        style={{
                          fontFamily: font.heavy,
                          fontSize: 15,
                          lineHeight: 19,
                          color: theme.ink,
                        }}
                      >
                        {c.name}
                      </Txt>
                      {c.tagline ? (
                        <Txt
                          numberOfLines={1}
                          style={{
                            fontFamily: font.regular,
                            fontSize: 12,
                            lineHeight: 16,
                            color: theme.muted,
                          }}
                        >
                          {c.tagline}
                        </Txt>
                      ) : null}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 1,
                        }}
                      >
                        <Txt
                          style={{
                            fontFamily: font.semibold,
                            fontSize: 11.5,
                            color: theme.subtle,
                          }}
                        >
                          {compactNumber(c.memberCount)} members
                        </Txt>
                        {c.onlineCount > 0 ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <View
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: theme.ok,
                              }}
                            />
                            <Txt
                              style={{
                                fontFamily: font.semibold,
                                fontSize: 11,
                                color: theme.ok,
                              }}
                            >
                              {compactNumber(c.onlineCount)} online
                            </Txt>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <JoinButton
                      joined={c.joined}
                      color={joinColor(idx)}
                      size="sm"
                      busy={busyKey === `join:${c.id}`}
                      onPress={() => void toggleJoinCommunity(c)}
                    />
                  </PressableScale>
                ))}
              </View>
            ) : null}

            {/* 3. Creators & Users Section */}
            {(activeTab === "all" || activeTab === "people") &&
            (results?.people.length ?? 0) > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionHeader
                  title="Creators & People"
                  actionLabel={
                    activeTab === "all" && results!.people.length > 4
                      ? "See All"
                      : undefined
                  }
                  onAction={
                    activeTab === "all"
                      ? () => setActiveTab("people")
                      : undefined
                  }
                />
                <View
                  style={[
                    styles.cardGroup,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                    shadow.card,
                  ]}
                >
                  {(activeTab === "all"
                    ? results!.people.slice(0, 4)
                    : results!.people
                  ).map((person, idx, arr) => {
                    const isFollowing = person.following || person.requested;
                    const isBusy = busyKey === `follow:${person.userId}`;
                    return (
                      <PressableScale
                        key={person.userId}
                        onPress={() =>
                          router.push(`/profile/${person.handle}`)
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`${person.displayName}, @${person.handle}`}
                        scaleTo={0.98}
                        style={[
                          styles.creatorRow,
                          idx < arr.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: theme.border,
                          },
                        ]}
                      >
                        <PersonAvatar
                          person={{
                            name: person.displayName,
                            hue: person.avatarHue,
                            userId: person.userId,
                            avatarV: person.avatarV,
                          }}
                          size={44}
                        />
                        <View style={{ flex: 1, gap: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Txt
                              numberOfLines={1}
                              style={{
                                fontFamily: font.heavy,
                                fontSize: 14,
                                color: theme.ink,
                                flexShrink: 1,
                              }}
                            >
                              {person.displayName}
                            </Txt>
                            {person.verified ? (
                              <VerifiedTick size={13} />
                            ) : null}
                          </View>
                          <Txt
                            numberOfLines={1}
                            style={{
                              fontFamily: font.regular,
                              fontSize: 12,
                              color: theme.muted,
                            }}
                          >
                            @{person.handle}
                            {person.headline ? ` · ${person.headline}` : ""}
                            {person.followers > 0
                              ? ` · ${compactNumber(person.followers)} followers`
                              : ""}
                          </Txt>
                        </View>
                        <PressableScale
                          onPress={() => void toggleFollowCreator(person)}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={
                            isFollowing
                              ? `Unfollow ${person.displayName}`
                              : `Follow ${person.displayName}`
                          }
                          scaleTo={0.93}
                          style={[
                            styles.followBtnPill,
                            {
                              backgroundColor: isFollowing
                                ? theme.surfaceAlt
                                : theme.violet,
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
                              color={isFollowing ? theme.violet : "#FFFFFF"}
                            />
                          ) : (
                            <Txt
                              style={{
                                fontFamily: font.bold,
                                fontSize: 12,
                                color: isFollowing ? theme.ink : "#FFFFFF",
                              }}
                            >
                              {person.requested
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
                </View>
              </View>
            ) : null}

            {/* 4. Posts Section */}
            {(activeTab === "all" || activeTab === "posts") &&
            (results?.posts.length ?? 0) > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionHeader
                  title="Posts"
                  actionLabel={
                    activeTab === "all" && results!.posts.length > 4
                      ? "See All"
                      : undefined
                  }
                  onAction={
                    activeTab === "all"
                      ? () => setActiveTab("posts")
                      : undefined
                  }
                />
                {(activeTab === "all"
                  ? results!.posts.slice(0, 4)
                  : results!.posts
                ).map((post) => {
                  const thumb = postPictures(post)[0] ?? null;
                  return (
                    <PressableScale
                      key={post.id}
                      onPress={() =>
                        router.push(
                          `/community/${post.communityId}/post/${post.id}`,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${post.title || plainPreview(post.body)} by ${post.author.nickname}`}
                      scaleTo={0.98}
                      style={[
                        styles.postResultCard,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                        shadow.card,
                      ]}
                    >
                      <View style={{ flex: 1, gap: 5 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <PersonAvatar
                            person={personFromChip(post.author)}
                            size={20}
                          />
                          <Txt
                            numberOfLines={1}
                            style={{
                              fontFamily: font.bold,
                              fontSize: 11.5,
                              color: theme.muted,
                              flexShrink: 1,
                            }}
                          >
                            {post.author.nickname}
                          </Txt>
                          <Txt
                            style={{
                              fontFamily: font.regular,
                              fontSize: 11,
                              color: theme.subtle,
                            }}
                          >
                            in {post.communityName} · {timeAgo(post.createdAt)}
                          </Txt>
                        </View>
                        {post.title ? (
                          <Txt
                            numberOfLines={1}
                            style={{
                              fontFamily: font.heavy,
                              fontSize: 14.5,
                              lineHeight: 19,
                              color: theme.ink,
                            }}
                          >
                            {post.title}
                          </Txt>
                        ) : null}
                        <Txt
                          numberOfLines={2}
                          style={{
                            fontFamily: font.regular,
                            fontSize: 13,
                            lineHeight: 17.5,
                            color: theme.text,
                          }}
                        >
                          {plainPreview(post.body)}
                        </Txt>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 14,
                            marginTop: 2,
                          }}
                        >
                          <View style={styles.postStatItem}>
                            <Ionicons
                              name="heart"
                              size={13}
                              color={theme.pink}
                            />
                            <Txt style={styles.postStatText}>
                              {compactNumber(post.likeCount)}
                            </Txt>
                          </View>
                          <View style={styles.postStatItem}>
                            <Ionicons
                              name="chatbubble-outline"
                              size={12}
                              color={theme.muted}
                            />
                            <Txt style={styles.postStatText}>
                              {compactNumber(post.commentCount)}
                            </Txt>
                          </View>
                        </View>
                      </View>
                      {thumb ? (
                        <Picture
                          source={serverImage(thumb)}
                          hue={post.author.hue}
                          radius={12}
                          style={{ width: 68, height: 68 }}
                        />
                      ) : null}
                    </PressableScale>
                  );
                })}
              </View>
            ) : null}

            {/* 5. Wiki Entries Section (Mockup 8) */}
            {(activeTab === "all" || activeTab === "wiki") &&
            (results?.wiki.length ?? 0) > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionHeader
                  title="Wiki Entries"
                  actionLabel={
                    activeTab === "all" && results!.wiki.length > 3
                      ? "See All"
                      : undefined
                  }
                  onAction={
                    activeTab === "all"
                      ? () => setActiveTab("wiki")
                      : undefined
                  }
                />
                {(activeTab === "all"
                  ? results!.wiki.slice(0, 3)
                  : results!.wiki
                ).map((entry) => (
                  <PressableScale
                    key={entry.id}
                    onPress={() =>
                      router.push(
                        `/community/${entry.communityId}/post/${entry.id}`,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Wiki entry: ${entry.title} in ${entry.communityName}`}
                    scaleTo={0.98}
                    style={[
                      styles.wikiResultCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                      shadow.card,
                    ]}
                  >
                    <Picture
                      source={
                        entry.cover
                          ? serverImage(entry.cover)
                          : heroArt["explore-2"] ?? defaultCover(entry.hue)
                      }
                      hue={entry.hue}
                      radius={12}
                      style={{ width: 56, height: 56 }}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Pill
                          label={entry.category}
                          icon="book-outline"
                          tone="blue"
                          style={{ height: 18, paddingHorizontal: 7 }}
                        />
                        <Txt
                          numberOfLines={1}
                          style={{
                            fontFamily: font.semibold,
                            fontSize: 11,
                            color: theme.subtle,
                            flexShrink: 1,
                          }}
                        >
                          {entry.communityName}
                        </Txt>
                      </View>
                      <Txt
                        numberOfLines={1}
                        style={{
                          fontFamily: font.heavy,
                          fontSize: 14,
                          color: theme.ink,
                        }}
                      >
                        {entry.title}
                      </Txt>
                      <Txt
                        numberOfLines={1}
                        style={{
                          fontFamily: font.regular,
                          fontSize: 12,
                          color: theme.muted,
                        }}
                      >
                        {entry.summary}
                      </Txt>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={theme.subtle}
                    />
                  </PressableScale>
                ))}
              </View>
            ) : null}

            {/* 6. Events Section (Mockup 8) */}
            {(activeTab === "all" || activeTab === "events") &&
            (results?.events.length ?? 0) > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionHeader
                  title="Events"
                  actionLabel={
                    activeTab === "all" && results!.events.length > 3
                      ? "See All"
                      : undefined
                  }
                  onAction={
                    activeTab === "all"
                      ? () => setActiveTab("events")
                      : undefined
                  }
                />
                {(activeTab === "all"
                  ? results!.events.slice(0, 3)
                  : results!.events
                ).map((ev) => {
                  const dt = new Date(ev.startsAt);
                  const valid = !Number.isNaN(dt.getTime());
                  const monthStr = valid
                    ? MONTHS_SHORT[dt.getMonth()]!
                    : "NOV";
                  const dayStr = valid
                    ? String(dt.getDate()).padStart(2, "0")
                    : "18";
                  const rsvpBusy = busyKey === `rsvp:${ev.id}`;
                  return (
                    <PressableScale
                      key={ev.id}
                      onPress={() => {
                        if (ev.communityId) {
                          router.push(`/community/${ev.communityId}/events`);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Event: ${ev.title}, ${ev.location}`}
                      scaleTo={0.98}
                      style={[
                        styles.eventResultCard,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                        shadow.card,
                      ]}
                    >
                      <View
                        style={[
                          styles.eventDateBox,
                          { backgroundColor: theme.tints.violet },
                        ]}
                      >
                        <Txt
                          style={{
                            fontFamily: font.heavy,
                            fontSize: 10,
                            color: theme.violet,
                          }}
                        >
                          {monthStr}
                        </Txt>
                        <Txt
                          style={{
                            fontFamily: font.heavy,
                            fontSize: 17,
                            lineHeight: 20,
                            color: theme.ink,
                          }}
                        >
                          {dayStr}
                        </Txt>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt
                          numberOfLines={1}
                          style={{
                            fontFamily: font.heavy,
                            fontSize: 14,
                            color: theme.ink,
                          }}
                        >
                          {ev.title}
                        </Txt>
                        <Txt
                          numberOfLines={1}
                          style={{
                            fontFamily: font.regular,
                            fontSize: 12,
                            color: theme.muted,
                          }}
                        >
                          {ev.location} · {compactNumber(ev.rsvpCount)}{" "}
                          interested
                        </Txt>
                      </View>
                      <PressableScale
                        onPress={() => void toggleEventRsvp(ev)}
                        disabled={rsvpBusy || !ev.communityId}
                        accessibilityRole="button"
                        accessibilityLabel={
                          ev.going
                            ? `Remove RSVP for ${ev.title}`
                            : `RSVP to ${ev.title}`
                        }
                        hitSlop={8}
                        scaleTo={0.9}
                        style={styles.eventRsvpIconBtn}
                      >
                        <Ionicons
                          name={ev.going ? "bookmark" : "bookmark-outline"}
                          size={19}
                          color={ev.going ? theme.violet : theme.muted}
                        />
                      </PressableScale>
                    </PressableScale>
                  );
                })}
              </View>
            ) : null}

            {/* 7. Related Search Suggestions */}
            {(results?.suggestions.length ?? 0) > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionHeader title="Related Searches" />
                <View style={styles.suggestionsWrap}>
                  {results!.suggestions.map((sug) => (
                    <PressableScale
                      key={sug}
                      onPress={() => selectSearchSuggestion(sug)}
                      accessibilityRole="button"
                      accessibilityLabel={`Related search ${sug}`}
                      scaleTo={0.95}
                      style={[
                        styles.suggestionChip,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                        shadow.card,
                      ]}
                    >
                      <Ionicons
                        name="search-outline"
                        size={14}
                        color={theme.violet}
                      />
                      <Txt
                        style={{
                          fontFamily: font.semibold,
                          fontSize: 12.5,
                          color: theme.ink,
                        }}
                      >
                        {sug}
                      </Txt>
                    </PressableScale>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Illustrated Empty State when no entities matched */}
            {totalMatchesCount === 0 ? (
              <EmptyHint
                emoji="🔭"
                title={`No direct matches for “${debouncedQuery}”`}
                text="Check the AI Answer card above, try a broader keyword, or launch a new community for this fandom!"
                actionLabel="Create a Community"
                onAction={() => router.push("/new-community")}
                style={{ marginHorizontal: 0 }}
              />
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Ask AI Follow-Up Sheet */}
      <Sheet
        visible={followUpOpen}
        title="Ask Kamino AI ✨"
        onClose={() => setFollowUpOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13,
            color: theme.muted,
          }}
        >
          Ask a deeper question about “{debouncedQuery}” and Kamino AI will
          summarize community lore and discussions.
        </Txt>
        <View
          style={[
            styles.followUpInputWrap,
            {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <TextInput
            value={followUpQuestion}
            onChangeText={setFollowUpQuestion}
            placeholder="e.g. What are the main fan theories?"
            placeholderTextColor={theme.subtle}
            returnKeyType="send"
            onSubmitEditing={() => void handleFollowUpSubmit()}
            style={[styles.followUpInput, { color: theme.ink }]}
          />
        </View>
        <GradientButton
          label={followUpBusy ? "Summarizing…" : "Get AI Answer"}
          icon="sparkles"
          gradient="hero"
          size="lg"
          full
          busy={followUpBusy}
          onPress={() => void handleFollowUpSubmit()}
        />
        {followUpAnswer ? (
          <View
            style={{
              padding: 12,
              borderRadius: radius.card,
              backgroundColor: theme.surfaceAi,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Txt
              selectable
              style={{
                fontFamily: font.regular,
                fontSize: 13.5,
                lineHeight: 20,
                color: theme.ink,
              }}
            >
              {followUpAnswer}
            </Txt>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

/**
 * Shimmer skeleton loader matching the Search Results layout.
 */
function SearchShimmerSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, gap: 14 }}>
      <View
        style={{
          height: 112,
          borderRadius: radius.xl,
          backgroundColor: theme.surfaceAi,
        }}
      />
      <SkeletonList count={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchHeaderWrap: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  searchBarBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    paddingVertical: 8,
    outlineWidth: 0,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardGroup: {
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    minHeight: 46,
  },
  recentRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  recentRemoveBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  aiAnswerCard: {
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
  },
  aiAnswerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aiIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#A855F7",
  },
  aiFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  askFollowUpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  communityRowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  followBtnPill: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  postResultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  postStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  postStatText: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    color: "#94A3B8",
  },
  wikiResultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  eventResultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  eventDateBox: {
    width: 48,
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eventRsvpIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  followUpInputWrap: {
    borderRadius: radius.tile,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  followUpInput: {
    fontFamily: font.regular,
    fontSize: 14,
    outlineWidth: 0,
  },
});