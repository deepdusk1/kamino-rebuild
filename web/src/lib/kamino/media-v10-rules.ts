import { z } from "zod";

export const STORY_STICKERS = ["✨", "💜", "🎉", "🔥", "🌈", "🌙", "⭐", "🎵", "☀️", "💡", "👏", "🌸"] as const;
export const storyLayerSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  kind: z.enum(["text", "sticker", "mention"]),
  text: z.string().trim().min(1).max(200),
  x: z.number().finite().min(5).max(95),
  y: z.number().finite().min(5).max(95),
  scale: z.number().finite().min(0.5).max(2.5),
  rotation: z.number().finite().min(-180).max(180),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  backdrop: z.boolean().default(true),
}).superRefine((layer, context) => {
  if (layer.kind === "sticker" && !(STORY_STICKERS as readonly string[]).includes(layer.text))
    context.addIssue({ code: "custom", message: "Choose one of the available stickers." });
  if (layer.kind === "mention" && !/^[a-zA-Z0-9_]{3,30}$/.test(layer.text))
    context.addIssue({ code: "custom", message: "Use a member's handle for mentions." });
});
export const storyLayersSchema = z.array(storyLayerSchema).max(12).superRefine((layers, context) => {
  if (new Set(layers.map(layer => layer.id)).size !== layers.length)
    context.addIssue({ code: "custom", message: "Story layer identifiers must be unique." });
});
export type StoryLayer = z.infer<typeof storyLayerSchema>;
export function readStoryLayers(value: unknown): StoryLayer[] {
  try { return storyLayersSchema.parse(typeof value === "string" ? JSON.parse(value) : value); }
  catch { return []; }
}
export function positionStoryLayer(value: number) { return Math.max(5, Math.min(95, value)); }
export function moderationTextSegments(value:string) {
  const result:string[]=[];
  for(let offset=0;offset<value.length;offset+=6500)result.push(value.slice(offset,offset+7500));
  return result;
}
/** Each uploaded image has one stable marker; omitted markers are appended rather than lost. */
export function articleWithImages(body: string, images: {id:number;altText:string}[]) {
  let result = body;
  images.forEach((image, index) => {
    const alt = image.altText.replaceAll("[", " ").replaceAll("]", " ").replaceAll("\\", " ").replace(/[\r\n]/g, " ").slice(0, 600);
    const markdown = `![${alt}](/api/v1/content-media/${image.id})`;
    const marker = `[image:${index + 1}]`;
    if (result.includes(marker)) result = result.split(marker).join(markdown);
    else result += `\n\n${markdown}`;
  });
  return result;
}
