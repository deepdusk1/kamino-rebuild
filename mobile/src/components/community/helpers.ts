/**
 * Small pure helpers for the Explore, Community and Post screens. No React Native imports, so they can be
 * unit-tested with plain Node (see `helpers.test.ts`).
 */

/** The colour families the kit understands (same names as `Tone` in "@/theme"). */
export type ToneName = "violet" | "blue" | "pink" | "green" | "orange" | "yellow" | "red";

/** How each kind of post is labelled on cards ("Discussion" pill in the mockup). */
export const POST_TYPE_META: Record<string, { label: string; tone: ToneName; icon: string }> = {
  blog: { label: "Blog", tone: "violet", icon: "document-text-outline" },
  image: { label: "Art", tone: "pink", icon: "image-outline" },
  poll: { label: "Poll", tone: "blue", icon: "stats-chart-outline" },
  quiz: { label: "Quiz", tone: "orange", icon: "help-circle-outline" },
  wiki: { label: "Wiki", tone: "green", icon: "book-outline" },
  story: { label: "Story", tone: "pink", icon: "time-outline" },
  question: { label: "Discussion", tone: "violet", icon: "chatbubble-ellipses-outline" },
  link: { label: "Link", tone: "blue", icon: "link-outline" },
};

export function postTypeMeta(type: string) {
  return POST_TYPE_META[type] ?? { label: "Post", tone: "violet" as const, icon: "document-text-outline" };
}

/**
 * Splits a post's text into a short lead (shown above the pictures, like the mockup) and the rest (shown under
 * them). The lead is the first paragraph; if the text is a single paragraph, everything is the lead.
 */
export function splitLead(body: string): { lead: string; rest: string } {
  const text = body.trim();
  const at = text.search(/\n\s*\n/);
  if (at < 0) return { lead: text, rest: "" };
  return { lead: text.slice(0, at).trim(), rest: text.slice(at).trim() };
}

const TOPIC_EMOJI: Record<string, string> = {
  anime: "🌸", manga: "🎮", "fan art": "⭐", fanart: "⭐", art: "🎨", discussions: "💗", discussion: "💗",
  recommendations: "🎬", music: "🎵", gaming: "🎮", games: "🎮", pets: "🐱", books: "📚", writing: "✍️",
  cosplay: "👗", news: "📰", memes: "😂", photography: "📷", food: "🍴", travel: "✈️", fitness: "🏋️",
  "k-pop": "📘", kpop: "📘", movies: "🎬", film: "🎬", ost: "🎧", theories: "💡", frames: "🖼️",
};
const FALLBACK_EMOJI = ["🌸", "🎮", "⭐", "💗", "🎬", "✨", "🎵", "📚"];
const TOPIC_TONES: ToneName[] = ["pink", "violet", "orange", "pink", "violet", "blue", "green", "orange"];

/** A colourful emoji and tint for a community topic chip (known words get a fitting emoji). */
export function topicStyle(topic: string, index: number): { emoji: string; tone: ToneName } {
  const emoji = TOPIC_EMOJI[topic.trim().toLowerCase()] ?? FALLBACK_EMOJI[index % FALLBACK_EMOJI.length]!;
  return { emoji, tone: TOPIC_TONES[index % TOPIC_TONES.length]! };
}

/** Cleans what a leader typed into the topics box: comma separated, trimmed, no duplicates, at most 8 × 24 chars. */
export function parseTopics(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === 8) break;
  }
  return out;
}

/** Search filters (the sheet behind the sliders button on Explore). */
export type SearchFilters = {
  /** Interest key ("anime") or "" for any. */
  category: string;
  /** Language code ("en") or "" for any. */
  language: string;
  /** Smallest community size, 0 = any. */
  minMembers: number;
  sort: "relevance" | "trending" | "new" | "growing" | "members";
  safe: boolean;
};

export const DEFAULT_FILTERS: SearchFilters = { category: "", language: "", minMembers: 0, sort: "relevance", safe: false };

/** How many filters differ from the defaults (shows the dot on the filter button). */
export function activeFilterCount(f: SearchFilters): number {
  return [f.category !== "", f.language !== "", f.minMembers > 0, f.sort !== "relevance", f.safe].filter(Boolean).length;
}

export const SIZE_OPTIONS = [
  { value: 0, label: "Any size" },
  { value: 10, label: "10+" },
  { value: 100, label: "100+" },
  { value: 1000, label: "1K+" },
  { value: 10000, label: "10K+" },
] as const;

export const SORT_OPTIONS = [
  { value: "relevance", label: "Best match" },
  { value: "trending", label: "Trending" },
  { value: "new", label: "New" },
  { value: "growing", label: "Growing" },
  { value: "members", label: "Most members" },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
] as const;

/**
 * The explore banners link with website addresses. Decide what the Explore screen should do with each one:
 * open the "browse" list (optionally sorted), start a new community, or go to another screen.
 */
export function bannerAction(href: string): { kind: "browse"; sort: SearchFilters["sort"] } | { kind: "create" } | { kind: "go"; href: string } {
  if (href === "/new" || href.startsWith("/new-community")) return { kind: "create" };
  const sort = /[?&]sort=(trending|new|growing|members)/.exec(href)?.[1] as SearchFilters["sort"] | undefined;
  if (href.startsWith("/explore")) return { kind: "browse", sort: sort ?? "trending" };
  const community = /^\/c\/([^/?#]+)/.exec(href);
  if (community) return { kind: "go", href: `/community/${community[1]}` };
  return { kind: "browse", sort: "trending" };
}

/** "#Anime" / "anime" → "anime" (what the search and tag chips use). */
export function cleanTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
}

/** "Anime" → "#Anime"; keeps the person's own capitals. */
export function tagLabel(tag: string): string {
  const t = cleanTag(tag);
  return t ? `#${t.charAt(0).toUpperCase()}${t.slice(1)}` : "";
}
