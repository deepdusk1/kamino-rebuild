import assert from "node:assert/strict";
import { test } from "node:test";
import { THEME_STYLES } from "../api/types.ts";
import { communityColors, contrast } from "./communityColors.ts";

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

test("button text is readable on the accent for every hue, style and mode", () => {
  for (const style of THEME_STYLES) {
    for (const dark of [false, true]) {
      for (let hue = 0; hue < 360; hue += 5) {
        const c = communityColors(hue, style, dark);
        assert.ok(contrast(rgb(c.accent), rgb(c.accentFg)) >= 4.5, `${style} ${hue} dark=${dark} accent`);
        assert.ok(contrast(rgb(c.accentAlt), rgb(c.accentFg)) >= 4.5, `${style} ${hue} dark=${dark} alt`);
      }
    }
  }
});

test("colours are valid hex and hue wraps", () => {
  const c = communityColors(-10, "vivid");
  for (const v of [c.accent, c.accentAlt, c.soft, c.from, c.to]) assert.match(v, /^#[0-9a-f]{6}$/);
  assert.deepEqual(communityColors(350, "vivid"), c);
});
