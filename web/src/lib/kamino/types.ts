export type Visibility = "public" | "private" | "unlisted";
export type Role = "agent" | "leader" | "curator" | "member";
export type MemberStatus = "active" | "pending" | "banned";
export type PostType = "blog" | "image" | "poll" | "quiz" | "wiki" | "story" | "question" | "link";
export type RoomKind = "public" | "private" | "dm" | "voice" | "screening";
export type DmPrivacy = "everyone" | "members" | "none";
/** Free avatar frames (everyone can use every one; nothing is bought or unlocked). */
export const PROFILE_FRAME_IDS = ["ring", "moon", "star", "laurel", "spark", "flame", "crown", "aurora", "none"] as const;
export type ProfileFrame = (typeof PROFILE_FRAME_IDS)[number];
/** Free chat bubble looks, on top of the colour you pick. */
export const BUBBLE_STYLES = ["soft", "glass", "outline", "bold"] as const;
export type BubbleStyle = (typeof BUBBLE_STYLES)[number];
export const COMMUNITY_MODULES = ["chats", "wiki", "files", "events", "rank", "members", "roleplay"] as const;
export type CommunityModule = (typeof COMMUNITY_MODULES)[number];

/** Colour styles a community can pick (free, like every other cosmetic). */
export const THEME_STYLES = ["aurora", "solid", "vivid", "soft", "night"] as const;
export type ThemeStyle = (typeof THEME_STYLES)[number];

export type Community = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  cover: string;
  hue: number;
  /** How the community's colour is used (banner tint and accent colour). */
  themeStyle: ThemeStyle;
  /** Address of the community's own icon picture, or "" for none. */
  icon: string;
  visibility: Visibility;
  ageGate: number;
  contentWarnings: string[];
  rules: string;
  modules: CommunityModule[];
  createdBy: string;
  memberCount: number;
  createdAt: string;
  /** Up to 8 short topic labels shown as chips on the community page (leaders set them). */
  topics: string[];
  /** Main language, for example "en". */
  language: string;
  /** A blue tick set by the site owner. */
  verified: boolean;
};

export type Membership = {
  userId: string;
  communityId: string;
  role: Role;
  status: MemberStatus;
  nickname: string;
  personaBio: string;
  personaHue: number;
  rep: number;
  /** Check-in streak inside this community (days in a row, counting yesterday as still alive). */
  streak: number;
  bestStreak: number;
  checkedInToday: boolean;
  handle?: string;
  /** Profile photo version, 0 when none (only filled in lists that join profiles). */
  avatarV?: number;
  joinedAt: string;
};

export type Profile = {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarHue: number;
  /** 0 = no photo; otherwise changes on every upload (used to refresh cached images). */
  avatarVersion: number;
  cover: string;
  mood: string;
  status: string;
  frame: ProfileFrame;
  lastSeenAt: string | null;
  bubbleHue: number;
  bubbleStyle: BubbleStyle;
  ageConfirmed: boolean;
  /** True once the person has passed the 13+ birthday check (the date itself is never saved). */
  minAgeConfirmed: boolean;
  dmPrivacy: DmPrivacy;
  hideJoined: boolean;
  showOnline: boolean;
  notifyLikes: boolean;
  notifyComments: boolean;
  notifyFollows: boolean;
  notifyChat: boolean;
  notifyWall: boolean;
  rep: number;
  streak: number;
  lastCheckinAt: string | null;
  createdAt: string;
  /** Optional, for example "she/her". */
  pronouns: string;
  location: string;
  /** An http(s) link, or "". */
  website: string;
  /** A short line under the name, for example "Digital Artist". */
  headline: string;
  /** A blue tick set by the site owner. */
  verified: boolean;
  /** "Creator" badge: set by the site owner, or automatic at 1,000 followers. */
  creator: boolean;
  /** Interest keys picked during onboarding (see INTEREST_OPTIONS). */
  interests: string[];
  /** Up to six profile category keys (see PROFILE_CATEGORY_OPTIONS). */
  profileCategories: string[];
  /** When onboarding was finished; null means the person has not done it yet. */
  onboardedAt: string | null;
  /** Following needs approval; only followers see more than the profile header. */
  privateAccount: boolean;
  showReadReceipts: boolean;
  /** Quiet hours for phone pushes (0-23 in `timezone`); null means off. */
  quietStart: number | null;
  quietEnd: number | null;
  notifyPrefs: NotifyPrefs;
  /** Time zone name such as "America/Vancouver" ("" = UTC). Used for quiet hours. */
  timezone: string;
  /** Longest daily check-in streak ever. */
  bestStreak: number;
};

/** Which phone pushes to send, by notification category. The in-app list always fills. */
export type NotifyPrefs = { social: boolean; community: boolean; events: boolean; messages: boolean; digest: boolean };

export type TitleDef = {
  id: number;
  communityId: string;
  communityName?: string;
  label: string;
  color: string;
  featured: boolean;
};

export type MemberTitle = {
  id: number;
  titleId: number;
  label: string;
  color: string;
  communityId: string;
  communityName: string;
  featured: boolean;
  pinned: boolean;
  hidden: boolean;
};

export type WallPost = {
  id: number;
  author: AuthorChip;
  body: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
};

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  unlocked: boolean;
  /** An icon name each app maps to its own icons (see `achievements.ts`). */
  icon: string;
  category: string;
  tier: "bronze" | "silver" | "gold" | "legend";
  /** Count so far (capped at `target`) for the progress bar. */
  progress: number;
  target: number;
  unlockedAt: string | null;
};

export type Character = {
  id: number;
  userId: string;
  name: string;
  fandom: string;
  bio: string;
  appearance: string;
  hue: number;
};

export type SharedItem = {
  id: number;
  communityId: string;
  title: string;
  url: string;
  note: string;
  author: string;
  authorId?: string;
  /** Folder path such as "Guides/Maps"; "" is the top level. */
  folder: string;
  /** The level a member needs to open this item (leaders can raise it). 1 means everyone. */
  minLevel: number;
  /** True when the viewer's level is too low: the link and note are left out. */
  locked: boolean;
  createdAt: string;
};

/** A post's pictures: the cover plus up to this many more (the server enforces it in `checkAlbum`). */
export const MAX_ALBUM_EXTRAS = 9;
/** Every picture of a post, the cover included (10). */
export const MAX_POST_PICTURES = MAX_ALBUM_EXTRAS + 1;

export type PostPayload = {
  format?: "markdown";
  templateSourceId?: number;
  options?: string[];
  questions?: { q: string; choices: string[]; answer: number; /** Set by the server when the question has a picture (`/api/v1/media/post/<id>/<100 + question number>`). */ hasImage?: boolean }[];
  /** Quiz time limit in seconds for the whole quiz; missing or 0 means untimed. Kept by the server. */
  timeLimitSec?: number;
  /** Story only: one short caption per scene (scene 1 is the cover, then the album pictures). Cleaned by the server. */
  captions?: string[];
  category?: string;
  url?: string;
  /** How many extra pictures an image post has (set by the server; see `/api/v1/media/post/<id>/<n>`). */
  albumCount?: number;
};

export type AuthorChip = {
  userId: string;
  nickname: string;
  handle: string;
  hue: number;
  /** Profile photo version, 0 when the person has no photo. */
  avatarV: number;
};

export type Post = {
  id: number;
  communityId: string;
  author: AuthorChip;
  type: PostType;
  wikiStatus: "draft" | "pending" | "approved" | "rejected";
  wikiReviewNote: string;
  title: string;
  body: string;
  cover: string;
  payload: PostPayload;
  featured: boolean;
  pinned: boolean;
  hidden: boolean;
  announcement: boolean;
  commentsDisabled: boolean;
  hashtags: string[];
  originalPostId: number | null;
  editedAt: string | null;
  saved: boolean;
  contentWarning: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  expiresAt: string | null;
  createdAt: string;
  /** Optional place name, for example "Kelowna". */
  location: string;
  /** "members" posts are only shown to active members of the community. */
  visibility: PostVisibility;
  /** When a scheduled post goes live (null = published straight away). */
  publishAt: string | null;
  /** True while the post is scheduled for later (only its author can see it then). */
  scheduled: boolean;
  /** The author has the site's blue tick. */
  authorVerified: boolean;
};

export type PostVisibility = "public" | "members";

export type Comment = {
  id: number;
  postId: number;
  author: AuthorChip;
  body: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
};

export type ChatRoom = {
  id: number;
  communityId: string | null;
  name: string;
  kind: RoomKind;
  createdBy: string;
  inviteRule: "hosts" | "members";
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  voiceCount: number;
  watchUrl: string;
  watchTitle: string;
  peerName: string | null;
  peerHandle: string | null;
  peerHue: number;
  peerAvatarV: number;
  peerUserId: string | null;
  pinned: boolean;
  muted: boolean;
};

export type ChatMessage = {
  id: number;
  roomId: number;
  author: AuthorChip;
  body: string;
  replyTo: number | null;
  bubbleHue: number;
  bubbleStyle: BubbleStyle;
  editedAt: string | null;
  deleted: boolean;
  mediaKind: "image" | "audio" | "video" | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
  createdAt: string;
};

export type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
  /** Who caused it (null for older rows and system messages). */
  actorId: string | null;
  /** What it is about: "post", "community", "room", "event", "profile" or "" (older rows). */
  targetType: string;
  targetId: string;
};

export type Report = {
  id: number;
  reporterId: string;
  communityId: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
};

export type HallEvent = {
  id: number;
  communityId: string;
  title: string;
  body: string;
  kind: "event" | "challenge";
  startsAt: string;
  endsAt: string | null;
  createdBy: string;
  rsvpCount: number;
  going: boolean;
  /** Challenges only: how many entries, whether the winners were picked, and the viewer's own entry. */
  entryCount: number;
  judged: boolean;
  myEntryPostId: number | null;
  /** Where a challenge is in its life: not started, taking entries, closed, or winners picked. */
  phase: ChallengePhase;
};

export type ChallengePhase = "upcoming" | "open" | "closed" | "judged";

export type RankBoard = "activity" | "streak" | "quiz";
export type RankPeriod = "week" | "month" | "all";
/** A leaderboard row. `score` is what the chosen board counts (points, streak days or quiz points). */
export type BoardRow = RankRow & { score: number };

export type ChallengeEntry = {
  postId: number;
  title: string;
  cover: string;
  author: AuthorChip;
  likeCount: number;
  /** 1, 2 or 3 once the leaders have picked winners. */
  placement: number | null;
  enteredAt: string;
};

export type InviteCode = {
  code: string;
  communityId: string;
  uses: number;
  maxUses: number;
  expiresAt: string | null;
  createdAt: string;
};

export type Strike = {
  id: number;
  communityId: string;
  userId: string;
  issuedBy: string;
  reason: string;
  createdAt: string;
};

export type JoinQuestion = {
  id: number;
  communityId: string;
  prompt: string;
  sortOrder: number;
};

export type Broadcast = {
  id: number;
  communityId: string;
  body: string;
  createdAt: string;
};

export type RankRow = {
  userId: string;
  nickname: string;
  handle: string;
  hue: number;
  avatarV: number;
  role: Role;
  rep: number;
  weekPosts: number;
  weekLikes: number;
  weekScore: number;
};

export const CATEGORIES = [
  "Anime",
  "Music",
  "Games",
  "Writing",
  "Art",
  "Roleplay",
  "Tabletop",
  "Film",
  "Science",
  "Lifestyle",
] as const;

export const REPORT_REASONS = [
  "Harassment",
  "Hate or threats",
  "Spam or scam",
  "Sexual content involving minors",
  "Non-consensual intimate content",
  "Self-harm",
  "Impersonation",
  "Copyright infringement",
  "Off-topic / community rules",
] as const;

export const MOOD_PRESETS = [
  "watching",
  "drawing",
  "writing",
  "listening",
  "in character",
  "offline hours",
  "on a comeback",
  "lore diving",
] as const;

/** An item the automatic safety check held or flagged, waiting for a person to decide. */
export type SafetyFlag = {
  id: number;
  communityId: string | null;
  targetType: "post" | "comment" | "message" | "wall" | "roleplay" | "scene";
  targetId: string;
  authorId: string;
  authorName: string;
  /** "hold": hidden until someone decides. "flag": still visible. */
  action: "hold" | "flag";
  reasons: string[];
  /** Serious enough to reach the site owner too. */
  severe: boolean;
  /** Linked to minors: its pictures are locked and the site owner must follow the reporting steps in the guide. */
  minors: boolean;
  excerpt: string;
  href: string;
  status: "open" | "restored" | "removed" | "dismissed";
  createdAt: string;
};

/** What the server's AI can do right now (the apps hide or explain features accordingly). */
export type AiStatus = {
  /** The AI safety check (OpenAI's free moderation service) is set up. The built-in rules always run. */
  moderation: boolean;
  /** The AI storyteller for role-play is set up. */
  storyteller: boolean;
  /** Storyteller replies left today for the whole server. */
  repliesLeft: number;
};

export type RoleplayCharacter = { name: string; description: string; playedBy: { userId: string; name: string } | null };

export type RoleplaySceneSummary = {
  id: number;
  communityId: string;
  title: string;
  source: string;
  premise: string;
  status: "open" | "ended";
  castCount: number;
  turnCount: number;
  endingCount: number;
  creatorName: string;
  updatedAt: string;
};

export type RoleplayTurn = {
  id: number;
  /** "narration" and "ending" are written by the AI storyteller; "turn" by a member. */
  kind: "turn" | "narration" | "ending";
  character: string;
  author: { userId: string; name: string; hue: number; avatarV: number } | null;
  body: string;
  createdAt: string;
};

export type RoleplayScene = RoleplaySceneSummary & {
  creatorId: string;
  characters: RoleplayCharacter[];
  turns: RoleplayTurn[];
  /** The character the viewer plays, or null. */
  myCharacter: string | null;
  /** The viewer may end or delete the scene (its creator or a moderator). */
  canManage: boolean;
  canPlay: boolean;
};

// ───────────────────────────── Redesign (social.ts) ─────────────────────────────

/** The fixed list of interests people pick during onboarding. The key is what is saved. */
export const INTEREST_OPTIONS = [
  { key: "anime", label: "Anime", emoji: "🐾" },
  { key: "gaming", label: "Gaming", emoji: "🎮" },
  { key: "art", label: "Art", emoji: "🎨" },
  { key: "music", label: "Music", emoji: "🎵" },
  { key: "kpop", label: "K-Pop", emoji: "📘" },
  { key: "books", label: "Books", emoji: "📚" },
  { key: "fitness", label: "Fitness", emoji: "🏋️" },
  { key: "fashion", label: "Fashion", emoji: "👗" },
  { key: "tech", label: "Tech", emoji: "💻" },
  { key: "food", label: "Food", emoji: "🍴" },
  { key: "movies", label: "Movies", emoji: "🎬" },
  { key: "pets", label: "Pets", emoji: "🐱" },
  { key: "astrology", label: "Astrology", emoji: "🌙" },
  { key: "photography", label: "Photography", emoji: "📷" },
  { key: "cars", label: "Cars", emoji: "🚗" },
  { key: "travel", label: "Travel", emoji: "✈️" },
  { key: "writing", label: "Writing", emoji: "✍️" },
  { key: "manga", label: "Manga", emoji: "📖" },
] as const;
export type InterestKey = (typeof INTEREST_OPTIONS)[number]["key"];
export type InterestOption = { key: string; label: string; emoji: string };

/** Profile category tiles (an owner picks up to six). Each opens the person's posts tagged with the key (#art, #daily...). */
export const PROFILE_CATEGORY_OPTIONS = [
  { key: "art", label: "My Art", emoji: "🎨" },
  { key: "daily", label: "Daily Life", emoji: "📷" },
  { key: "gaming", label: "Gaming", emoji: "🎮" },
  { key: "growth", label: "Growth", emoji: "🌱" },
  { key: "qa", label: "Q&A", emoji: "❤️" },
  { key: "milestones", label: "Milestones", emoji: "⭐" },
  { key: "music", label: "Music", emoji: "🎵" },
  { key: "writing", label: "Writing", emoji: "✍️" },
  { key: "cosplay", label: "Cosplay", emoji: "🎭" },
  { key: "photos", label: "Photos", emoji: "🖼️" },
  { key: "reviews", label: "Reviews", emoji: "📝" },
  { key: "fanfic", label: "Fanfic", emoji: "📖" },
] as const;
export type ProfileCategoryOption = { key: string; label: string; emoji: string };

/** A slide of the home carousel or the explore banner. `art` is an artwork key (see brandArt `heroArt`). */
export type Hero = { id: string; title: string; text: string; cta: string; href: string; art: string };

/** A community as the cards show it: joined or not, how many are online, and up to four member faces. */
export type CommunityCardData = Community & {
  joined: boolean;
  onlineCount: number;
  memberFaces: AuthorChip[];
};

/** A person worth following (home "Featured Creators", onboarding step 4). */
export type CreatorCard = {
  userId: string;
  handle: string;
  displayName: string;
  avatarHue: number;
  avatarV: number;
  headline: string;
  verified: boolean;
  /** Has the "Creator" badge. */
  creator: boolean;
  followers: number;
  /** The viewer already follows them. */
  following: boolean;
  /** The viewer asked to follow (private account) and is waiting. */
  requested: boolean;
};

/** A voice or screening room people are in right now. */
export type LiveRoomCard = {
  roomId: number;
  communityId: string;
  communityName: string;
  title: string;
  subtitle: string;
  /** Category label, for example "Music" (the room's topic or the community's category). */
  topic: string;
  /** Picture for the card (the community banner). */
  cover: string;
  /** How many people are in the room's voice/watch session. */
  liveCount: number;
  faces: AuthorChip[];
  /** Button colour for this card (cycles through the five join colours). */
  color: string;
  /** "voice" and "screening" are live rooms; community pages also list their text rooms ("public", "private"). */
  kind: RoomKind;
  /** The viewer is a member of the room's community (so Join opens it straight away). */
  joined: boolean;
};

/** An upcoming event as the home "Live Event" card shows it. */
export type EventCard = HallEvent & {
  communityName: string;
  communityCover: string;
  communityHue: number;
  /** Up to four people who said they are going. */
  faces: AuthorChip[];
};

export type StreakInfo = {
  /** Current daily check-in streak (0 when it has lapsed). */
  days: number;
  /** Monday to Sunday of this week (UTC days): true when checked in that day. */
  week: boolean[];
  checkedInToday: boolean;
  best: number;
};

export type FeedTab = "forYou" | "following" | "communities";

export type NotificationFilter = "all" | "social" | "community" | "events";
export type NotificationCategory = "social" | "community" | "events" | "messages";

/** A person shown on a notification (an AuthorChip plus what the Follow Back row needs). */
export type NotificationActor = AuthorChip & { headline: string; verified: boolean; followers: number };

export type NotificationItem = Notification & {
  category: NotificationCategory;
  actor: NotificationActor | null;
  /** A small picture for the right side (post picture, community banner...), or "". */
  thumb: string;
  /** A quoted piece of text (the comment, the wall note...), or "". */
  snippet: string;
  /** Short words after the actor's name, for example "liked your post". "" for older rows (show title and body). */
  verb: string;
  action: "followBack" | "join" | "open" | null;
  /** followBack: the person's user id. join: the community slug. open: the address to go to. */
  actionTarget: string;
  /** The viewer already follows the actor. */
  actorFollowed: boolean;
  /** A live room that is live right now, or a call that is still ringing. */
  live: boolean;
  /** For community invites and join notices. */
  community: { id: string; name: string; memberCount: number; icon: string; cover: string; hue: number; faces: AuthorChip[] } | null;
  /** For event reminders. */
  event: { id: number; title: string; startsAt: string; communityId: string; communityName: string } | null;
  /** For live rooms: the room's name and topic and how many are in it. */
  room: { id: number; name: string; topic: string; communityName: string; liveCount: number } | null;
};

/** A row in "Messages" on the Chats screen. */
export type ChatOverviewRoom = ChatRoom & {
  peerOnline: boolean;
  peerVerified: boolean;
  /** "You" for your own last message, otherwise the sender's name. */
  lastAuthor: string | null;
  lastKind: "text" | "image" | "audio" | "video" | null;
  /** A community group chat (not a DM and not a live room). */
  isGroup: boolean;
  /** A message request waiting for you to accept it. */
  isRequest: boolean;
  /** You started this DM and the other person has not accepted it yet. */
  awaitingAccept: boolean;
  communityName: string | null;
  topic: string;
};

/** Someone in a followers / following / friends list. */
export type PersonRow = {
  userId: string;
  handle: string;
  displayName: string;
  avatarHue: number;
  avatarV: number;
  headline: string;
  verified: boolean;
  online: boolean;
  /** The viewer follows them. */
  following: boolean;
  /** They follow the viewer. */
  followsYou: boolean;
  requested: boolean;
};

/** Someone you muted (`listMutedPeople`), for a "Muted accounts" list in settings. */
export type MutedPerson = {
  userId: string;
  handle: string;
  displayName: string;
  avatarHue: number;
  avatarV: number;
  headline: string;
  verified: boolean;
  mutedAt: string;
};

export type ModeratorRow = {
  userId: string;
  handle: string;
  nickname: string;
  avatarHue: number;
  avatarV: number;
  role: Role;
  /** Badge to show: leader (crown), coleader (star) or moderator (shield). */
  badge: "leader" | "coleader" | "moderator";
  /** "Leader", "Co-leader" or "Moderator". */
  label: string;
};

export type MediaItem = { postId: number; index: number; url: string };

/** Search results, one list per kind. Lists not asked for (see `kind`) are empty. */
export type SearchEverything = {
  query: string;
  people: (PersonRow & { creator: boolean; followers: number })[];
  communities: CommunityCardData[];
  posts: (Post & { communityName: string })[];
  tags: { tag: string; count: number }[];
  rooms: LiveRoomCard[];
  events: (HallEvent & { communityName: string })[];
  /** True when nothing matched exactly and the closest spellings were used instead. */
  fuzzy: boolean;
};
