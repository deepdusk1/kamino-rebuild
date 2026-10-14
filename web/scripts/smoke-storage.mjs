/**
 * Integration test for object storage. Needs a dev server started with the KAMINO_S3_* settings pointing at the
 * pretend bucket this script starts itself (see `npm run test:storage`, which does both).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MOCK_S3, startMockS3 } from "./mock-s3.mjs";

const base = process.env.TEST_ORIGIN ?? "http://localhost:8080";
const port = Number(process.env.MOCK_S3_PORT ?? 9100);
const bucket = await startMockS3(port);
let passed = 0;
const pass = (name) => { passed += 1; console.log(`PASS ${name}`); };

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
async function signUp(label) {
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.TEST_AUTH_ORIGIN ?? base },
    body: JSON.stringify({ name: `Store ${label}`, email: `store-${label}-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(16).toString("hex") }),
  });
  assert.equal(res.status, 200);
  const token = res.headers.get("set-auth-token");
  await ok(token, "bootstrap", {});
  await ok(token, "confirmMinimumAge", { year: 1990, month: 1, day: 1 });
  return { token, id: (await res.json()).user.id };
}
const bytes = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
const fetchBytes = async (url, token) => {
  const res = await fetch(url, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") };
};

// Three different small PNG files, so a mix-up between them would show.
const png = (r) => `data:image/png;base64,${Buffer.from(
  Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, r, 0, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]),
).toString("base64")}`;
const [COVER, ALBUM1, ALBUM2, CHAT, AVATAR] = [10, 20, 30, 40, 50].map(png);

const owner = await signUp("owner");
const member = await signUp("member");
const hall = await ok(owner.token, "createCommunity", { name: `Storage Lab ${Date.now()}`, tagline: "QA", description: "Object storage QA", category: "Art", visibility: "public", ageGate: 13, rules: "Be kind." });
const secret = await ok(owner.token, "createCommunity", { name: `Private Store ${Date.now()}`, tagline: "QA", description: "Private", category: "Art", visibility: "private", ageGate: 13, rules: "Be kind." });
await ok(member.token, "joinCommunity", { slug: hall.id, nickname: "Member" });
assert.equal(bucket.objects.size, 0);

// ── Files go to the bucket, the database keeps only references ─────────────
const post = await ok(member.token, "createPost", { slug: hall.id, type: "image", title: "Stored album", body: "x", cover: COVER, album: [ALBUM1, ALBUM2] });
const page = (await ok(null, "getPostPage", { slug: hall.id, postId: post.id })).post;
assert.equal(page.cover, `/api/v1/media/post/${post.id}/0`, "the cover is served from the post's own address");
assert.equal(page.payload.albumCount, 2);
assert.equal(bucket.objects.size, 3, "cover + 2 album pictures are in the bucket");
for (const [position, original] of [[0, COVER], [1, ALBUM1], [2, ALBUM2]]) {
  const got = await fetchBytes(`${base}/api/v1/media/post/${post.id}/${position}`);
  assert.equal(got.status, 200, `position ${position}`);
  assert.equal(got.type, "image/png");
  assert.ok(got.body.equals(bytes(original)), `position ${position} returns exactly the uploaded bytes`);
}
pass("posts: cover and album go to object storage and come back byte for byte");

const secretPost = await ok(owner.token, "createPost", { slug: secret.id, type: "image", title: "Members only", body: "x", cover: COVER });
assert.equal((await fetchBytes(`${base}/api/v1/media/post/${secretPost.id}/0`)).status, 404, "a private community's picture is not public even though it is in the bucket");
assert.equal((await fetchBytes(`${base}/api/v1/media/post/${secretPost.id}/0`, owner.token)).status, 200);
pass("storage does not bypass privacy: the server checks access before handing a file over");

const room = await ok(owner.token, "createRoom", { slug: hall.id, name: "Photos", kind: "public" });
const sent = await ok(member.token, "sendMessage", { roomId: room.id, body: "photo", media: { kind: "image", dataUrl: CHAT } });
const chatFile = await fetchBytes(`${base}/api/v1/media/message/${room.id}/${sent.id}`, member.token);
assert.equal(chatFile.status, 200);
assert.ok(chatFile.body.equals(bytes(CHAT)), "chat photo bytes match");
assert.equal((await fetchBytes(`${base}/api/v1/media/message/${room.id}/${sent.id}`)).status, 401, "anonymous people still can not read chat media");
pass("chat media: stored in the bucket, streamed to members only");

await ok(member.token, "setAvatar", { dataUrl: AVATAR });
const avatar = await fetchBytes(`${base}/api/v1/media/avatar/${member.id}`);
assert.equal(avatar.status, 200);
assert.ok(avatar.body.equals(bytes(AVATAR)));
const beforeReplace = bucket.objects.size;
await ok(member.token, "setAvatar", { dataUrl: AVATAR });
assert.equal(bucket.objects.size, beforeReplace, "replacing a photo removes the old file");
pass("profile photos: stored in the bucket; replacing one removes the old file");

// ── The archive still contains the real files ──────────────────────────────
const archive = JSON.parse((await ok(member.token, "exportMyData", {})).json);
assert.equal(archive.posts.find((p) => p.id === post.id).cover, COVER, "the export holds the picture, not a storage reference");
assert.equal(archive.messageMedia[0].data_url, CHAT);
assert.equal(archive.postImages.length, 2);
assert.equal(archive.postImages[0].data_url, ALBUM1);
assert.equal(JSON.stringify(archive).includes("s3:"), false);
pass("export: stored files are put back into the archive, so it stays complete");

// ── Deleting removes the files too ─────────────────────────────────────────
const before = bucket.objects.size;
await ok(owner.token, "deleteMessage", { roomId: room.id, messageId: sent.id });
assert.equal(bucket.objects.size, before - 1, "deleting a message removes its file");
await ok(member.token, "deletePost", { slug: hall.id, postId: post.id });
assert.equal(bucket.objects.size, before - 1 - 3, "deleting a post removes its cover and album");
await ok(member.token, "removeAvatar", {});
assert.equal(bucket.objects.size, before - 1 - 3 - 1, "removing a photo removes its file");
pass("deletes: messages, posts and photos also remove their stored files");

const leaver = await signUp("leaver");
await ok(leaver.token, "joinCommunity", { slug: hall.id, nickname: "Leaver" });
await ok(leaver.token, "createPost", { slug: hall.id, type: "image", title: "Bye", body: "x", cover: COVER, album: [ALBUM1] });
await ok(leaver.token, "sendMessage", { roomId: room.id, body: "bye", media: { kind: "image", dataUrl: CHAT } });
await ok(leaver.token, "setAvatar", { dataUrl: AVATAR });
const mid = bucket.objects.size;
await ok(leaver.token, "deleteMyAccount", { confirm: "DELETE" });
assert.equal(bucket.objects.size, mid - 4, "deleting an account removes all of that person's stored files");
pass("account deletion removes the person's stored files too");

// ── Quiz pictures, story scenes and community pictures also live in the bucket ──
const QP1 = png(60);
const QP2 = png(70);
const beforeExtras = bucket.objects.size;
const quiz = await ok(owner.token, "createPost", {
  slug: hall.id, type: "quiz", title: "Picture quiz", body: "x",
  payload: { questions: [{ q: "One?", choices: ["a", "b"], answer: 0 }, { q: "Two?", choices: ["a", "b"], answer: 1 }] },
  questionImages: [QP1, QP2],
});
assert.equal(bucket.objects.size, beforeExtras + 2, "both quiz pictures are in the bucket");
await ok(member.token, "startQuiz", { postId: quiz.id });
for (const [position, original] of [[100, QP1], [101, QP2]]) {
  const got = await fetchBytes(`${base}/api/v1/media/post/${quiz.id}/${position}`, member.token);
  assert.equal(got.status, 200, `quiz picture ${position}`);
  assert.ok(got.body.equals(bytes(original)), `quiz picture ${position} returns exactly the uploaded bytes`);
}
const sceneStory = await ok(owner.token, "createPost", { slug: hall.id, type: "story", title: "Scenes", body: "", cover: COVER, album: [ALBUM1, ALBUM2], payload: { captions: ["a", "b", "c"] } });
assert.equal(bucket.objects.size, beforeExtras + 2 + 3, "a three-scene story keeps three files");
const lookBefore = bucket.objects.size;
await ok(owner.token, "updateCommunityLook", { slug: hall.id, coverUpload: COVER, iconUpload: ALBUM1 });
assert.equal(bucket.objects.size, lookBefore + 2, "the community cover and icon are stored as files");
const icon = await fetchBytes(`${base}/api/v1/media/community/${hall.id}/icon`);
assert.equal(icon.status, 200);
assert.ok(icon.body.equals(bytes(ALBUM1)), "the community icon comes back byte for byte");
await ok(owner.token, "updateCommunityLook", { slug: hall.id, iconUpload: null });
assert.equal(bucket.objects.size, lookBefore + 1, "removing the icon removes its file");
await ok(owner.token, "deletePost", { slug: hall.id, postId: quiz.id });
await ok(owner.token, "deletePost", { slug: hall.id, postId: sceneStory.id });
assert.equal(bucket.objects.size, lookBefore + 1 - 5, "deleting the quiz and the story removes their files");
pass("quiz pictures, story scenes and community pictures use object storage and are cleaned up");

assert.deepEqual(bucket.log.refused, [], `the bucket refused something: ${bucket.log.refused.join("; ")}`);
pass("every request Kamino signed was accepted by a bucket that checks signatures");

console.log(`\n${passed} STORAGE GROUPS PASSED`);
bucket.close();
