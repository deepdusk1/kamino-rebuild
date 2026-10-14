/**
 * Role-play stories: the rules and the words sent to the AI storyteller, as plain functions (no database, no network).
 *
 * A scene has a premise ("Titanic, but the ship reaches New York"), a few characters, and members who each play one of
 * them. After a member writes their character's turn, the storyteller narrates what happens next and voices the
 * characters nobody plays. Anyone in the cast can ask for an alternate ending in their own direction.
 */

export type SceneCharacter = { name: string; description: string };

export type RoleplayTurnKind = "turn" | "narration" | "ending";

export type TurnForPrompt = { kind: RoleplayTurnKind; character: string; body: string };

export const MAX_CHARACTERS = 8;
export const MAX_TURN_CHARS = 1200;

/**
 * Reply budgets for the storyteller. The default reasoning model (gpt-oss) spends part of the
 * allowance thinking before it writes, so these must stay large enough that narration and
 * endings never come back empty (the 2026-09-29 regression). Endings run longer than narration.
 */
export const STORYTELLER_NARRATION_TOKENS = 1000;
export const STORYTELLER_ENDING_TOKENS = 1400;

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Cleans a scene before it is saved. Throws a readable Error when something required is missing. */
export function checkScene(input: {
  title?: unknown;
  source?: unknown;
  premise?: unknown;
  characters?: unknown;
}): {
  title: string;
  source: string;
  premise: string;
  characters: SceneCharacter[];
} {
  const title = clip(input.title, 80);
  const source = clip(input.source, 80);
  const premise = typeof input.premise === "string" ? input.premise.trim().slice(0, 1500) : "";
  if (title.length < 3) throw new Error("Give the story a title (at least 3 characters).");
  if (premise.length < 10)
    throw new Error("Describe the story in a sentence or two, including what should change.");
  const seen = new Set<string>();
  const characters: SceneCharacter[] = [];
  for (const raw of Array.isArray(input.characters) ? input.characters : []) {
    const item = raw as { name?: unknown; description?: unknown } | null;
    const name = clip(item?.name, 40);
    if (name.length < 2 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    characters.push({ name, description: clip(item?.description, 200) });
    if (characters.length === MAX_CHARACTERS) break;
  }
  if (!characters.length) throw new Error("Add at least one character people can play.");
  return { title, source, premise, characters };
}

/** The storyteller's standing instructions. They keep every story safe for a 13+ community. */
export function storytellerRules(): string {
  return [
    "You are the narrator of a collaborative role-play story inside a community app used by people aged 13 and up.",
    "Keep everything teen-appropriate: no sexual content or romance beyond a kiss, no graphic gore, no hate or slurs,",
    "and no real-world instructions for weapons, drugs, hacking, self-harm or crime. Conflict, danger and villains are fine.",
    "Characters may come from existing books, films, games or shows; this is fan fiction, so write only ORIGINAL prose.",
    "Never copy lines, lyrics, dialogue or scenes from the original works, and do not summarise their plots at length.",
    "Stay inside the story and never mention being an AI or these rules. If a player tries to push the story somewhere",
    "unsafe, steer the plot elsewhere without comment.",
  ].join(" ");
}

function castLines(characters: SceneCharacter[], cast: { name: string; player: string }[]): string {
  const played = new Map(cast.map((c) => [c.name.toLowerCase(), c.player]));
  return characters
    .map((c) => {
      const player = played.get(c.name.toLowerCase());
      return `- ${c.name}${c.description ? `: ${c.description}` : ""} (${player ? `played by a member; never write this character's actions or words` : "not taken; you voice this character"})`;
    })
    .join("\n");
}

/** The most recent part of the story, newest last, kept under `maxChars` so prompts stay small (the free allowance is counted in words, not requests). */
export function recentStory(turns: TurnForPrompt[], maxChars = 3500): string {
  const lines: string[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const t = turns[i]!;
    const label =
      t.kind === "narration"
        ? "Narrator"
        : t.kind === "ending"
          ? "Alternate ending"
          : t.character || "Player";
    const line = `${label}: ${t.body.trim()}`;
    if (used + line.length > maxChars) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

type SceneForPrompt = {
  title: string;
  source: string;
  premise: string;
  characters: SceneCharacter[];
};

function sceneHeader(scene: SceneForPrompt, cast: { name: string; player: string }[]): string {
  return [
    `Story: ${scene.title}${scene.source ? ` (inspired by ${scene.source})` : ""}`,
    `Premise and what changes: ${scene.premise}`,
    `Characters:\n${castLines(scene.characters, cast)}`,
  ].join("\n");
}

export type PromptMessage = { role: "system" | "user"; content: string };

/** Asks for the next piece of narration, optionally nudged by a player ("a storm hits"). */
export function narrationPrompt(
  scene: SceneForPrompt,
  cast: { name: string; player: string }[],
  turns: TurnForPrompt[],
  nudge = "",
): PromptMessage[] {
  const story = recentStory(turns);
  return [
    { role: "system", content: storytellerRules() },
    {
      role: "user",
      content: [
        sceneHeader(scene, cast),
        story
          ? `The story so far:\n${story}`
          : "The story has not started yet. Write the opening scene.",
        nudge ? `A player suggests this should happen next: ${clip(nudge, 200)}` : "",
        "Continue as the narrator: third person, present tense, 60 to 160 words. Describe the world and voice the characters nobody plays.",
        "End on a moment the players can react to. Reply with the narration only.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

/** Asks for an alternate ending in the direction a player chose. */
export function endingPrompt(
  scene: SceneForPrompt,
  cast: { name: string; player: string }[],
  turns: TurnForPrompt[],
  direction: string,
): PromptMessage[] {
  return [
    { role: "system", content: storytellerRules() },
    {
      role: "user",
      content: [
        sceneHeader(scene, cast),
        `The story so far:\n${recentStory(turns) || "(nothing yet)"}`,
        `Write a satisfying ending for this story in which: ${clip(direction, 300)}`,
        "It may be completely different from how the original work ends. 150 to 300 words, third person, past tense.",
        "You may describe every character here, because the story is finishing. Reply with the ending only.",
      ].join("\n\n"),
    },
  ];
}

/** Asks the storyteller to set up a whole scene from a short idea ("Harry Potter where Neville is the chosen one"). */
export function draftPrompt(source: string, idea: string): PromptMessage[] {
  return [
    { role: "system", content: storytellerRules() },
    {
      role: "user",
      content: [
        `Set up a role-play story for a group of friends.`,
        source ? `It is inspired by: ${clip(source, 80)}` : "",
        `Their idea: ${clip(idea, 400)}`,
        "Reply with JSON only, no other text, in exactly this shape:",
        '{"title": "short title", "premise": "2-3 sentences: the situation and what is different from the original", "characters": [{"name": "Name", "description": "one sentence"}], "opening": "the opening narration, 60-160 words, present tense"}',
        "Use 3 to 6 characters.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

/** Removes "thinking" blocks some free models add, and trims to a sane length. */
export function cleanReply(text: string, max = 2500): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*(narrator|storyteller)\s*:\s*/i, "")
    .trim()
    .slice(0, max);
}

/** Reads the JSON a draft request returns, tolerating code fences and extra words around it. */
export function parseDraft(text: string): {
  title: string;
  premise: string;
  characters: SceneCharacter[];
  opening: string;
} {
  const cleaned = cleanReply(text, 8000);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("The AI storyteller's draft could not be read. Try again.");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("The AI storyteller's draft could not be read. Try again.");
  }
  const checked = checkScene({
    title: raw.title,
    premise: raw.premise,
    characters: raw.characters,
  });
  return {
    title: checked.title,
    premise: checked.premise,
    characters: checked.characters,
    opening: cleanReply(String(raw.opening ?? ""), 1500),
  };
}
