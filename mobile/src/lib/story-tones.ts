/**
 * Story moods for AI role-play set-up, and the "your move" line on a story. Pure, so it is unit tested.
 * Kept in step with STORY_TONES in web/src/lib/kamino/roleplay.ts (the server ignores unknown moods).
 */

export const STORY_TONES = {
  adventure: { label: "Adventure", emoji: "🗺️", guide: "Quick and physical: chases, close calls, strange places and bold choices." },
  mystery: { label: "Mystery", emoji: "🔍", guide: "Real clues and red herrings. Each turn reveals one fact and raises a sharper question." },
  horror: { label: "Horror", emoji: "🕯️", guide: "Dread over gore: wrong details, sounds, silences, things just out of sight." },
  comedy: { label: "Comedy", emoji: "😂", guide: "Things go wrong in escalating, specific, absurd ways." },
  romance: { label: "Romance", emoji: "💞", guide: "Slow-burn chemistry through small gestures, banter and tension." },
  drama: { label: "Drama", emoji: "🎭", guide: "Loyalties, secrets and consequences between characters." },
} as const;

export type StoryTone = keyof typeof STORY_TONES;

export const TONE_KEYS = Object.keys(STORY_TONES) as StoryTone[];

/** "🔍 Mystery", or "" for no or an unknown mood. */
export function toneLabel(tone: string | null | undefined): string {
  if (!tone || !(tone in STORY_TONES)) return "";
  const t = STORY_TONES[tone as StoryTone];
  return `${t.emoji} ${t.label}`;
}

/**
 * The banner under the story: whose move it is. `mine` is true when the storyteller turned to the viewer's own
 * character. Null when the story is over or nobody is on the spot.
 */
export function spotlightLine(
  spotlight: string | null | undefined,
  myCharacter: string | null | undefined,
  open: boolean,
): { mine: boolean; text: string } | null {
  if (!open || !spotlight) return null;
  if (myCharacter && spotlight === myCharacter) return { mine: true, text: `Your move, ${myCharacter}! The story just turned to you.` };
  return { mine: false, text: `The story turned to ${spotlight}. Anyone in the cast can still jump in.` };
}
