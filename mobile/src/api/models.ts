import type {
  Achievement, AuthorChip, BoardRow, Broadcast, ChallengeEntry, Character, ChatMessage, ChatOverviewRoom, ChatRoom, Comment, Community,
  CommunityCardData, CreatorCard, EventCard, HallEvent, Hero, InviteCode, JoinQuestion, LiveRoomCard, MediaItem, MemberTitle, Membership,
  ModeratorRow, MutedPerson, Notification, NotificationItem, PersonRow, Post, Profile, ProfileCategoryOption, RankBoard, RankPeriod, RankRow, Report,
  SharedItem, StreakInfo, Strike, TitleDef, WallPost,
} from "./types";

/** Shapes of what the server answers. They mirror the server functions in web/src/lib/kamino. */

export type PostWithCommunity = Post & { communityName?: string };

export type Bootstrap = { profile: Profile | null; unread: number; joined: Community[] };
export type Discover = { communities: Community[]; joinedIds: string[] };
export type HomeFeed = {
  featured: PostWithCommunity[];
  latest: PostWithCommunity[];
  communities: Community[];
  joined: Community[];
};

export type CommunityPage = {
  community: Community;
  member: Membership | null;
  locked: boolean;
  posts: Post[];
  stories: Post[];
  rooms: ChatRoom[];
  members: Membership[];
  followingIds: string[];
  requestedIds?: string[];
  titleDefs: TitleDef[];
  grantedTitles: { userId: string; titles: MemberTitle[] }[];
  announcements: Post[];
  events: HallEvent[];
  broadcasts: Broadcast[];
  joinQuestions: JoinQuestion[];
};

export type PostPage = {
  community: Community;
  member: Membership | null;
  post: Post;
  comments: Comment[];
  poll: { options: string[]; counts: number[]; mine: number | null } | null;
  quizBoard: { nickname: string; score: number; total: number; timeMs: number }[];
  myQuiz: { score: number; total: number } | null;
  /** Set when the quiz was started but not handed in yet; the server keeps the clock. */
  quizRun: { startedAt: string; serverNow: string } | null;
  wikiPinned: boolean;
};

export type WikiPage = { community: Community; member: Membership | null; locked: boolean; entries: Post[] };
export type WikiRevision = { id: number; editorId?: string; title: string; body: string; createdAt: string };

export type RoomPage = {
  room: ChatRoom;
  messages: ChatMessage[];
  /** People currently in a voice room (raw column names, as the server sends them). */
  voices: { user_id: string; nickname: string }[];
  participants: { userId: string; name: string; handle: string; isHost: boolean; isCohost: boolean }[];
};

export type Me = {
  profile: Profile;
  /** Your communities, with your nickname, role and reputation in each (matches `getMe` on the server). */
  joined: { community: Community; nickname: string; role: string; hue: number; rep: number }[];
  /** People you blocked (raw column names, as the server sends them; the website uses the same shape). */
  blocked: { blocked_id: string; handle: string; display_name: string }[];
};

export type PublicProfile = {
  profile: Profile;
  joined: { id: string; name: string; cover: string; category: string; nickname: string; role: string }[];
  recent: Post[];
  pinnedWiki: Post[];
  blocked: boolean;
  isSelf: boolean;
  characters: Character[];
  titles: MemberTitle[];
  featuredTitle: MemberTitle | null;
  achievements: Achievement[];
  /** Up to three achievements shown as banners under the name. */
  showcase: Achievement[];
  stats: { reputation: number; following: number; followers: number };
  viewerFollows: boolean;
  wall: (WallPost & { author: AuthorChip })[];
  /** A private account the viewer does not follow: only the header is filled in. */
  locked?: boolean;
  /** The viewer asked to follow this private account and is waiting. */
  requested?: boolean;
};

export type Moderation = {
  reports: Report[];
  pending: Membership[];
  audit: { id: number; actor_id: string; action: string; detail: string; created_at: string }[];
  role: string;
  communityModules: string[];
  titleDefs: TitleDef[];
  joinQuestions: JoinQuestion[];
  invites: InviteCode[];
  strikes: Strike[];
  joinAnswers: { userId: string; answers: string[] }[];
};

export type RankPage = { community: Community; rank: RankRow[] };
export type BoardPage = { community: Community; by: RankBoard; period: RankPeriod; rank: BoardRow[] };
export type CommunityCheckIn = { already: boolean; streak: number; bestStreak: number; rep: number };
export type MyPost = { id: number; title: string; type: string };
export type ChallengeEntries = { eventId: number; judged: boolean; entries: ChallengeEntry[] };
export type EventsPage = { community: Community; member: Membership | null; events: HallEvent[] };
export type ImportResult = { imported: number; skipped: number };
export type SharedPage = { member: Membership | null; items: SharedItem[] };
export type CheckIn = { already: boolean; streak: number; rep: number };

export type MyStanding = {
  status: "active" | "pending" | "banned" | "none";
  strikes: { id: number; reason: string; createdAt: string }[];
  mute: { until: string; reason: string } | null;
  appeals: { id: number; kind: string; status: string; decisionNote: string; createdAt: string }[];
};
export type AppealRow = {
  id: number; userId: string; name: string; handle: string; kind: string; message: string;
  status: string; decisionNote: string; createdAt: string;
};
export type WikiProposal = {
  id: number; proposerId: string; proposer: string; title: string; body: string; note: string;
  /** "open", "accepted" or "rejected". */
  status: string; createdAt: string;
};
export type FeedItem = { title: string; link: string; publishedAt: string | null; source: string };
export type NotificationRow = Notification;

/** What a saved draft holds. Mirrors `draftContentSchema` on the server. */
export type DraftContent = {
  type: "blog" | "image" | "question" | "link" | "poll" | "quiz" | "wiki" | "story";
  title: string;
  body: string;
  url: string;
  warning: string;
  opts: string[]; // always exactly 5 entries (blank ones are ignored)
  image: string;
  /** More pictures for an image post (the cover is `image`). Missing on older drafts. */
  album?: string[];
  commentsOff: boolean;
  announce: boolean;
  questions: { q: string; choices: string[]; answer: number; /** A picture shown with the question (data URL). */ image?: string }[];
  /** Whole-quiz time limit in seconds; empty or 0 means untimed. */
  timeLimitSec?: number;
  /** Story only: one short caption per scene. */
  captions?: string[];
};
export type Draft = { id: string; slug: string; content: DraftContent; revision: number; updatedAt: string };

export type SearchResults = {
  query: string;
  communities: Community[];
  posts: PostWithCommunity[];
  people: { userId: string; handle: string; displayName: string; hue: number; avatarV: number; rep: number }[];
};

/** A network server for calls (STUN finds a route; TURN relays when there is none). */
export type IceServer = { urls: string | string[]; username?: string; credential?: string };
/** Someone is calling a room you are in. Only rings for 45 seconds. */
export type IncomingCall = { id: number; name: string; body: string; href: string; createdAt: string };

// ───────────────────────────── Redesign (server: social.ts) ─────────────────────────────

/** A post in a list that mixes communities (home feed tabs, search, profile posts). */
export type FeedPost = Post & { communityName: string; communityIcon: string; communityHue: number };

export type HomeOverview = {
  heroes: Hero[];
  recommended: CommunityCardData[];
  trending: CommunityCardData[];
  streak: StreakInfo;
  liveEvent: EventCard | null;
  featuredCreators: CreatorCard[];
  liveRooms: LiveRoomCard[];
};

/** One page of a feed tab; pass `next` back as `cursor` for more (null = the end). */
export type FeedPage = { posts: FeedPost[]; next: string | null };

export type ExploreOverview = {
  banners: Hero[];
  recommended: CommunityCardData[];
  trendingTags: { tag: string; count: number }[];
  newest: CommunityCardData[];
  growing: CommunityCardData[];
  joined: CommunityCardData[];
};

export type RecentSearch = { query: string; at: string };
export type OnboardingSuggestions = { communities: CommunityCardData[]; creators: CreatorCard[] };

export type CommunityOverview = {
  community: CommunityCardData;
  member: Membership | null;
  /** A private community the viewer cannot read: only the counts are filled in. */
  locked: boolean;
  onlineCount: number;
  onlineFaces: AuthorChip[];
  memberFaces: AuthorChip[];
  /** 1, 5, 10, 25, 50 or 100: "Top 1%" and so on. */
  rankPercent: number;
  moderators: ModeratorRow[];
  featured: Post[];
  recent: Post[];
  rooms: LiveRoomCard[];
  events: HallEvent[];
  media: MediaItem[];
  trendingTags: { tag: string; count: number }[];
};

export type ChatsOverview = { rooms: ChatOverviewRoom[]; requests: number };
export type RoomReceipts = { seenBy: { userId: string; lastReadId: number; name: string; handle: string; hue: number; avatarV: number }[] };
export type TypingNow = { names: string[]; userIds: string[] };

/** `next` is the id to pass as `before` for older notifications (null = no more). */
export type NotificationsFeed = { items: NotificationItem[]; unread: number; next: number | null };

export type ProfileOverviewProfile = Omit<Profile, "profileCategories"> & {
  profileCategories: ProfileCategoryOption[];
  profileCategoryKeys: string[];
  online: boolean;
};
export type ProfileOverview = {
  profile: ProfileOverviewProfile;
  stats: { posts: number; followers: number; following: number; friends: number };
  following: boolean;
  followsYou: boolean;
  requested: boolean;
  isSelf: boolean;
  blocked: boolean;
  /** You muted this person (see `api.mutePerson`). Their posts still show here, on their own profile. */
  muted: boolean;
  /** Private account (or a block): only the header and counts are filled in. */
  locked: boolean;
  showcase: Achievement[];
  streak: { days: number; best: number };
  badges: Achievement[];
  recentPosts: Post[];
  communities: CommunityCardData[];
  categoryCounts: Record<string, number>;
};
export type ProfilePostsPage = { posts: FeedPost[]; next: string | null; locked: boolean };
export type FollowList = { people: PersonRow[]; counts: { followers: number; following: number; friends: number }; locked: boolean };
export type FollowRequestRow = {
  userId: string; handle: string; displayName: string; avatarHue: number; avatarV: number; headline: string; verified: boolean; createdAt: string;
};
export type ListedComment = Comment & { authorVerified: boolean; mine: boolean };
export type FollowResult = { following: boolean; requested: boolean };
export type MuteResult = { muted: boolean };
/** One row of `api.listMutedPeople()`. */
export type MutedRow = MutedPerson;
export type DeleteCommentResult = { ok: true };
export type CreatePostResult = { id: number; held: boolean; scheduled: boolean; publishAt: string | null };
