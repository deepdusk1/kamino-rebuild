import assert from "node:assert/strict";
import { test } from "node:test";
import { BUBBLE_STYLES, PROFILE_FRAME_IDS } from "../api/types.ts";
import { bubbleLook, frameLook } from "./cosmetics.ts";

test("every frame the server accepts has a look (or is the plain frame)", () => {
  for (const id of PROFILE_FRAME_IDS) {
    if (id === "none") assert.equal(frameLook(id), null);
    else assert.ok(frameLook(id), id);
  }
});

test("an unknown frame falls back to the standard ring", () => {
  assert.equal(frameLook("mystery"), frameLook("ring"));
});

test("every bubble style gives a look, in light and dark", () => {
  for (const style of BUBBLE_STYLES) {
    for (const dark of [false, true]) assert.ok(bubbleLook(style, 120, dark).background.length > 0, style);
  }
});

test("bold uses white text and outline has a border", () => {
  assert.equal(bubbleLook("bold", 10, false).color, "#ffffff");
  assert.equal(bubbleLook("outline", 10, false).borderWidth, 2);
});
