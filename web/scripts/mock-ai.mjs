/**
 * A pretend AI service for the automatic tests (never used in production). It answers like OpenAI's moderation service
 * (POST /v1/moderations) and like an OpenAI-compatible chat service such as Groq (POST /v1/chat/completions), with
 * fixed, predictable replies, and it checks the API keys, so a request Kamino sends wrongly is refused here too.
 *
 * Test words: text containing MOCK-ILLICIT scores high for illegal activity, MOCK-MINORS for sexual content with minors,
 * MOCK-SELFHARM for self-harm intent, MOCK-HATE-LOW is a weak hate signal. Pictures registered with `markUnsafeImage`
 * score high for sexual content.
 */
import { createServer } from "node:http";

export const MOCK_AI = { moderationKey: "test-moderation-key", chatKey: "test-chat-key" };

export function startMockAi(port) {
  const log = { moderation: [], chat: [], chatOk: 0, refused: [] };
  const unsafeImages = new Set();
  let chatStatus = 200;
  /** Status per model, e.g. { "openai/gpt-oss-20b": 429 } for a model that has used up its free day. */
  const modelStatus = new Map();
  /** Thinking models: an answer is empty when the token allowance is below this (the bug seen with the real service). */
  let thinkingCost = 0;
  /** Replies handed out first-in-first-out before the built-in ones (used to script a nice demo story). */
  const queuedReplies = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      res.writeHead(400).end("bad json");
      return;
    }
    const send = (status, json) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const key = (req.headers.authorization ?? "").replace(/^Bearer /, "");

    if (req.method === "POST" && req.url === "/v1/moderations") {
      if (key !== MOCK_AI.moderationKey) {
        log.refused.push("moderation: wrong key");
        return send(401, { error: { message: "bad key" } });
      }
      const item = body.input?.[0] ?? {};
      log.moderation.push({ model: body.model, type: item.type });
      const scores = {};
      if (item.type === "text") {
        const text = String(item.text ?? "");
        if (text.includes("MOCK-ILLICIT")) scores.illicit = 0.95;
        if (text.includes("MOCK-MINORS")) scores["sexual/minors"] = 0.9;
        if (text.includes("MOCK-SELFHARM")) scores["self-harm/intent"] = 0.9;
        if (text.includes("MOCK-HATE-LOW")) scores.hate = 0.55;
      } else if (item.type === "image_url" && unsafeImages.has(item.image_url?.url)) {
        scores.sexual = 0.97;
      }
      return send(200, { id: "modr-test", model: body.model, results: [{ flagged: Object.keys(scores).length > 0, category_scores: scores }] });
    }

    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      if (key !== MOCK_AI.chatKey) {
        log.refused.push("chat: wrong key");
        return send(401, { error: { message: "bad key" } });
      }
      log.chat.push(body);
      const status = modelStatus.get(body.model) ?? chatStatus;
      if (status !== 200) {
        res.writeHead(status, { "content-type": "application/json", ...(status === 429 ? { "retry-after": "2" } : {}) });
        return res.end(JSON.stringify({ error: { message: "busy" } }));
      }
      // Reasoning models spend max_tokens on hidden thinking first; asking for less thinking leaves room for the answer.
      const thinks = /gpt-oss/.test(String(body.model));
      const needed = thinks ? (body.reasoning_effort === "low" ? thinkingCost : Math.max(thinkingCost, 2000)) : 0;
      if (thinks && Number(body.max_tokens ?? 0) < needed)
        return send(200, { id: "chat-test", model: body.model, choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: "" } }] });
      const user = String(body.messages?.find((m) => m.role === "user")?.content ?? "");
      let content;
      if (queuedReplies.length && !user.includes("Reply with JSON only")) {
        content = queuedReplies.shift();
      } else if (user.includes("Reply with JSON only")) {
        content =
          '<think>planning</think>```json\n{"title":"The Ship That Made It","premise":"The iceberg is seen in time, and everyone sails on to New York.","characters":[{"name":"Rose","description":"A restless traveller"},{"name":"Jack","description":"An artist with no ticket"},{"name":"Captain","description":"Proud and tired"}],"opening":"Fog curls over the deck as the lookout shouts."}\n```';
      } else if (user.includes("Write a satisfying ending")) {
        content = "Everyone steps onto the New York docks at dawn, and the story ends happily.";
      } else if (user.includes("MOCK-UNSAFE-STORY")) {
        content = "The stranger whispers that he is selling meth behind the tavern.";
      } else {
        content = "Narrator: The wind rises and the ship creaks as the next moment begins.";
      }
      log.chatOk += 1;
      return send(200, { id: "chat-test", model: body.model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }] });
    }
    send(404, { error: { message: "not found" } });
  });
  server.listen(port, "127.0.0.1");
  return {
    log,
    markUnsafeImage: (dataUrl) => unsafeImages.add(dataUrl),
    setChatStatus: (status) => (chatStatus = status),
    setModelStatus: (model, status) => (status === 200 ? modelStatus.delete(model) : modelStatus.set(model, status)),
    setThinkingCost: (tokens) => (thinkingCost = tokens),
    queueChatReply: (text) => queuedReplies.push(text),
    close: () => server.close(),
  };
}
