import assert from "node:assert/strict";
import { test } from "node:test";
import { STORYTELLER_DEFAULT_TOKENS } from "./ai.server.ts";
import { STORYTELLER_ENDING_TOKENS, STORYTELLER_NARRATION_TOKENS } from "./roleplay.ts";

/**
 * Regression test for the 2026-09-29 production bug: after a player's turn, the narrator
 * replied "The AI storyteller had nothing to say." The default reasoning model (gpt-oss-20b)
 * spends tokens thinking before it writes, so a small max_tokens budget left nothing for the
 * reply itself and the API returned empty content. The fix raised the budgets and retries once
 * on empty content. These budgets must stay large enough for the reasoning model.
 */
test("storyteller token budgets leave headroom for the reasoning model", () => {
  assert.ok(
    STORYTELLER_DEFAULT_TOKENS >= 1000,
    `default budget ${STORYTELLER_DEFAULT_TOKENS} is too small for the reasoning model`,
  );
  assert.ok(
    STORYTELLER_NARRATION_TOKENS >= 1000,
    `narration budget ${STORYTELLER_NARRATION_TOKENS} is too small; narration after a player turn would come back empty`,
  );
  assert.ok(
    STORYTELLER_ENDING_TOKENS >= STORYTELLER_NARRATION_TOKENS,
    "endings run longer than narration, so their budget must be at least as large",
  );
});
