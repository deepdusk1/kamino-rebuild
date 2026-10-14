import assert from "node:assert/strict";
import { test } from "node:test";
import { checkScene, cleanReply, draftPrompt, endingPrompt, narrationPrompt, parseDraft, recentStory, storytellerRules } from "./roleplay.ts";

const scene = {
  title: "The ship that made it",
  source: "a famous shipwreck film",
  premise: "The iceberg is spotted in time. What happens in New York?",
  characters: [
    { name: "Rose", description: "A restless young traveller" },
    { name: "Captain", description: "Proud and tired" },
  ],
};

test("a scene needs a title, a premise and at least one character; duplicates and blanks are dropped", () => {
  assert.throws(() => checkScene({ ...scene, title: "x" }), /title/);
  assert.throws(() => checkScene({ ...scene, premise: "short" }), /Describe/);
  assert.throws(() => checkScene({ ...scene, characters: [] }), /character/);
  const checked = checkScene({
    ...scene,
    characters: [{ name: "Rose" }, { name: "rose" }, { name: " " }, ...Array.from({ length: 12 }, (_, i) => ({ name: `Extra ${i}` }))],
  });
  assert.equal(checked.characters[0]!.name, "Rose");
  assert.equal(checked.characters.filter((c) => c.name.toLowerCase() === "rose").length, 1);
  assert.equal(checked.characters.length, 8);
});

test("the storyteller is told to stay teen-safe and to write original prose only", () => {
  const rules = storytellerRules();
  assert.match(rules, /13/);
  assert.match(rules, /no sexual content/);
  assert.match(rules, /ORIGINAL prose/);
  assert.match(rules, /Never copy lines, lyrics/);
});

test("narration leaves member-played characters to their players and voices the rest", () => {
  const messages = narrationPrompt(scene, [{ name: "Rose", player: "u1" }], [{ kind: "turn", character: "Rose", body: "I run to the deck." }], "a storm");
  assert.equal(messages[0]!.role, "system");
  const user = messages[1]!.content;
  assert.match(user, /Rose: A restless young traveller \(played by a member; never write/);
  assert.match(user, /Captain: Proud and tired \(not taken; you voice/);
  assert.match(user, /Rose: I run to the deck\./);
  assert.match(user, /A player suggests this should happen next: a storm/);
  assert.match(narrationPrompt(scene, [], [])[1]!.content, /Write the opening scene/);
});

test("endings follow the player's direction", () => {
  const user = endingPrompt(scene, [], [], "everyone opens a bakery together")[1]!.content;
  assert.match(user, /in which: everyone opens a bakery together/);
  assert.match(user, /completely different/);
});

test("only the newest part of a long story is sent, in order", () => {
  const turns = Array.from({ length: 200 }, (_, i) => ({ kind: "turn" as const, character: "Rose", body: `line ${i} ${"x".repeat(50)}` }));
  const story = recentStory(turns, 1000);
  assert.ok(story.length <= 1000);
  assert.match(story, /line 199/);
  assert.doesNotMatch(story, /line 0 /);
  const lines = story.split("\n");
  assert.ok(Number(/line (\d+)/.exec(lines[0]!)![1]) < Number(/line (\d+)/.exec(lines.at(-1)!)![1]));
  assert.match(recentStory([{ kind: "narration", character: "", body: "Fog." }, { kind: "ending", character: "", body: "The end." }]), /Narrator: Fog\.\nAlternate ending: The end\./);
});

test("replies are cleaned of thinking blocks and labels", () => {
  assert.equal(cleanReply("<think>plan</think>\nNarrator: The wind howls."), "The wind howls.");
  assert.equal(cleanReply("x".repeat(3000)).length, 2500);
});

test("drafts are read from JSON even with code fences around them", () => {
  const draft = parseDraft(
    'Sure!\n```json\n{"title":"Chosen Neville","premise":"Neville is the one the prophecy meant. Everything shifts.","characters":[{"name":"Neville","description":"brave"},{"name":"Luna","description":"dreamy"}],"opening":"Rain drums on the castle."}\n```',
  );
  assert.equal(draft.title, "Chosen Neville");
  assert.equal(draft.characters.length, 2);
  assert.equal(draft.opening, "Rain drums on the castle.");
  assert.throws(() => parseDraft("no json here"), /could not be read/);
  assert.throws(() => parseDraft('{"title": "ok title", "premise": "x"}'), /Describe/);
  assert.match(draftPrompt("Harry Potter", "Neville is chosen")[1]!.content, /JSON only/);
});
