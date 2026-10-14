import assert from "node:assert/strict";
import { test } from "node:test";
import { bubbleLook } from "./cosmetics.ts";
import { BUBBLE_STYLES } from "./types.ts";

test("every style gives a usable look", () => {
  for (const style of BUBBLE_STYLES) {
    const look = bubbleLook(style, 200);
    assert.ok(look.background.length > 0, style);
  }
});

test("hue is kept inside 0-360", () => {
  assert.match(bubbleLook("bold", 999).background, /hsl\(360,/);
  assert.match(bubbleLook("bold", -5).background, /hsl\(0,/);
});

test("bold uses white text, glass blurs, outline is see-through", () => {
  assert.equal(bubbleLook("bold", 10).color, "#ffffff");
  assert.equal(bubbleLook("glass", 10).blur, true);
  assert.equal(bubbleLook("outline", 10).background, "transparent");
});
