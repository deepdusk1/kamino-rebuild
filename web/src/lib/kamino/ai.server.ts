/**
 * Talking to the two free AI services Kamino can use. Both are optional: without keys, Kamino still runs, the
 * built-in safety rules still apply, and the role-play screens say that the AI storyteller is not set up.
 *
 *   Moderation  – OpenAI's moderation service (free of charge; needs an OpenAI API key). Checks text and pictures.
 *                 KAMINO_MODERATION_API_KEY (or OPENAI_API_KEY), optional KAMINO_MODERATION_URL.
 *   Storyteller – any "OpenAI-compatible" chat service. The default is Groq's free tier.
 *                 KAMINO_AI_API_KEY (or GROQ_API_KEY), optional KAMINO_AI_BASE_URL,
 *                 KAMINO_AI_MODEL (one model, or several separated by commas: if the first is busy or used up,
 *                 the next one answers; every model has its own free allowance),
 *                 KAMINO_AI_DAILY_LIMIT (default 300 replies a day; Groq's free tier allows about 200,000 words
 *                 of traffic per model per day, and a story reply is roughly 1,300 of them).
 *
 * Nothing here ever throws on a moderation failure: a slow or broken service must not stop people from posting.
 */
import type { Sql } from "@/lib/db";

type Env = Record<string, string | undefined>;

export type AiConfig = {
  moderation: { url: string; key: string; model: string } | null;
  chat: { url: string; key: string; models: string[]; dailyLimit: number } | null;
};

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** Free models tried in this order. Each has its own daily allowance on Groq, so two models roughly double the day. */
export const DEFAULT_CHAT_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];
const DEFAULT_DAILY_LIMIT = 300;

export function aiConfigFrom(env: Env): AiConfig {
  const moderationKey = (env.KAMINO_MODERATION_API_KEY || env.OPENAI_API_KEY || "").trim();
  const chatKey = (env.KAMINO_AI_API_KEY || env.GROQ_API_KEY || "").trim();
  const limit = Number(env.KAMINO_AI_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT);
  const models = (env.KAMINO_AI_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    moderation: moderationKey
      ? {
          url: trimSlash(env.KAMINO_MODERATION_URL?.trim() || "https://api.openai.com/v1"),
          key: moderationKey,
          model: env.KAMINO_MODERATION_MODEL?.trim() || "omni-moderation-latest",
        }
      : null,
    chat: chatKey
      ? {
          url: trimSlash(env.KAMINO_AI_BASE_URL?.trim() || "https://api.groq.com/openai/v1"),
          key: chatKey,
          models: models.length ? models : DEFAULT_CHAT_MODELS,
          dailyLimit:
            Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : DEFAULT_DAILY_LIMIT,
        }
      : null,
  };
}

export const aiConfig = (): AiConfig => aiConfigFrom(process.env);

async function postJson(
  url: string,
  key: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scores one piece of text or one picture (a data: URL). Returns the score per category, or null when moderation is
 * switched off or the service did not answer in time.
 */
export async function moderationScores(
  input: { text: string } | { image: string },
): Promise<Record<string, number> | null> {
  const config = aiConfig().moderation;
  if (!config) return null;
  const item =
    "text" in input
      ? { type: "text", text: input.text.slice(0, 8000) }
      : { type: "image_url", image_url: { url: input.image } };
  try {
    const res = await postJson(
      `${config.url}/moderations`,
      config.key,
      { model: config.model, input: [item] },
      6000,
    );
    if (!res.ok) {
      console.warn(`[moderation] service answered ${res.status}; the built-in rules still apply`);
      return null;
    }
    const body = (await res.json()) as { results?: { category_scores?: Record<string, number> }[] };
    return body.results?.[0]?.category_scores ?? null;
  } catch (error) {
    console.warn(
      "[moderation] service unreachable; the built-in rules still apply",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** A friendly error for people (shown as-is in the apps). */
export class AiUnavailableError extends Error {}

/** Counts one storyteller reply against today's budget. */
async function countReply(sql: Sql): Promise<void> {
  await sql`
    insert into ai_usage (day, calls) values ((now() at time zone 'UTC')::date, 1)
    on conflict (day) do update set calls = ai_usage.calls + 1
  `;
}

/** How many storyteller replies are left today (for the apps to show). */
export async function budgetLeft(sql: Sql): Promise<number> {
  const config = aiConfig().chat;
  if (!config) return 0;
  const used = Number(
    (
      await sql<{
        calls: number;
      }>`select calls from ai_usage where day = (now() at time zone 'UTC')::date`
    )[0]?.calls ?? 0,
  );
  return Math.max(0, config.dailyLimit - used);
}

/**
 * The request for one model. Models in the "gpt-oss" family think silently before they answer, and that thinking is
 * paid for out of the same `max_tokens` allowance as the answer. On the default (medium) effort a short reply budget is
 * used up by the thinking and the answer comes back empty, so these models are asked to think only a little and are
 * given extra room.
 */
export function chatBody(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Record<string, unknown> {
  const thinksFirst = /gpt-oss/i.test(model);
  return {
    model,
    messages,
    max_tokens: thinksFirst ? maxTokens + 700 : maxTokens,
    temperature: 0.9,
    ...(thinksFirst ? { reasoning_effort: "low" } : {}),
  };
}

/** Cuts a reply that was stopped by the length limit back to its last full sentence. */
export function trimToSentence(text: string): string {
  const end = text.search(/[.!?…]["'”’)\]]*\s*$/);
  if (end >= 0) return text.trim();
  const cut = Math.max(
    ...[".", "!", "?", "…"].map((mark) => text.lastIndexOf(mark)),
  );
  return cut > text.length * 0.4 ? text.slice(0, cut + 1).trim() : text.trim();
}

type Attempt =
  | { kind: "ok"; text: string }
  | { kind: "empty" }
  | { kind: "busy"; retryAfterMs: number }
  | { kind: "failed" };

/**
 * Default reply budget for one storyteller call. The default reasoning model (gpt-oss) pays for
 * its thinking out of this allowance, so it must stay well above a plain answer's length or the
 * reply comes back empty (the 2026-09-29 regression). Callers may pass more.
 */
export const STORYTELLER_DEFAULT_TOKENS = 1000;

/** Models that ran out of allowance or were busy, and when to try them again (kept in memory). */
const restingUntil = new Map<string, number>();
export const resetModelRests = () => restingUntil.clear();

async function askOnce(
  config: NonNullable<AiConfig["chat"]>,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<Attempt> {
  let res: Response;
  try {
    res = await postJson(
      `${config.url}/chat/completions`,
      config.key,
      chatBody(model, messages, maxTokens),
      25_000,
    );
  } catch {
    return { kind: "failed" };
  }
  if (res.status === 429) {
    const seconds = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000;
    return { kind: "busy", retryAfterMs: Math.min(wait, 60 * 60_000) };
  }
  if (!res.ok) {
    console.warn(`[ai] ${model} answered ${res.status}`);
    return { kind: "failed" };
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  };
  const choice = body.choices?.[0];
  const text = choice?.message?.content?.trim() ?? "";
  if (!text) return { kind: "empty" };
  return { kind: "ok", text: choice?.finish_reason === "length" ? trimToSentence(text) : text };
}

/**
 * Asks the storyteller for a reply. Tries each configured model in turn: a model that is busy, used up, broken or
 * answers with nothing is skipped in favour of the next. Throws `AiUnavailableError` with a message people can read.
 */
export async function chatComplete(
  sql: Sql,
  messages: ChatMessage[],
  options: { maxTokens?: number } = {},
): Promise<string> {
  const config = aiConfig().chat;
  if (!config) throw new AiUnavailableError("The AI storyteller is not set up on this server yet.");
  if ((await budgetLeft(sql)) <= 0)
    throw new AiUnavailableError(
      "The AI storyteller has used today's free replies. It will be back tomorrow.",
    );
  const maxTokens = options.maxTokens ?? STORYTELLER_DEFAULT_TOKENS;
  let sawBusy = false;
  let sawEmpty = false;
  for (const model of config.models) {
    if ((restingUntil.get(model) ?? 0) > Date.now()) {
      sawBusy = true;
      continue;
    }
    // An empty answer is tried once more with double the room before moving on.
    for (const room of [maxTokens, maxTokens * 2]) {
      const attempt = await askOnce(config, model, messages, room);
      if (attempt.kind === "ok") {
        await countReply(sql);
        return attempt.text;
      }
      if (attempt.kind === "busy") {
        restingUntil.set(model, Date.now() + attempt.retryAfterMs);
        sawBusy = true;
        break;
      }
      if (attempt.kind === "empty") {
        sawEmpty = true;
        continue;
      }
      break;
    }
  }
  if (sawBusy) throw new AiUnavailableError("The AI storyteller is busy right now. Try again in a minute.");
  if (sawEmpty) throw new AiUnavailableError("The AI storyteller had nothing to say. Try again.");
  throw new AiUnavailableError("The AI storyteller could not answer. Try again in a moment.");
}
