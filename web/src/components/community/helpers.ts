/**
 * Small plain helpers for the Explore, Community and Post screens (website). No React here, so they are easy
 * to test and reuse. They mirror the phone app's `src/components/community/helpers.ts` so both apps label and
 * sort things the same way.
 */
import type { AuthorChip, Post } from "@/lib/kamino/types";
import type { AvatarPerson, Tone } from "@/components/k";

/** An AuthorChip (what the server sends for people) as the kit's avatar person. */
export function personFromChip(c: AuthorChip): AvatarPerson {
  return { name: c.nickname, hue: c.hue, userId: c.userId, avatarV: c.avatarV };
}

/** How each kind of post is labelled on cards (the "Discussion" pill in the mockup). */
export const POST_TYPE_META: Record<string, { label: string; tone: Tone }> = {
  blog: { label: "Blog", tone: "violet" },
  image: { label: "Art", tone: "pink" },
  poll: { label: "Poll", tone: "blue" },
  quiz: { label: "Quiz", tone: "orange" },
  wiki: { label: "Wiki", tone: "green" },
  story: { label: "Story", tone: "pink" },
  question: { label: "Discussion", tone: "violet" },
  link: { label: "Link", tone: "blue" },
};

export function postTypeMeta(type: string): { label: string; tone: Tone } {
  return POST_TYPE_META[type] ?? { label: "Post", tone: "violet" };
}

/**
 * Splits a post's text into a short lead (shown above the pictures, like the mockup) and the rest (shown under
 * them). The lead is the first paragraph; a single paragraph is all lead.
 */
export function splitLead(body: string): { lead: string; rest: string } {
  const text = body.trim();
  const at = text.search(/\n\s*\n/);
  if (at < 0) return { lead: text, rest: "" };
  return { lead: text.slice(0, at).trim(), rest: text.slice(at).trim() };
}

/** Markdown-ish text as one plain line (for previews). */
export function plainPreview(markdown: string): string {
  return markdown
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every picture of a post: the cover first, then the album pictures (`albumCount` more). */
export function postPictures(post: Pick<Post, "id" | "cover" | "payload">): string[] {
  const album = Array.from(
    { length: post.payload.albumCount ?? 0 },
    (_, i) => `/api/v1/media/post/${post.id}/${i + 1}`,
  );
  return post.cover ? [post.cover, ...album] : album;
}

const TOPIC_EMOJI: Record<string, string> = {
  anime: "🌸",
  manga: "🎮",
  "fan art": "⭐",
  fanart: "⭐",
  art: "🎨",
  discussions: "💗",
  discussion: "💗",
  recommendations: "🎬",
  music: "🎵",
  gaming: "🎮",
  games: "🎮",
  pets: "🐱",
  books: "📚",
  writing: "✍️",
  cosplay: "👗",
  news: "📰",
  memes: "😂",
  photography: "📷",
  food: "🍴",
  travel: "✈️",
  fitness: "🏋️",
  "k-pop": "📘",
  kpop: "📘",
  movies: "🎬",
  film: "🎬",
  ost: "🎧",
  theories: "💡",
  frames: "🖼️",
};
const FALLBACK_EMOJI = ["🌸", "🎮", "⭐", "💗", "🎬", "✨", "🎵", "📚"];
const TOPIC_TONES: Tone[] = ["pink", "violet", "orange", "pink", "violet", "blue", "green", "orange"];

/** A colourful emoji and tint for a community topic chip (known words get a fitting emoji). */
export function topicStyle(topic: string, index: number): { emoji: string; tone: Tone } {
  const emoji =
    TOPIC_EMOJI[topic.trim().toLowerCase()] ?? FALLBACK_EMOJI[index % FALLBACK_EMOJI.length]!;
  return { emoji, tone: TOPIC_TONES[index % TOPIC_TONES.length]! };
}

/** Cleans what a leader typed into the topics box: comma separated, trimmed, no repeats, at most 8 × 24 chars. */
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

/** Search filters (the panel behind the sliders button on Explore). */
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

export const DEFAULT_FILTERS: SearchFilters = {
  category: "",
  language: "",
  minMembers: 0,
  sort: "relevance",
  safe: false,
};

/** How many filters differ from the defaults (lights up the filter button). */
export function activeFilterCount(f: SearchFilters): number {
  return [f.category !== "", f.language !== "", f.minMembers > 0, f.sort !== "relevance", f.safe]
    .filter(Boolean).length;
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
 * What an explore banner's button should do: open the "browse" list (optionally sorted), start a new
 * community, or go to another page.
 */
export function bannerAction(
  href: string,
):
  | { kind: "browse"; sort: SearchFilters["sort"] }
  | { kind: "go"; href: string } {
  const sort = /[?&]sort=(trending|new|growing|members)/.exec(href)?.[1] as
    | SearchFilters["sort"]
    | undefined;
  if (href.startsWith("/explore") || !href.startsWith("/")) return { kind: "browse", sort: sort ?? "trending" };
  return { kind: "go", href };
}

/** "#Anime" / "anime" → "anime" (what the search and tag chips use). */
export function cleanTag(tag: string): string {
  return tag.trim().replace(/^#+/, "");
}

/** "anime" → "#Anime"; keeps the person's own capitals. */
export function tagLabel(tag: string): string {
  const t = cleanTag(tag);
  return t ? `#${t.charAt(0).toUpperCase()}${t.slice(1)}` : "";
}

/** The search address for a hashtag (Explore opens with it). */
export function tagSearchHref(tag: string): string {
  return `/explore?q=${encodeURIComponent(`#${cleanTag(tag)}`)}`;
}

/** Roles that can moderate a community. */
export function isModRole(role: string | undefined | null): boolean {
  return !!role && ["agent", "leader", "curator"].includes(role);
}

/** Roles that lead a community (look, topics, announcements). */
export function isLeaderRole(role: string | undefined | null): boolean {
  return !!role && ["agent", "leader"].includes(role);
}
