import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addTag, albumFor, blankQuestion, buildPayload, draftToQuickPost, emptyContent, emptyQuickPost, normalizeLink, normalizeTag, questionImagesFor,
  quickPostProblem, quickPostRequest, quickPostToDraft, schedulePresets, splitTitle, validateContent,
} from "./compose.ts";

test("a post needs a real title", () => {
  assert.match(validateContent(emptyContent()) ?? "", /title/);
  assert.equal(validateContent({ ...emptyContent(), title: "Hello" }), null);
});

test("links, pictures and polls are checked", () => {
  const base = { ...emptyContent(), title: "Hello" };
  assert.match(validateContent({ ...base, type: "link", url: "ftp://x" }) ?? "", /link/);
  assert.equal(validateContent({ ...base, type: "link", url: "https://kamino.app" }), null);
  assert.match(validateContent({ ...base, type: "image" }) ?? "", /picture/);
  assert.match(validateContent({ ...base, type: "poll", opts: ["Yes", "", "", "", ""] }) ?? "", /two options/);
  assert.equal(validateContent({ ...base, type: "poll", opts: ["Yes", "No", "", "", ""] }), null);
});

test("quiz answers keep pointing at the right choice after blanks are dropped", () => {
  const content = {
    ...emptyContent("quiz"),
    title: "Quiz time",
    questions: [{ q: "Capital of France?", choices: ["", "Paris", "", "Rome"], answer: 3 }],
  };
  assert.equal(validateContent(content), null);
  assert.deepEqual(buildPayload(content, "").questions, [{ q: "Capital of France?", choices: ["Paris", "Rome"], answer: 1 }]);
});

test("a quiz whose correct answer is blank is refused", () => {
  const content = { ...emptyContent("quiz"), title: "Quiz time", questions: [{ q: "Q?", choices: ["A", "B", "", ""], answer: 2 }] };
  assert.match(validateContent(content) ?? "", /correct answer/);
});

test("payload only carries what the post type needs", () => {
  const wiki = buildPayload({ ...emptyContent("wiki"), title: "Lore" }, "Lore/Places");
  assert.deepEqual(wiki, { format: "markdown", category: "Lore/Places" });
  assert.deepEqual(buildPayload({ ...emptyContent("blog"), title: "Hi" }, "ignored"), { format: "markdown" });
});

test("quiz time limit is optional and must be 10 to 3600 seconds", () => {
  const base = { ...emptyContent("quiz"), title: "Timed", questions: [{ q: "Q?", choices: ["A", "B", "", ""], answer: 0 }] };
  assert.equal(validateContent(base), null);
  assert.equal(validateContent({ ...base, timeLimitSec: 0 }), null);
  assert.equal(validateContent({ ...base, timeLimitSec: 60 }), null);
  assert.match(validateContent({ ...base, timeLimitSec: 5 }) ?? "", /time limit/);
  assert.match(validateContent({ ...base, timeLimitSec: 7200 }) ?? "", /time limit/);
  assert.match(validateContent({ ...base, timeLimitSec: 12.5 }) ?? "", /time limit/);
  assert.equal(buildPayload({ ...base, timeLimitSec: 90 }, "").timeLimitSec, 90);
  assert.equal(buildPayload(base, "").timeLimitSec, undefined);
});

test("quiz pictures travel beside the payload, one entry per question", () => {
  const base = emptyContent("quiz");
  const picture = "data:image/png;base64,AAAA";
  const content = { ...base, questions: [{ ...blankQuestion(), image: picture }, blankQuestion()] };
  assert.deepEqual(questionImagesFor(content), [picture, ""]);
  assert.equal(questionImagesFor(base), undefined);
  assert.equal(JSON.stringify(buildPayload(content, "")).includes("AAAA"), false, "pictures never go inside the payload");
});

test("stories keep one caption per scene and image posts keep their album", () => {
  const story = { ...emptyContent("story"), image: "cover", album: ["b", "c"], captions: ["  One ", "", "Three", "extra"] };
  assert.deepEqual(buildPayload(story, "").captions, ["One", "", "Three"]);
  assert.equal(buildPayload({ ...story, captions: ["", "", ""] }, "").captions, undefined);
  assert.deepEqual(albumFor(story), ["b", "c"]);
  assert.equal(albumFor({ ...story, type: "blog" }), undefined);
  assert.deepEqual(albumFor({ ...story, type: "image" }), ["b", "c"]);
});

// ── Quick composer (Create tab) ──

test("the first line becomes the title", () => {
  assert.deepEqual(splitTitle("Sunset sketch\nDrew this tonight"), { title: "Sunset sketch", body: "Drew this tonight" });
  assert.deepEqual(splitTitle("Hello there", "My title"), { title: "My title", body: "Hello there" });
  const long = "This is a really long first line that keeps going and going well past eighty characters for sure";
  const split = splitTitle(long);
  assert.ok(split.title.endsWith("…") && split.title.length <= 80);
  assert.equal(split.body, long);
});

test("quick posts pick the right post type", () => {
  const base = { ...emptyQuickPost(), text: "Look at this" };
  assert.equal(quickPostRequest(base).type, "blog");
  assert.equal(quickPostRequest({ ...base, media: ["a"] }).type, "image");
  const album = quickPostRequest({ ...base, media: ["a", "b", "c"] });
  assert.deepEqual([album.cover, album.album], ["a", ["b", "c"]]);
  const link = quickPostRequest({ ...base, link: "kamino.app" });
  assert.deepEqual([link.type, link.payload.url], ["link", "https://kamino.app"]);
  const albumWithLink = quickPostRequest({ ...base, media: ["a", "b"], link: "https://x.dev" });
  assert.equal(albumWithLink.type, "image");
  assert.match(albumWithLink.body, /https:\/\/x\.dev/);
  const poll = quickPostRequest({ ...base, poll: ["Yes", " ", "No"] });
  assert.deepEqual([poll.type, poll.payload.options], ["poll", ["Yes", "No"]]);
});

test("quick post problems are explained", () => {
  assert.match(quickPostProblem(emptyQuickPost()) ?? "", /few words/);
  const base = { ...emptyQuickPost(), text: "Pick one" };
  assert.equal(quickPostProblem(base), null);
  assert.match(quickPostProblem({ ...base, poll: ["Only one", ""] }) ?? "", /two options/);
  assert.match(quickPostProblem({ ...base, poll: ["A", "B"], media: ["a", "b"] }) ?? "", /one picture/);
  assert.match(quickPostProblem({ ...base, link: "not a link" }) ?? "", /link/);
  assert.match(quickPostProblem({ ...base, text: "x".repeat(2001) }) ?? "", /2,000/);
});

test("links and tags are tidied", () => {
  assert.equal(normalizeLink("https://kamino.app/c/x"), "https://kamino.app/c/x");
  assert.equal(normalizeLink("ftp://x.y"), null);
  assert.equal(normalizeLink("hello"), null);
  assert.equal(normalizeTag("#Fan Art!"), "FanArt");
  assert.deepEqual(addTag(["Anime"], "#anime"), ["Anime"]);
  assert.deepEqual(addTag(["Anime"], "Art"), ["Anime", "Art"]);
});

test("drafts round-trip through the quick composer", () => {
  const post = { ...emptyQuickPost(), text: "Which one?", poll: ["Cats", "Dogs"], media: ["a"], commentsOff: true };
  const back = draftToQuickPost(quickPostToDraft(post));
  assert.deepEqual([back.text, back.poll, back.media, back.commentsOff], ["Which one?", ["Cats", "Dogs"], ["a"], true]);
});

test("schedule presets are all in the future", () => {
  const now = new Date(2026, 9, 2, 10, 7);
  const presets = schedulePresets(now);
  assert.ok(presets.length >= 3);
  for (const p of presets) assert.ok(new Date(p.iso).getTime() > now.getTime());
  assert.ok(presets.some((p) => p.key === "tonight"));
  assert.ok(!schedulePresets(new Date(2026, 9, 2, 19, 30)).some((p) => p.key === "tonight"));
});
