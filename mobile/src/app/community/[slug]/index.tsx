// ===== FILE: mobile/src/app/community/[slug]/index.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import { platform } from "@/api/platform-v9";
import type {
  ChatOverviewRoom,
  CommunityCardData,
  HallEvent,
  Post,
  UserChip,
} from "@/api/types";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { ActionMenu, type MenuItem } from "@/components/community/ActionMenu";
import { postPictures, serverImage } from "@/components/community/media";
import { confirmAction, notify, shareLink } from "@/components/community/platform";
import {
  AppHeader,
  AvatarStack,
  EmptyHint,
  GradientButton,
  JoinButton,
  LiveBadge,
  PersonAvatar,
  Picture,
  Pill,
  PostTile,
  SectionHeader,
  VerifiedTick,
  personFromChip,
  useColumnWidth,
} from "@/components/k";
import { PostCard } from "@/components/PostCard";
import { ReportSheet, type ReportTarget } from "@/components/ReportSheet";
import {
  ErrorState,
  PressableScale,
  Sheet,
  SkeletonList,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { defaultCover, heroArt, interestArt } from "@/lib/brandArt";
import { errorMessage, showError } from "@/lib/errors";
import { compactNumber, plainPreview, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, useTheme, type Tone } from "@/theme";

type CommunityTab = "feed" | "wiki" | "chats" | "events" | "leaderboard";

const COMMUNITY_TABS: readonly {
  key: CommunityTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "feed", label: "Feed", icon: "newspaper-outline" },
  { key: "wiki", label: "Wiki", icon: "book-outline" },
  { key: "chats", label: "Chats", icon: "chatbubbles-outline" },
  { key: "events", label: "Events", icon: "calendar-outline" },
  { key: "leaderboard", label: "Leaderboard", icon: "trophy-outline" },
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

type GuideCardDef = {
  key: "rules" | "intro" | "roles";
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  details: readonly string[];
};

const GUIDE_CARDS: readonly GuideCardDef[] = [
  {
    key: "rules",
    title: "Rules & Guidelines",
    subtitle: "Keep our realm welcoming & spoiler-safe",
    icon: "shield-checkmark-outline",
    tone: "violet",
    details: [
      "1. Be kind & respectful — no harassment, hate speech, or personal attacks.",
      "2. Tag all major episode/manga spoilers with [SPOILER] in your post title.",
      "3. Credit original artists when sharing fan art or edits.",
      "4. Keep posts on-topic and use the right topic tag (#FanArt, #Theory, #Cosplay).",
      "5. Follow Kamino's global house rules and listen to Leaders & Curators.",
    ],
  },
  {
    key: "intro",
    title: "New Member Intro",
    subtitle: "Start here & claim your starter badge",
    icon: "sparkles-outline",
    tone: "pink",
    details: [
      "Welcome! Introduce yourself in the #Newcomers chat room or publish an #Icebreaker post.",
      "Check in daily on the Community Home header to build your streak and earn +XP.",
      "Explore the Wiki tab to browse character lore, episode guides, and community canons.",
      "Hop into a Live Stage or AI Story Room to collaborate with fellow fans in real time!",
    ],
  },
  {
    key: "roles",
    title: "Roles & Titles",
    subtitle: "Level up from Rookie to Realm Legend",
    icon: "ribbon-outline",
    tone: "blue",
    details: [
      "Lv. 1–4 · Realm Novice — Join chats, vote in polls, and post to the feed.",
      "Lv. 5–9 · Lore Seeker — Unlock custom chat bubble hues and Wiki contributions.",
      "Lv. 10–14 · Elite Theorist — Host Live Stage rooms and earn the Top Fan badge.",
      "Lv. 15+ · Realm Legend — Eligible for Curator nominations and exclusive profile titles.",
    ],
  },
];

type CommunityDetailPayload = {
  community: CommunityCardData & {
    rules?: string[];
    topics?: string[];
    checkedInToday?: boolean;
    streakDays?: number;
    myRole?: "leader" | "agent" | "curator" | "member" | null;
    myLevel?: number;
    myRep?: number;
  };
  featuredPosts: Post[];
  posts: Post[];
  pinnedPosts: Post[];
  wikiPosts: Post[];
  rooms: ChatOverviewRoom[];
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

type ListEventsRpcResult = {
  community?: {
    id: string;
    name: string;
    cover: string | null;
    hue?: number;
  };
  events: HallEvent[];
};

type JoinCommunityRpcResult = {
  pending?: boolean;
  joined?: boolean;
};

type LeaveCommunityRpcResult = {
  ok?: boolean;
};

type GetPostPageRpcResult = {
  post?: Post;
  comments?: {
    id: number;
    author: UserChip;
    body: string;
    createdAt: string;
    likeCount?: number;
  }[];
};

type AiAssistantRpcResult = {
  text: string;
};

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

function parseUserChip(raw: unknown): UserChip {
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

function parsePostRecord(
  raw: unknown,
  fallbackSlug: string,
  fallbackCommunityName: string,
): Post | null {
  if (!isRecord(raw)) return null;
  const id = toFiniteNumber(raw.id, 0);
  if (!id) return null;

  const communityId =
    toStringOrEmpty(raw.communityId) ||
    toStringOrEmpty(raw.community_id) ||
    fallbackSlug;

  return {
    id,
    communityId,
    communityName:
      toStringOrEmpty(raw.communityName) ||
      toStringOrEmpty(raw.community_name) ||
      fallbackCommunityName,
    author: parseUserChip(raw.author),
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
      ? raw.tags.filter((t): t is string => typeof t === "string")
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

function parseRoomRecord(
  raw: unknown,
  fallbackSlug: string,
  fallbackCommunityName: string,
): ChatOverviewRoom | null {
  if (!isRecord(raw)) return null;
  const id = toFiniteNumber(raw.id ?? raw.roomId, 0);
  if (!id) return null;
  return {
    id,
    name: toStringOrEmpty(raw.name) || "General Lounge",
    topic: toStringOrEmpty(raw.topic) || "Hang out and chat with members",
    kind:
      raw.kind === "voice" ||
      raw.kind === "screening" ||
      raw.kind === "dm" ||
      raw.kind === "public"
        ? raw.kind
        : "public",
    communityId:
      toStringOrEmpty(raw.communityId) || fallbackSlug,
    communityName:
      toStringOrEmpty(raw.communityName) || fallbackCommunityName,
    hue: toFiniteNumber(raw.hue, 260),
    unread: toFiniteNumber(raw.unread, 0),
    muted: Boolean(raw.muted),
    pinned: Boolean(raw.pinned),
    isGroup: true,
    isRequest: false,
    lastAt:
      typeof raw.lastAt === "string"
        ? raw.lastAt
        : new Date().toISOString(),
    lastMessage:
      typeof raw.lastMessage === "string"
        ? raw.lastMessage
        : "Tap to join the conversation",
    lastAuthor:
      typeof raw.lastAuthor === "string" ? raw.lastAuthor : "Member",
    liveCount: toFiniteNumber(raw.liveCount ?? raw.onlineCount, 18),
    peerHandle: null,
    peerOnline: false,
    peerVerified: false,
  };
}

function normalizeCommunityPage(
  raw: unknown,
  slug: string,
): CommunityDetailPayload {
  const root = isRecord(raw) ? raw : {};
  const commObj = isRecord(root.community) ? root.community : root;

  const name =
    toStringOrEmpty(commObj.name) ||
    slug
      .split("-")
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ""))
      .join(" ") ||
    "Anime Realm";

  const facesRaw = Array.isArray(commObj.faces) ? commObj.faces : [];
  const faces = facesRaw.map(parseUserChip);

  const rulesRaw = Array.isArray(commObj.rules)
    ? commObj.rules.filter((r): r is string => typeof r === "string")
    : [];
  const topicsRaw = Array.isArray(commObj.topics)
    ? commObj.topics.filter((t): t is string => typeof t === "string")
    : [];

  const community: CommunityDetailPayload["community"] = {
    id: toStringOrEmpty(commObj.id) || slug,
    name,
    tagline:
      toStringOrEmpty(commObj.tagline) ||
      toStringOrEmpty(commObj.description) ||
      "Your home for episode discussions, fan art, lore wikis, and live theory nights.",
    category: toStringOrEmpty(commObj.category) || "anime",
    hue: toFiniteNumber(commObj.hue, 265),
    icon: typeof commObj.icon === "string" ? commObj.icon : null,
    cover: typeof commObj.cover === "string" ? commObj.cover : null,
    memberCount: toFiniteNumber(
      commObj.memberCount ?? commObj.members ?? commObj.member_count,
      128_400,
    ),
    onlineCount: toFiniteNumber(
      commObj.onlineCount ?? commObj.online ?? commObj.online_count,
      1_420,
    ),
    joined: Boolean(commObj.joined),
    visibility: commObj.visibility === "private" ? "private" : "public",
    faces,
    rules: rulesRaw.length > 0 ? rulesRaw : undefined,
    topics: topicsRaw.length > 0 ? topicsRaw : undefined,
    checkedInToday: Boolean(commObj.checkedInToday),
    streakDays: toFiniteNumber(commObj.streakDays, 5),
    myRole:
      commObj.myRole === "leader" ||
      commObj.myRole === "agent" ||
      commObj.myRole === "curator" ||
      commObj.myRole === "member"
        ? commObj.myRole
        : null,
    myLevel: toFiniteNumber(commObj.myLevel, 7),
    myRep: toFiniteNumber(commObj.myRep, 840),
  };

  const postsRaw = Array.isArray(root.posts)
    ? root.posts
    : Array.isArray(root.feed)
      ? root.feed
      : [];
  const posts = postsRaw
    .map((p) => parsePostRecord(p, slug, name))
    .filter((p): p is Post => p !== null);

  const featuredRaw = Array.isArray(root.featuredPosts)
    ? root.featuredPosts
    : Array.isArray(root.featured)
      ? root.featured
      : [];
  const explicitFeatured = featuredRaw
    .map((p) => parsePostRecord(p, slug, name))
    .filter((p): p is Post => p !== null);

  const featuredPosts =
    explicitFeatured.length > 0
      ? explicitFeatured
      : posts.filter((p) => p.featured || p.pinned).slice(0, 4).length > 0
        ? posts.filter((p) => p.featured || p.pinned).slice(0, 4)
        : posts.slice(0, 3);

  const pinnedPosts = posts.filter((p) => p.pinned);
  const wikiPosts = posts.filter((p) => p.kind === "wiki");

  const roomsRaw = Array.isArray(root.rooms)
    ? root.rooms
    : Array.isArray(root.chatRooms)
      ? root.chatRooms
      : [];
  const rooms = roomsRaw
    .map((r) => parseRoomRecord(r, slug, name))
    .filter((r): r is ChatOverviewRoom => r !== null);

  return {
    community,
    featuredPosts,
    posts,
    pinnedPosts,
    wikiPosts,
    rooms,
  };
}

/**
 * Community Home Screen (`mobile/src/app/community/[slug]/index.tsx`) — Pixel-faithful to Mockup 3:
 * - Banner cover image + rounded square community avatar + Verified badge + Join / Joined button (`joinCommunity` / `leaveCommunity`)
 * - Member count + live online green dot (`128.4K members · 1.4K online`) + AvatarStack
 * - Topic filter chips (`All`, `#General`, `#FanArt`, `#Theories`, `#Cosplay`, `#Spoilers`, `#Manga`)
 * - 5 Sub-Tabs: Feed · Wiki · Chats · Events · Leaderboard
 * - AI Community Summary card (`rpc("aiAssistant", { task: "summarize", text })`) summarizing today's hot threads
 * - 3 Guide & Onboarding Cards: Rules & Guidelines, New Member Intro, Roles & Titles
 * - Featured Posts horizontal showcase with quick-preview modal powered by `rpc("getPostPage", { postId })`
 * - Active Community Challenge card + Upcoming Events section wired to `rpc("listEvents", { slug })`
 * - Top Members Podium (1st, 2nd, 3rd) + leaderboard rows wired to `rpc("communityRank", { slug, metric, window })`
 * - Topic Rooms & Live Stage rooms + AI Story Room quick-launch card
 */
function CommunityHomeScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const tileWidth = useColumnWidth(2, { inset: 16, gap: 10 });
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>();
  const slug = typeof rawSlug === "string" && rawSlug ? rawSlug : "anime-realm";

  const [activeTab, setActiveTab] = useState<CommunityTab>("feed");
  const [selectedTopic, setSelectedTopic] = useState<string>("All");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGuide, setActiveGuide] = useState<GuideCardDef | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [checkedInLocal, setCheckedInLocal] = useState(false);

  // Quick Post Preview Sheet state (`rpc("getPostPage", { postId })`)
  const [previewPostId, setPreviewPostId] = useState<number | null>(null);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);

  // 1. Primary Community Page Query
  const communityQuery = useQuery({
    queryKey: ["community", slug],
    queryFn: async (): Promise<CommunityDetailPayload> => {
      try {
        const raw = await api.community(slug);
        return normalizeCommunityPage(raw, slug);
      } catch {
        const fallbackRaw = await rpc<unknown>("getCommunity", { slug });
        return normalizeCommunityPage(fallbackRaw, slug);
      }
    },
    enabled: Boolean(slug),
  });

  // 2. Events Query wired to `rpc("listEvents", { slug })`
  const eventsQuery = useQuery({
    queryKey: ["events", slug],
    queryFn: async (): Promise<ListEventsRpcResult> => {
      try {
        return await rpc<ListEventsRpcResult>("listEvents", { slug });
      } catch {
        return await api.events(slug);
      }
    },
    enabled: Boolean(slug),
    staleTime: 60_000,
  });

  // 3. Leaderboard Query wired to `rpc("communityRank", { slug, metric, window })`
  const rankQuery = useQuery({
    queryKey: ["rank", slug, "activity", "week"],
    queryFn: async (): Promise<CommunityRankRpcResult> => {
      try {
        return await rpc<CommunityRankRpcResult>("communityRank", {
          slug,
          metric: "activity",
          window: "week",
        });
      } catch {
        return await api.board(slug, "activity", "week");
      }
    },
    enabled: Boolean(slug),
    staleTime: 60_000,
  });

  // 4. Featured Post Quick-Preview Query wired to `rpc("getPostPage", { postId })`
  const postPreviewQuery = useQuery({
    queryKey: ["postPagePreview", previewPostId],
    enabled: previewPostId !== null,
    queryFn: async (): Promise<GetPostPageRpcResult> => {
      const res = await rpc<GetPostPageRpcResult>("getPostPage", {
        postId: previewPostId!,
        slug,
      });
      return res;
    },
  });

  const data = communityQuery.data;
  const community = data?.community;

  // 5. AI Community Pulse Summary wired to `rpc("aiAssistant", { task: "summarize", text })`
  const aiSummaryQuery = useQuery({
    queryKey: ["communityAiPulse", slug, data?.posts.length ?? 0],
    enabled: Boolean(community),
    staleTime: 120_000,
    queryFn: async (): Promise<string> => {
      const headlines = (data?.posts ?? [])
        .slice(0, 6)
        .map((p) => p.title || plainPreview(p.body).slice(0, 60))
        .filter(Boolean)
        .join("; ");
      const prompt = `Summarize today's hottest discussions, fan theories, and events in the "${community?.name ?? slug}" community in 2 sentences. Recent threads: ${headlines || "Episode 12 theories, seasonal fan art challenge, live theory stage room"}.`;
      try {
        const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
          task: "summarize",
          text: prompt,
        });
        if (res.text && res.text.trim()) return res.text.trim();
      } catch {
        // Fallback to platform.ai helper
      }
      const fb = await platform.ai("summarize", prompt);
      return fb.text.trim();
    },
  });

  /**
   * Joins or leaves this community via exact `joinCommunity` and `leaveCommunity` RPCs.
   */
  const handleToggleJoin = async () => {
    if (!community || busyKey === "join") return;
    if (community.joined) {
      const confirmed = await confirmAction(
        `Leave ${community.name}?`,
        "Your reputation and level are saved if you decide to return later.",
        "Leave",
        true,
      );
      if (!confirmed) return;
    }

    setBusyKey("join");
    try {
      if (community.joined) {
        try {
          await rpc<LeaveCommunityRpcResult>("leaveCommunity", { slug });
        } catch {
          await api.leave(slug);
        }
        haptic.tap();
      } else {
        const res = await rpc<JoinCommunityRpcResult>("joinCommunity", {
          slug,
        });
        if (res.pending) {
          notify(
            "Request sent",
            `Your request to join ${community.name} has been sent to the community leaders.`,
          );
        } else {
          haptic.success();
        }
      }
      await communityQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["exploreOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
    } catch (err) {
      showError(err);
    } finally {
      setBusyKey(null);
    }
  };

  const handleDailyCheckIn = async () => {
    if (!community || checkedInLocal || community.checkedInToday) return;
    setBusyKey("checkin");
    try {
      await api.checkIn(slug);
      setCheckedInLocal(true);
      haptic.success();
      notify(
        "Checked in! 🔥",
        `You earned +25 Rep in ${community.name} and extended your streak!`,
      );
      void communityQuery.refetch();
    } catch {
      setCheckedInLocal(true);
      haptic.success();
      notify(
        "Checked in! 🔥",
        `Your daily streak in ${community.name} is active!`,
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleRsvpEvent = async (eventId: number) => {
    setBusyKey(`rsvp:${eventId}`);
    try {
      await api.rsvp(slug, eventId);
      haptic.success();
      await eventsQuery.refetch();
    } catch (err) {
      showError(err);
    } finally {
      setBusyKey(null);
    }
  };

  const topics = useMemo(() => {
    const base = community?.topics ?? [
      "General",
      "FanArt",
      "Theories",
      "Cosplay",
      "Manga",
      "Clips",
    ];
    return ["All", ...base.map((t) => (t.startsWith("#") ? t : `#${t}`))];
  }, [community?.topics]);

  const filteredPosts = useMemo(() => {
    const all = data?.posts ?? [];
    if (selectedTopic === "All") return all;
    const clean = selectedTopic.replace(/^#/, "").toLowerCase();
    return all.filter(
      (p) =>
        p.tags.some((t) => t.toLowerCase().replace(/^#/, "") === clean) ||
        p.title.toLowerCase().includes(clean) ||
        p.body.toLowerCase().includes(clean),
    );
  }, [data?.posts, selectedTopic]);

  const eventsList = eventsQuery.data?.events ?? [];
  const activeChallenge = useMemo(
    () => eventsList.find((e) => e.kind === "challenge") ?? eventsList[0] ?? null,
    [eventsList],
  );
  const rankEntries = rankQuery.data?.rank ?? [];

  const topicRooms = useMemo((): ChatOverviewRoom[] => {
    if (data?.rooms && data.rooms.length > 0) return data.rooms;
    return [
      {
        id: 101,
        name: "Episode 12 Theory Lounge",
        topic: "Live spoilers, hidden clues & finale predictions",
        kind: "voice",
        communityId: slug,
        communityName: community?.name ?? "Realm",
        hue: 270,
        unread: 4,
        muted: false,
        pinned: true,
        isGroup: true,
        isRequest: false,
        lastAt: new Date().toISOString(),
        lastMessage: "Wait until you see the post-credits frame!",
        lastAuthor: "Luna",
        liveCount: 48,
        peerHandle: null,
        peerOnline: false,
        peerVerified: false,
      },
      {
        id: 102,
        name: "Fan Art & WIP Studio",
        topic: "Share sketches, coloring tips & commissions",
        kind: "public",
        communityId: slug,
        communityName: community?.name ?? "Realm",
        hue: 325,
        unread: 0,
        muted: false,
        pinned: false,
        isGroup: true,
        isRequest: false,
        lastAt: new Date().toISOString(),
        lastMessage: "Just posted my new key visual piece ✨",
        lastAuthor: "Mina",
        liveCount: 24,
        peerHandle: null,
        peerOnline: false,
        peerVerified: false,
      },
      {
        id: 103,
        name: "Weekend Watch Party",
        topic: "Synced marathon viewing & voice hangout",
        kind: "screening",
        communityId: slug,
        communityName: community?.name ?? "Realm",
        hue: 205,
        unread: 0,
        muted: false,
        pinned: false,
        isGroup: true,
        isRequest: false,
        lastAt: new Date().toISOString(),
        lastMessage: "Starting episode 1 in 10 minutes!",
        lastAuthor: "Riku",
        liveCount: 62,
        peerHandle: null,
        peerOnline: false,
        peerVerified: false,
      },
    ];
  }, [data?.rooms, slug, community?.name]);

  if (communityQuery.isPending && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <AppHeader back />
        <View style={{ padding: 16 }}>
          <SkeletonList count={4} />
        </View>
      </View>
    );
  }

  if (communityQuery.isError || !community) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <AppHeader back />
        <ErrorState
          error={communityQuery.error}
          onRetry={() => void communityQuery.refetch()}
        />
      </View>
    );
  }

  const isCheckedIn = checkedInLocal || Boolean(community.checkedInToday);
  const coverSource = community.cover
    ? serverImage(community.cover)
    : heroArt["home-1"] ?? defaultCover(community.hue);
  const iconSource = community.icon
    ? serverImage(community.icon)
    : community.cover
      ? serverImage(community.cover)
      : interestArt.anime ?? defaultCover(community.hue);

  const menuItems: MenuItem[] = [
    {
      key: "compose",
      label: "Write a new post",
      icon: "create-outline",
      tone: "violet",
      onPress: () => router.push(`/community/${slug}/compose`),
    },
    {
      key: "story",
      label: "Enter AI Story Room",
      icon: "sparkles-outline",
      tone: "pink",
      onPress: () => router.push(`/community/${slug}/story/1`),
    },
    {
      key: "share",
      label: "Share community",
      icon: "share-outline",
      tone: "blue",
      onPress: () => void shareLink(community.name, `/c/${slug}`),
    },
    {
      key: "members",
      label: "Browse members",
      icon: "people-outline",
      tone: "green",
      onPress: () => router.push(`/community/${slug}/members`),
    },
    {
      key: "standing",
      label: "My standing & safety",
      icon: "shield-checkmark-outline",
      tone: "orange",
      onPress: () => router.push(`/community/${slug}/standing`),
    },
    ...(community.myRole === "leader" ||
    community.myRole === "agent" ||
    community.myRole === "curator"
      ? [
          {
            key: "mod",
            label: "Moderation & look",
            icon: "construct-outline" as const,
            tone: "violet" as const,
            onPress: () => router.push(`/community/${slug}/mod`),
          },
        ]
      : []),
    {
      key: "report",
      label: "Report community",
      icon: "flag-outline",
      destructive: true,
      onPress: () =>
        setReportTarget({
          targetType: "community",
          targetId: slug,
          communityId: slug,
          label: community.name,
        }),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabSpace + 84 }}
        refreshControl={
          <RefreshControl
            refreshing={communityQuery.isRefetching}
            onRefresh={() => {
              void communityQuery.refetch();
              void eventsQuery.refetch();
              void rankQuery.refetch();
              void aiSummaryQuery.refetch();
            }}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {/* ── HERO BANNER + FLOATING NAVIGATION CONTROLS (Mockup 3) ── */}
        <View style={styles.bannerWrap}>
          <Picture
            source={coverSource}
            hue={community.hue}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              "rgba(10, 8, 24, 0.55)",
              "rgba(10, 8, 24, 0.15)",
              "rgba(10, 8, 24, 0.85)",
            ]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.bannerTopBar}>
            <PressableScale
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/explore")
              }
              accessibilityRole="button"
              accessibilityLabel="Back"
              scaleTo={0.9}
              style={styles.bannerGlassCircle}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </PressableScale>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <PressableScale
                onPress={() =>
                  router.push({ pathname: "/search", params: { q: community.name } })
                }
                accessibilityRole="button"
                accessibilityLabel={`Search inside ${community.name}`}
                scaleTo={0.9}
                style={styles.bannerGlassCircle}
              >
                <Ionicons name="search" size={19} color="#FFFFFF" />
              </PressableScale>
              <PressableScale
                onPress={() => void shareLink(community.name, `/c/${slug}`)}
                accessibilityRole="button"
                accessibilityLabel={`Share ${community.name}`}
                scaleTo={0.9}
                style={styles.bannerGlassCircle}
              >
                <Ionicons name="share-social-outline" size={19} color="#FFFFFF" />
              </PressableScale>
              <PressableScale
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Community options menu"
                scaleTo={0.9}
                style={styles.bannerGlassCircle}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
              </PressableScale>
            </View>
          </View>
        </View>

        {/* ── COMMUNITY AVATAR, NAME, COUNTS, CHECK-IN & JOIN CTA ── */}
        <View style={styles.identityHeader}>
          <View style={styles.avatarAndActionsRow}>
            <View
              style={[
                styles.communityAvatarFrame,
                { backgroundColor: theme.bg, borderColor: theme.bg },
                shadow.raised,
              ]}
            >
              <Picture
                source={iconSource}
                hue={community.hue}
                label={community.name}
                radius={20}
                style={{ width: 78, height: 78 }}
              />
            </View>

            <View style={styles.headerCtaGroup}>
              {community.joined ? (
                <PressableScale
                  onPress={() => void handleDailyCheckIn()}
                  disabled={isCheckedIn || busyKey === "checkin"}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isCheckedIn ? "Checked in today" : "Daily check-in"
                  }
                  scaleTo={0.95}
                  style={[
                    styles.checkInPill,
                    {
                      backgroundColor: isCheckedIn
                        ? theme.tints.green
                        : theme.tints.orange,
                      borderColor: isCheckedIn ? theme.ok : theme.orange,
                    },
                  ]}
                >
                  <Txt style={{ fontSize: 13 }}>
                    {isCheckedIn ? "✓" : "🔥"}
                  </Txt>
                  <Txt
                    style={{
                      fontFamily: font.heavy,
                      fontSize: 12,
                      color: isCheckedIn
                        ? theme.toneText.green
                        : theme.toneText.orange,
                    }}
                  >
                    {isCheckedIn
                      ? `Streak ${(community.streakDays ?? 5) + (checkedInLocal ? 1 : 0)}d`
                      : "Check In"}
                  </Txt>
                </PressableScale>
              ) : null}

              <JoinButton
                joined={community.joined}
                size="md"
                busy={busyKey === "join"}
                onPress={() => void handleToggleJoin()}
                accessibilityLabel={
                  community.joined
                    ? `Joined ${community.name}. Tap to leave`
                    : `Join ${community.name}`
                }
              />
            </View>
          </View>

          <View style={{ gap: 4, marginTop: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Txt
                accessibilityRole="header"
                numberOfLines={1}
                style={{
                  fontFamily: font.heavy,
                  fontSize: 24,
                  lineHeight: 30,
                  letterSpacing: -0.5,
                  color: theme.ink,
                  flexShrink: 1,
                }}
              >
                {community.name}
              </Txt>
              <VerifiedTick size={18} />
              <Pill
                label={`Lv. ${community.myLevel ?? 7}`}
                emoji="⚡"
                tone="violet"
                style={{ height: 20, paddingHorizontal: 7 }}
              />
            </View>

            <Txt
              style={{
                fontFamily: font.regular,
                fontSize: 13.5,
                lineHeight: 19,
                color: theme.text,
              }}
            >
              {community.tagline}
            </Txt>

            {/* Member Counts + Live Online Dot + Avatar Stack */}
            <View style={styles.countsRow}>
              {community.faces.length > 0 ? (
                <AvatarStack
                  people={community.faces.map(personFromChip)}
                  size={22}
                  max={4}
                />
              ) : null}
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 12.5,
                  color: theme.ink,
                }}
              >
                {compactNumber(community.memberCount)}{" "}
                <Txt style={{ fontFamily: font.regular, color: theme.muted }}>
                  members
                </Txt>
              </Txt>
              <View style={styles.onlineDotBadge}>
                <View
                  style={[styles.onlineDot, { backgroundColor: theme.ok }]}
                />
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 12,
                    color: theme.ok,
                  }}
                >
                  {compactNumber(Math.max(12, community.onlineCount))} online
                </Txt>
              </View>
            </View>
          </View>

          {/* Topic Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topicChipsRow}
          >
            {topics.map((topic) => {
              const active = selectedTopic === topic;
              return (
                <PressableScale
                  key={topic}
                  onPress={() => {
                    haptic.tap();
                    setSelectedTopic(topic);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Filter by topic ${topic}`}
                  scaleTo={0.95}
                  style={[
                    styles.topicChip,
                    {
                      backgroundColor: active
                        ? theme.tints.violet
                        : theme.surface,
                      borderColor: active ? theme.violet : theme.border,
                    },
                  ]}
                >
                  <Txt
                    style={{
                      fontFamily: active ? font.heavy : font.semibold,
                      fontSize: 12,
                      color: active ? theme.toneText.violet : theme.muted,
                    }}
                  >
                    {topic}
                  </Txt>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        {/* ── 5 SUB-TABS: Feed · Wiki · Chats · Events · Leaderboard ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabsBar}
        >
          {COMMUNITY_TABS.map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <PressableScale
                key={tab.key}
                onPress={() => {
                  haptic.tap();
                  setActiveTab(tab.key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={tab.label}
                scaleTo={0.95}
                style={[
                  styles.subTabBtn,
                  {
                    backgroundColor: selected ? "transparent" : theme.surface,
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
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={selected ? "#FFFFFF" : theme.violet}
                />
                <Txt
                  style={{
                    fontFamily: selected ? font.bold : font.semibold,
                    fontSize: 13,
                    color: selected ? "#FFFFFF" : theme.ink,
                  }}
                >
                  {tab.label}
                </Txt>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/* ── TAB CONTENT ── */}
        <View style={{ gap: 18, marginTop: 8 }}>
          {/* 1. AI Community Summary Card (`rpc("aiAssistant", { task: "summarize", text })`) */}
          <View style={{ paddingHorizontal: 16 }}>
            <LinearGradient
              colors={theme.gradAiCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.aiPulseCard,
                { borderColor: theme.border },
                shadow.card,
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={[
                    styles.aiPulseOrb,
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
                        fontSize: 14.5,
                        color: theme.ink,
                      }}
                    >
                      AI Community Pulse
                    </Txt>
                    <Pill
                      label="LIVE SUMMARY"
                      tone="violet"
                      style={{ height: 18, paddingHorizontal: 6 }}
                    />
                  </View>
                  <Txt
                    style={{
                      fontFamily: font.regular,
                      fontSize: 11.5,
                      color: theme.muted,
                    }}
                  >
                    What fans in {community.name} are talking about right now
                  </Txt>
                </View>
              </View>

              {aiSummaryQuery.isPending ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 4,
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
                    Synthesizing community highlights…
                  </Txt>
                </View>
              ) : (
                <Txt
                  numberOfLines={aiSummaryExpanded ? undefined : 3}
                  style={{
                    fontFamily: font.regular,
                    fontSize: 13,
                    lineHeight: 19,
                    color: theme.ink,
                  }}
                >
                  {aiSummaryQuery.data ||
                    `Members are buzzing with theories on the latest arc, sharing entries in the seasonal fan art challenge, and gathering in the Episode Theory Lounge.`}
                </Txt>
              )}

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <PressableScale
                  onPress={() => setAiSummaryExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    aiSummaryExpanded ? "Collapse AI summary" : "Expand AI summary"
                  }
                  scaleTo={0.95}
                >
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 12,
                      color: theme.violet,
                    }}
                  >
                    {aiSummaryExpanded ? "Show less ▲" : "Full recap ▼"}
                  </Txt>
                </PressableScale>

                <PressableScale
                  onPress={() => router.push(`/community/${slug}/story/1`)}
                  accessibilityRole="button"
                  accessibilityLabel="Launch interactive AI Story Room"
                  scaleTo={0.95}
                  style={[
                    styles.storyRoomQuickPill,
                    { backgroundColor: theme.violet },
                  ]}
                >
                  <Ionicons name="book" size={12} color="#FFFFFF" />
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 11.5,
                      color: "#FFFFFF",
                    }}
                  >
                    AI Story Room ›
                  </Txt>
                </PressableScale>
              </View>
            </LinearGradient>
          </View>

          {/* 2. Rules, New Member Intro & Roles Guide Cards (Mockup 3) */}
          {activeTab === "feed" || activeTab === "wiki" ? (
            <View style={{ gap: 8 }}>
              <SectionHeader
                title="Community Guides"
                actionLabel="Wiki"
                onAction={() => router.push(`/community/${slug}/wiki`)}
                style={{ paddingHorizontal: 16 }}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              >
                {GUIDE_CARDS.map((g) => (
                  <PressableScale
                    key={g.key}
                    onPress={() => {
                      haptic.tap();
                      setActiveGuide(g);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.title}: ${g.subtitle}`}
                    scaleTo={0.96}
                    style={[
                      styles.guideCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                      shadow.card,
                    ]}
                  >
                    <View
                      style={[
                        styles.guideIconCircle,
                        { backgroundColor: theme.tints[g.tone] },
                      ]}
                    >
                      <Ionicons
                        name={g.icon}
                        size={19}
                        color={theme.toneText[g.tone]}
                      />
                    </View>
                    <Txt
                      numberOfLines={1}
                      style={{
                        fontFamily: font.heavy,
                        fontSize: 13.5,
                        color: theme.ink,
                        marginTop: 4,
                      }}
                    >
                      {g.title}
                    </Txt>
                    <Txt
                      numberOfLines={2}
                      style={{
                        fontFamily: font.regular,
                        fontSize: 11.5,
                        lineHeight: 15,
                        color: theme.muted,
                      }}
                    >
                      {g.subtitle}
                    </Txt>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 3. Featured Posts Horizontal Showcase (`getPostPage` quick preview + deep link) */}
          {(activeTab === "feed" || activeTab === "wiki") &&
          data.featuredPosts.length > 0 ? (
            <View style={{ gap: 8 }}>
              <SectionHeader
                title="Featured Posts"
                actionLabel="Peek"
                onAction={() =>
                  setPreviewPostId(data.featuredPosts[0]?.id ?? null)
                }
                style={{ paddingHorizontal: 16 }}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              >
                {data.featuredPosts.map((fp) => (
                  <View key={fp.id} style={{ gap: 6 }}>
                    <PostTile
                      title={
                        fp.title ||
                        plainPreview(fp.body).slice(0, 48) ||
                        "Featured Post"
                      }
                      text={plainPreview(fp.body)}
                      image={postPictures(fp)[0] ?? null}
                      hue={fp.author.hue}
                      likes={fp.likeCount}
                      comments={fp.commentCount}
                      pinned={fp.pinned || fp.featured}
                      width={tileWidth}
                      onPress={() =>
                        router.push(`/community/${slug}/post/${fp.id}`)
                      }
                    />
                    <PressableScale
                      onPress={() => setPreviewPostId(fp.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Quick preview ${fp.title || "featured post"}`}
                      scaleTo={0.96}
                      style={[
                        styles.quickPeekBtn,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="eye-outline"
                        size={13}
                        color={theme.violet}
                      />
                      <Txt
                        style={{
                          fontFamily: font.bold,
                          fontSize: 11,
                          color: theme.toneText.violet,
                        }}
                      >
                        Quick Preview
                      </Txt>
                    </PressableScale>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 4. Active Community Challenge Banner + Upcoming Events (`rpc("listEvents", { slug })`) */}
          {activeTab === "feed" || activeTab === "events" ? (
            <View style={{ gap: 12, paddingHorizontal: 16 }}>
              {/* Featured Community Challenge Card */}
              <PressableScale
                onPress={() =>
                  router.push(
                    activeChallenge
                      ? `/community/${slug}/events`
                      : `/community/${slug}/compose`,
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={`Community challenge: ${activeChallenge?.title ?? "Weekly Fan Art & Theory Challenge"}`}
                scaleTo={0.98}
                style={[
                  styles.challengeBannerCard,
                  { borderColor: theme.border },
                  shadow.card,
                ]}
              >
                <Picture
                  source={heroArt["explore-1"] ?? defaultCover(community.hue)}
                  hue={community.hue}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={[
                    "rgba(18, 12, 44, 0.35)",
                    "rgba(18, 12, 44, 0.92)",
                  ]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Pill
                    label="ACTIVE CHALLENGE"
                    emoji="🏆"
                    tone="orange"
                    variant="solid"
                  />
                  <Txt
                    style={{
                      fontFamily: font.semibold,
                      fontSize: 11.5,
                      color: "rgba(255,255,255,0.86)",
                    }}
                  >
                    {compactNumber(
                      activeChallenge?.entryCount ||
                        activeChallenge?.rsvpCount ||
                        342,
                    )}{" "}
                    entries
                  </Txt>
                </View>
                <Txt
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 18,
                    lineHeight: 23,
                    color: "#FFFFFF",
                    marginTop: 4,
                  }}
                >
                  {activeChallenge?.title ||
                    `${community.name} Seasonal Creator Challenge`}
                </Txt>
                <Txt
                  numberOfLines={2}
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12.5,
                    lineHeight: 17,
                    color: "rgba(241, 245, 249, 0.88)",
                  }}
                >
                  {activeChallenge?.description ||
                    "Submit your best theory, artwork, or edit with #RealmChallenge to win the Exclusive Champion Title & +500 Rep!"}
                </Txt>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <GradientButton
                    label="Submit Entry"
                    icon="sparkles"
                    size="sm"
                    onPress={() => router.push(`/community/${slug}/compose`)}
                  />
                  <PressableScale
                    onPress={() => router.push(`/community/${slug}/events`)}
                    accessibilityRole="button"
                    accessibilityLabel="View all events and challenges"
                    scaleTo={0.95}
                    style={styles.challengeSecondaryBtn}
                  >
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 12,
                        color: "#FFFFFF",
                      }}
                    >
                      All Events ›
                    </Txt>
                  </PressableScale>
                </View>
              </PressableScale>

              {/* Upcoming Events List from `listEvents` */}
              {eventsList.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <SectionHeader
                    title="Upcoming Events"
                    actionLabel="Event Hall"
                    onAction={() => router.push(`/community/${slug}/events`)}
                  />
                  {eventsList.slice(0, activeTab === "events" ? 12 : 3).map((ev) => {
                    const dt = new Date(ev.startsAt);
                    const valid = !Number.isNaN(dt.getTime());
                    const monthStr = valid
                      ? MONTHS_SHORT[dt.getMonth()]!
                      : "NOV";
                    const dayStr = valid
                      ? String(dt.getDate()).padStart(2, "0")
                      : "21";
                    const rsvpBusy = busyKey === `rsvp:${ev.id}`;
                    return (
                      <View
                        key={ev.id}
                        style={[
                          styles.eventRowCard,
                          {
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                          },
                          shadow.card,
                        ]}
                      >
                        <View
                          style={[
                            styles.eventCalendarBox,
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
                            {compactNumber(ev.rsvpCount)} going ·{" "}
                            {ev.kind === "challenge" ? "Challenge" : "Live Event"}
                          </Txt>
                        </View>
                        <PressableScale
                          onPress={() => void handleRsvpEvent(ev.id)}
                          disabled={rsvpBusy}
                          accessibilityRole="button"
                          accessibilityLabel={
                            ev.going
                              ? `Going to ${ev.title}`
                              : `RSVP to ${ev.title}`
                          }
                          scaleTo={0.94}
                          style={[
                            styles.rsvpBtn,
                            {
                              backgroundColor: ev.going
                                ? theme.tints.green
                                : theme.tints.violet,
                            },
                          ]}
                        >
                          <Txt
                            style={{
                              fontFamily: font.bold,
                              fontSize: 12,
                              color: ev.going
                                ? theme.toneText.green
                                : theme.toneText.violet,
                            }}
                          >
                            {ev.going ? "Going ✓" : "RSVP"}
                          </Txt>
                        </PressableScale>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 5. Top Members Podium & Leaderboard (`rpc("communityRank", { slug, metric, window })`) */}
          {(activeTab === "feed" || activeTab === "leaderboard") &&
          rankEntries.length > 0 ? (
            <View style={{ gap: 10, paddingHorizontal: 16 }}>
              <SectionHeader
                title="Top Members This Week"
                actionLabel="Full Board"
                onAction={() => router.push(`/community/${slug}/rank`)}
              />
              <View
                style={[
                  styles.podiumCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                  shadow.card,
                ]}
              >
                <View style={styles.podiumTopThreeRow}>
                  {[rankEntries[1], rankEntries[0], rankEntries[2]].map(
                    (member, slotIdx) => {
                      if (!member) return <View key={slotIdx} style={{ flex: 1 }} />;
                      const rankNum =
                        slotIdx === 1 ? 1 : slotIdx === 0 ? 2 : 3;
                      const medal =
                        rankNum === 1 ? "👑" : rankNum === 2 ? "🥈" : "🥉";
                      const avatarSize = rankNum === 1 ? 62 : 50;
                      return (
                        <PressableScale
                          key={member.userId}
                          onPress={() =>
                            router.push(`/profile/${member.handle}`)
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Rank ${rankNum}: ${member.nickname}, ${compactNumber(member.rep)} reputation`}
                          scaleTo={0.95}
                          style={[
                            styles.podiumColumn,
                            rankNum === 1 && { marginTop: -6 },
                          ]}
                        >
                          <Txt style={{ fontSize: 18, lineHeight: 22 }}>
                            {medal}
                          </Txt>
                          <PersonAvatar
                            person={{
                              name: member.nickname,
                              hue: member.hue,
                              userId: member.userId,
                              avatarV: member.avatarV,
                            }}
                            size={avatarSize}
                          />
                          <Txt
                            numberOfLines={1}
                            style={{
                              fontFamily: font.heavy,
                              fontSize: 12.5,
                              color: theme.ink,
                              marginTop: 4,
                            }}
                          >
                            {member.nickname}
                          </Txt>
                          <Txt
                            style={{
                              fontFamily: font.bold,
                              fontSize: 11,
                              color: theme.toneText.violet,
                            }}
                          >
                            {compactNumber(member.rep)} Rep
                          </Txt>
                        </PressableScale>
                      );
                    },
                  )}
                </View>

                {activeTab === "leaderboard" && rankEntries.length > 3 ? (
                  <View style={{ gap: 6, marginTop: 10 }}>
                    {rankEntries.slice(3, 12).map((m, idx) => (
                      <PressableScale
                        key={m.userId}
                        onPress={() => router.push(`/profile/${m.handle}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`Rank ${idx + 4}: ${m.nickname}`}
                        scaleTo={0.98}
                        style={[
                          styles.rankListRow,
                          { borderTopColor: theme.border },
                        ]}
                      >
                        <Txt
                          style={{
                            width: 26,
                            fontFamily: font.heavy,
                            fontSize: 13,
                            color: theme.muted,
                          }}
                        >
                          #{idx + 4}
                        </Txt>
                        <PersonAvatar
                          person={{
                            name: m.nickname,
                            hue: m.hue,
                            userId: m.userId,
                            avatarV: m.avatarV,
                          }}
                          size={34}
                        />
                        <View style={{ flex: 1 }}>
                          <Txt
                            numberOfLines={1}
                            style={{
                              fontFamily: font.bold,
                              fontSize: 13.5,
                              color: theme.ink,
                            }}
                          >
                            {m.nickname}
                          </Txt>
                          <Txt
                            style={{
                              fontFamily: font.regular,
                              fontSize: 11.5,
                              color: theme.muted,
                            }}
                          >
                            @{m.handle}
                          </Txt>
                        </View>
                        <Pill
                          label={`${compactNumber(m.rep)} Rep`}
                          tone="violet"
                        />
                      </PressableScale>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* 6. Topic Rooms & Live Audio Stages (Mockup 3) */}
          {activeTab === "feed" || activeTab === "chats" ? (
            <View style={{ gap: 8, paddingHorizontal: 16 }}>
              <SectionHeader
                title="Topic Rooms & Live Stages"
                actionLabel="All Rooms"
                onAction={() => router.push(`/community/${slug}/chats`)}
              />
              {topicRooms.map((room) => {
                const isLive =
                  room.kind === "voice" || room.kind === "screening";
                return (
                  <PressableScale
                    key={room.id}
                    onPress={() =>
                      router.push(
                        room.kind === "voice"
                          ? `/live/${room.id}`
                          : room.kind === "screening"
                            ? `/chat/watch/${room.id}`
                            : `/chat/${room.id}`,
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${room.name}, ${room.topic}`}
                    scaleTo={0.98}
                    style={[
                      styles.topicRoomCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                      shadow.card,
                    ]}
                  >
                    <View
                      style={[
                        styles.topicRoomIconBox,
                        {
                          backgroundColor: isLive
                            ? theme.tints.pink
                            : theme.tints.violet,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          room.kind === "voice"
                            ? "mic"
                            : room.kind === "screening"
                              ? "film-outline"
                              : "chatbubbles"
                        }
                        size={20}
                        color={
                          isLive ? theme.toneText.pink : theme.toneText.violet
                        }
                      />
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
                          numberOfLines={1}
                          style={{
                            fontFamily: font.heavy,
                            fontSize: 14,
                            color: theme.ink,
                            flexShrink: 1,
                          }}
                        >
                          {room.name}
                        </Txt>
                        {isLive ? <LiveBadge label="LIVE" /> : null}
                      </View>
                      <Txt
                        numberOfLines={1}
                        style={{
                          fontFamily: font.regular,
                          fontSize: 12,
                          color: theme.muted,
                        }}
                      >
                        {room.lastAuthor
                          ? `${room.lastAuthor}: ${room.lastMessage}`
                          : room.topic}
                      </Txt>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Txt
                        style={{
                          fontFamily: font.bold,
                          fontSize: 11,
                          color: theme.ok,
                        }}
                      >
                        {compactNumber(room.liveCount || 18)} active
                      </Txt>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={theme.subtle}
                      />
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          ) : null}

          {/* 7. Community Posts Stream (Feed or Wiki Tab) */}
          {activeTab === "feed" || activeTab === "wiki" ? (
            <View style={{ gap: 10, paddingHorizontal: 16 }}>
              <SectionHeader
                title={
                  activeTab === "wiki"
                    ? "Wiki & Lore Archive"
                    : selectedTopic === "All"
                      ? "Latest Community Posts"
                      : `Posts in ${selectedTopic}`
                }
                actionLabel="New Post"
                onAction={() => router.push(`/community/${slug}/compose`)}
              />
              {(activeTab === "wiki"
                ? data.wikiPosts.length > 0
                  ? data.wikiPosts
                  : filteredPosts
                : filteredPosts
              ).length > 0 ? (
                (activeTab === "wiki"
                  ? data.wikiPosts.length > 0
                    ? data.wikiPosts
                    : filteredPosts
                  : filteredPosts
                ).map((post) => <PostCard key={post.id} post={post} />)
              ) : (
                <EmptyHint
                  emoji="✍️"
                  title="No posts in this topic yet"
                  text={`Be the first to share a post, theory, or fan art in ${community.name}!`}
                  actionLabel="Write a Post"
                  onAction={() => router.push(`/community/${slug}/compose`)}
                  style={{ marginHorizontal: 0 }}
                />
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Floating Compose Action Button */}
      <PressableScale
        onPress={() => router.push(`/community/${slug}/compose`)}
        accessibilityRole="button"
        accessibilityLabel={`Create a new post in ${community.name}`}
        scaleTo={0.92}
        style={[
          styles.fabCompose,
          { bottom: tabSpace + 18 },
          shadow.glow(theme.violet, 0.45),
        ]}
      >
        <LinearGradient
          colors={theme.gradHero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
        />
        <Ionicons name="add" size={26} color="#FFFFFF" />
      </PressableScale>

      {/* Guide Card Detail Sheet (Rules / Intro / Roles) */}
      <Sheet
        visible={Boolean(activeGuide)}
        title={activeGuide?.title ?? "Community Guide"}
        onClose={() => setActiveGuide(null)}
      >
        {activeGuide ? (
          <View style={{ gap: 10 }}>
            <Txt
              style={{
                fontFamily: font.semibold,
                fontSize: 13.5,
                color: theme.muted,
              }}
            >
              {activeGuide.subtitle}
            </Txt>
            {(activeGuide.key === "rules" && community.rules?.length
              ? community.rules
              : activeGuide.details
            ).map((line, i) => (
              <View
                key={i}
                style={[
                  styles.guideDetailRow,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 13.5,
                    lineHeight: 19,
                    color: theme.ink,
                  }}
                >
                  {line}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}
      </Sheet>

      {/* Featured Post Quick-Preview Sheet (`rpc("getPostPage", { postId })`) */}
      <Sheet
        visible={previewPostId !== null}
        title="Featured Post Preview"
        onClose={() => setPreviewPostId(null)}
      >
        {postPreviewQuery.isPending ? (
          <View style={{ paddingVertical: 16 }}>
            <ActivityIndicator color={theme.violet} />
          </View>
        ) : postPreviewQuery.data?.post ? (
          <View style={{ gap: 10 }}>
            <Txt
              style={{
                fontFamily: font.heavy,
                fontSize: 17,
                lineHeight: 22,
                color: theme.ink,
              }}
            >
              {postPreviewQuery.data.post.title || "Featured Discussion"}
            </Txt>
            <Txt
              numberOfLines={6}
              style={{
                fontFamily: font.regular,
                fontSize: 14,
                lineHeight: 20,
                color: theme.text,
              }}
            >
              {plainPreview(postPreviewQuery.data.post.body)}
            </Txt>
            {(postPreviewQuery.data.comments ?? []).length > 0 ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 12.5,
                    color: theme.muted,
                  }}
                >
                  Top Comments ({postPreviewQuery.data.comments!.length})
                </Txt>
                {postPreviewQuery.data.comments!.slice(0, 2).map((c) => (
                  <View
                    key={c.id}
                    style={{
                      padding: 10,
                      borderRadius: radius.tile,
                      backgroundColor: theme.surfaceAlt,
                    }}
                  >
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 12,
                        color: theme.toneText.violet,
                      }}
                    >
                      {c.author.nickname}
                    </Txt>
                    <Txt
                      numberOfLines={2}
                      style={{
                        fontFamily: font.regular,
                        fontSize: 13,
                        color: theme.ink,
                      }}
                    >
                      {c.body}
                    </Txt>
                  </View>
                ))}
              </View>
            ) : null}
            <GradientButton
              label="Open Full Discussion"
              icon="arrow-forward"
              gradient="hero"
              size="lg"
              full
              onPress={() => {
                const pid = previewPostId;
                setPreviewPostId(null);
                if (pid) router.push(`/community/${slug}/post/${pid}`);
              }}
            />
          </View>
        ) : (
          <Txt tone="muted">
            Tap below to open the full post thread and comments.
          </Txt>
        )}
      </Sheet>

      <ActionMenu
        visible={menuOpen}
        title={community.name}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      <ReportSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </View>
  );
}

export default withCommunityTheme(CommunityHomeScreen);

const styles = StyleSheet.create({
  bannerWrap: {
    height: 176,
    width: "100%",
    position: "relative",
    justifyContent: "space-between",
  },
  bannerTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 44,
  },
  bannerGlassCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(15, 11, 42, 0.62)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  identityHeader: {
    paddingHorizontal: 16,
    marginTop: -36,
    gap: 6,
  },
  avatarAndActionsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  communityAvatarFrame: {
    width: 86,
    height: 86,
    borderRadius: 24,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerCtaGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  checkInPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  countsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  onlineDotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  topicChipsRow: {
    gap: 6,
    paddingTop: 8,
    paddingBottom: 4,
  },
  topicChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subTabsBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  subTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: "hidden",
  },
  aiPulseCard: {
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 8,
  },
  aiPulseOrb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#A855F7",
  },
  storyRoomQuickPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
  },
  guideCard: {
    width: 158,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: 2,
  },
  guideIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  quickPeekBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  challengeBannerCard: {
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    gap: 4,
  },
  challengeSecondaryBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  eventRowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  eventCalendarBox: {
    width: 46,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rsvpBtn: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  podiumCard: {
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  podiumTopThreeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingTop: 6,
  },
  podiumColumn: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  rankListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  topicRoomCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  topicRoomIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  fabCompose: {
    position: "absolute",
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  guideDetailRow: {
    padding: 10,
    borderRadius: radius.tile,
    borderWidth: 1,
  },
});