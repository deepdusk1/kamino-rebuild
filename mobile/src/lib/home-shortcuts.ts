/**
 * "Jump back in" cards for Home, built from the discovery hub. Pure (no React Native), so it is
 * unit tested. Same rules as the website's `hubShortcuts` in web/src/components/home/home-data.ts.
 */

type HubRow = Record<string, string | number | boolean | null | undefined>;

export type HubShortcut = {
  key: string;
  /** Small label above the title: "Message", "Chat", "Upcoming", "Visited", "2 listening". */
  label: string;
  title: string;
  icon: "radio" | "chatbubbles" | "calendar" | "planet";
  tone: "pink" | "violet" | "blue" | "green";
  href: string;
  live: boolean;
  /** Direct chats: the other person, so the card shows their face. */
  person: { name: string; hue: number; userId: string; avatarV: number } | null;
  /** Chats: time of the latest message. Events: start time. ISO, or null. */
  at: string | null;
};

/** How many of each kind to show, so one busy kind can't push the others off the row. */
const PER_KIND = 3;

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Live rooms first, then your chats, upcoming events and communities you visited. At most three of
 * each; rows without an id are skipped; a live room that is also one of your chats shows once.
 */
export function hubShortcuts(
  hub: { live?: HubRow[]; chats?: HubRow[]; events?: HubRow[]; visits?: HubRow[] } | undefined,
): HubShortcut[] {
  if (!hub) return [];
  const list: HubShortcut[] = [];
  const seen = new Set<string>();
  const add = (rows: HubRow[] | undefined, prefix: string, make: (r: HubRow) => Omit<HubShortcut, "key"> | null) => {
    for (const r of (rows ?? []).slice(0, PER_KIND)) {
      if (r.id === null || r.id === undefined || r.id === "") continue;
      const item = make(r);
      if (!item || seen.has(item.href)) continue;
      seen.add(item.href);
      list.push({ key: `${prefix}-${String(r.id)}`, ...item });
    }
  };
  add(hub.live, "live", (r) => {
    const listeners = Number(r.listeners) || 0;
    return {
      label: listeners > 0 ? `${listeners} listening` : "",
      title: String(r.name || "Live room"),
      icon: "radio",
      tone: "pink",
      href: `/chat/${String(r.id)}`,
      live: true,
      person: null,
      at: null,
    };
  });
  add(hub.chats, "chat", (r) => {
    const dm = r.is_dm === true && typeof r.peer_user_id === "string";
    const title = String(r.name || "Chat");
    return {
      label: dm ? "Message" : "Chat",
      title,
      icon: "chatbubbles",
      tone: "violet",
      href: `/chat/${String(r.id)}`,
      live: false,
      person: dm ? { name: title, hue: Number(r.peer_hue) || 262, userId: String(r.peer_user_id), avatarV: Number(r.peer_avatar_v) || 0 } : null,
      at: isoOrNull(r.latest),
    };
  });
  add(hub.events, "event", (r) =>
    r.community_id
      ? {
          label: "Upcoming",
          title: String(r.title || "Event"),
          icon: "calendar",
          tone: "blue",
          href: `/community/${String(r.community_id)}/events`,
          live: false,
          person: null,
          at: isoOrNull(r.starts_at),
        }
      : null,
  );
  add(hub.visits, "visit", (r) => ({
    label: "Visited",
    title: String(r.name || "Community"),
    icon: "planet",
    tone: "green",
    href: `/community/${String(r.id)}`,
    live: false,
    person: null,
    at: null,
  }));
  return list;
}

/** The shortcuts at the end of Home: tinted tiles to the screens people reach for most. */
export const HOME_TOOLS = [
  { href: "/tools?tab=discovery", title: "Discover", text: "Tune your feed", icon: "options", tone: "violet" },
  { href: "/saved", title: "Saved", text: "Posts you kept", icon: "bookmark", tone: "blue" },
  { href: "/tools?tab=creator", title: "Creator studio", text: "Stats & offers", icon: "color-wand", tone: "pink" },
] as const;
