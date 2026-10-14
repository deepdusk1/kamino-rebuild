import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_VERDICT, decideFromScores, excerptOf, mergeVerdicts, rulesVerdict } from "./moderation.ts";

test("rules hold obvious illegal trades and leave ordinary talk alone", () => {
  for (const text of [
    "selling xanax and percs, dm me",
    "dm for carts 🔥",
    "selling glock switches cheap",
    "fullz and cvv shop link in bio",
    "send nudes pls",
    "trading your nude pics?",
  ]) {
    const v = rulesVerdict(text);
    assert.equal(v.action, "hold", text);
    assert.equal(v.severe, true, text);
  }
  for (const text of [
    "This song is fire and the plot was a killer",
    "I got weed killer for the garden",
    "The coke vs pepsi debate never ends",
    "My character sells potions in the market",
    "Who has the best pill bottle design for my art class?",
  ]) {
    assert.equal(rulesVerdict(text).action, null, text);
  }
});

test("minors are always severe and marked so pictures are locked", () => {
  const v = rulesVerdict("trading cp links");
  assert.deepEqual([v.action, v.severe, v.minors], ["hold", true, true]);
});

test("threats and doxxing are flagged for a human, not hidden", () => {
  assert.equal(rulesVerdict("I'll kill you in the next match lol").action, "flag");
  assert.equal(rulesVerdict("what's your home address").action, "flag");
});

test("AI scores: illegal activity is held, low scores are ignored", () => {
  assert.equal(decideFromScores({ illicit: 0.92 }).action, "hold");
  assert.equal(decideFromScores({ illicit: 0.92 }).severe, true);
  assert.equal(decideFromScores({ illicit: 0.5 }).action, "flag");
  assert.equal(decideFromScores({ illicit: 0.5 }).severe, false, "a weak signal only reaches the community's moderators");
  assert.equal(decideFromScores({ illicit: 0.1, hate: 0.2 }).action, null);
  assert.deepEqual(decideFromScores({}), NO_VERDICT);
});

test("any hint of sexual content with minors is held and severe", () => {
  const v = decideFromScores({ "sexual/minors": 0.35 });
  assert.deepEqual([v.action, v.severe, v.minors], ["hold", true, true]);
  assert.equal(decideFromScores({ "sexual/minors": 0.15 }).minors, true);
});

test("sexual content is held in teen communities but only flagged in 18+ ones", () => {
  assert.equal(decideFromScores({ sexual: 0.8 }, { ageGate: 13 }).action, "hold");
  assert.equal(decideFromScores({ sexual: 0.8 }, { ageGate: 18 }).action, "flag");
});

test("self-harm reaches moderators and the author gets support, but a cry for help is not hidden", () => {
  const v = decideFromScores({ "self-harm/intent": 0.9 });
  assert.deepEqual([v.action, v.selfHarm], ["flag", true]);
  assert.equal(decideFromScores({ "self-harm/instructions": 0.8 }).action, "hold");
});

test("stories may have villains: fictional violence is not held", () => {
  assert.equal(decideFromScores({ violence: 0.95, "harassment/threatening": 0.8 }, { fiction: true }).action, "flag");
  assert.equal(decideFromScores({ violence: 0.6 }, { fiction: true }).action, null);
  assert.equal(decideFromScores({ "harassment/threatening": 0.8 }).action, "hold");
  assert.equal(decideFromScores({ illicit: 0.95 }, { fiction: true }).action, "hold", "real-world crime is still held in stories");
});

test("merging keeps the strictest action and every reason", () => {
  const merged = mergeVerdicts(rulesVerdict("hello"), decideFromScores({ hate: 0.6 }), rulesVerdict("selling meth"));
  assert.equal(merged.action, "hold");
  assert.equal(merged.severe, true);
  assert.deepEqual(merged.reasons.sort(), ["Hate speech", "Selling drugs or other illegal goods"].sort());
  assert.equal(mergeVerdicts().action, null);
});

test("excerpts are short and on one line", () => {
  assert.equal(excerptOf("a\n\n b   c"), "a b c");
  assert.equal(excerptOf("x".repeat(400)).length, 280);
});
