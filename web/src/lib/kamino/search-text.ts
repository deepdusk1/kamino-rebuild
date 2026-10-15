/**
 * Turning what someone typed into safe database patterns, and ranking matches. No database or network code, so it is
 * unit tested in search-text.test.ts and shared by every search (people, communities, posts, tags, rooms, events,
 * messages, suggestions).
 */

/**
 * Escapes the characters that mean "anything" in a LIKE / ILIKE pattern (`%`, `_`) and the escape character itself.
 * Before this, searches removed `%` and `_`, so a handle like "neo_tokyo" could never be found ("neotokyo" was
 * searched instead), and searching for "%" matched every row.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `%text%` for "contains", already escaped. */
export function containsPattern(text: string): string {
  return `%${escapeLike(text)}%`;
}

/** `text%` for "starts with", already escaped. */
export function prefixPattern(text: string): string {
  return `${escapeLike(text)}%`;
}

export type ParsedQuery = {
  /** What was typed, tidied (trimmed, inner spaces collapsed, at most 60 characters). */
  query: string;
  /** Starts with `#`: a hashtag search. */
  isTag: boolean;
  /** Starts with `@`: someone's username. */
  isHandle: boolean;
  /** Lower case, without the leading `#` or `@`. Empty when nothing usable was typed. */
  term: string;
};

/** Reads a search box. "@Mika_Chan " → handle search for "mika_chan"; "#Anime" → tag search for "anime". */
export function parseSearchQuery(raw: unknown): ParsedQuery {
  const query = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const isTag = query.startsWith("#");
  const isHandle = query.startsWith("@");
  const term = query
    .replace(/^[#@]+/, "")
    .trim()
    .toLowerCase();
  return { query, isTag, isHandle, term };
}

/** Enough was typed to search (two letters; Chinese, Japanese and Korean names can be shorter). */
export function longEnough(term: string): boolean {
  if (term.length >= 2) return true;
  return /[぀-ヿ㐀-鿿가-힯]/.test(term);
}

type CommunityText = { name: string; tagline: string; description: string; category: string; topics: string[] };

/**
 * How well a community matches the words typed (0 = not at all). Exact name beats a name that starts with the words,
 * which beats a word in the name, then a topic or category, then the tagline, then the description.
 */
export function communityMatchScore(c: CommunityText, term: string): number {
  const t = term.trim().toLowerCase();
  if (!t) return 1;
  const name = c.name.toLowerCase();
  if (name === t) return 100;
  if (name.startsWith(t)) return 80;
  if (name.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(t))) return 65;
  if (name.includes(t)) return 55;
  const topics = c.topics.map((x) => x.toLowerCase());
  if (topics.some((x) => x === t || x.startsWith(t))) return 45;
  if (c.category.toLowerCase().includes(t) || topics.some((x) => x.includes(t))) return 35;
  if (c.tagline.toLowerCase().includes(t)) return 25;
  if (c.description.toLowerCase().includes(t)) return 10;
  return 0;
}

type PersonText = { handle: string; displayName: string; headline: string };

/** How well a person matches (0 = not at all): exact @username, then username start, name start, word in name... */
export function personMatchScore(p: PersonText, term: string): number {
  const t = term.trim().toLowerCase();
  if (!t) return 0;
  const handle = p.handle.toLowerCase();
  const name = p.displayName.toLowerCase();
  if (handle === t) return 100;
  if (name === t) return 90;
  if (handle.startsWith(t)) return 80;
  if (name.startsWith(t)) return 70;
  if (name.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(t))) return 60;
  if (handle.includes(t) || name.includes(t)) return 40;
  if (p.headline.toLowerCase().includes(t)) return 15;
  return 0;
}

/**
 * A new search replaces a recent one it grew out of (or was shortened to), so typing "m", "mi", "mik", "mika" leaves
 * one recent search instead of four. Only applies to searches made a moment apart (the caller passes recent ones).
 */
export function supersedesRecent(previous: string, next: string): boolean {
  const a = previous.trim().toLowerCase();
  const b = next.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || b.startsWith(a) || a.startsWith(b);
}
