import { runWithStartContext } from "@tanstack/start-storage-context";
import { serverFnFetcher } from "../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
const base = process.env.TEST_ORIGIN ?? "http://localhost:8080";
const moduleText = await (await fetch(base + "/src/lib/kamino/server.ts")).text();
const functions = new Map(
  [
    ...moduleText.matchAll(
      /export const (\w+) = createServerFn\(\{ method: "(GET|POST)" \}\)[\s\S]*?createClientRpc\("([^"]+)"\)/g,
    ),
  ].map((m) => [m[1], { method: m[2], id: m[3] }]),
);
let token = "";
let passed = 0;
const pass = (n) => {
  passed++;
  console.log("PASS " + n);
};
async function rpc(name, data, auth = true) {
  const f = functions.get(name);
  assert.ok(f, name);
  const r = await runWithStartContext({ startOptions: {} }, () =>
    serverFnFetcher(
      base + "/_serverFn/" + f.id,
      [
        {
          method: f.method,
          data,
          headers: {
            origin: base,
            "sec-fetch-site": "same-origin",
            ...(auth && token ? { authorization: "Bearer " + token } : {}),
          },
        },
      ],
      fetch,
    ),
  );
  if (r.error) throw r.error;
  return r.result ?? r;
}
/** New accounts must pass the 13+ birthday check before they can post, join or chat. */
async function confirmAge(bearer) {
  const res = await fetch(base + "/api/v1/rpc/confirmMinimumAge", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + bearer },
    body: JSON.stringify({ data: { year: 1990, month: 1, day: 1 } }),
  });
  assert.equal(res.status, 200, "age check: " + (await res.text()));
}
async function signup() {
  const res = await fetch(base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      name: "Creator QA",
      email: "creator-" + randomBytes(8).toString("hex") + "@example.test",
      password: randomBytes(20).toString("hex"),
    }),
  });
  const a = await res.json();
  assert.equal(res.status, 200, JSON.stringify(a));
  token = a.token;
  await rpc("bootstrap");
  await confirmAge(token);
  return a;
}
const owner = await signup();
const ownerToken = token;
const hall = await rpc("createCommunity", {
  name: "Creator Lab " + Date.now(),
  tagline: "QA",
  description: "Creator workflow QA",
  category: "Art",
  visibility: "public",
  ageGate: 13,
  rules: "Be kind.",
});
const content = {
  type: "quiz",
  title: "A complete saved quiz",
  body: "## A guide\n**Keep this writing**",
  url: "",
  warning: "",
  opts: ["", "", "", "", ""],
  image: "",
  commentsOff: false,
  announce: false,
  questions: [
    { q: "First?", choices: ["A", "B"], answer: 1 },
    { q: "Second?", choices: ["C", "D", "E"], answer: 2 },
    { q: "Third?", choices: ["F", "G"], answer: 0 },
  ],
};
const id = randomUUID();
const saved = await rpc("saveDraft", { id, slug: hall.id, revision: 0, content });
assert.equal(saved.revision, 1);
assert.deepEqual((await rpc("listDrafts", hall.id))[0].content, content);
pass("private draft round trip preserves all questions and formatting");
await assert.rejects(() => rpc("listDrafts", hall.id, false));
await assert.rejects(() =>
  rpc("saveDraft", {
    id: randomUUID(),
    slug: hall.id,
    revision: 0,
    content: { ...content, body: "x".repeat(8001) },
  }),
);
pass("draft sign-in and size validation");
const v2 = await rpc("saveDraft", {
  id,
  slug: hall.id,
  revision: 1,
  content: { ...content, title: "Revised quiz" },
});
assert.equal(v2.revision, 2);
await assert.rejects(() => rpc("saveDraft", { id, slug: hall.id, revision: 1, content }));
await assert.rejects(() => rpc("deleteDraft", { id, revision: 1 }));
pass("stale saves and deletes cannot overwrite newer drafts");
const visitor = await signup();
const visitorToken = token;
await rpc("joinCommunity", { slug: hall.id });
assert.equal((await rpc("listDrafts", hall.id)).length, 0);
await assert.rejects(() => rpc("saveDraft", { id, slug: hall.id, revision: 2, content }));
await assert.rejects(() => rpc("deleteDraft", { id, revision: 2 }));
pass("draft ownership isolated across accounts");
token = ownerToken;
assert.deepEqual(
  (await rpc("updateCommunityModules", { slug: hall.id, modules: ["wiki", "chats", "members"] }))
    .modules,
  ["wiki", "chats", "members"],
);
assert.deepEqual((await rpc("getCommunityPage", { slug: hall.id })).community.modules, [
  "wiki",
  "chats",
  "members",
]);
await assert.rejects(() =>
  rpc("updateCommunityModules", { slug: hall.id, modules: ["wiki", "wiki"] }),
);
token = visitorToken;
await assert.rejects(() => rpc("updateCommunityModules", { slug: hall.id, modules: ["events"] }));
token = ownerToken;
pass("leaders choose ordered community tabs; duplicates and member edits are denied");
const quiz = await rpc("createPost", {
  slug: hall.id,
  type: "quiz",
  title: content.title,
  body: content.body,
  payload: { format: "markdown", questions: content.questions },
});
const qp = await rpc("getPostPage", { slug: hall.id, postId: quiz.id });
assert.equal(qp.post.payload.questions.length, 3);
assert.ok(qp.post.payload.questions.every((q) => q.answer === -1));
await rpc("startQuiz", { postId: quiz.id });
assert.equal((await rpc("submitQuiz", { postId: quiz.id, answers: [1, 2, 0] })).score, 3);
pass("independent quiz choices and correct answers score correctly");
const wiki = await rpc("createPost", {
  slug: hall.id,
  type: "wiki",
  title: "Community lore",
  body: "Our world history",
  payload: { category: "Lore", format: "markdown" },
});
await rpc("submitWiki", wiki.id);
assert.equal(
  (await rpc("getWiki", hall.id)).entries.find((p) => p.id === wiki.id).wikiStatus,
  "pending",
);
token = visitorToken;
await assert.rejects(() => rpc("reviewWiki", { postId: wiki.id, decision: "approved" }));
await assert.rejects(() => rpc("submitWiki", wiki.id));
pass("wiki submission and review permissions");
token = ownerToken;
await rpc("reviewWiki", { postId: wiki.id, decision: "rejected", note: "Please add context." });
assert.equal(
  (await rpc("getWiki", hall.id)).entries.find((p) => p.id === wiki.id).wikiReviewNote,
  "Please add context.",
);
await rpc("submitWiki", wiki.id);
await rpc("reviewWiki", { postId: wiki.id, decision: "approved" });
await assert.rejects(() => rpc("reviewWiki", { postId: wiki.id, decision: "rejected" }));
pass("wiki feedback, resubmission and one-time review");
assert.equal((await rpc("toggleWikiProfilePin", wiki.id)).pinned, true);
assert.ok((await rpc("getPublicProfile", owner.user.id)).pinnedWiki.some((p) => p.id === wiki.id));
assert.equal((await rpc("toggleWikiProfilePin", wiki.id)).pinned, false);
pass("approved public wiki pages can be pinned and removed from profiles");
token = visitorToken;
const template = await rpc("copyWikiTemplate", wiki.id);
const copied = await rpc("getPostPage", { slug: hall.id, postId: template.id });
assert.equal(copied.post.wikiStatus, "draft");
assert.equal(copied.post.payload.templateSourceId, wiki.id);
assert.equal(copied.post.author.userId, visitor.user.id);
await rpc("editPost", {
  slug: hall.id,
  postId: template.id,
  title: "My own lore",
  body: "My version",
});
const prior = await rpc("listWikiRevisions", template.id);
assert.equal(prior[0].body, "Our world history");
await rpc("restoreWikiRevision", { postId: template.id, revisionId: prior[0].id });
assert.equal(
  (await rpc("getPostPage", { slug: hall.id, postId: template.id })).post.body,
  "Our world history",
);
token = ownerToken;
await assert.rejects(() =>
  rpc("restoreWikiRevision", { postId: template.id, revisionId: prior[0].id }),
);
pass("wiki template copying, author credit, edit history and owner-only restore");
await rpc("editPost", {
  slug: hall.id,
  postId: wiki.id,
  title: "Community lore",
  body: "Revised world history",
});
assert.equal(
  (await rpc("getWiki", hall.id)).entries.find((p) => p.id === wiki.id).wikiStatus,
  "pending",
);
pass("editing approved wiki requires another review");
await rpc("setPostFlags", { slug: hall.id, postId: wiki.id, hidden: true });
assert.ok(!(await rpc("getWiki", hall.id)).entries.some((p) => p.id === wiki.id));
await rpc("setPostFlags", { slug: hall.id, postId: wiki.id, hidden: false });
token = visitorToken;
await rpc("blockUser", owner.user.id);
assert.ok(!(await rpc("getWiki", hall.id)).entries.some((p) => p.id === wiki.id));
pass("hidden and blocked wiki content excluded");
const otherPost = await rpc("createPost", {
  slug: hall.id,
  type: "blog",
  title: "Other member secret",
  body: "Must not appear in owner archive",
});
token = ownerToken;
const archive = JSON.parse((await rpc("exportMyData")).json);
assert.equal(archive.formatVersion, 4);
assert.equal(archive.posts.find((p) => p.id === quiz.id).body, content.body);
assert.ok(archive.drafts.some((d) => d.id === id));
assert.ok(!archive.posts.some((p) => p.id === otherPost.id));
pass("export includes full writing and own drafts only");
await rpc("deleteDraft", { id, revision: 2 });
assert.equal((await rpc("listDrafts", hall.id)).length, 0);
pass("draft deletion persists");
token = visitorToken;
await rpc("leaveCommunity", hall.id);
await assert.rejects(() =>
  rpc("editPost", {
    slug: hall.id,
    postId: otherPost.id,
    title: "After leaving",
    body: "Must be rejected",
  }),
);
pass("leaving revokes author edit access");
console.log(`${passed} CREATOR INTEGRATION GROUPS PASSED`);
