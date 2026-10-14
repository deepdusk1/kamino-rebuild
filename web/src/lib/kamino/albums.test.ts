import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ALBUM_EXTRAS, MAX_POST_PICTURES, QUIZ_GRACE_MS, checkAlbum, checkQuestionImages, checkTimeLimit, draftFromExportedDraft, isQuizLate, draftFromExportedPost, folderCounts, normalizeFolder } from "./albums.ts";

import { draftContentSchema, emptyDraft } from "./writing.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("album: a cover plus up to nine more pictures (ten in all), refuses a tenth extra", () => {
  assert.equal(MAX_ALBUM_EXTRAS, 9);
  assert.equal(MAX_POST_PICTURES, 10);
  assert.deepEqual(checkAlbum(undefined), []);
  assert.equal(checkAlbum(Array(9).fill(PNG)).length, 9);
  assert.throws(() => checkAlbum(Array(10).fill(PNG)), /10 pictures at most/);
});

test("album: nine pictures may not add up to more than about 15 MB", () => {
  const big = `data:image/png;base64,${"A".repeat(2_400_000)}`;
  assert.equal(checkAlbum(Array(8).fill(big)).length, 8);
  assert.throws(() => checkAlbum(Array(9).fill(big)), /too large/);
});

test("drafts hold the same album as a post (nine extras and ten captions)", () => {
  const draft = { ...emptyDraft("story"), image: PNG, album: Array(9).fill(PNG), captions: Array(10).fill("hi") };
  assert.equal(draftContentSchema.safeParse(draft).success, true);
  assert.equal(draftContentSchema.safeParse({ ...draft, album: Array(10).fill(PNG) }).success, false);
  assert.equal(draftContentSchema.safeParse({ ...draft, captions: Array(11).fill("hi") }).success, false);
});

test("album: refuses anything that is not an image data URL", () => {
  assert.throws(() => checkAlbum(["https://example.com/a.png"]), /PNG, JPEG/);
  assert.throws(() => checkAlbum(["data:text/html;base64,PGI+"]), /PNG, JPEG/);
  assert.throws(() => checkAlbum("nope"), /list/);
});

test("album: refuses a picture over 2 MB", () => {
  assert.throws(() => checkAlbum([`data:image/png;base64,${"A".repeat(2_800_100)}`]), /2 MB/);
});

test("folders are tidied up and can not climb out", () => {
  assert.equal(normalizeFolder("  Guides //  Maps "), "Guides/Maps");
  assert.equal(normalizeFolder("../../etc"), "etc");
  assert.equal(normalizeFolder("a\\b"), "a/b");
  assert.equal(normalizeFolder(""), "");
  assert.equal(normalizeFolder(42), "");
  assert.equal(normalizeFolder("a/b/c/d/e/f"), "a/b/c/d");
  assert.equal(normalizeFolder("x".repeat(80)).length, 30);
});

test("folder counts include parent folders", () => {
  assert.deepEqual(folderCounts(["Guides/Maps", "Guides", "", "Art"]), [
    { folder: "Art", count: 1 },
    { folder: "Guides", count: 2 },
    { folder: "Guides/Maps", count: 1 },
  ]);
});

test("import: a poll post becomes a poll draft", () => {
  const draft = draftFromExportedPost({
    community_id: "game-night", type: "poll", title: "Best snack?", body: "Vote", cover: "",
    payload: JSON.stringify({ options: ["Chips", "Fruit"] }), comments_disabled: false,
  });
  assert.ok(draft);
  assert.equal(draft.slug, "game-night");
  assert.equal(draft.content.type, "poll");
  assert.deepEqual(draft.content.opts, ["Chips", "Fruit", "", "", ""]);
});

test("import: quiz questions are kept only when valid", () => {
  const draft = draftFromExportedPost({
    community_id: "c", type: "quiz", title: "Quiz", body: "",
    payload: { questions: [{ q: "1+1?", choices: ["1", "2"], answer: 1 }, { q: "bad", choices: ["only"], answer: 0 }] },
  });
  assert.equal(draft?.content.questions.length, 1);
  assert.equal(draft?.content.questions[0]?.answer, 1);
});

test("import: albums come back, junk pictures do not", () => {
  const draft = draftFromExportedPost({ community_id: "c", type: "image", title: "Trip", body: "", cover: PNG, payload: {} }, [PNG, "javascript:alert(1)"]);
  assert.deepEqual(draft?.content.album, [PNG]);
  assert.equal(draft?.content.image, PNG);
});

test("import: unknown types and broken rows are skipped", () => {
  assert.equal(draftFromExportedPost({ community_id: "c", type: "hack", title: "x" }), null);
  assert.equal(draftFromExportedPost(null), null);
  assert.equal(draftFromExportedPost({ type: "blog" }), null);
});

test("import: saved drafts round-trip", () => {
  const content = draftFromExportedPost({ community_id: "c", type: "blog", title: "Hi there", body: "Body", payload: {} })!.content;
  const back = draftFromExportedDraft({ community_id: "c", content: JSON.stringify(content) });
  assert.equal(back?.content.title, "Hi there");
  assert.equal(draftFromExportedDraft({ community_id: "c", content: "{}" }), null);
});

test("quiz pictures: one per question, blanks allowed, junk refused", () => {
  assert.deepEqual(checkQuestionImages(undefined, 2), ["", ""]);
  assert.deepEqual(checkQuestionImages([PNG], 3), [PNG, "", ""]);
  assert.deepEqual(checkQuestionImages(["", PNG], 2), ["", PNG]);
  assert.throws(() => checkQuestionImages([PNG, PNG, PNG], 2), /do not match/);
  assert.throws(() => checkQuestionImages(["https://example.com/x.png"], 1), /PNG, JPEG/);
  assert.throws(() => checkQuestionImages([`data:image/png;base64,${"A".repeat(2_800_100)}`], 1), /2 MB/);
});

test("quiz time limit: none, or 10 seconds to 1 hour", () => {
  assert.equal(checkTimeLimit(undefined), 0);
  assert.equal(checkTimeLimit(0), 0);
  assert.equal(checkTimeLimit(90), 90);
  for (const bad of [5, 3601, 12.5, "60", -1, NaN]) assert.throws(() => checkTimeLimit(bad), /between 10 seconds/, String(bad));
});

test("a late answer sheet is only late after the limit plus a little grace", () => {
  assert.equal(isQuizLate(0, 9_999_999), false, "untimed quizzes are never late");
  assert.equal(isQuizLate(60, 60_000), false);
  assert.equal(isQuizLate(60, 60_000 + QUIZ_GRACE_MS), false);
  assert.equal(isQuizLate(60, 60_000 + QUIZ_GRACE_MS + 1), true);
});

test("an imported quiz keeps its question pictures, time limit and story captions", () => {
  const pic = "data:image/png;base64,AAAA";
  const quiz = draftFromExportedPost(
    {
      id: 1,
      community_id: "hall",
      type: "quiz",
      title: "Quiz",
      body: "",
      cover: "",
      payload: JSON.stringify({
        timeLimitSec: 90,
        questions: [
          { q: "Broken", choices: ["only one"], answer: 0 },
          { q: "Which?", choices: ["A", "B"], answer: 1, hasImage: true },
        ],
      }),
    },
    [],
    ["", pic],
  );
  assert.ok(quiz);
  assert.equal(quiz.content.timeLimitSec, 90);
  // The broken first question is skipped, and the picture that belonged to question 2 stays with question 2.
  assert.equal(quiz.content.questions.length, 1);
  assert.equal(quiz.content.questions[0]!.image, pic);
  const story = draftFromExportedPost({ id: 2, community_id: "hall", type: "story", title: "S", body: "", cover: pic, payload: { captions: ["one", "two"] } });
  assert.deepEqual(story?.content.captions, ["one", "two"]);
  const badLimit = draftFromExportedPost({ id: 3, community_id: "hall", type: "quiz", title: "Q", body: "", payload: { timeLimitSec: 5, questions: [{ q: "Q", choices: ["a", "b"], answer: 0 }] } });
  assert.equal(badLimit?.content.timeLimitSec, undefined, "an invalid limit from an old file is dropped, not imported");
});
