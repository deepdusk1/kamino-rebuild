/**
 * Achievements: a badge for almost everything people do on Kamino, in tiers (bronze, silver, gold, legend), each with a
 * progress bar towards the next. Plain data and functions so the website, the phone app and the tests share them.
 *
 * All achievements are free and earned only by taking part. None can be bought.
 */

/** What is counted for one person. Filled in by the server with one query (see `achievementMetrics`). */
export type AchievementMetrics = {
  posts: number;
  comments: number;
  likesReceived: number;
  followers: number;
  streak: number;
  rep: number;
  messages: number;
  stickers: number;
  reactions: number;
  communities: number;
  leading: number;
  curating: number;
  quizzesTaken: number;
  perfectQuizzes: number;
  quizzesMade: number;
  pollsMade: number;
  pollVotes: number;
  stories: number;
  wikiApproved: number;
  images: number;
  roleplayTurns: number;
  scenesCreated: number;
  events: number;
  challengeWins: number;
  wallNotes: number;
  saved: number;
  profileComplete: number;
  accountDays: number;
};

export type AchievementMetric = keyof AchievementMetrics;

/** A small icon name each app maps to its own icon set. */
export type AchievementIcon =
  | "pen"
  | "chat"
  | "heart"
  | "users"
  | "flame"
  | "star"
  | "message"
  | "sticker"
  | "smile"
  | "globe"
  | "crown"
  | "shield"
  | "brain"
  | "target"
  | "puzzle"
  | "chart"
  | "check"
  | "clock"
  | "book"
  | "image"
  | "mask"
  | "film"
  | "calendar"
  | "trophy"
  | "note"
  | "bookmark"
  | "sparkles"
  | "cake";

export const TIERS = ["bronze", "silver", "gold", "legend"] as const;
export type AchievementTier = (typeof TIERS)[number];

export type AchievementCategory =
  "Creating" | "Community" | "Chat" | "Play" | "Stories" | "Dedication";

type Family = {
  metric: AchievementMetric;
  icon: AchievementIcon;
  category: AchievementCategory;
  /** [how many, name, description] from the first tier up. */
  steps: [number, string, string][];
};

const FAMILIES: Family[] = [
  {
    metric: "posts",
    icon: "pen",
    category: "Creating",
    steps: [
      [1, "First Words", "Publish your first post"],
      [10, "Storyteller", "Publish 10 posts"],
      [50, "Prolific", "Publish 50 posts"],
      [200, "Legend of the Feed", "Publish 200 posts"],
    ],
  },
  {
    metric: "images",
    icon: "image",
    category: "Creating",
    steps: [
      [1, "Snapshot", "Share a picture post"],
      [20, "Gallery", "Share 20 picture posts"],
      [100, "Exhibition", "Share 100 picture posts"],
    ],
  },
  {
    metric: "stories",
    icon: "clock",
    category: "Creating",
    steps: [
      [1, "A Still", "Post a 24-hour story"],
      [10, "Daily Diarist", "Post 10 stories"],
      [50, "Story Machine", "Post 50 stories"],
    ],
  },
  {
    metric: "wikiApproved",
    icon: "book",
    category: "Creating",
    steps: [
      [1, "Archivist", "Get a wiki page approved"],
      [10, "Librarian", "Get 10 wiki pages approved"],
      [50, "Keeper of Lore", "Get 50 wiki pages approved"],
    ],
  },
  {
    metric: "quizzesMade",
    icon: "puzzle",
    category: "Creating",
    steps: [
      [1, "Quizmaster", "Create a quiz"],
      [10, "Grand Examiner", "Create 10 quizzes"],
    ],
  },
  {
    metric: "pollsMade",
    icon: "chart",
    category: "Creating",
    steps: [
      [1, "Floor Vote", "Open a poll"],
      [10, "Pollster", "Open 10 polls"],
    ],
  },
  {
    metric: "comments",
    icon: "chat",
    category: "Community",
    steps: [
      [1, "Chiming In", "Write your first comment"],
      [25, "Conversationalist", "Write 25 comments"],
      [100, "Heart of the Thread", "Write 100 comments"],
      [500, "Voice of the Community", "Write 500 comments"],
    ],
  },
  {
    metric: "likesReceived",
    icon: "heart",
    category: "Community",
    steps: [
      [1, "First Heart", "Get your first like"],
      [50, "Crowd Pleaser", "Get 50 likes"],
      [250, "Fan Favourite", "Get 250 likes"],
      [1000, "Superstar", "Get 1,000 likes"],
    ],
  },
  {
    metric: "followers",
    icon: "users",
    category: "Community",
    steps: [
      [1, "Noticed", "Get your first follower"],
      [10, "Rising Star", "Get 10 followers"],
      [50, "Influencer", "Get 50 followers"],
      [200, "Icon", "Get 200 followers"],
    ],
  },
  {
    metric: "communities",
    icon: "globe",
    category: "Community",
    steps: [
      [1, "Newcomer", "Join a community"],
      [5, "Explorer", "Join 5 communities"],
      [15, "Globetrotter", "Join 15 communities"],
    ],
  },
  {
    metric: "wallNotes",
    icon: "note",
    category: "Community",
    steps: [
      [1, "Guestbook Signer", "Write on someone's wall"],
      [25, "Friendly Neighbour", "Write 25 wall notes"],
    ],
  },
  {
    metric: "saved",
    icon: "bookmark",
    category: "Community",
    steps: [
      [1, "Collector", "Save a post"],
      [25, "Curator of Cool", "Save 25 posts"],
    ],
  },
  {
    metric: "leading",
    icon: "crown",
    category: "Community",
    steps: [[1, "Hall Keeper", "Lead a community"]],
  },
  {
    metric: "curating",
    icon: "shield",
    category: "Community",
    steps: [[1, "Trusted Hand", "Become a curator"]],
  },
  {
    metric: "messages",
    icon: "message",
    category: "Chat",
    steps: [
      [1, "Hello There", "Send your first chat message"],
      [100, "Chatterbox", "Send 100 messages"],
      [1000, "Night Owl", "Send 1,000 messages"],
      [5000, "Chat Royalty", "Send 5,000 messages"],
    ],
  },
  {
    metric: "stickers",
    icon: "sticker",
    category: "Chat",
    steps: [
      [1, "Sticky Fingers", "Send a sticker"],
      [50, "Sticker Fiend", "Send 50 stickers"],
    ],
  },
  {
    metric: "reactions",
    icon: "smile",
    category: "Chat",
    steps: [
      [1, "Reactor", "React to a message"],
      [100, "Emoji Enthusiast", "React 100 times"],
    ],
  },
  {
    metric: "quizzesTaken",
    icon: "brain",
    category: "Play",
    steps: [
      [1, "Pop Quiz", "Take a quiz"],
      [10, "Know-it-all", "Take 10 quizzes"],
      [50, "Trivia Titan", "Take 50 quizzes"],
    ],
  },
  {
    metric: "perfectQuizzes",
    icon: "target",
    category: "Play",
    steps: [
      [1, "Perfect Score", "Get every answer right"],
      [10, "Flawless", "Get 10 perfect scores"],
    ],
  },
  {
    metric: "pollVotes",
    icon: "check",
    category: "Play",
    steps: [
      [1, "Voice Heard", "Vote in a poll"],
      [50, "Civic Hero", "Vote in 50 polls"],
    ],
  },
  {
    metric: "events",
    icon: "calendar",
    category: "Play",
    steps: [
      [1, "RSVP'd", "Say you're going to an event"],
      [10, "Regular", "Go to 10 events"],
      [50, "Life of the Party", "Go to 50 events"],
    ],
  },
  {
    metric: "challengeWins",
    icon: "trophy",
    category: "Play",
    steps: [
      [1, "Champion", "Place in a challenge"],
      [5, "Hall of Fame", "Place in 5 challenges"],
    ],
  },
  {
    metric: "roleplayTurns",
    icon: "mask",
    category: "Stories",
    steps: [
      [1, "Curtain Up", "Play a role-play turn"],
      [25, "Method Actor", "Play 25 turns"],
      [100, "Leading Role", "Play 100 turns"],
    ],
  },
  {
    metric: "scenesCreated",
    icon: "film",
    category: "Stories",
    steps: [
      [1, "Director", "Start a role-play story"],
      [5, "Showrunner", "Start 5 stories"],
    ],
  },
  {
    metric: "streak",
    icon: "flame",
    category: "Dedication",
    steps: [
      [3, "Warming Up", "Check in 3 days in a row"],
      [7, "Seven Nights", "Check in 7 days in a row"],
      [30, "Unbreakable", "Check in 30 days in a row"],
      [100, "Eternal Flame", "Check in 100 days in a row"],
    ],
  },
  {
    metric: "rep",
    icon: "star",
    category: "Dedication",
    steps: [
      [100, "Rep 100", "Earn 100 reputation"],
      [500, "Respected", "Earn 500 reputation"],
      [2000, "Esteemed", "Earn 2,000 reputation"],
      [10000, "Legendary", "Earn 10,000 reputation"],
    ],
  },
  {
    metric: "profileComplete",
    icon: "sparkles",
    category: "Dedication",
    steps: [[1, "Looking Sharp", "Add a profile photo, a wall cover and a bio"]],
  },
  {
    metric: "accountDays",
    icon: "cake",
    category: "Dedication",
    steps: [
      [7, "Settled In", "Be a member for a week"],
      [30, "One Month In", "Be a member for a month"],
      [365, "Anniversary", "Be a member for a year"],
    ],
  },
];

export type AchievementDef = {
  id: string;
  name: string;
  desc: string;
  icon: AchievementIcon;
  category: AchievementCategory;
  tier: AchievementTier;
  metric: AchievementMetric;
  target: number;
};

/** Every achievement, in display order. Ids look like "posts-10". */
export const ACHIEVEMENTS: AchievementDef[] = FAMILIES.flatMap((family) =>
  family.steps.map(([target, name, desc], i) => ({
    id: `${family.metric}-${target}`,
    name,
    desc,
    icon: family.icon,
    category: family.category,
    // Single-step achievements are gold; otherwise the tier follows the step.
    tier: family.steps.length === 1 ? "gold" : TIERS[Math.min(i, TIERS.length - 1)]!,
    metric: family.metric,
    target,
  })),
);

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** How many achievements a person may show as banners at the top of their profile. */
export const MAX_SHOWCASE = 3;

export type AchievementState = AchievementDef & {
  unlocked: boolean;
  /** Current count, capped at the target (so the bar never overflows). */
  progress: number;
  unlockedAt: string | null;
};

export function emptyMetrics(): AchievementMetrics {
  return Object.fromEntries(FAMILIES.map((f) => [f.metric, 0])) as AchievementMetrics;
}

/** Which achievements the counts earn. */
export function earnedIds(metrics: AchievementMetrics): string[] {
  return ACHIEVEMENTS.filter((a) => Number(metrics[a.metric] ?? 0) >= a.target).map((a) => a.id);
}

/**
 * The full list for a profile. Once unlocked an achievement stays unlocked even if a count goes down later (a deleted
 * post does not take a badge away), so `remembered` (from the database) also counts.
 */
export function achievementStates(
  metrics: AchievementMetrics,
  remembered: Map<string, string> = new Map(),
): AchievementState[] {
  return ACHIEVEMENTS.map((a) => {
    const count = Math.max(0, Number(metrics[a.metric] ?? 0));
    const unlocked = count >= a.target || remembered.has(a.id);
    return {
      ...a,
      unlocked,
      progress: unlocked ? a.target : Math.min(count, a.target),
      unlockedAt: remembered.get(a.id) ?? null,
    };
  });
}

/** Keeps only valid, unlocked, distinct ids, at most `MAX_SHOWCASE`. */
export function cleanShowcase(ids: unknown, unlocked: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && unlocked.has(id))),
  ].slice(0, MAX_SHOWCASE);
}

/** The words of the "unlocked" notification: one name, or a count when several arrive at once. */
export function unlockMessage(newIds: string[]): { title: string; body: string } | null {
  const defs = newIds
    .map((id) => ACHIEVEMENT_BY_ID.get(id))
    .filter((d): d is AchievementDef => Boolean(d));
  if (!defs.length) return null;
  if (defs.length === 1)
    return { title: `Achievement unlocked: ${defs[0]!.name}`, body: defs[0]!.desc };
  return {
    title: `You unlocked ${defs.length} achievements`,
    body:
      defs
        .slice(0, 3)
        .map((d) => d.name)
        .join(", ") + (defs.length > 3 ? "…" : ""),
  };
}
