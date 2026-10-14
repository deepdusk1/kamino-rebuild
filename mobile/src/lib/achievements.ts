import type { Ionicons } from "@expo/vector-icons";
import type { Achievement } from "@/api/types";
import type { Tone } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * The server sends a small icon word for each achievement (see web/src/lib/kamino/achievements.ts).
 * Each word gets a filled phone icon (drawn white inside the hexagon medals) and a medal colour, so a row of
 * badges looks colourful like the profile mockup (orange crown, blue brush, pink heart, green leaf…).
 */
const MEDALS: Record<string, { icon: IconName; tone: Tone }> = {
  pen: { icon: "brush", tone: "blue" },
  chat: { icon: "chatbubble-ellipses", tone: "blue" },
  heart: { icon: "heart", tone: "pink" },
  users: { icon: "people", tone: "blue" },
  flame: { icon: "flame", tone: "orange" },
  star: { icon: "star", tone: "yellow" },
  message: { icon: "chatbubbles", tone: "violet" },
  sticker: { icon: "color-palette", tone: "pink" },
  smile: { icon: "happy", tone: "green" },
  globe: { icon: "earth", tone: "green" },
  crown: { icon: "ribbon", tone: "orange" },
  shield: { icon: "shield-checkmark", tone: "violet" },
  brain: { icon: "bulb", tone: "yellow" },
  target: { icon: "locate", tone: "red" },
  puzzle: { icon: "extension-puzzle", tone: "violet" },
  chart: { icon: "bar-chart", tone: "blue" },
  check: { icon: "checkbox", tone: "green" },
  clock: { icon: "time", tone: "violet" },
  book: { icon: "book", tone: "orange" },
  image: { icon: "image", tone: "pink" },
  mask: { icon: "color-wand", tone: "violet" },
  film: { icon: "film", tone: "red" },
  calendar: { icon: "calendar", tone: "orange" },
  trophy: { icon: "trophy", tone: "yellow" },
  note: { icon: "document-text", tone: "blue" },
  bookmark: { icon: "bookmark", tone: "violet" },
  sparkles: { icon: "sparkles", tone: "violet" },
  cake: { icon: "gift", tone: "pink" },
  leaf: { icon: "leaf", tone: "green" },
};

/** The medal look (filled icon + colour) for an achievement's icon word. Unknown words get a violet medal. */
export function achievementMedal(icon: string): { icon: IconName; tone: Tone } {
  return MEDALS[icon] ?? { icon: "medal", tone: "violet" };
}

/** The outline version of the icon, for small places on light backgrounds. */
export function achievementIcon(icon: string): IconName {
  const filled = achievementMedal(icon).icon;
  return `${filled}-outline` as IconName;
}

/**
 * Banner colours per tier (left → right) and the text colour on them. All four are deep enough for white text,
 * in the redesign's palette: bronze = warm orange, silver = blue-violet, gold = amber, legend = the Top Creator gradient.
 */
export const TIER_LOOK: Record<Achievement["tier"], { colors: [string, string]; text: string; label: string; tone: Tone }> = {
  bronze: { colors: ["#E8742A", "#C2410C"], text: "#ffffff", label: "Bronze", tone: "orange" },
  silver: { colors: ["#5B6CF0", "#3B4FE0"], text: "#ffffff", label: "Silver", tone: "blue" },
  gold: { colors: ["#D97706", "#B45309"], text: "#ffffff", label: "Gold", tone: "yellow" },
  legend: { colors: ["#8B4DFB", "#B23FE0"], text: "#ffffff", label: "Legend", tone: "violet" },
};

/** Share of the way to the target, 0 to 1 (for progress bars). */
export function progressShare(a: Pick<Achievement, "progress" | "target" | "unlocked">): number {
  if (a.unlocked) return 1;
  return Math.max(0, Math.min(1, a.progress / Math.max(1, a.target)));
}

/** Achievements grouped by category, in the order the server sends them. */
export function byCategory(list: Achievement[]): { category: string; items: Achievement[] }[] {
  const groups = new Map<string, Achievement[]>();
  for (const a of list) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);
  return [...groups].map(([category, items]) => ({ category, items }));
}

/** Adds or removes an id from the showcase, keeping at most three (the newest choice wins). */
export function toggleShowcase(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-3);
}
