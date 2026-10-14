/**
 * Free sticker packs. Everyone has every pack: there is no store, no coins and nothing to unlock
 * (a Kamino house law). A sticker is sent as the message text `::sticker:<id>::`; the apps show it
 * large. The server only accepts ids from this list, so nothing else can pose as a sticker.
 */

export type Sticker = { id: string; label: string; emoji: string };
export type StickerPack = { id: string; label: string; stickers: Sticker[] };

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "everyday",
    label: "Everyday",
    stickers: [
      { id: "heart", label: "Heart", emoji: "❤️" },
      { id: "star", label: "Star", emoji: "⭐" },
      { id: "spark", label: "Sparkles", emoji: "✨" },
      { id: "fire", label: "Fire", emoji: "🔥" },
      { id: "hug", label: "Hug", emoji: "🤗" },
      { id: "clap", label: "Clap", emoji: "👏" },
      { id: "laugh", label: "Laughing", emoji: "😂" },
      { id: "happycry", label: "Happy tears", emoji: "🥹" },
      { id: "party", label: "Party", emoji: "🎉" },
      { id: "thumbs", label: "Thumbs up", emoji: "👍" },
      { id: "wow", label: "Wow", emoji: "😮" },
      { id: "swoon", label: "Heart eyes", emoji: "😍" },
    ],
  },
  {
    id: "fandom",
    label: "Fandom",
    stickers: [
      { id: "music", label: "Music", emoji: "🎵" },
      { id: "game", label: "Game", emoji: "🎮" },
      { id: "book", label: "Book", emoji: "📚" },
      { id: "art", label: "Art", emoji: "🎨" },
      { id: "film", label: "Film", emoji: "🎬" },
      { id: "mic", label: "Microphone", emoji: "🎤" },
      { id: "guitar", label: "Guitar", emoji: "🎸" },
      { id: "sword", label: "Swords", emoji: "⚔️" },
      { id: "wand", label: "Magic wand", emoji: "🪄" },
      { id: "rocket", label: "Rocket", emoji: "🚀" },
      { id: "alien", label: "Alien", emoji: "👽" },
      { id: "dragon", label: "Dragon", emoji: "🐉" },
    ],
  },
  {
    id: "cozy",
    label: "Cozy",
    stickers: [
      { id: "moon", label: "Moon", emoji: "🌙" },
      { id: "leaf", label: "Leaf", emoji: "🍃" },
      { id: "tea", label: "Tea", emoji: "🍵" },
      { id: "coffee", label: "Coffee", emoji: "☕" },
      { id: "cat", label: "Cat", emoji: "🐱" },
      { id: "dog", label: "Dog", emoji: "🐶" },
      { id: "bunny", label: "Bunny", emoji: "🐰" },
      { id: "sun", label: "Sun", emoji: "☀️" },
      { id: "rain", label: "Rain", emoji: "🌧️" },
      { id: "cake", label: "Cake", emoji: "🍰" },
      { id: "plant", label: "Plant", emoji: "🪴" },
      { id: "scarf", label: "Scarf", emoji: "🧣" },
    ],
  },
];

/** Every sticker in one list (the original eight keep their ids, so old messages still show). */
export const STICKERS: Sticker[] = STICKER_PACKS.flatMap((pack) => pack.stickers);

export type StickerId = string;

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

export function stickerToken(id: string) {
  return `::sticker:${id}::`;
}

/** The sticker id inside a message body, or null when the body is not exactly one known sticker. */
export function parseSticker(body: string): StickerId | null {
  const m = body.match(/^::sticker:([a-z]+)::$/);
  if (!m) return null;
  return BY_ID.has(m[1]!) ? m[1]! : null;
}

export function stickerEmoji(id: string): string {
  return BY_ID.get(id)?.emoji ?? "✨";
}

/** A message body as plain text for lists and previews: a sticker reads as "Sticker 🐱" instead of its code. */
export function previewText(body: string): string {
  const id = parseSticker(body);
  return id ? `Sticker ${stickerEmoji(id)}` : body;
}
