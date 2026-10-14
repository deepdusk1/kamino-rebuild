import assert from "node:assert/strict";
import { test } from "node:test";
import { isMediaRef, parseMediaRef, s3ConfigFrom } from "./media-store.server.ts";
import { deleteMediaObject } from "./media-store.server.ts";

const good = {
  KAMINO_S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
  KAMINO_S3_BUCKET: "kamino",
  KAMINO_S3_ACCESS_KEY_ID: "id",
  KAMINO_S3_SECRET_ACCESS_KEY: "secret",
};

test("storage is off until all four settings are present", () => {
  assert.equal(s3ConfigFrom({}), null);
  assert.equal(s3ConfigFrom({ ...good, KAMINO_S3_BUCKET: "" }), null);
  assert.equal(s3ConfigFrom({ ...good, KAMINO_S3_SECRET_ACCESS_KEY: undefined }), null);
});

test("settings are read with sensible defaults", () => {
  const cfg = s3ConfigFrom(good)!;
  assert.equal(cfg.region, "us-east-1");
  assert.equal(cfg.pathStyle, true);
  assert.equal(cfg.endpoint.host, "acct.r2.cloudflarestorage.com");
  assert.equal(s3ConfigFrom({ ...good, KAMINO_S3_REGION: "auto", KAMINO_S3_PATH_STYLE: "false" })!.pathStyle, false);
});

test("a mistyped address gives a clear error instead of a crash later", () => {
  assert.throws(() => s3ConfigFrom({ ...good, KAMINO_S3_ENDPOINT: "not a url" }), /KAMINO_S3_ENDPOINT/);
});

test("references round-trip and data URLs are not references", () => {
  assert.equal(isMediaRef("s3:chat/1f2e-3d|image/jpeg"), true);
  assert.equal(isMediaRef("data:image/png;base64,AAAA"), false);
  assert.deepEqual(parseMediaRef("s3:chat/1f2e-3d|image/jpeg"), { key: "chat/1f2e-3d", mime: "image/jpeg" });
  assert.equal(parseMediaRef("s3:../etc/passwd|image/png"), null, "a key can not climb out of its folder");
  assert.equal(parseMediaRef("s3:chat/x|not a mime"), null);
});

test("files still inside the database keep working when storage is off", async () => {
  const { loadMedia, storeMedia, deleteMedia } = await import("./media-store.server.ts");
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(await storeMedia("chat", dataUrl), dataUrl, "storage off: the file stays in the database");
  assert.equal(await loadMedia(dataUrl), dataUrl);
  await assert.rejects(() => loadMedia("s3:chat/abc|image/png"), /not configured/);
  await deleteMedia(["s3:chat/abc|image/png", null, undefined]); // does nothing, never throws
});

test("durable deletion rejects missing configuration and provider failures, accepts DELETE/404", async () => {
  const previous = Object.fromEntries(Object.keys(good).map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  let calls = 0;
  try {
    for (const key of Object.keys(good)) delete process.env[key];
    globalThis.fetch = async () => { calls++; throw new Error("No external request allowed"); };
    await assert.rejects(deleteMediaObject("s3:post/object|image/png"), /not configured/);
    await assert.rejects(deleteMediaObject("data:image/png;base64,AAAA"), /Invalid/);
    assert.equal(calls, 0);
    Object.assign(process.env, good);
    for (const status of [204, 404, 403, 503]) {
      globalThis.fetch = async (_url, init) => {
        calls++; assert.equal(init?.method, "DELETE");
        return new Response(null, { status });
      };
      if (status === 204 || status === 404) await deleteMediaObject("s3:post/object|image/png");
      else await assert.rejects(deleteMediaObject("s3:post/object|image/png"), new RegExp(`HTTP ${status}`));
    }
    globalThis.fetch = async () => { throw new Error("Network unavailable"); };
    await assert.rejects(deleteMediaObject("s3:post/object|image/png"), /request failed/);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
