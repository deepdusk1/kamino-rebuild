/**
 * Small pure helpers for albums, shared-file folders and importing an exported copy of your data.
 * Kept free of database code so they can be tested on their own.
 */
import { MAX_ALBUM_EXTRAS, MAX_POST_PICTURES } from "./types.ts";
import { draftContentSchema, emptyDraft, type DraftContent } from "./writing.ts";

// An album is the cover picture plus up to MAX_ALBUM_EXTRAS more (10 pictures in all). The numbers live in
// types.ts so the phone app gets the same ones.
export { MAX_ALBUM_EXTRAS, MAX_POST_PICTURES };

/** One picture, as a data: URL (about 2 MB of image). */
const MAX_IMAGE_CHARS = 2_800_000;
/**
 * All the extra pictures together (about 15 MB of images). Lower than 9 × 2 MB on purpose: an album of nine
 * full-size pictures would be a very slow upload on a phone, so people are asked to use smaller ones.
 */
export const MAX_ALBUM_CHARS = 20_000_000;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** Checks the extra pictures of an album and returns them. Throws a readable Error when something is off. */
export function checkAlbum(album: unknown): string[] {
  if (album === undefined || album === null) return [];
  if (!Array.isArray(album)) throw new Error("The album is not a list of pictures.");
  if (album.length > MAX_ALBUM_EXTRAS)
    throw new Error(`An album can hold ${MAX_ALBUM_EXTRAS + 1} pictures at most.`);
  let total = 0;
  for (const item of album) {
    if (typeof item !== "string" || !IMAGE_DATA_URL.test(item))
      throw new Error("Album pictures must be PNG, JPEG, WebP or GIF files.");
    if (item.length > MAX_IMAGE_CHARS) throw new Error("Each picture must be under 2 MB.");
    total += item.length;
  }
  if (total > MAX_ALBUM_CHARS)
    throw new Error("The album is too large. Use fewer or smaller pictures.");
  return album as string[];
}

/** Quiz question pictures are stored after the album pictures: question 1 is position 100, question 2 is 101 ... */
export const QUIZ_IMAGE_BASE = 100;

/** Checks the pictures sent with a quiz (one entry per question, empty for none) and returns them. */
export function checkQuestionImages(images: unknown, questionCount: number): string[] {
  if (images === undefined || images === null) return Array(questionCount).fill("") as string[];
  if (!Array.isArray(images) || images.length > questionCount)
    throw new Error("Quiz pictures do not match the questions.");
  const out: string[] = [];
  let total = 0;
  for (let i = 0; i < questionCount; i += 1) {
    const item = images[i] ?? "";
    if (item !== "" && (typeof item !== "string" || !IMAGE_DATA_URL.test(item)))
      throw new Error("Quiz pictures must be PNG, JPEG, WebP or GIF files.");
    if (typeof item === "string" && item.length > MAX_IMAGE_CHARS)
      throw new Error("Each quiz picture must be under 2 MB.");
    total += String(item).length;
    out.push(String(item));
  }
  if (total > MAX_ALBUM_CHARS)
    throw new Error("The quiz pictures are too large. Use fewer or smaller pictures.");
  return out;
}

/** Quiz time limit in seconds: 0 for none, otherwise 10 seconds to 1 hour. Throws a readable Error when out of range. */
export function checkTimeLimit(value: unknown): number {
  if (value === undefined || value === null || value === 0) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 10 || value > 3600) {
    throw new Error("Choose a time limit between 10 seconds and 1 hour, or leave it empty.");
  }
  return value;
}

/** How late a submission may arrive after the time limit (slow networks), in milliseconds. */
export const QUIZ_GRACE_MS = 3000;

/** True when an answer sheet arrived too late for a timed quiz. */
export function isQuizLate(limitSec: number, elapsedMs: number): boolean {
  return limitSec > 0 && elapsedMs > limitSec * 1000 + QUIZ_GRACE_MS;
}

const MAX_FOLDER_DEPTH = 4;
const MAX_SEGMENT = 30;

/** Turns what someone typed ("  Guides // Maps ") into a clean folder path ("Guides/Maps"), or "" for the top level. */
export function normalizeFolder(input: unknown): string {
  if (typeof input !== "string") return "";
  const parts = input
    .split(/[/\\]/)
    .map((part) => part.replace(/\s+/g, " ").trim().slice(0, MAX_SEGMENT))
    .filter((part) => part && part !== "." && part !== "..");
  return parts.slice(0, MAX_FOLDER_DEPTH).join("/");
}

/** The top-level folders (and how many items each holds), for a folder picker. */
export function folderCounts(folders: string[]): { folder: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const folder of folders) {
    if (!folder) continue;
    // A file in "A/B" also counts towards "A".
    const parts = folder.split("/");
    for (let i = 1; i <= parts.length; i += 1) {
      const path = parts.slice(0, i).join("/");
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

// ─────────────────────────── Importing an exported copy of your data ───────────────────────────

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A time limit from an old export, or undefined when it is not a valid one. */
function importedTimeLimit(value: unknown): number | undefined {
  try {
    return checkTimeLimit(value) || undefined;
  } catch {
    return undefined;
  }
}

const POST_TYPES = new Set(["blog", "image", "question", "link", "poll", "quiz", "wiki", "story"]);
const trim = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

/**
 * Turns one post row from an export into a draft (posts are never re-published automatically, so
 * an import can not spam a community). Returns null for a row that can not be a draft.
 */
export function draftFromExportedPost(
  row: unknown,
  album: string[] = [],
  /** Quiz pictures by question number (question 1 = index 0), with "" for none. */
  quizPictures: string[] = [],
): { slug: string; content: DraftContent } | null {
  const post = asObject(row);
  if (!post) return null;
  const slug = trim(post.community_id, 100);
  const type = trim(post.type, 20);
  if (!slug || !POST_TYPES.has(type)) return null;
  const payload = asObject(post.payload) ?? {};
  const base = emptyDraft(type as DraftContent["type"]);
  const options = Array.isArray(payload.options)
    ? payload.options.map((o) => trim(o, 200)).slice(0, 5)
    : [];
  while (options.length < 5) options.push("");
  const cover = trim(post.cover, 2_800_000);
  const questions = Array.isArray(payload.questions)
    ? payload.questions.flatMap((q, index) => {
        const item = asObject(q);
        if (!item || !Array.isArray(item.choices)) return [];
        const choices = item.choices.map((c) => trim(c, 200)).slice(0, 6);
        const answer = Number(item.answer);
        return choices.length >= 2 &&
          Number.isInteger(answer) &&
          answer >= 0 &&
          answer < choices.length
          ? [
              {
                q: trim(item.q, 500),
                choices,
                answer,
                ...(IMAGE_DATA_URL.test(quizPictures[index] ?? "")
                  ? { image: quizPictures[index] }
                  : {}),
              },
            ]
          : [];
      })
    : [];
  const candidate = {
    ...base,
    title: trim(post.title, 120),
    body: trim(post.body, 8000),
    url: trim(payload.url, 2000),
    warning: trim(post.content_warning, 120),
    opts: options,
    image: cover.startsWith("data:image/") || cover.startsWith("https://") ? cover : "",
    commentsOff: post.comments_disabled === true || post.comments_disabled === "t",
    announce: false,
    questions: questions.length ? questions.slice(0, 30) : base.questions,
    album: album.filter((item) => IMAGE_DATA_URL.test(item)).slice(0, MAX_ALBUM_EXTRAS),
    timeLimitSec: importedTimeLimit(payload.timeLimitSec),
    captions: Array.isArray(payload.captions)
      ? payload.captions.map((c) => trim(c, 140)).slice(0, MAX_POST_PICTURES)
      : undefined,
  };
  const parsed = draftContentSchema.safeParse(candidate);
  return parsed.success ? { slug, content: parsed.data } : null;
}

/** Turns one saved-draft row from an export back into a draft. */
export function draftFromExportedDraft(
  row: unknown,
): { slug: string; content: DraftContent } | null {
  const draft = asObject(row);
  if (!draft) return null;
  const slug = trim(draft.community_id, 100);
  const parsed = draftContentSchema.safeParse(asObject(draft.content));
  return slug && parsed.success ? { slug, content: parsed.data } : null;
}
