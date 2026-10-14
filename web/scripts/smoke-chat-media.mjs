import { runWithStartContext } from "@tanstack/start-storage-context";
import { serverFnFetcher } from "../node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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
const pass = (name) => {
  passed++;
  console.log("PASS " + name);
};
async function rpc(name, data) {
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
            ...(token ? { authorization: "Bearer " + token } : {}),
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
  const r = await fetch(base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      name: "Media QA",
      email: "media-" + randomBytes(8).toString("hex") + "@example.test",
      password: randomBytes(20).toString("hex"),
    }),
  });
  const a = await r.json();
  assert.equal(r.status, 200, JSON.stringify(a));
  token = a.token;
  const profile = (await rpc("bootstrap")).profile;
  await confirmAge(token);
  return { ...a, profile };
}
await signup();
const ownerToken = token;
const hall = await rpc("createCommunity", {
  name: "Media Lab " + Date.now(),
  tagline: "Testing",
  description: "Media QA",
  category: "Art",
  visibility: "public",
  ageGate: 13,
  rules: "Be kind.",
});
const room = await rpc("createRoom", { slug: hall.id, name: "Gallery", kind: "public" });
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const audio =
  "data:audio/webm;codecs=opus;base64," + Buffer.from("qa-voice-bytes").toString("base64");
const video = "data:video/mp4;base64," + Buffer.from("qa-video-bytes").toString("base64");
const photo = await rpc("sendMessage", {
  roomId: room.id,
  body: "My photo",
  media: { kind: "image", dataUrl: tinyPng },
});
const voice = await rpc("sendMessage", {
  roomId: room.id,
  body: "",
  media: { kind: "audio", dataUrl: audio },
});
const clip = await rpc("sendMessage", {
  roomId: room.id,
  body: "A short clip",
  media: { kind: "video", dataUrl: video },
});
let page = await rpc("getRoom", { roomId: room.id });
assert.equal(page.messages.find((m) => m.id === photo.id).mediaKind, "image");
assert.equal(page.messages.find((m) => m.id === voice.id).mediaKind, "audio");
assert.equal(page.messages.find((m) => m.id === clip.id).mediaKind, "video");
assert.equal(
  (await rpc("getMessageMedia", { roomId: room.id, messageId: photo.id })).dataUrl,
  tinyPng,
);
assert.equal(
  (await rpc("getMessageMedia", { roomId: room.id, messageId: voice.id })).dataUrl,
  audio,
);
assert.equal(
  (await rpc("getMessageMedia", { roomId: room.id, messageId: clip.id })).dataUrl,
  video,
);
pass("photo, video and voice-note persistence and gated retrieval");
await assert.rejects(() =>
  rpc("sendMessage", {
    roomId: room.id,
    body: "",
    media: { kind: "image", dataUrl: "data:text/html;base64,PHNjcmlwdD4=" },
  }),
);
await assert.rejects(() =>
  rpc("sendMessage", {
    roomId: room.id,
    body: "",
    media: { kind: "video", dataUrl: "data:video/avi;base64,QUFB" },
  }),
);
await assert.rejects(() =>
  rpc("sendMessage", {
    roomId: room.id,
    body: "",
    media: { kind: "image", dataUrl: "data:image/png;base64," + "A".repeat(2_700_004) },
  }),
);
await assert.rejects(() =>
  rpc("editMessage", { roomId: room.id, messageId: photo.id, body: "replace media" }),
);
pass("media type/size validation and no edit substitution");
await signup();
const outsiderToken = token;
await assert.rejects(() => rpc("getMessageMedia", { roomId: room.id, messageId: photo.id }));
await assert.rejects(() =>
  rpc("toggleMessageReaction", { roomId: room.id, messageId: photo.id, emoji: "❤️" }),
);
pass("outsiders cannot retrieve or react to private room media");
await rpc("joinCommunity", { slug: hall.id });
await rpc("toggleMessageReaction", { roomId: room.id, messageId: photo.id, emoji: "❤️" });
token = ownerToken;
page = await rpc("getRoom", { roomId: room.id });
assert.deepEqual(page.messages.find((m) => m.id === photo.id).reactions, [
  { emoji: "❤️", count: 1, mine: false },
]);
token = outsiderToken;
await rpc("toggleMessageReaction", { roomId: room.id, messageId: photo.id, emoji: "❤️" });
token = ownerToken;
page = await rpc("getRoom", { roomId: room.id });
assert.deepEqual(page.messages.find((m) => m.id === photo.id).reactions, []);
pass("reaction toggle aggregates across accounts");
await rpc("setRoomPreference", { roomId: room.id, pinned: true, muted: true });
page = await rpc("getRoom", { roomId: room.id });
assert.equal(page.room.pinned, true);
assert.equal(page.room.muted, true);
assert.equal((await rpc("listRooms"))[0].id, room.id);
await rpc("setRoomPreference", { roomId: room.id, muted: false });
assert.equal((await rpc("getRoom", { roomId: room.id })).room.muted, false);
pass("pin and mute preferences persist independently");
const later = await rpc("sendMessage", { roomId: room.id, body: "Later note" });
const history = await rpc("getOlderMessages", { roomId: room.id, beforeId: later.id });
assert.ok(history.messages.some((m) => m.id === photo.id));
await assert.rejects(() => rpc("getOlderMessages", { roomId: room.id, beforeId: -1 }));
pass("older message paging preserves access checks");
assert.ok(
  (await rpc("searchRoomMessages", { roomId: room.id, query: "My photo" })).some(
    (m) => m.id === photo.id,
  ),
);
assert.equal(
  (await rpc("searchRoomMessages", { roomId: room.id, query: "no-such-message" })).length,
  0,
);
token = outsiderToken;
await rpc("leaveCommunity", hall.id);
await assert.rejects(() => rpc("searchRoomMessages", { roomId: room.id, query: "My photo" }));
token = ownerToken;
pass("in-room search finds history and denies former members");
await rpc("deleteMessage", { roomId: room.id, messageId: photo.id });
await assert.rejects(() => rpc("getMessageMedia", { roomId: room.id, messageId: photo.id }));
assert.equal(
  (await rpc("getRoom", { roomId: room.id })).messages.find((m) => m.id === photo.id).mediaKind,
  null,
);
pass("deleted attachments are inaccessible");
token = outsiderToken;
await assert.rejects(() => rpc("getMessageMedia", { roomId: room.id, messageId: voice.id }));
await assert.rejects(() => rpc("setRoomPreference", { roomId: room.id, pinned: true }));
pass("leaving revokes attachment and room-control access");
token = ownerToken;
const circle = await rpc("createRoom", { slug: hall.id, name: "Private circle", kind: "private" });
token = outsiderToken;
await rpc("joinCommunity", { slug: hall.id });
const outsiderProfile = (await rpc("bootstrap")).profile;
await assert.rejects(() => rpc("getRoom", { roomId: circle.id }));
const third = await signup();
const thirdToken = token;
await rpc("joinCommunity", { slug: hall.id });
token = ownerToken;
await rpc("inviteToRoom", { roomId: circle.id, handle: outsiderProfile.handle });
assert.equal((await rpc("getRoom", { roomId: circle.id })).participants.length, 2);
token = outsiderToken;
await rpc("getRoom", { roomId: circle.id });
await assert.rejects(() =>
  rpc("inviteToRoom", { roomId: circle.id, handle: third.profile.handle }),
);
await assert.rejects(() =>
  rpc("transferRoomHost", { roomId: circle.id, targetUserId: third.profile.userId }),
);
token = ownerToken;
await rpc("toggleRoomCohost", { roomId: circle.id, targetUserId: outsiderProfile.userId });
token = outsiderToken;
await rpc("inviteToRoom", { roomId: circle.id, handle: third.profile.handle });
token = thirdToken;
await rpc("getRoom", { roomId: circle.id });
token = ownerToken;
await rpc("setRoomInviteRule", { roomId: circle.id, rule: "members" });
assert.equal((await rpc("getRoom", { roomId: circle.id })).room.inviteRule, "members");
await rpc("transferRoomHost", { roomId: circle.id, targetUserId: outsiderProfile.userId });
await assert.rejects(() => rpc("setRoomInviteRule", { roomId: circle.id, rule: "hosts" }));
token = outsiderToken;
assert.equal((await rpc("getRoom", { roomId: circle.id })).room.createdBy, outsiderProfile.userId);
pass("private invites, cohosts, invite rules and host handover enforce room membership");
console.log(`${passed} CHAT MEDIA INTEGRATION GROUPS PASSED`);
