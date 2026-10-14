import assert from "node:assert/strict";
import { test } from "node:test";
import { clampHue, communityColors, contrastOnWhite } from "./theme.ts";
import { THEME_STYLES } from "./types.ts";

const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

test("the accent is readable with white text for every hue and style", () => {
  for (const style of THEME_STYLES) {
    for (let hue = 0; hue < 360; hue += 5) {
      const { accent } = communityColors(hue, style);
      assert.ok(contrastOnWhite(rgbOf(accent)) >= 4.5, `${style} ${hue}: ${accent}`);
    }
  }
});

test("colours are valid hex and the hue wraps around", () => {
  const c = communityColors(370, "aurora");
  for (const value of [c.accent, c.from, c.to]) assert.match(value, /^#[0-9a-f]{6}$/);
  assert.deepEqual(communityColors(10, "aurora"), c);
});

test("solid is one flat colour, night is dark", () => {
  const solid = communityColors(200, "solid");
  assert.equal(solid.from, solid.to);
  const night = communityColors(200, "night");
  assert.ok(contrastOnWhite(rgbOf(night.from)) > 10, "the night banner is dark");
});

test("hue is clamped and junk falls back", () => {
  assert.equal(clampHue(999, 100), 360);
  assert.equal(clampHue(-4, 100), 0);
  assert.equal(clampHue("red", 100), 100);
  assert.equal(clampHue(NaN, 100), 100);
});
