import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFlush, entriesForRoom, flushEntries, isRetryable, type QueuedMessage } from "./queue-core.ts";

const entry = (tag: string, roomId = 1, userId = "me"): QueuedMessage => ({
  clientTag: tag,
  userId,
  input: { roomId, body: tag, clientTag: tag },
  queuedAt: 0,
});
const fail = (status: number, message = "nope") => Object.assign(new Error(message), { status });

test("network trouble is retried; a real refusal is not", () => {
  assert.equal(isRetryable(fail(0)), true);
  assert.equal(isRetryable(fail(503)), true);
  assert.equal(isRetryable(fail(429)), true);
  assert.equal(isRetryable(fail(403)), false);
  assert.equal(isRetryable(fail(400)), false);
  assert.equal(isRetryable(new Error("odd")), true);
});

test("messages go out in order and stop at the first temporary failure (no overtaking)", async () => {
  const sent: string[] = [];
  const result = await flushEntries([entry("a"), entry("b"), entry("c")], "me", async (input) => {
    if (input.clientTag === "b") throw fail(0);
    sent.push(input.clientTag);
  });
  assert.deepEqual(sent, ["a"]);
  assert.deepEqual([...result.sent], ["a"]);
});

test("a refused message is marked failed, the rest still go out, and failed ones aren't retried", async () => {
  const sent: string[] = [];
  const queue = [entry("a"), entry("bad"), entry("c")];
  const result = await flushEntries(queue, "me", async (input) => {
    if (input.clientTag === "bad") throw fail(403, "You can't message this person.");
    sent.push(input.clientTag);
  });
  assert.deepEqual(sent, ["a", "c"]);
  const next = applyFlush([...queue, entry("new")], result);
  assert.deepEqual(next.map((e) => [e.clientTag, e.failed ?? null]), [
    ["bad", "You can't message this person."],
    ["new", null],
  ]);
  const again: string[] = [];
  await flushEntries(next, "me", async (input) => void again.push(input.clientTag));
  assert.deepEqual(again, ["new"]);
});

test("another account's messages are never sent", async () => {
  const sent: string[] = [];
  await flushEntries([entry("theirs", 1, "other")], "me", async (input) => void sent.push(input.clientTag));
  assert.deepEqual(sent, []);
});

test("a room only shows its own waiting messages", () => {
  const queue = [entry("a", 1), entry("b", 2), entry("c", 1, "other")];
  assert.deepEqual(entriesForRoom(queue, "me", 1).map((e) => e.clientTag), ["a"]);
});
