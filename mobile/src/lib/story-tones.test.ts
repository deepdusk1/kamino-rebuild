import assert from "node:assert/strict";
import { test } from "node:test";
import { STORY_TONES, TONE_KEYS, spotlightLine, toneLabel } from "./story-tones.ts";

test("the phone offers the same six moods as the server", () => {
  assert.deepEqual(TONE_KEYS, ["adventure", "mystery", "horror", "comedy", "romance", "drama"]);
  assert.equal(toneLabel("mystery"), `${STORY_TONES.mystery.emoji} Mystery`);
  assert.equal(toneLabel(""), "");
  assert.equal(toneLabel("unknown"), "");
  assert.equal(toneLabel(null), "");
});

test("the 'your move' line speaks to the right person and hides when the story is over", () => {
  assert.deepEqual(spotlightLine("Rose", "Rose", true), { mine: true, text: "Your move, Rose! The story just turned to you." });
  assert.equal(spotlightLine("Rose", "Jack", true)?.mine, false);
  assert.match(spotlightLine("Rose", null, true)!.text, /turned to Rose/);
  assert.equal(spotlightLine("Rose", "Rose", false), null);
  assert.equal(spotlightLine(null, "Rose", true), null);
});
