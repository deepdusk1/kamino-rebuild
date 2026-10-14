/**
 * Kamino brand artwork (website).
 *
 * All pictures are original illustrations drawn in code by `/home/claude/redesign/art/generate.mjs`
 * and served from `public/kamino/...`. Use these lookups instead of typing file paths by hand, so a
 * missing picture shows up as a TypeScript error rather than a broken image.
 */

/** The fixed list of interests (same order everywhere: onboarding grid, filters, backend). */
export const INTEREST_KEYS = [
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
  "writing",
  "manga",
] as const;

export type InterestKey = (typeof INTEREST_KEYS)[number];

/** True when `value` is one of the 18 interest keys. */
export function isInterestKey(value: string): value is InterestKey {
  return (INTEREST_KEYS as readonly string[]).includes(value);
}

/** Picture for each interest tile (480 x 360). */
export const interestArt: Record<InterestKey, string> = {
  anime: "/kamino/interests/anime.jpg",
  gaming: "/kamino/interests/gaming.jpg",
  art: "/kamino/interests/art.jpg",
  music: "/kamino/interests/music.jpg",
  kpop: "/kamino/interests/kpop.jpg",
  books: "/kamino/interests/books.jpg",
  fitness: "/kamino/interests/fitness.jpg",
  fashion: "/kamino/interests/fashion.jpg",
  tech: "/kamino/interests/tech.jpg",
  food: "/kamino/interests/food.jpg",
  movies: "/kamino/interests/movies.jpg",
  pets: "/kamino/interests/pets.jpg",
  astrology: "/kamino/interests/astrology.jpg",
  photography: "/kamino/interests/photography.jpg",
  cars: "/kamino/interests/cars.jpg",
  travel: "/kamino/interests/travel.jpg",
  writing: "/kamino/interests/writing.jpg",
  manga: "/kamino/interests/manga.jpg",
};

/**
 * Hero banners. `home-*` and `explore-*` are 1200 x 640 with a calm, dark left half for white text
 * (checked: at least 4.5:1 contrast) and the illustration on the right. `chats` (800 x 520) is a
 * light pastel picture for the right side of the Chats card; `create` (800 x 400) is very soft and
 * sits behind light content.
 */
export const heroArt: Record<string, string> = {
  "home-1": "/kamino/heroes/home-1.jpg",
  "home-2": "/kamino/heroes/home-2.jpg",
  "home-3": "/kamino/heroes/home-3.jpg",
  "home-4": "/kamino/heroes/home-4.jpg",
  "explore-1": "/kamino/heroes/explore-1.jpg",
  "explore-2": "/kamino/heroes/explore-2.jpg",
  "explore-3": "/kamino/heroes/explore-3.jpg",
  chats: "/kamino/heroes/chats.jpg",
  create: "/kamino/heroes/create.jpg",
};

/** Welcome screen: the dreamy sky (1170 x 1300, fades to white at the bottom) and three tilted cards (600 x 760). */
export const welcomeArt: { sky: string; cards: string[] } = {
  sky: "/kamino/welcome/sky.jpg",
  cards: ["/kamino/welcome/card-1.jpg", "/kamino/welcome/card-2.jpg", "/kamino/welcome/card-3.jpg"],
};

const DEFAULT_COVERS = [
  "/kamino/covers/default-1.jpg",
  "/kamino/covers/default-2.jpg",
  "/kamino/covers/default-3.jpg",
  "/kamino/covers/default-4.jpg",
  "/kamino/covers/default-5.jpg",
  "/kamino/covers/default-6.jpg",
  "/kamino/covers/default-7.jpg",
  "/kamino/covers/default-8.jpg",
] as const;

/**
 * A calm fallback cover (1500 x 500) for a community without its own cover.
 * Any whole number works (negative or large values wrap around), so pass e.g. the community's hue or id hash.
 */
export function defaultCover(i: number): string {
  const n = DEFAULT_COVERS.length;
  const index = ((Math.trunc(Number.isFinite(i) ? i : 0) % n) + n) % n;
  return DEFAULT_COVERS[index] ?? DEFAULT_COVERS[0];
}
