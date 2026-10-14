/**
 * Kamino's automatic safety checks, as plain functions (no database, no network), so they can be unit tested.
 *
 * Two layers decide together:
 *   1. Built-in rules: free, instant, always on. They catch the obvious illegal-trade and exploitation phrases.
 *   2. An AI check (OpenAI's free moderation service) when the server has a key. It returns a score from 0 to 1 per
 *      category, which `decideFromScores` turns into an action.
 *
 * The result is never a punishment. "hold" hides the content until a human moderator restores or removes it;
 * "flag" leaves it visible and asks a moderator to look. Bans and strikes stay a human decision.
 */

export type SafetyAction = "hold" | "flag";

export type Verdict = {
  action: SafetyAction | null;
  /** Plain-English reasons shown to moderators, e.g. "Selling drugs or other illegal goods". */
  reasons: string[];
  /** Serious enough that the site owner is told too, not only the community's moderators. */
  severe: boolean;
  /** Anything to do with sexual content and minors. Pictures of such posts are never served while it is open. */
  minors: boolean;
  /** The author may be at risk of hurting themselves: they get a kind note instead of silence. */
  selfHarm: boolean;
};

export const NO_VERDICT: Verdict = {
  action: null,
  reasons: [],
  severe: false,
  minors: false,
  selfHarm: false,
};

type Rule = {
  pattern: RegExp;
  action: SafetyAction;
  reason: string;
  severe?: boolean;
  minors?: boolean;
};

/**
 * Phrases that almost always mean someone is trading something illegal or exploiting people. Kept deliberately
 * narrow so ordinary talk ("this song is fire", "the plot is a killer") is not caught.
 */
const RULES: Rule[] = [
  {
    pattern:
      /\b(child\s*porn|cp\s*(links?|trade|for\s*sale)|underage\s*(nudes?|sex|pics?)|loli\s*(nsfw|nudes?)|pedo\s*(links?|group))\b/i,
    action: "hold",
    reason: "Sexual content involving minors",
    severe: true,
    minors: true,
  },
  {
    pattern:
      /\b(send(ing)?|trad(e|ing)|swap(ping)?|sell(ing)?|buy(ing)?)\s+(me\s+)?(your\s+)?(nudes?|noods|nude\s*pics?|lewds?)\b/i,
    action: "hold",
    reason: "Asking for or trading sexual pictures",
    severe: true,
  },
  {
    pattern:
      /\b(sell(ing)?|selling\s+cheap|plug\s+for|dm\s+(me\s+)?for|hmu\s+for)\s+(some\s+)?(weed|coke|cocaine|xans?|xanax|oxys?|oxycodone|percs?|percocet|molly|mdma|meth|fent(anyl)?|shrooms|lsd|tabs|carts|pills|lean|heroin|ketamine)\b(?![-\w])/i,
    action: "hold",
    reason: "Selling drugs or other illegal goods",
    severe: true,
  },
  {
    pattern:
      /\b(sell(ing)?|buy(ing)?|dm\s+(me\s+)?for)\s+(a\s+)?(guns?|glocks?|pistols?|rifles?|ammo|ghost\s*guns?|switch(es)?|auto\s*sears?)\b/i,
    action: "hold",
    reason: "Selling weapons",
    severe: true,
  },
  {
    pattern:
      /\b(fullz|cvv\s*(shop|dumps?|for\s*sale)|carding\s*(method|tutorial|group)|bank\s*logs?|cash\s*app\s*flip|stolen\s*(cards?|accounts?)\s*(for\s*sale)?)\b/i,
    action: "hold",
    reason: "Fraud or stolen accounts",
    severe: true,
  },
  {
    pattern:
      /\b(fake\s*(ids?|passports?)\s*(for\s*sale|cheap)|buy\s*(a\s*)?fake\s*(id|passport))\b/i,
    action: "hold",
    reason: "Selling fake documents",
    severe: true,
  },
  {
    pattern:
      /\b(i('?ll| will)\s+(kill|shoot|stab)\s+(you|u|him|her|them)|bomb\s+threat|shoot\s+up\s+(the|my|our)\s+school)\b/i,
    // Only flagged: in games and role-play "I'll kill you" is usually part of the fun. A moderator decides.
    action: "flag",
    reason: "Possible threat of violence",
  },
  {
    pattern:
      /\b(what('?s| is)\s+your\s+(home\s+)?address|dox(x)?(ed|ing)?\s+(him|her|them|you))\b/i,
    action: "flag",
    reason: "Possible doxxing or asking for personal details",
  },
];

/** Built-in rule check. Fast and free; used on everything, with or without an AI key. */
export function rulesVerdict(text: string): Verdict {
  const reasons: string[] = [];
  let action: SafetyAction | null = null;
  let severe = false;
  let minors = false;
  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    reasons.push(rule.reason);
    action = rule.action === "hold" || action === "hold" ? "hold" : "flag";
    severe ||= Boolean(rule.severe);
    minors ||= Boolean(rule.minors);
  }
  return { action, reasons, severe, minors, selfHarm: false };
}

/** Categories the AI check reports, with the words moderators see and how firmly Kamino reacts. */
const AI_CATEGORIES: Record<
  string,
  {
    reason: string;
    hold: number;
    flag: number;
    severe?: boolean;
    minors?: boolean;
    selfHarm?: boolean;
    adultOnly?: boolean;
  }
> = {
  "sexual/minors": {
    reason: "Sexual content involving minors",
    hold: 0.3,
    flag: 0.1,
    severe: true,
    minors: true,
  },
  "illicit/violent": { reason: "Weapons or violent crime", hold: 0.6, flag: 0.3, severe: true },
  illicit: {
    reason: "Illegal activity (drugs, fraud, stolen goods)",
    hold: 0.7,
    flag: 0.4,
    severe: true,
  },
  "self-harm/instructions": {
    reason: "Instructions for self-harm",
    hold: 0.5,
    flag: 0.3,
    severe: true,
    selfHarm: true,
  },
  "self-harm/intent": {
    reason: "Someone may be thinking of hurting themselves",
    hold: 2,
    flag: 0.4,
    selfHarm: true,
  },
  "self-harm": { reason: "Self-harm", hold: 2, flag: 0.5, selfHarm: true },
  "harassment/threatening": { reason: "Threats against someone", hold: 0.7, flag: 0.4 },
  "hate/threatening": { reason: "Threats against a group", hold: 0.6, flag: 0.3, severe: true },
  hate: { reason: "Hate speech", hold: 0.9, flag: 0.5 },
  harassment: { reason: "Harassment or bullying", hold: 2, flag: 0.6 },
  sexual: { reason: "Sexual content", hold: 0.6, flag: 0.4, adultOnly: true },
  "violence/graphic": { reason: "Graphic violence", hold: 0.8, flag: 0.5 },
  violence: { reason: "Violence", hold: 2, flag: 0.7 },
};

/** In stories these are normal (a villain threatens the hero); they are only flagged when extreme, never held. */
const FICTION_RELAXED = new Set([
  "violence",
  "violence/graphic",
  "harassment",
  "harassment/threatening",
]);

/**
 * Turns the AI's scores into an action. `ageGate` is the community's minimum age: sexual content is held in 13+
 * and 16+ communities but only flagged in 18+ ones. A threshold of 2 means "never hold, only flag".
 */
export function decideFromScores(
  scores: Record<string, number>,
  options: {
    ageGate?: number;
    /** Role-play and stories: fictional fights and villains are allowed. */ fiction?: boolean;
  } = {},
): Verdict {
  const reasons: string[] = [];
  let action: SafetyAction | null = null;
  let severe = false;
  let minors = false;
  let selfHarm = false;
  for (const [category, rule] of Object.entries(AI_CATEGORIES)) {
    const score = Number(scores[category] ?? 0);
    if (!Number.isFinite(score) || score < rule.flag) continue;
    if (options.fiction && FICTION_RELAXED.has(category) && score < 0.9) continue;
    const holdAt =
      (rule.adultOnly && (options.ageGate ?? 13) >= 18) ||
      (options.fiction && FICTION_RELAXED.has(category))
        ? 2
        : rule.hold;
    const holds = score >= holdAt;
    reasons.push(rule.reason);
    action = holds || action === "hold" ? "hold" : "flag";
    if (holds || rule.minors) severe ||= Boolean(rule.severe);
    minors ||= Boolean(rule.minors);
    selfHarm ||= Boolean(rule.selfHarm);
  }
  return { action, reasons, severe, minors, selfHarm };
}

/** Combines several checks (rules, text AI, each picture): the strictest action wins and all reasons are kept. */
export function mergeVerdicts(...verdicts: Verdict[]): Verdict {
  const reasons = [...new Set(verdicts.flatMap((v) => v.reasons))];
  const action = verdicts.some((v) => v.action === "hold")
    ? "hold"
    : verdicts.some((v) => v.action === "flag")
      ? "flag"
      : null;
  return {
    action,
    reasons,
    severe: verdicts.some((v) => v.severe),
    minors: verdicts.some((v) => v.minors),
    selfHarm: verdicts.some((v) => v.selfHarm),
  };
}

/** A short piece of the text for the review queue (moderators cannot open held chat messages or comments). */
export function excerptOf(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
