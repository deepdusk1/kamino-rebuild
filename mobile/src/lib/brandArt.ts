/**
 * Kamino brand artwork (phone app).
 *
 * All pictures are original illustrations drawn in code by `/home/claude/redesign/art/generate.mjs`
 * and live in `assets/kamino/...`. Every file is a static `require(...)` so Metro bundles it with the
 * app. Pass a value straight to `<Image source={...} />` (React Native or expo-image).
 */
import type { ImageSourcePropType } from "react-native";

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
export const interestArt: Record<InterestKey, ImageSourcePropType> = {
  anime: require("../../assets/kamino/interests/anime.jpg"),
  gaming: require("../../assets/kamino/interests/gaming.jpg"),
  art: require("../../assets/kamino/interests/art.jpg"),
  music: require("../../assets/kamino/interests/music.jpg"),
  kpop: require("../../assets/kamino/interests/kpop.jpg"),
  books: require("../../assets/kamino/interests/books.jpg"),
  fitness: require("../../assets/kamino/interests/fitness.jpg"),
  fashion: require("../../assets/kamino/interests/fashion.jpg"),
  tech: require("../../assets/kamino/interests/tech.jpg"),
  food: require("../../assets/kamino/interests/food.jpg"),
  movies: require("../../assets/kamino/interests/movies.jpg"),
  pets: require("../../assets/kamino/interests/pets.jpg"),
  astrology: require("../../assets/kamino/interests/astrology.jpg"),
  photography: require("../../assets/kamino/interests/photography.jpg"),
  cars: require("../../assets/kamino/interests/cars.jpg"),
  travel: require("../../assets/kamino/interests/travel.jpg"),
  writing: require("../../assets/kamino/interests/writing.jpg"),
  manga: require("../../assets/kamino/interests/manga.jpg"),
};

/**
 * Hero banners. `home-*` and `explore-*` are 1200 x 640 with a calm, dark left half for white text
 * (checked: at least 4.5:1 contrast) and the illustration on the right. `chats` (800 x 520) is a
 * light pastel picture for the right side of the Chats card; `create` (800 x 400) is very soft and
 * sits behind light content.
 */
export const heroArt: Record<string, ImageSourcePropType> = {
  "home-1": require("../../assets/kamino/heroes/home-1.jpg"),
  "home-2": require("../../assets/kamino/heroes/home-2.jpg"),
  "home-3": require("../../assets/kamino/heroes/home-3.jpg"),
  "home-4": require("../../assets/kamino/heroes/home-4.jpg"),
  "explore-1": require("../../assets/kamino/heroes/explore-1.jpg"),
  "explore-2": require("../../assets/kamino/heroes/explore-2.jpg"),
  "explore-3": require("../../assets/kamino/heroes/explore-3.jpg"),
  chats: require("../../assets/kamino/heroes/chats.jpg"),
  create: require("../../assets/kamino/heroes/create.jpg"),
};

/** Welcome screen: the dreamy sky (1170 x 1300, fades to white at the bottom) and three tilted cards (600 x 760). */
export const welcomeArt: { sky: ImageSourcePropType; cards: ImageSourcePropType[] } = {
  sky: require("../../assets/kamino/welcome/sky.jpg"),
  cards: [
    require("../../assets/kamino/welcome/card-1.jpg"),
    require("../../assets/kamino/welcome/card-2.jpg"),
    require("../../assets/kamino/welcome/card-3.jpg"),
  ],
};

const DEFAULT_COVERS: ImageSourcePropType[] = [
  require("../../assets/kamino/covers/default-1.jpg"),
  require("../../assets/kamino/covers/default-2.jpg"),
  require("../../assets/kamino/covers/default-3.jpg"),
  require("../../assets/kamino/covers/default-4.jpg"),
  require("../../assets/kamino/covers/default-5.jpg"),
  require("../../assets/kamino/covers/default-6.jpg"),
  require("../../assets/kamino/covers/default-7.jpg"),
  require("../../assets/kamino/covers/default-8.jpg"),
];

/**
 * A calm fallback cover (1500 x 500) for a community without its own cover.
 * Any whole number works (negative or large values wrap around), so pass e.g. the community's hue or id hash.
 */
export function defaultCover(i: number): ImageSourcePropType {
  const n = DEFAULT_COVERS.length;
  const index = ((Math.trunc(Number.isFinite(i) ? i : 0) % n) + n) % n;
  return DEFAULT_COVERS[index] ?? require("../../assets/kamino/covers/default-1.jpg");
}
