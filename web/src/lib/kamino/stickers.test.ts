import assert from "node:assert/strict";
import { test } from "node:test";
import { STICKERS, STICKER_PACKS, parseSticker, stickerEmoji, stickerToken } from "./stickers.ts";

test("every sticker id is lowercase letters (the message format) and unique", () => {
  const ids = STICKERS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z]+$/, id);
  assert.ok(STICKER_PACKS.every((p) => p.stickers.length === 12));
});

test("the original eight stickers still work", () => {
  for (const id of ["heart", "star", "spark", "moon", "fire", "music", "game", "leaf"]) assert.equal(parseSticker(stickerToken(id)), id);
});

test("only exact, known stickers parse", () => {
  assert.equal(parseSticker(stickerToken("dragon")), "dragon");
  assert.equal(parseSticker(stickerToken("nothing")), null);
  assert.equal(parseSticker("hello ::sticker:heart::"), null);
  assert.equal(parseSticker("::sticker:heart:: and more"), null);
  assert.equal(parseSticker("::sticker:Heart::"), null);
});

test("every sticker has an emoji", () => {
  assert.equal(stickerEmoji("cat"), "🐱");
  assert.equal(stickerEmoji("unknown"), "✨");
  assert.ok(STICKERS.every((s) => s.emoji.length > 0));
});
