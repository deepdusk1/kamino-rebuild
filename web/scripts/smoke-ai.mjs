/**
 * Integration test for the safety checks, role-play stories, wall covers and achievements, WITH the AI services on.
 * It starts a pretend AI service on 127.0.0.1:9200 itself; the dev server must be started with:
 *   KAMINO_MODERATION_API_KEY=test-moderation-key KAMINO_MODERATION_URL=http://127.0.0.1:9200/v1
 *   KAMINO_AI_API_KEY=test-chat-key KAMINO_AI_BASE_URL=http://127.0.0.1:9200/v1 KAMINO_AI_DAILY_LIMIT=500
 *   KAMINO_ADMIN_EMAILS=site-owner@example.test KAMINO_RATE_LIMIT=off
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { startMockAi } from "./mock-ai.mjs";

const base = process.env.TEST_ORIGIN ?? "http://localhost:8080";
const mock = startMockAi(Number(process.env.MOCK_AI_PORT ?? 9200));
let passed = 0;
const pass = (name) => {
  passed += 1;
  console.log(`PASS ${name}`);
};

async function call(token, name, data) {
  const res = await fetch(`${base}/api/v1/rpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: res.status, ...(await res.json()) };
}
async function ok(token, name, data) {
  const r = await call(token, name, data);
  assert.equal(r.error, undefined, `${name} failed: ${r.error?.message}`);
  return r.result;
}
async function refused(token, name, data) {
  const r = await call(token, name, data);
  assert.ok(r.error, `${name} should have been refused`);
  return r.error.message;
}
async function signUp(label, email) {
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.TEST_AUTH_ORIGIN ?? base },
    body: JSON.stringify({ name: `AI ${label}`, email: email ?? `ai-${label}-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(16).toString("hex") }),
  });
  assert.equal(res.status, 200, `sign-up ${label}`);
  const token = res.headers.get("set-auth-token");
  const body = await res.json();
  await ok(token, "bootstrap", {});
  await ok(token, "confirmMinimumAge", { year: 1990, month: 1, day: 1 });
  return { token, id: body.user.id };
}
const notes = async (who) => ok(who.token, "listNotifications", {});
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PIXEL2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const UNSAFE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
mock.markUnsafeImage(UNSAFE);

// ── Set-up ─────────────────────────────────────────────────────────────────
const siteOwner = await signUp("owner", "site-owner@example.test");
const leader = await signUp("leader");
const member = await signUp("member");
const friend = await signUp("friend");
const outsider = await signUp("outsider");
const hall = await ok(leader.token, "createCommunity", { name: `Safety Hall ${Date.now()}`, tagline: "QA", description: "AI QA", category: "Art", visibility: "public", ageGate: 13, rules: "Be kind." });
for (const who of [member, friend]) await ok(who.token, "joinCommunity", { slug: hall.id });

const status = await ok(null, "getAiStatus", undefined);
assert.deepEqual([status.moderation, status.storyteller], [true, true]);
assert.ok(status.repliesLeft > 0 && status.repliesLeft <= 500);
assert.equal((await ok(siteOwner.token, "getSafetyRole", undefined)).siteAdmin, true);
assert.equal((await ok(member.token, "getSafetyRole", undefined)).siteAdmin, false);
pass("status: the AI check and storyteller are reported; the site owner is recognised by email");

// ── Posts: held by the AI, reviewed by a person ─────────────────────────────
const bad = await ok(member.token, "createPost", { slug: hall.id, type: "blog", title: "Party supplies", body: "hmu MOCK-ILLICIT" });
assert.equal(bad.held, true, "the author is told the post was held");
assert.ok(!(await ok(friend.token, "getCommunityPage", { slug: hall.id })).posts.some((p) => p.id === bad.id), "others do not see it");
assert.match(await refused(friend.token, "getPostPage", { slug: hall.id, postId: bad.id }), /unavailable/);
assert.ok((await notes(member)).some((n) => /waiting for a moderator/.test(n.title)), "the author gets a calm explanation");
assert.ok((await notes(leader)).some((n) => n.kind === "safety" && /held for review/.test(n.title)), "the leader is alerted");
assert.ok((await notes(siteOwner)).some((n) => n.kind === "safety"), "a serious case also reaches the site owner");
assert.match(await refused(member.token, "listSafetyFlags", { slug: hall.id }), /Moderators only/);
let queue = await ok(leader.token, "listSafetyFlags", { slug: hall.id });
const postFlag = queue.find((f) => f.targetType === "post" && f.targetId === String(bad.id));
assert.ok(postFlag, "the post is in the community's safety queue");
assert.deepEqual([postFlag.action, postFlag.severe, postFlag.status], ["hold", true, "open"]);
assert.ok(postFlag.reasons.some((r) => /Illegal activity/.test(r)));
assert.match(postFlag.excerpt, /Party supplies/);
assert.match(await refused(leader.token, "reviewSafetyFlag", { id: postFlag.id, decision: "dismiss" }), /restored or removed/);
assert.match(await refused(friend.token, "reviewSafetyFlag", { id: postFlag.id, decision: "restore" }), /Moderators only/);
await ok(leader.token, "reviewSafetyFlag", { id: postFlag.id, decision: "restore" });
assert.ok((await ok(friend.token, "getCommunityPage", { slug: hall.id })).posts.some((p) => p.id === bad.id), "restored posts come back");
assert.ok((await notes(member)).some((n) => /is back/.test(n.title)));
assert.match(await refused(leader.token, "reviewSafetyFlag", { id: postFlag.id, decision: "remove" }), /already decided/);
const fine = await ok(member.token, "createPost", { slug: hall.id, type: "blog", title: "Sketch club", body: "Share your drawings" });
assert.equal(fine.held, false, "ordinary posts are not held");
pass("posts: the AI check holds illegal trading, the author and moderators are told, a person restores it");

// ── Comments: the built-in rules alone catch drug sales ─────────────────────
const before = (await ok(friend.token, "getPostPage", { slug: hall.id, postId: fine.id })).post.commentCount;
const held = await ok(friend.token, "addComment", { postId: fine.id, body: "selling xanax, dm me" });
assert.equal(held.held, true);
let pageAfter = await ok(member.token, "getPostPage", { slug: hall.id, postId: fine.id });
assert.equal(pageAfter.comments.length, 0, "held comments are not shown");
assert.equal(pageAfter.post.commentCount, before, "and not counted");
queue = await ok(leader.token, "listSafetyFlags", { slug: hall.id });
const commentFlag = queue.find((f) => f.targetType === "comment" && f.status === "open");
assert.ok(commentFlag.reasons.includes("Selling drugs or other illegal goods"));
await ok(leader.token, "reviewSafetyFlag", { id: commentFlag.id, decision: "remove" });
assert.ok((await notes(friend)).some((n) => /was removed/.test(n.title)));
await ok(friend.token, "addComment", { postId: fine.id, body: "Love this idea" });
pageAfter = await ok(member.token, "getPostPage", { slug: hall.id, postId: fine.id });
assert.deepEqual([pageAfter.comments.length, pageAfter.post.commentCount], [1, before + 1]);
pass("comments: built-in rules hold drug sales; removed ones vanish and the count stays right");

// ── Weak signals and self-harm: flagged, still visible ─────────────────────
const weak = await ok(member.token, "addComment", { postId: fine.id, body: "MOCK-HATE-LOW take on this" });
assert.equal(weak.held, false);
queue = await ok(leader.token, "listSafetyFlags", { slug: hall.id });
const weakFlag = queue.find((f) => f.action === "flag" && f.status === "open");
assert.ok(weakFlag && !weakFlag.severe, "a weak signal is only flagged, for the community's moderators");
assert.equal((await ok(friend.token, "getPostPage", { slug: hall.id, postId: fine.id })).comments.length, 2, "flagged comments stay visible");
await ok(leader.token, "reviewSafetyFlag", { id: weakFlag.id, decision: "dismiss" });
const sad = await ok(friend.token, "createPost", { slug: hall.id, type: "blog", title: "Rough week", body: "MOCK-SELFHARM honestly" });
assert.equal(sad.held, false, "a cry for help is not hidden");
assert.ok((await notes(friend)).some((n) => n.kind === "support"), "the author gets a kind note with where to find help");
pass("weak signals and self-harm are flagged for moderators and stay visible; the author gets support");

// ── Chat and direct messages ─────────────────────────────────────────────────
const room = await ok(leader.token, "createRoom", { slug: hall.id, name: "Lounge", kind: "public" });
const sent = await ok(member.token, "sendMessage", { roomId: room.id, body: "anyone want MOCK-ILLICIT stuff" });
assert.equal(sent.held, true);
assert.ok(!(await ok(friend.token, "getRoom", { roomId: room.id })).messages.some((m) => m.id === sent.id), "held messages are not delivered");
const pic = await ok(member.token, "sendMessage", { roomId: room.id, body: "", media: { kind: "image", dataUrl: UNSAFE } });
assert.equal(pic.held, true, "an unsafe picture in chat is held");
assert.equal((await call(friend.token, "getMessageMedia", { roomId: room.id, messageId: pic.id })).error?.message, "Attachment unavailable.");
const dm = await ok(member.token, "openDm", friend.id);
const dmSent = await ok(member.token, "sendMessage", { roomId: dm.roomId, body: "MOCK-ILLICIT in private" });
assert.equal(dmSent.held, true);
const siteQueue = await ok(siteOwner.token, "listSiteSafetyFlags", undefined);
const dmFlag = siteQueue.find((f) => f.targetType === "message" && f.targetId === String(dmSent.id));
assert.ok(dmFlag && dmFlag.communityId === null, "direct messages reach the site owner");
assert.match(await refused(leader.token, "reviewSafetyFlag", { id: dmFlag.id, decision: "remove" }), /Site owners only/);
assert.match(await refused(leader.token, "listSiteSafetyFlags", undefined), /Site owners only/);
await ok(siteOwner.token, "reviewSafetyFlag", { id: dmFlag.id, decision: "remove" });
pass("chat: held messages and pictures are not delivered; DMs go to the site owner, who decides");

// ── Minors: locked pictures, only the site owner may restore ─────────────────
const minors = await ok(member.token, "createPost", { slug: hall.id, type: "image", title: "Pics", body: "MOCK-MINORS", cover: PIXEL, album: [PIXEL2] });
assert.equal(minors.held, true);
queue = await ok(leader.token, "listSafetyFlags", { slug: hall.id });
const minorsFlag = queue.find((f) => f.targetId === String(minors.id));
assert.deepEqual([minorsFlag.minors, minorsFlag.severe], [true, true]);
const modView = await ok(leader.token, "getPostPage", { slug: hall.id, postId: minors.id });
assert.equal(modView.post.cover, "", "the cover is not sent to anyone, moderators included");
for (const position of [0, 1]) assert.equal((await call(leader.token, "getPostImage", { postId: minors.id, position })).error?.message, "Picture not found.");
assert.match(await refused(leader.token, "reviewSafetyFlag", { id: minorsFlag.id, decision: "restore" }), /Only the site owner/);
await ok(siteOwner.token, "reviewSafetyFlag", { id: minorsFlag.id, decision: "restore" });
const restored = await ok(friend.token, "getPostPage", { slug: hall.id, postId: minors.id });
assert.equal((await ok(friend.token, "getPostImage", { postId: minors.id, position: 0 })).dataUrl, PIXEL, "a false alarm restored by the site owner gets its cover back");
assert.ok(restored.post.cover);
pass("minors: pictures are locked even for moderators; only the site owner can restore, and the cover comes back");

// ── Profile pictures and wall covers ────────────────────────────────────────
assert.match(await refused(member.token, "setAvatar", { dataUrl: UNSAFE }), /can't be used/);
assert.match(await refused(member.token, "setProfileCover", { dataUrl: UNSAFE }), /can't be used/);
assert.match(await refused(member.token, "setProfileCover", { dataUrl: "data:text/html;base64,PGI+" }), /JPEG, PNG or WebP/);
const coverSet = await ok(member.token, "setProfileCover", { dataUrl: PIXEL });
assert.match(coverSet.cover, new RegExp(`^/api/v1/media/cover/${member.id}\\?v=\\d+$`));
const me = await ok(member.token, "getMe", {});
assert.equal(me.profile.cover, coverSet.cover);
const coverFile = await fetch(`${base}${coverSet.cover}`);
assert.equal(coverFile.status, 200);
assert.equal(coverFile.headers.get("content-type"), "image/png");
assert.equal(Buffer.from(await coverFile.arrayBuffer()).length, Buffer.from(PIXEL.split(",")[1], "base64").length);
await ok(member.token, "updateSettings", { cover: "" });
assert.equal((await fetch(`${base}${coverSet.cover}`)).status, 404, "switching to a built-in banner deletes the uploaded cover");
await ok(member.token, "setProfileCover", { dataUrl: PIXEL2 });
await ok(member.token, "removeProfileCover", undefined);
assert.equal((await ok(member.token, "getMe", {})).profile.cover, "");
pass("wall covers: upload your own (checked by the AI), served as a file, replaced or removed cleanly");

// ── Role-play stories with the AI storyteller ───────────────────────────────
const draft = await ok(member.token, "draftScene", { slug: hall.id, source: "a shipwreck film", idea: "the ship never sinks" });
assert.equal(draft.title, "The Ship That Made It");
assert.deepEqual(draft.characters.map((c) => c.name), ["Rose", "Jack", "Captain"]);
assert.match(draft.opening, /Fog curls/);
const lastSystem = mock.log.chat.at(-1).messages[0].content;
assert.match(lastSystem, /13 and up/);
assert.match(lastSystem, /ORIGINAL prose/);
const scene = await ok(member.token, "createScene", { slug: hall.id, ...draft, playAs: "Rose" });
assert.deepEqual([scene.held, scene.aiError], [false, null]);
let view = await ok(friend.token, "getScene", { sceneId: scene.id });
assert.equal(view.turns[0].kind, "narration");
assert.match(view.turns[0].body, /Fog curls/);
assert.equal(view.characters.find((c) => c.name === "Rose").playedBy.userId, member.id);
assert.equal(view.myCharacter, null);
assert.match(await refused(friend.token, "joinScene", { sceneId: scene.id, character: "Rose" }), /already played/);
await ok(friend.token, "joinScene", { sceneId: scene.id, character: "Jack" });
const chatCallsBefore = mock.log.chat.length;
const turn = await ok(member.token, "addTurn", { sceneId: scene.id, body: "Rose runs to the rail and waves at the lookout." });
assert.deepEqual([turn.held, turn.aiError], [false, null]);
assert.equal(mock.log.chat.length, chatCallsBefore + 1, "the storyteller answered the turn");
const narrationPromptSent = mock.log.chat.at(-1).messages[1].content;
assert.match(narrationPromptSent, /Rose: A restless traveller \(played by a member/);
assert.match(narrationPromptSent, /Captain: Proud and tired \(not taken; you voice/);
view = await ok(friend.token, "getScene", { sceneId: scene.id });
assert.deepEqual(view.turns.slice(-2).map((t) => t.kind), ["turn", "narration"]);
assert.equal(view.turns.at(-1).body, "The wind rises and the ship creaks as the next moment begins.", "labels like 'Narrator:' are cleaned off");
await ok(friend.token, "addTurn", { sceneId: scene.id, body: "Jack sketches the captain.", narrate: false });
await ok(friend.token, "continueScene", { sceneId: scene.id, nudge: "a storm hits" });
assert.match(mock.log.chat.at(-1).messages[1].content, /A player suggests this should happen next: a storm hits/);
await ok(friend.token, "writeEnding", { sceneId: scene.id, direction: "they open a bakery in New York" });
view = await ok(member.token, "getScene", { sceneId: scene.id });
assert.equal(view.turns.at(-1).kind, "ending");
assert.equal(view.endingCount, 1);
await ok(friend.token, "continueScene", { sceneId: scene.id, nudge: "MOCK-UNSAFE-STORY" });
view = await ok(member.token, "getScene", { sceneId: scene.id });
assert.ok(!view.turns.some((t) => /selling meth/.test(t.body)), "the storyteller's own writing is checked and held too");
queue = await ok(leader.token, "listSafetyFlags", { slug: hall.id });
assert.ok(queue.some((f) => f.targetType === "roleplay" && f.authorName === "AI storyteller"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Every request for a thinking model asks for little thinking and leaves room for the answer.
for (const request of mock.log.chat) {
  assert.equal(request.reasoning_effort, "low", "thinking models are asked to think briefly");
  assert.ok(request.max_tokens >= 1000, "and are given room for the answer");
}
// The bug seen with the real service: the model spends the allowance thinking and answers with nothing. Kamino asks
// again with more room instead of failing.
mock.setThinkingCost(1500);
const askedBefore = mock.log.chat.length;
await ok(friend.token, "continueScene", { sceneId: scene.id, nudge: "a bell rings" });
const retried = mock.log.chat.slice(askedBefore);
assert.equal(retried.length, 2, "an empty answer is asked for again");
assert.ok(retried[1].max_tokens > retried[0].max_tokens, "with more room the second time");
assert.match((await ok(member.token, "getScene", { sceneId: scene.id })).turns.at(-1).body, /wind rises/);
mock.setThinkingCost(0);
// A model that has used up its free day is skipped: the next model answers.
mock.setModelStatus("openai/gpt-oss-20b", 429);
const failoverFrom = mock.log.chat.length;
await ok(friend.token, "continueScene", { sceneId: scene.id, nudge: "the lights flicker" });
assert.equal(mock.log.chat.at(-1).model, "openai/gpt-oss-120b", "the backup model takes over");
await ok(friend.token, "continueScene", { sceneId: scene.id, nudge: "a whistle blows" });
assert.equal(mock.log.chat.slice(failoverFrom).filter((r) => r.model === "openai/gpt-oss-20b").length, 1, "a used-up model is left alone for a while");
mock.setModelStatus("openai/gpt-oss-20b", 200);
// Both models busy: the member sees a friendly message and their own turn is kept.
mock.setChatStatus(429);
await sleep(2200);
const busy = await ok(member.token, "addTurn", { sceneId: scene.id, body: "Rose laughs." });
assert.match(busy.aiError, /busy/, "a busy storyteller never loses the member's turn");
assert.equal((await ok(member.token, "getScene", { sceneId: scene.id })).turns.at(-1).body, "Rose laughs.");
mock.setChatStatus(200);
await sleep(2200);
assert.match(await refused(outsider.token, "addTurn", { sceneId: scene.id, body: "hi" }), /Join this community/);
await ok(outsider.token, "joinCommunity", { slug: hall.id });
assert.match(await refused(outsider.token, "addTurn", { sceneId: scene.id, body: "hi" }), /Pick a character/);
const violentTurn = await ok(friend.token, "addTurn", { sceneId: scene.id, body: "Jack shouts: I'll kill you, pirate!", narrate: false });
assert.equal(violentTurn.held, false, "a villain's threat inside a story is not held");
assert.match(await refused(friend.token, "deleteScene", { sceneId: scene.id }), /creator or a moderator/);
await ok(member.token, "endScene", { sceneId: scene.id });
assert.match(await refused(friend.token, "addTurn", { sceneId: scene.id, body: "one more" }), /ended/);
const listed = await ok(null, "listScenes", { slug: hall.id });
assert.equal(listed[0].id, scene.id);
assert.equal(listed[0].status, "ended");
const unsafeScene = await ok(member.token, "createScene", { slug: hall.id, title: "Market", premise: "A market where MOCK-ILLICIT goods are sold.", characters: [{ name: "Trader" }] });
assert.equal(unsafeScene.held, true);
assert.ok(!(await ok(friend.token, "listScenes", { slug: hall.id })).some((s) => s.id === unsafeScene.id), "a held story is hidden from others");
const statusAfter = await ok(null, "getAiStatus", undefined);
assert.equal(statusAfter.repliesLeft, 500 - mock.log.chatOk, "every storyteller reply that was written counts against the daily free allowance (failed attempts do not)");
pass("role-play: AI set-up, characters, narration after turns, twists, alternate endings, teen-safe prompts, AI output checked, failures never lose turns");

// ── Achievements ────────────────────────────────────────────────────────────
const handle = (await ok(member.token, "getMe", {})).profile.handle;
let profile = await ok(member.token, "getPublicProfile", handle);
assert.ok(profile.achievements.length >= 70);
const unlocked = profile.achievements.filter((a) => a.unlocked).map((a) => a.id);
for (const id of ["posts-1", "roleplayTurns-1", "scenesCreated-1", "communities-1"]) assert.ok(unlocked.includes(id), id);
assert.ok(profile.showcase.length >= 1 && profile.showcase.length <= 3, "a profile shows banners automatically");
const locked = profile.achievements.find((a) => !a.unlocked && a.metric !== "accountDays");
assert.ok(locked.progress < locked.target);
await ok(member.token, "setShowcase", { ids: ["scenesCreated-1", "posts-1"] });
profile = await ok(friend.token, "getPublicProfile", handle);
assert.deepEqual(profile.showcase.map((a) => a.id), ["scenesCreated-1", "posts-1"], "visitors see the chosen banners in order");
assert.match(await refused(member.token, "setShowcase", { ids: [locked.id] }), /unlocked/);
await ok(member.token, "addComment", { postId: fine.id, body: "One more thought" });
await ok(member.token, "getPublicProfile", handle);
assert.ok((await notes(member)).some((n) => n.kind === "achievement" && /Achievement unlocked|achievements/.test(n.title)), "new unlocks are announced");
pass("achievements: 70+ with progress, unlocked by activity, chosen banners shown to visitors, unlocks announced");

assert.deepEqual(mock.log.refused, [], "every AI request used the right key");
assert.ok(mock.log.moderation.some((m) => m.type === "image_url"), "pictures were checked too");
pass("every request to the AI services carried the right key; pictures and text were both checked");

console.log(`\n${passed} AI INTEGRATION GROUPS PASSED`);
mock.close();
