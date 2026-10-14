import { z } from "zod";

const baseDraftSchema = z.object({
  type: z.enum(["blog", "image", "question", "link", "poll", "quiz", "wiki", "story"]),
  title: z.string().max(120),
  body: z.string().max(8000),
  url: z.string().max(2000),
  warning: z.string().max(120),
  opts: z.array(z.string().max(200)).length(5),
  image: z.string().max(2800000),
  /** More pictures for an image post (the cover is `image`). Same limit as MAX_ALBUM_EXTRAS in albums.ts. */
  album: z.array(z.string().max(2800000)).max(9).optional(),
  commentsOff: z.boolean(),
  announce: z.boolean(),
  questions: z
    .array(
      z.object({
        q: z.string().max(500),
        choices: z.array(z.string().max(200)).min(2).max(6),
        answer: z.number().int().min(0).max(5),
        /** A picture shown with the question (quizzes only). */
        image: z.string().max(2800000).optional(),
      }),
    )
    .min(1)
    .max(30),
  /** Whole-quiz time limit in seconds; empty or 0 means untimed. */
  timeLimitSec: z.number().int().min(0).max(3600).optional(),
  /** Short text shown with each scene of a story (the cover is scene 1, then the album). */
  captions: z.array(z.string().max(140)).max(10).optional(),
});
/** Everything in a draft (pictures included) may not exceed about 24 MB (a cover plus a full album fits). */
export const draftContentSchema = baseDraftSchema.refine(
  (draft) => JSON.stringify(draft).length <= 24_000_000,
  {
    message: "This draft is too large. Use fewer or smaller pictures.",
  },
);
export type DraftContent = z.infer<typeof draftContentSchema>;
export type CreatorDraft = {
  id: string;
  slug: string;
  content: DraftContent;
  revision: number;
  updatedAt: string;
};
export const saveDraftSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(100),
  revision: z.number().int().min(0),
  content: draftContentSchema,
});
export function emptyDraft(type: DraftContent["type"] = "blog"): DraftContent {
  return {
    type,
    title: "",
    body: "",
    url: "",
    warning: "",
    opts: ["", "", "", "", ""],
    image: "",
    commentsOff: false,
    announce: false,
    questions: [{ q: "", choices: ["", "", "", ""], answer: 0 }],
  };
}
