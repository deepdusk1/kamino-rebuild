import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CHAT_MODELS, aiConfigFrom, chatBody, trimToSentence } from "./ai.server.ts";

test("thinking models are asked to think briefly and given room for the answer", () => {
  const body = chatBody("openai/gpt-oss-20b", [{ role: "user", content: "hi" }], 400);
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.max_tokens, 1100);
});

test("other models get the plain request", () => {
  const body = chatBody("llama-3.1-8b-instant", [{ role: "user", content: "hi" }], 400);
  assert.equal("reasoning_effort" in body, false);
  assert.equal(body.max_tokens, 400);
});

test("a reply cut off by the length limit ends on a full sentence", () => {
  assert.equal(trimToSentence("The door opens. Rain falls. Then a sh"), "The door opens. Rain falls.");
  assert.equal(trimToSentence("It ends here."), "It ends here.");
  assert.equal(trimToSentence('She said, "Run!"'), 'She said, "Run!"');
  assert.equal(trimToSentence("no punctuation at all"), "no punctuation at all");
  assert.equal(
    trimToSentence("Hi. and then a very long unfinished thought that keeps going"),
    "Hi. and then a very long unfinished thought that keeps going",
  );
});

test("settings: keys, several models, and a daily limit", () => {
  assert.equal(aiConfigFrom({}).chat, null);
  assert.equal(aiConfigFrom({}).moderation, null);
  const basic = aiConfigFrom({ KAMINO_AI_API_KEY: "k" }).chat!;
  assert.deepEqual(basic.models, DEFAULT_CHAT_MODELS);
  assert.equal(basic.dailyLimit, 300);
  assert.equal(basic.url, "https://api.groq.com/openai/v1");
  const custom = aiConfigFrom({
    GROQ_API_KEY: "k",
    KAMINO_AI_MODEL: " model-a , model-b ,",
    KAMINO_AI_DAILY_LIMIT: "50",
    KAMINO_AI_BASE_URL: "http://localhost:11434/v1/",
  }).chat!;
  assert.deepEqual(custom.models, ["model-a", "model-b"]);
  assert.equal(custom.dailyLimit, 50);
  assert.equal(custom.url, "http://localhost:11434/v1");
});
