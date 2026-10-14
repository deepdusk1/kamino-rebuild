/**
 * The emoji category list shared by chips, interest tiles and filters (SPEC 1).
 * `key` matches the interest keys the server uses (SPEC 4), "forYou" and "more" are UI-only.
 */
export type CategoryItem = { key: string; label: string; emoji: string };

export const CATEGORY_LIST: CategoryItem[] = [
  { key: "forYou", label: "For You", emoji: "🔥" },
  { key: "gaming", label: "Gaming", emoji: "🎮" },
  { key: "art", label: "Art", emoji: "🎨" },
  { key: "music", label: "Music", emoji: "🎵" },
  { key: "anime", label: "Anime", emoji: "🐾" },
  { key: "kpop", label: "K-Pop", emoji: "📘" },
  { key: "writing", label: "Writing", emoji: "✍️" },
  { key: "fitness", label: "Fitness", emoji: "🏋️" },
  { key: "pets", label: "Pets", emoji: "🐱" },
  { key: "books", label: "Books", emoji: "📚" },
  { key: "fashion", label: "Fashion", emoji: "👗" },
  { key: "tech", label: "Tech", emoji: "💻" },
  { key: "food", label: "Food", emoji: "🍴" },
  { key: "movies", label: "Movies", emoji: "🎬" },
  { key: "astrology", label: "Astrology", emoji: "🌙" },
  { key: "photography", label: "Photography", emoji: "📷" },
  { key: "cars", label: "Cars", emoji: "🚗" },
  { key: "travel", label: "Travel", emoji: "✈️" },
  { key: "manga", label: "Manga", emoji: "📖" },
  { key: "more", label: "More", emoji: "⋯" },
];

const BY_KEY = new Map(CATEGORY_LIST.map((c) => [c.key, c]));

/** Look up categories by key, in the order given (unknown keys are skipped). */
export function pickCategories(keys: string[]): CategoryItem[] {
  return keys.map((k) => BY_KEY.get(k)).filter((c): c is CategoryItem => Boolean(c));
}

export function categoryByKey(key: string): CategoryItem | undefined {
  return BY_KEY.get(key);
}

/** Home chips (03-home): For You, Gaming, Anime, Art, Music, K-Pop, More. */
export const HOME_CATEGORIES = pickCategories(["forYou", "gaming", "anime", "art", "music", "kpop", "more"]);

/** Explore chips (04-explore): For You, Gaming, Art, Music, Anime, K-Pop (+ scroll arrow). */
export const EXPLORE_CATEGORIES = pickCategories(["forYou", "gaming", "art", "music", "anime", "kpop", "writing", "fitness", "pets", "books"]);

/** Welcome chips (01-welcome), two rows of four. */
export const WELCOME_CATEGORIES = pickCategories(["gaming", "art", "music", "anime", "kpop", "writing", "fitness", "pets"]);

/** The 16 onboarding interest tiles (02-interests), in mockup order. */
export const INTEREST_CATEGORIES = pickCategories([
  "anime",
  "gaming",
  "art",
  "music",
  "kpop",
  "books",
  "fitness",
  "fashion",
  "tech",
  "food",
  "movies",
  "pets",
  "astrology",
  "photography",
  "cars",
  "travel",
]);
