import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWatchInput, twitchSource, vimeoId, youtubeId } from "./shelf.ts";

test("watch input accepts youtube, vimeo, twitch and direct files", () => {
  const yt = parseWatchInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal("kind" in yt && yt.kind, "youtube");
  const shortYt = parseWatchInput("https://youtu.be/dQw4w9WgXcQ");
  assert.equal("kind" in shortYt && shortYt.kind, "youtube");

  const vimeo = parseWatchInput("https://vimeo.com/76979871");
  assert.ok(!("error" in vimeo));
  assert.equal(vimeo.kind, "vimeo");
  assert.equal(vimeo.url, "https://player.vimeo.com/video/76979871");
  const vimeoPlayer = parseWatchInput("https://player.vimeo.com/video/76979871");
  assert.ok(!("error" in vimeoPlayer));

  const channel = parseWatchInput("https://www.twitch.tv/twitchpresents");
  assert.ok(!("error" in channel));
  assert.equal(channel.kind, "twitch");
  assert.equal(channel.url, "https://player.twitch.tv/?channel=twitchpresents");
  const vod = parseWatchInput("https://www.twitch.tv/videos/123456789");
  assert.ok(!("error" in vod));
  assert.equal(vod.kind, "twitch");
  assert.equal(vod.url, "https://player.twitch.tv/?video=123456789");

  const file = parseWatchInput("https://example.com/movie.mp4");
  assert.ok(!("error" in file));
  assert.equal(file.kind, "mp4");
});

test("watch input still refuses locked catalogs and junk", () => {
  assert.ok("error" in parseWatchInput("https://www.netflix.com/watch/123"));
  assert.ok("error" in parseWatchInput("https://example.com/page"));
  assert.ok("error" in parseWatchInput(""));
  assert.ok("error" in parseWatchInput("https://twitch.tv/directory"));
});

test("player id helpers extract from canonical urls", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(vimeoId("https://player.vimeo.com/video/76979871"), "76979871");
  assert.deepEqual(twitchSource("https://player.twitch.tv/?channel=twitchpresents"), {
    channel: "twitchpresents",
  });
  assert.deepEqual(twitchSource("https://player.twitch.tv/?video=123456789"), {
    video: "123456789",
  });
  assert.equal(twitchSource("https://player.vimeo.com/video/76979871"), null);
});
