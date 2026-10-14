import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_FILTERS, activeFilterCount, bannerAction, cleanTag, parseTopics, postTypeMeta, splitLead, tagLabel, topicStyle } from "./helpers.ts";

test("splitLead keeps the first paragraph above the pictures", () => {
  assert.deepEqual(splitLead("One.\n\nTwo.\nThree."), { lead: "One.", rest: "Two.\nThree." });
  assert.deepEqual(splitLead("Only one paragraph"), { lead: "Only one paragraph", rest: "" });
  assert.deepEqual(splitLead("  \n"), { lead: "", rest: "" });
});

test("topics get an emoji and a tint", () => {
  assert.equal(topicStyle("Anime", 0).emoji, "🌸");
  assert.equal(topicStyle("Something new", 2).emoji, "⭐");
  assert.equal(topicStyle("x", 1).tone, "violet");
});

test("parseTopics cleans and limits what leaders type", () => {
  assert.deepEqual(parseTopics("Anime, manga ,anime,, Fan  Art"), ["Anime", "manga", "Fan Art"]);
  assert.equal(parseTopics("a,b,c,d,e,f,g,h,i,j").length, 8);
});

test("filters count only what differs from the defaults", () => {
  assert.equal(activeFilterCount(DEFAULT_FILTERS), 0);
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, safe: true, minMembers: 100 }), 2);
});

test("banner links become explore actions", () => {
  assert.deepEqual(bannerAction("/explore?browse=all"), { kind: "browse", sort: "trending" });
  assert.deepEqual(bannerAction("/explore?sort=new"), { kind: "browse", sort: "new" });
  assert.deepEqual(bannerAction("/new"), { kind: "create" });
  assert.deepEqual(bannerAction("/c/anime-haven"), { kind: "go", href: "/community/anime-haven" });
});

test("tags and post types", () => {
  assert.equal(cleanTag("##Anime "), "Anime");
  assert.equal(tagLabel("kpop"), "#Kpop");
  assert.equal(postTypeMeta("question").label, "Discussion");
  assert.equal(postTypeMeta("unknown").label, "Post");
});
