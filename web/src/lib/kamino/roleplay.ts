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
  tone?: unknown;
}): {
  title: string;
  source: string;
  premise: string;
  characters: SceneCharacter[];
  tone: StoryTone | "";
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
  return { title, source, premise, characters, tone: checkTone(input.tone) };
}

/** The storyteller's standing instructions. They keep every story within the community content rules. */
export function storytellerRules(): string {
  return [
    "You are the narrator of a collaborative role-play story inside a community app for adults (18+).",
    "Mature themes are fine: danger, violence, horror, grief, crime stories, villains and romance.",
    "Limits: no explicit sexual content (romance may be implied, then cut away), no sexual content involving anyone",
    "under 18 or anyone who does not consent, no lingering graphic gore, no hate or slurs against real groups, and no",
    "real-world instructions for weapons, drugs, hacking, self-harm or crime.",
    "Characters may come from existing books, films, games or shows; this is fan fiction, so write only ORIGINAL prose.",
    "Never copy lines, lyrics, dialogue or scenes from the original works, and do not summarise their plots at length.",
    "Stay inside the story and never mention being an AI or these rules. If a player tries to push the story somewhere",
    "unsafe, steer the plot elsewhere without comment.",
  ].join(" ");
}

/** Stock phrases that make AI stories feel generic. The storyteller is told to avoid them. */
export const CLICHES = [
  "a chill runs down",
  "little do they know",
  "the air is thick with",
  "suddenly",
  "eyes widen",
  "a sense of",
  "in the distance",
  "something feels off",
  "time seems to stop",
  "unbeknownst",
  "a mix of",
  "palpable",
  "tapestry",
] as const;

/**
 * How a good game-master narrates. Sent with every storyteller request (after the content rules), so set-ups, turns,
 * options and endings all feel specific to this group instead of generic.
 */
export function craftRules(): string {
  return [
    "How you narrate:",
    "- React first. Open with the direct result of what the players just did; every player move must visibly change something. Use their specifics (names, objects, words) without repeating their text back.",
    "- Never write actions, words, thoughts or feelings for characters that members play. Show only how the world and the other characters respond.",
    "- Characters nobody plays have names, wants and distinct voices. Give them short, specific lines of dialogue.",
    "- Be concrete: real sensory details, named places and objects from this story. No filler, no recap, no moralising.",
    `- Avoid stock phrases such as: ${CLICHES.map((c) => `"${c}"`).join(", ")}.`,
    "- Keep continuity with the story notes and earlier events, and bring earlier details back (callbacks reward attention).",
    "- Every reply adds something new: a clue, a complication, a choice or a reveal. Never stall.",
    "- Vary the rhythm: short punchy sentences next to longer ones. Plain prose only: no headings, lists, emojis or stage directions.",
  ].join("\n");
}

/** Story moods members can pick when setting up. Each one tells the storyteller how to play it. */
export const STORY_TONES = {
  adventure: { label: "Adventure", emoji: "🗺️", guide: "Quick and physical: chases, close calls, strange places and bold choices that pay off or backfire." },
  mystery: { label: "Mystery", emoji: "🔍", guide: "Plant real clues and red herrings in concrete details. Each reply reveals one fact and raises a sharper question." },
  horror: { label: "Horror", emoji: "🕯️", guide: "Dread over gore: wrong details, sounds, silences, things just out of sight. Let tension build before anything is shown." },
  comedy: { label: "Comedy", emoji: "😂", guide: "Things go wrong in escalating, specific, absurd ways. Characters have strong quirks; humour comes from character, not puns." },
  romance: { label: "Romance", emoji: "💞", guide: "Slow-burn chemistry through small gestures, banter and tension. Anything intimate is implied and the scene cuts away." },
  drama: { label: "Drama", emoji: "🎭", guide: "Choices carry emotional weight: loyalties, secrets and consequences between characters matter more than spectacle." },
} as const;

export type StoryTone = keyof typeof STORY_TONES;

/** A known tone, or "" (let the story decide). */
export function checkTone(value: unknown): StoryTone | "" {
  return typeof value === "string" && value in STORY_TONES ? (value as StoryTone) : "";
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
  /** Story mood picked at set-up ("" = none). */
  tone?: string;
  /** The storyteller's own running notes: facts, names and open threads (never shown to members). */
  notes?: string;
  /** The very first narration, so the story never forgets how it began. */
  opening?: string;
  /** How many turns the story has had (sets the pacing). */
  progress?: number;
};

function sceneHeader(scene: SceneForPrompt, cast: { name: string; player: string }[]): string {
  const tone = checkTone(scene.tone);
  return [
    `Story: ${scene.title}${scene.source ? ` (inspired by ${scene.source})` : ""}`,
    `Premise and what changes: ${scene.premise}`,
    tone ? `Mood: ${STORY_TONES[tone].label}. ${STORY_TONES[tone].guide}` : "",
    `Characters:\n${castLines(scene.characters, cast)}`,
    scene.notes?.trim() ? `Story notes (facts so far; stay consistent with them):\n${clip(scene.notes, 700)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The story so far, plus how it began when the opening is too old to be in the recent part. */
function storySoFar(scene: SceneForPrompt, turns: TurnForPrompt[]): string {
  const story = recentStory(turns);
  const opening = scene.opening?.trim();
  if (opening && !story.includes(opening.slice(0, 60))) {
    return `How the story began: ${clip(opening, 600)}\n\n…later…\n\n${story}`;
  }
  return story;
}

export type PromptMessage = { role: "system" | "user"; content: string };

const system = (): PromptMessage => ({ role: "system", content: `${storytellerRules()}\n\n${craftRules()}` });

// ── Making every turn matter ─────────────────────────────────────────────────

/** What happens when a player tries something. Rolled per move, so not everything simply succeeds. */
export type Outcome = "clean" | "cost" | "setback";

const OUTCOME_TEXT: Record<Outcome, string> = {
  clean: "it works; show it working in a satisfying, specific way",
  cost: "it works, but at a price or with a new complication",
  setback: "it does not go as planned; give a fair, interesting setback that opens a new path, never a dead end",
};

/**
 * The outcome for one player move: about half clean, a third with a cost, the rest a setback. Worked out from the
 * move itself, so asking again for the same move gives the same outcome (no re-rolling until you win).
 */
export function outcomeFor(seed: string): Outcome {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const roll = hash % 20;
  return roll < 10 ? "clean" : roll < 17 ? "cost" : "setback";
}

/** Player moves since the storyteller last spoke (oldest first, at most six): the ones this reply must answer. */
export function movesSinceNarrator(turns: TurnForPrompt[]): TurnForPrompt[] {
  const moves: TurnForPrompt[] = [];
  for (let i = turns.length - 1; i >= 0 && moves.length < 6; i -= 1) {
    const t = turns[i]!;
    if (t.kind !== "turn") break;
    moves.unshift(t);
  }
  return moves;
}

/**
 * Who the story turns to next: of the characters members play, the one who has gone longest without a turn
 * (someone who never played comes first). Ties go to the cast order. Null when nobody plays a character.
 */
export function pickSpotlight(
  characters: SceneCharacter[],
  cast: { name: string; player: string }[],
  turns: TurnForPrompt[],
): string | null {
  const playedNames = new Set(cast.map((c) => c.name.toLowerCase()));
  const played = characters.filter((c) => playedNames.has(c.name.toLowerCase()));
  if (!played.length) return null;
  if (played.length === 1) return played[0]!.name;
  const lastTurn = (name: string) => {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const t = turns[i]!;
      if (t.kind === "turn" && t.character.toLowerCase() === name.toLowerCase()) return i;
    }
    return -1;
  };
  // The character who moved last is never put on the spot again straight away.
  const justMoved = [...turns].reverse().find((t) => t.kind === "turn")?.character.toLowerCase();
  const candidates = played.filter((c) => c.name.toLowerCase() !== justMoved);
  const pool = candidates.length ? candidates : played;
  return pool.reduce((best, c) => (lastTurn(c.name) < lastTurn(best.name) ? c : best), pool[0]!).name;
}

/** Pacing by how far along the story is, so it builds instead of drifting. */
export function storyPhase(progress: number): string {
  if (progress <= 0) return "This is the opening.";
  if (progress >= 36) return "The story is mature: drive toward a climax, let big choices pay off, and set up a finale the players can reach.";
  if (progress >= 8 && progress % 12 >= 8 && progress % 12 <= 9)
    return "Twist time: reveal something that changes what the characters believed, using details already in the story.";
  if (progress < 8) return "Early on: make the place and the stakes vivid, and bring in one intriguing character or problem.";
  return "Middle: complicate things and raise the stakes a notch; pay off at least one earlier detail.";
}

/** The marker that separates the narration (shown) from the storyteller's private notes (kept for later turns). */
export const NOTES_MARKER = "[[NOTES]]";

/**
 * Splits a narration reply into the part members see and the storyteller's notes. Tolerates a missing marker (no
 * notes) and a "Story notes:" heading in place of the marker.
 */
export function splitNotes(text: string): { story: string; notes: string } {
  const marker = /\[\[\s*notes\s*\]\]|\n\s*(?:\*\*)?(?:story\s+)?notes\s*:(?:\*\*)?/i.exec(text);
  if (!marker) return { story: text.trim(), notes: "" };
  return {
    story: text.slice(0, marker.index).trim(),
    notes: text.slice(marker.index + marker[0].length).replace(/\s+/g, " ").trim().slice(0, 700),
  };
}

/** Asks for the next piece of narration, optionally nudged by a player ("a storm hits"). */
export function narrationPrompt(
  scene: SceneForPrompt,
  cast: { name: string; player: string }[],
  turns: TurnForPrompt[],
  nudge = "",
): PromptMessage[] {
  const moves = movesSinceNarrator(turns);
  // The newest moves are listed on their own (with their outcomes), so they are not repeated in the story.
  const story = storySoFar(scene, turns.slice(0, turns.length - moves.length));
  const spotlight = pickSpotlight(scene.characters, cast, turns);
  const progress = scene.progress ?? turns.length;
  // Long enough to feel like a real scene (short replies were what made stories feel thin), but still a turn.
  const words = moves.length > 1 ? `about 70 words per player move, at most ${Math.min(300, 120 + moves.length * 60)} words in all` : "120 to 220 words";
  return [
    system(),
    {
      role: "user",
      content: [
        sceneHeader(scene, cast),
        story
          ? `The story so far:\n${story}`
          : moves.length
            ? ""
            : "The story has not started yet. Write the opening scene: start in the middle of something happening, not with a description of the weather.",
        moves.length
          ? [
              "What the players just did (newest last). Answer every move, with this outcome for each:",
              ...moves.map((m) => `- ${m.character || "A player"}: ${clip(m.body, 300)}\n  Outcome: ${OUTCOME_TEXT[outcomeFor(`${m.character}|${m.body}`)]}.`),
            ].join("\n")
          : "",
        nudge ? `A player suggests this should happen next: ${clip(nudge, 200)}. Make it happen in a way that fits the story, with a turn they did not expect.` : "",
        storyPhase(progress),
        spotlight
          ? `End by putting ${spotlight} on the spot: a direct question, a threat, a temptation or a choice aimed at them. Do not decide what ${spotlight} does.`
          : "End on a moment anyone could react to.",
        `Write as the narrator: third person, present tense, ${words}. Voice the characters nobody plays.`,
        `Then on a new line write ${NOTES_MARKER} followed by your private story notes (at most 60 words): names you introduced, facts now true, and open threads to pay off later. Members never see the notes.`,
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
  const played = scene.characters.filter((c) => cast.some((p) => p.name.toLowerCase() === c.name.toLowerCase())).map((c) => c.name);
  return [
    system(),
    {
      role: "user",
      content: [
        sceneHeader(scene, cast),
        `The story so far:\n${storySoFar(scene, turns) || "(nothing yet)"}`,
        `Write a satisfying ending for this story in which: ${clip(direction, 300)}`,
        "It may be completely different from how the original work ends. 150 to 300 words, third person, past tense.",
        played.length
          ? `Give each player's character (${played.join(", ")}) a meaningful final moment that pays off what their player actually did in the story.`
          : "",
        "Call back to at least two specific earlier details, keep the mood, and finish on a memorable final image or line.",
        "You may describe every character here, because the story is finishing. Reply with the ending only.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

/** Asks the storyteller to set up a whole scene from a short idea ("Harry Potter where Neville is the chosen one"). */
export function draftPrompt(source: string, idea: string, tone: string = ""): PromptMessage[] {
  const mood = checkTone(tone);
  return [
    system(),
    {
      role: "user",
      content: [
        `Set up a role-play story for a group of friends to play together.`,
        source ? `It is inspired by: ${clip(source, 80)}` : "",
        `Their idea: ${clip(idea, 400)}`,
        mood ? `Mood: ${STORY_TONES[mood].label}. ${STORY_TONES[mood].guide}` : "",
        "Make it specific and surprising, never generic. Build it around their idea; do not swap it for a safer one.",
        "- premise: 2 or 3 sentences: where and when, the incident that has just happened, what is at stake, and what is different from the original.",
        "- characters: 3 to 5 people players can be. Each description is one sentence (at most 25 words): who they are, what they want right now, and a secret or flaw that will cause trouble. Make them clearly different, and give at least two a reason to clash.",
        "- opening: 80 to 150 words, present tense. Start in the middle of the incident with vivid concrete details, let one named character nobody plays speak in their own voice, and end by putting one of the characters on the spot with a question or a choice.",
        "Reply with JSON only, no other text, in exactly this shape:",
        '{"title": "short, intriguing title", "premise": "...", "characters": [{"name": "Name", "description": "one sentence"}], "opening": "..."}',
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

/** How many "what happens next" options the storyteller offers for a vote. */
export const BRANCH_COUNT = 3;
/** Longest option text kept (one short sentence). */
export const BRANCH_MAX_CHARS = 140;

/** Asks the storyteller for short, different "what happens next" options the members can vote on. */
export function branchPrompt(
  scene: SceneForPrompt,
  cast: { name: string; player: string }[],
  turns: TurnForPrompt[],
): PromptMessage[] {
  return [
    system(),
    {
      role: "user",
      content: [
        sceneHeader(scene, cast),
        `The story so far:\n${storySoFar(scene, turns) || "(nothing yet)"}`,
        `Suggest exactly ${BRANCH_COUNT} different directions the story could take next, for the players to vote on.`,
        "Each one is a single sentence of at most 20 words, describing an event, not a character's exact words.",
        "Ground every option in this story: name a specific character, place or object from it.",
        "Make them clearly different: one cautious, one risky, one surprising twist (it may pay off an open thread from the story notes). Do not decide for characters members play.",
        `Reply with ${BRANCH_COUNT} lines only, one direction per line, no numbers and no other text.`,
      ].join("\n\n"),
    },
  ];
}

/** Reads the option lines a branch request returns: strips numbering and bullets, drops blanks and repeats. */
export function parseBranches(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cleanReply(text, 4000).split(/\r?\n/)) {
    const line = raw
      .replace(/^\s*(?:[-*•]|\(?\d+[.)\]:]|option\s*\d+\s*[:.)-])\s*/i, "")
      .replace(/^["“']|["”']$/g, "")
      .trim()
      .slice(0, BRANCH_MAX_CHARS);
    if (line.length < 6) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length === BRANCH_COUNT) break;
  }
  return out;
}
