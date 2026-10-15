import assert from "node:assert/strict";
import { test } from "node:test";
import { communityMatchScore, containsPattern, escapeLike, longEnough, parseSearchQuery, personMatchScore, prefixPattern, supersedesRecent } from "./search-text.ts";

test("like patterns keep % and _ as plain characters", () => {
  assert.equal(escapeLike("neo_tokyo"), "neo\\_tokyo");
  assert.equal(escapeLike("100%"), "100\\%");
  assert.equal(escapeLike("a\\b"), "a\\\\b");
  assert.equal(containsPattern("x_y"), "%x\\_y%");
  assert.equal(prefixPattern("mi"), "mi%");
});

test("reading the search box: # for tags, @ for people, tidy spaces", () => {
  assert.deepEqual(parseSearchQuery("  @Mika_Chan "), { query: "@Mika_Chan", isTag: false, isHandle: true, term: "mika_chan" });
  assert.deepEqual(parseSearchQuery("#Anime"), { query: "#Anime", isTag: true, isHandle: false, term: "anime" });
  assert.equal(parseSearchQuery("studio   ghibli").term, "studio ghibli");
  assert.equal(parseSearchQuery(undefined).term, "");
  assert.equal(parseSearchQuery("x".repeat(100)).query.length, 60);
});

test("two letters are needed, except for Chinese, Japanese and Korean", () => {
  assert.equal(longEnough("a"), false);
  assert.equal(longEnough("ab"), true);
  assert.equal(longEnough("猫"), true);
  assert.equal(longEnough("한"), true);
  assert.equal(longEnough(""), false);
});

test("communities: exact name beats name start beats a word, topic, tagline, description", () => {
  const c = (name: string, extra: Partial<{ tagline: string; description: string; category: string; topics: string[] }> = {}) => ({
    name, tagline: "", description: "", category: "Games", topics: [], ...extra,
  });
  const term = "anime";
  const scores = [
    communityMatchScore(c("Anime"), term),
    communityMatchScore(c("Anime Lovers"), term),
    communityMatchScore(c("Starlight Anime Club"), term),
    communityMatchScore(c("Otaku", { topics: ["anime"] }), term),
    communityMatchScore(c("Otaku", { tagline: "all about anime" }), term),
    communityMatchScore(c("Otaku", { description: "we watch anime" }), term),
    communityMatchScore(c("Cooking"), term),
  ];
  assert.deepEqual([...scores].sort((a, b) => b - a), scores, "already in best-first order");
  assert.equal(scores.at(-1), 0);
});

test("people: exact @username first, then name and username starts", () => {
  const p = (handle: string, displayName: string, headline = "") => ({ handle, displayName, headline });
  const scores = [
    personMatchScore(p("mika", "Someone"), "mika"),
    personMatchScore(p("x1", "Mika"), "mika"),
    personMatchScore(p("mika_art", "Art"), "mika"),
    personMatchScore(p("x2", "Mikaela"), "mika"),
    personMatchScore(p("x3", "Lovely Mikan"), "mika"),
    personMatchScore(p("tomika", "T"), "mika"),
    personMatchScore(p("x4", "Z", "fan of mika"), "mika"),
    personMatchScore(p("x5", "Nobody"), "mika"),
  ];
  assert.deepEqual([...scores].sort((a, b) => b - a), scores);
  assert.equal(scores.at(-1), 0);
});

test("a search replaces the ones it grew out of while typing", () => {
  assert.equal(supersedesRecent("mi", "mika"), true);
  assert.equal(supersedesRecent("mika", "mik"), true, "backspacing replaces too");
  assert.equal(supersedesRecent("Mika", "mika"), true);
  assert.equal(supersedesRecent("anime", "manga"), false);
  assert.equal(supersedesRecent("", "mika"), false);
});
