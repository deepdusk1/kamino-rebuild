/**
 * The Create screen's quick composer, as plain helpers (no React). They turn what was typed into exactly what
 * `createPost` expects, so the screen stays small and the rules match the phone app (`mobile/src/lib/compose.ts`).
 */
import { MAX_POST_PICTURES, type PostPayload } from "@/lib/kamino/types";
import { emptyDraft, type DraftContent } from "@/lib/kamino/writing";

/** Longest text the composer accepts (the counter shows "0/2,000"). */
export const MAX_POST_TEXT = 2000;
/** Pictures per post: the server keeps a cover plus up to 5 more (see `checkAlbum`). */
/** Pictures per post: a cover plus up to 9 more (the server allows 10). */
export const MAX_POST_MEDIA = MAX_POST_PICTURES;
/** Tags per post (the server keeps up to 10). */
export const MAX_POST_TAGS = 10;
/** Poll options (the editor shows 2 to 5). */
export const MAX_POLL_OPTIONS = 5;

export type QuickPost = {
  /** The main text ("What's on your mind?"). Its first line becomes the title when no title is given. */
  text: string;
  /** Optional title (More Options). */
  title: string;
  /** Pictures as data URLs (the first one is the cover). */
  media: string[];
  /** Poll options, or null when there is no poll. */
  poll: string[] | null;
  /** A web link, or null when there is none. */
  link: string | null;
  location: string;
  visibility: "public" | "members";
  /** Tags without the "#". */
  tags: string[];
  warning: string;
  commentsOff: boolean;
  /** ISO time to publish later, or null for now. */
  publishAt: string | null;
};

export function emptyQuickPost(): QuickPost {
  return {
    text: "",
    title: "",
    media: [],
    poll: null,
    link: null,
    location: "",
    visibility: "public",
    tags: [],
    warning: "",
    commentsOff: false,
    publishAt: null,
  };
}

/** What `createPost` needs (without the community, which the screen adds). */
export type QuickPostRequest = {
  type: "blog" | "image" | "link" | "poll";
  title: string;
  body: string;
  cover?: string;
  album?: string[];
  payload: PostPayload;
  contentWarning?: string;
  commentsDisabled?: boolean;
  location?: string;
  visibility: "public" | "members";
  publishAt?: string | null;
  hashtags?: string[];
};

/** "kamino.app" → "https://kamino.app"; anything that still isn't a web address → null. */
export function normalizeLink(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  return /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i.test(withScheme) ||
    /^https?:\/\/localhost/i.test(withScheme)
    ? withScheme
    : null;
}

/** "#Fan Art!" → "FanArt" (letters, numbers and _ only, up to 30 characters). */
export function normalizeTag(raw: string): string {
  return raw
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 30);
}

/** Adds a tag once (case-insensitive), keeping at most `MAX_POST_TAGS`. */
export function addTag(tags: readonly string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (
    !tag ||
    tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ||
    tags.length >= MAX_POST_TAGS
  )
    return [...tags];
  return [...tags, tag];
}

/** Adds or removes a tag (case-insensitive). */
export function toggleTag(tags: readonly string[], tag: string): string[] {
  const lower = tag.toLowerCase();
  return tags.some((t) => t.toLowerCase() === lower)
    ? tags.filter((t) => t.toLowerCase() !== lower)
    : addTag(tags, tag);
}

/**
 * Splits the text into a title and a body. With an explicit title the whole text is the body. Otherwise the first
 * line is the title (a long first line is shortened at a word and the full text stays in the body).
 */
export function splitTitle(text: string, explicitTitle = ""): { title: string; body: string } {
  const body = text.trim();
  if (explicitTitle.trim()) return { title: explicitTitle.trim().slice(0, 120), body };
  const lines = body.split("\n");
  const first = (lines[0] ?? "").replace(/^#+\s*/, "").trim();
  if (first.length <= 80) return { title: first, body: lines.slice(1).join("\n").trim() };
  const cut = first.slice(0, 78);
  const space = cut.lastIndexOf(" ");
  return { title: `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`, body };
}

/** A plain-English problem with the post, or null when it is ready to publish. */
export function quickPostProblem(p: QuickPost): string | null {
  if (p.text.length > MAX_POST_TEXT)
    return `Keep it under ${MAX_POST_TEXT.toLocaleString("en-US")} characters.`;
  if (p.media.length > MAX_POST_MEDIA) return `A post can have up to ${MAX_POST_MEDIA} pictures.`;
  const { title } = splitTitle(p.text, p.title);
  if (title.length < 3)
    return p.poll
      ? "Write your poll question first."
      : "Write a few words first (at least 3 characters).";
  if (p.poll) {
    if (p.poll.filter((o) => o.trim()).length < 2) return "A poll needs at least two options.";
    if (p.media.length > 1)
      return "A poll can have one picture. Remove the others, or remove the poll.";
  }
  if (p.link !== null && p.link.trim() && !normalizeLink(p.link))
    return "That link doesn't look right. Try something like https://example.com.";
  if (p.publishAt && Number.isNaN(new Date(p.publishAt).getTime()))
    return "Pick a time to publish.";
  return null;
}

/** Turns the composer into the `createPost` request. Call `quickPostProblem` first. */
export function quickPostRequest(p: QuickPost): QuickPostRequest {
  const { title, body } = splitTitle(p.text, p.title);
  const link = p.link ? normalizeLink(p.link) : null;
  const pollOptions = p.poll ? p.poll.map((o) => o.trim()).filter(Boolean) : null;
  const payload: PostPayload = { format: "markdown" };
  let type: QuickPostRequest["type"] = "blog";
  let text = body;
  let album: string[] | undefined;
  if (pollOptions) {
    type = "poll";
    payload.options = pollOptions;
    if (link) text = [body, link].filter(Boolean).join("\n\n");
  } else if (link && p.media.length <= 1) {
    type = "link";
    payload.url = link;
  } else if (p.media.length) {
    type = "image";
    album = p.media.length > 1 ? p.media.slice(1) : undefined;
    // An album can't also be a link post, so the link goes at the end of the text.
    if (link) text = [body, link].filter(Boolean).join("\n\n");
  }
  return {
    type,
    title,
    body: text,
    cover: p.media[0],
    album,
    payload,
    contentWarning: p.warning.trim() || undefined,
    commentsDisabled: p.commentsOff || undefined,
    location: p.location.trim() || undefined,
    visibility: p.visibility,
    publishAt: p.publishAt,
    hashtags: p.tags.length ? p.tags.slice(0, MAX_POST_TAGS) : undefined,
  };
}

/** Saves the composer as a community draft (location, tags and visibility are not part of drafts). */
export function quickPostToDraft(p: QuickPost): DraftContent {
  const request = quickPostRequest(p);
  const opts = [...(p.poll ?? []), "", "", "", "", ""].slice(0, 5) as DraftContent["opts"];
  return {
    ...emptyDraft(request.type),
    title: p.title,
    body: p.text,
    url: p.link ?? "",
    warning: p.warning,
    opts,
    image: p.media[0] ?? "",
    album: p.media.slice(1),
    commentsOff: p.commentsOff,
  };
}

/** Opens a saved draft in the quick composer. Quizzes, wiki pages and stories belong in the full editor. */
export function draftToQuickPost(d: DraftContent): QuickPost {
  const poll = d.type === "poll" ? d.opts.filter((o) => o.trim()) : null;
  return {
    ...emptyQuickPost(),
    text: d.body,
    title: d.title,
    media: [d.image, ...(d.album ?? [])].filter(Boolean),
    poll: poll
      ? [...poll, ...(poll.length < 2 ? ["", ""] : [])].slice(0, Math.max(2, poll.length))
      : null,
    link: d.url ? d.url : null,
    warning: d.warning,
    commentsOff: d.commentsOff,
  };
}

/** True for drafts the quick composer can open (the others open in the full editor). */
export function isQuickDraft(d: Pick<DraftContent, "type">): boolean {
  return d.type === "blog" || d.type === "image" || d.type === "link" || d.type === "poll";
}

/** Ready-made "publish later" times: in an hour, tonight at 8 PM (when it's still ahead), tomorrow 9 AM and 8 PM. */
export function schedulePresets(
  now: Date = new Date(),
): { key: string; label: string; iso: string }[] {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const inAnHour = new Date(now.getTime() + 60 * 60_000);
  inAnHour.setSeconds(0, 0);
  inAnHour.setMinutes(Math.ceil(inAnHour.getMinutes() / 5) * 5);
  const list = [{ key: "hour", label: "In 1 hour", iso: inAnHour.toISOString() }];
  const tonight = at(0, 20);
  if (tonight.getTime() - now.getTime() > 90 * 60_000)
    list.push({ key: "tonight", label: "Tonight, 8 PM", iso: tonight.toISOString() });
  list.push({ key: "tomorrow-am", label: "Tomorrow, 9 AM", iso: at(1, 9).toISOString() });
  list.push({ key: "tomorrow-pm", label: "Tomorrow, 8 PM", iso: at(1, 20).toISOString() });
  return list;
}

/** A few ready-made event start times so nobody has to type a date. */
export function eventPresets(
  now: Date = new Date(),
): { key: string; label: string; iso: string }[] {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const list: { key: string; label: string; iso: string }[] = [];
  const tonight = at(0, 20);
  if (tonight.getTime() - now.getTime() > 60 * 60_000)
    list.push({ key: "tonight", label: "Tonight, 8 PM", iso: tonight.toISOString() });
  list.push({ key: "tomorrow", label: "Tomorrow, 7 PM", iso: at(1, 19).toISOString() });
  list.push({
    key: "saturday",
    label: "Saturday, 6 PM",
    iso: at((6 - now.getDay() + 7) % 7 || 7, 18).toISOString(),
  });
  return list;
}

/** A `datetime-local` value ("2026-10-31T19:30") as an ISO time, or null when empty/invalid. */
export function localInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "Sat, Oct 31, 7:30 PM" in the viewer's own time zone. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── The Create screen's type tiles ──

export type CreateKind = "post" | "story" | "community" | "live" | "event";

export const CREATE_KINDS: readonly { key: CreateKind; label: string; hint: string }[] = [
  { key: "post", label: "Post", hint: "Write a post" },
  { key: "story", label: "Story", hint: "Pictures that disappear after 24 hours" },
  { key: "community", label: "Community", hint: "Start a new community" },
  { key: "live", label: "Live Room", hint: "Start a live voice room" },
  { key: "event", label: "Event", hint: "Schedule an event (community leaders)" },
];
