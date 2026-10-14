/**
 * The shared category / interest list with the colourful emoji from the mockups (SPEC section 1).
 * `key` matches the server's interest keys (`anime, gaming, art, …`); "forYou" and "more" are UI-only.
 */
export type Category = {
  key: string;
  label: string;
  /** Shown before the label. `null` for "More", which uses a grid icon instead. */
  emoji: string | null;
};

export const CATEGORIES: readonly Category[] = [
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
  { key: "more", label: "More", emoji: null },
];

/** Looks a category up by key (falls back to a plain chip with the key as label). */
export function categoryByKey(key: string): Category {
  return CATEGORIES.find((c) => c.key === key) ?? { key, label: key, emoji: null };
}

/** Picks categories in the given order: `pickCategories(["forYou", "gaming", "anime", "more"])`. */
export function pickCategories(keys: readonly string[]): Category[] {
  return keys.map(categoryByKey);
}

/** Home screen chips (03-home): For You, Gaming, Anime, Art, Music, K-Pop, More. */
export const HOME_CATEGORIES = pickCategories(["forYou", "gaming", "anime", "art", "music", "kpop", "more"]);

/** Explore screen chips (04-explore): For You, Gaming, Art, Music, Anime, K-Pop (+ a ">" button). */
export const EXPLORE_CATEGORIES = pickCategories(["forYou", "gaming", "art", "music", "anime", "kpop"]);

/** Welcome screen chips (01-welcome), two rows of four. */
export const WELCOME_CATEGORIES = pickCategories(["gaming", "art", "music", "anime", "kpop", "writing", "fitness", "pets"]);

/** The 16 interest tiles on onboarding step 2 (02-interests), in the mockup's order. */
export const ONBOARDING_INTERESTS = [
  "anime", "gaming", "art", "music", "kpop", "books", "fitness", "fashion",
  "tech", "food", "movies", "pets", "astrology", "photography", "cars", "travel",
] as const;
