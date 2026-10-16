import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bookmark, CalendarDays, MessageCircle, Orbit, Radio, SlidersHorizontal, Wand2 } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Avatar, LiveBadge, TONE_STYLE, timeAgo, type Tone } from "@/components/k";
import { getDiscoveryHub } from "@/lib/kamino/platform-v9";
import { cn } from "@/lib/utils";
import { hubShortcuts, type HubShortcut } from "./home-data";
import { HomeSection } from "./home-sections";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;

const SHORTCUT_ICON: Record<HubShortcut["icon"], Icon> = {
  live: Radio,
  chat: MessageCircle,
  event: CalendarDays,
  community: Orbit,
};

/** The three creator/reader tools, as tinted tiles instead of plain grey chips. */
const TOOLS: { to: string; title: string; text: string; icon: Icon; tone: Tone }[] = [
  { to: "/discover-plus", title: "Discover", text: "Tune your feed", icon: SlidersHorizontal, tone: "violet" },
  { to: "/saved", title: "Saved", text: "Posts you kept", icon: Bookmark, tone: "blue" },
  { to: "/creator", title: "Creator studio", text: "Stats & offers", icon: Wand2, tone: "pink" },
];

/**
 * The end of Home: "Jump back in" (live rooms, your chats, upcoming events, communities you
 * visited — same cards as the phone app) and "Your tools". Jump back in hides itself when empty.
 */
export function HomeShortcuts() {
  const hub = useQuery({
    queryKey: ["discoveryHub", "", ""],
    queryFn: () => getDiscoveryHub({ data: {} }),
    staleTime: 60_000,
  });
  const items = hubShortcuts(hub.data);

  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      {items.length ? (
        <HomeSection icon="⚡" title="Jump back in">
          <div
            className="k-row -mx-4 gap-2.5 px-4 py-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:px-0"
            aria-label="Jump back in"
          >
            {items.map((item) => (
              <ShortcutCard key={item.key} item={item} />
            ))}
          </div>
        </HomeSection>
      ) : null}

      <HomeSection icon="🧰" title="Your tools">
        <div className="grid grid-cols-3 gap-2.5 lg:gap-3">
          {TOOLS.map((tool) => {
            const tone = TONE_STYLE[tool.tone];
            const ToolIcon = tool.icon;
            return (
              <Link
                key={tool.to}
                to={tool.to}
                className="k-card k-focus group flex min-w-0 flex-col gap-2 p-3 transition-transform active:scale-[0.97] lg:flex-row lg:items-center lg:gap-3 lg:p-4"
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", tone.softClassName)}>
                  <ToolIcon className="size-[19px]" strokeWidth={2.3} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13.5px] leading-[17px] font-extrabold text-balance text-ink lg:truncate lg:text-[15px]">
                    {tool.title}
                  </span>
                  <span className="truncate text-[11.5px] leading-4 font-semibold text-muted lg:text-[13px]">
                    {tool.text}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </HomeSection>
    </div>
  );
}

function ShortcutCard({ item }: { item: HubShortcut }) {
  const tone = TONE_STYLE[item.tone];
  const ShortcutIcon = SHORTCUT_ICON[item.icon];
  // Chats: how long ago; events: the day. Home's hub loads in the browser, so local time is right.
  const when = !item.at
    ? ""
    : item.icon === "chat"
      ? timeAgo(item.at, { short: true })
      : item.icon === "event"
        ? new Date(item.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "";
  const label = item.live ? (item.kind.startsWith("Live · ") ? item.kind.slice(7) : "") : item.kind;
  return (
    <Link
      to={item.href}
      aria-label={`${item.kind}: ${item.title}`}
      className="k-card k-focus flex w-[224px] min-w-0 items-center gap-2.5 p-2.5 pr-3 transition-transform active:scale-[0.97] lg:w-auto lg:p-3"
    >
      {item.person ? (
        <Avatar person={item.person} size={40} />
      ) : (
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", tone.softClassName)}>
          <ShortcutIcon className="size-[19px]" strokeWidth={2.3} aria-hidden />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          {item.live ? <LiveBadge /> : null}
          <span className="truncate text-[11.5px] leading-4 font-semibold text-muted">
            {label}
            {when ? ` · ${when}` : ""}
          </span>
        </span>
        <span className="truncate text-[14px] leading-[19px] font-extrabold text-ink">{item.title}</span>
      </span>
    </Link>
  );
}
