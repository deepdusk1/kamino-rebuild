import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  Headphones,
  Radio,
  Search,
  Tag,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Avatar,
  AvatarStack,
  CATEGORY_LIST,
  EmptyHint,
  FilterPills,
  GradientButton,
  JoinButton,
  LiveBadge,
  OutlineButton,
  SectionHeader,
  TONE_STYLE,
  VerifiedTick,
  toneAt,
  type Tone,
} from "@/components/k";
import { PostCard } from "@/components/post-card";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { compactNumber, timeAgo } from "@/lib/format-ui";
import { joinCommunity, leaveCommunity, toggleFollowProfile } from "@/lib/kamino/server";
import { clearRecentSearches, recentSearches, searchEverything } from "@/lib/kamino/social";
import type { CommunityCardData, SearchEverything } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FILTERS,
  LANGUAGE_OPTIONS,
  SIZE_OPTIONS,
  SORT_OPTIONS,
  cleanTag,
  personFromChip,
  tagLabel,
  type SearchFilters,
} from "./helpers";
import { Picture, ResultRow } from "./community-parts";
import { Sheet } from "./sheet";

export type ResultTab = "people" | "communities" | "posts" | "tags" | "rooms" | "events";

const TABS: { key: ResultTab; label: string; icon: ReactNode }[] = [
  { key: "people", label: "People", icon: <User /> },
  { key: "communities", label: "Communities", icon: <Users /> },
  { key: "posts", label: "Posts", icon: <FileText /> },
  { key: "tags", label: "Tags", icon: <Tag /> },
  { key: "rooms", label: "Rooms", icon: <Radio /> },
  { key: "events", label: "Events", icon: <CalendarDays /> },
];

/** Which tab to open first: the most useful one that has results. */
function bestTab(r: SearchEverything | undefined, isTag: boolean): ResultTab {
  if (!r) return "communities";
  const order: ResultTab[] = isTag
    ? ["posts", "tags", "communities", "people", "rooms", "events"]
    : ["communities", "posts", "people", "tags", "rooms", "events"];
  return order.find((k) => r[k].length > 0) ?? "communities";
}

const TAG_TONES: Tone[] = ["pink", "violet", "blue", "orange", "pink", "orange", "violet", "blue"];

/** A tinted "#Anime" chip (Trending Tags). Clicking searches that tag. */
export function TagChip({
  tag,
  index,
  onPick,
  count,
}: {
  tag: string;
  index: number;
  onPick: (q: string) => void;
  count?: number;
}) {
  const tone = TAG_TONES[index % TAG_TONES.length]!;
  return (
    <button
      type="button"
      onClick={() => onPick(`#${cleanTag(tag)}`)}
      aria-label={`Search ${tagLabel(tag)}`}
      className={cn(
        "k-focus k-hit inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-[11px] text-[12px] font-semibold whitespace-nowrap transition-[filter] hover:brightness-95 lg:h-8 lg:px-3.5 lg:text-[14px]",
        TONE_STYLE[tone].softClassName,
      )}
    >
      {tagLabel(tag)}
      {count !== undefined ? (
        <span className="text-[11px] font-medium text-muted">{compactNumber(count)}</span>
      ) : null}
    </button>
  );
}

// ── Recent searches (empty search box) ───────────────────────────────────────

/** Recent searches with "Clear", plus trending tags, shown while the search box is empty. */
export function RecentSearches({
  tags,
  onPick,
}: {
  tags: { tag: string; count: number }[];
  onPick: (q: string) => void;
}) {
  const { user } = useCurrentUserState();
  const queryClient = useQueryClient();
  const recent = useQuery({
    queryKey: ["recentSearches", user?.id ?? null],
    queryFn: () => recentSearches(),
    enabled: !!user,
  });
  async function clear() {
    queryClient.setQueryData(["recentSearches", user?.id ?? null], []);
    try {
      await clearRecentSearches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear your searches");
      void recent.refetch();
    }
  }
  const items = recent.data ?? [];
  return (
    <div className="space-y-3.5">
      <SectionHeader
        icon={<Clock className="text-violet" strokeWidth={2.6} />}
        title="Recent searches"
        action={
          items.length ? (
            <button
              type="button"
              onClick={() => void clear()}
              className="k-focus k-hit rounded-full px-1.5 text-[12.5px] font-semibold text-violet hover:underline lg:text-[14px]"
            >
              Clear
            </button>
          ) : undefined
        }
      />
      {user && recent.isPending ? (
        <div className="h-24 animate-pulse rounded-card bg-surface-alt" aria-hidden />
      ) : items.length ? (
        <ul className="k-card rounded-card px-3">
          {items.map((r, i) => (
            <li key={`${r.query}-${i}`} className={cn(i > 0 && "border-t border-border")}>
              <button
                type="button"
                onClick={() => onPick(r.query)}
                aria-label={`Search again for ${r.query}`}
                className="k-focus flex min-h-[46px] w-full items-center gap-2.5 text-left"
              >
                {r.query.startsWith("#") ? (
                  <Tag className="size-[17px] text-muted" aria-hidden />
                ) : (
                  <Search className="size-[17px] text-muted" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                  {r.query}
                </span>
                <span className="text-[11.5px] text-subtle" suppressHydrationWarning>
                  {timeAgo(r.at)}
                </span>
                <ArrowUpLeft className="size-4 text-subtle" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-muted">
          {user ? "Your searches will show up here." : "Sign in to keep your recent searches."}
        </p>
      )}
      {tags.length ? (
        <>
          <SectionHeader
            icon={<TrendingUp className="text-pink" strokeWidth={2.6} />}
            title="Trending Tags"
            className="pt-1.5"
          />
          <div className="flex flex-wrap gap-2">
            {tags.map((t, i) => (
              <TagChip key={t.tag} tag={t.tag} index={i} onPick={onPick} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

/** Search results with the six tabs (People / Communities / Posts / Tags / Rooms / Events). */
export function SearchResults({
  term,
  filters,
  onPickQuery,
}: {
  /** What was typed ("" when only filters are set: then communities are browsed). */
  term: string;
  filters: SearchFilters;
  onPickQuery: (q: string) => void;
}) {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<ResultTab | null>(null);
  const [seenTerm, setSeenTerm] = useState(term);
  if (seenTerm !== term) {
    // A new search starts on the best tab again.
    setSeenTerm(term);
    setPicked(null);
  }
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const input = {
    q: term,
    kind: "all" as const,
    category: filters.category || undefined,
    sort: filters.sort,
    minMembers: filters.minMembers || undefined,
    language: filters.language || undefined,
    safe: filters.safe || undefined,
  };
  const results = useQuery({
    queryKey: ["searchEverything", input],
    queryFn: () => searchEverything({ data: input }),
  });
  const r = results.data;
  const tab = picked ?? bestTab(r, term.startsWith("#"));

  async function toggleJoin(c: CommunityCardData) {
    if (!user) return void navigate({ to: "/login" });
    const isIn = joined[c.id] ?? c.joined;
    // Private communities ask questions first: their page has the join form.
    if (!isIn && c.visibility === "private")
      return void navigate({ to: "/c/$slug", params: { slug: c.id } });
    setBusy(c.id);
    try {
      if (isIn) await leaveCommunity({ data: c.id });
      else {
        const res = await joinCommunity({ data: { slug: c.id } });
        if (res.pending) {
          toast.success("Request sent", { description: "The leaders will review your request." });
          return;
        }
      }
      setJoined((m) => ({ ...m, [c.id]: !isIn }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleFollow(userId: string) {
    if (!user) return void navigate({ to: "/login" });
    setBusy(userId);
    try {
      const res = await toggleFollowProfile({ data: userId });
      setFollowing((m) => ({ ...m, [userId]: res.following }));
      if (res.requested)
        toast.success("Request sent", {
          description: "This account is private. You'll see their posts once they accept.",
        });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {term ? (
        <FilterPills
          label="Result type"
          items={TABS.map((t) => ({
            key: t.key,
            label: r ? `${t.label} ${r[t.key].length}` : t.label,
            icon: t.icon,
          }))}
          value={tab}
          onChange={(k) => setPicked(k as ResultTab)}
          tinted
        />
      ) : null}
      {r?.fuzzy ? (
        <p className="text-[12.5px] text-muted">No exact matches, so here are the closest ones.</p>
      ) : null}
      {results.isPending ? (
        <div className="space-y-2.5" aria-busy="true" aria-label="Searching">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-card bg-surface-alt" />
          ))}
        </div>
      ) : results.isError ? (
        <EmptyHint
          icon="☁️"
          title="Search didn't load"
          text="Check your connection and try again."
          action={
            <GradientButton size="sm" onClick={() => void results.refetch()}>
              Try again
            </GradientButton>
          }
        />
      ) : !r || r[tab].length === 0 ? (
        <EmptyHint
          icon="🔍"
          title={term ? `No ${tab} for “${term}”` : "No communities match these filters"}
          text={term ? "Try another spelling, or a #hashtag." : "Try fewer filters."}
        />
      ) : tab === "communities" ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {r.communities.map((c, i) => (
            <CommunityResult
              key={c.id}
              c={c}
              index={i}
              joined={joined[c.id] ?? c.joined}
              busy={busy === c.id}
              onJoin={() => void toggleJoin(c)}
            />
          ))}
        </div>
      ) : tab === "people" ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {r.people.map((p, i) => {
            const isFollowing = following[p.userId] ?? p.following;
            return (
              <ResultRow key={p.userId}>
                <Avatar
                  person={{ name: p.displayName, hue: p.avatarHue, userId: p.userId, avatarV: p.avatarV }}
                  size={48}
                  online={p.online}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-1 text-[14.5px] font-extrabold text-ink">
                    <Link
                      to="/u/$handle"
                      params={{ handle: p.handle }}
                      className="k-focus truncate after:absolute after:inset-0 after:rounded-card after:content-['']"
                    >
                      {p.displayName}
                    </Link>
                    {p.verified ? <VerifiedTick size={13} /> : null}
                  </h3>
                  <p className="truncate text-[12.5px] text-muted">
                    @{p.handle}
                    {p.headline ? ` · ${p.headline}` : ""}
                  </p>
                  <p className="text-[11.5px] text-subtle">
                    {compactNumber(p.followers)} followers{p.followsYou ? " · Follows you" : ""}
                  </p>
                </div>
                <JoinButton
                  tone={toneAt(i)}
                  size="sm"
                  joined={isFollowing}
                  busy={busy === p.userId}
                  label="Follow"
                  joinedLabel="Following"
                  name={p.displayName}
                  onClick={() => void toggleFollow(p.userId)}
                />
              </ResultRow>
            );
          })}
        </div>
      ) : tab === "posts" ? (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {r.posts.map((p) => (
            <PostCard key={p.id} post={p} communityName={p.communityName} />
          ))}
        </div>
      ) : tab === "tags" ? (
        <div className="flex flex-wrap gap-2">
          {r.tags.map((t, i) => (
            <TagChip key={t.tag} tag={t.tag} count={t.count} index={i} onPick={onPickQuery} />
          ))}
        </div>
      ) : tab === "rooms" ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {r.rooms.map((room, i) => {
            const href = room.joined ? `/chats/${room.roomId}` : `/c/${room.communityId}`;
            return (
              <ResultRow key={room.roomId}>
                <span className="relative size-14 shrink-0 overflow-hidden rounded-[14px]">
                  <Picture src={room.cover} hue={250} icon={<Radio aria-hidden />} className="size-full" />
                  {room.liveCount > 0 ? <LiveBadge className="absolute top-[3px] left-[3px]" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14.5px] font-extrabold text-ink">
                    <Link
                      to={href}
                      className="k-focus after:absolute after:inset-0 after:rounded-card after:content-['']"
                    >
                      {room.title}
                    </Link>
                  </h3>
                  <p className="truncate text-[12.5px] text-muted">
                    {room.communityName}
                    {room.topic ? ` · ${room.topic}` : ""}
                  </p>
                  <AvatarStack
                    people={room.faces.map(personFromChip)}
                    size={16}
                    max={4}
                    extra={room.liveCount ? `${compactNumber(room.liveCount)} here now` : undefined}
                    className="mt-0.5"
                  />
                </div>
                <JoinButton
                  tone={toneAt(i)}
                  size="sm"
                  icon={<Headphones className="size-4" aria-hidden />}
                  name={room.title}
                  onClick={() => void navigate({ to: href })}
                />
              </ResultRow>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {r.events.map((e) => {
            const when = new Date(e.startsAt);
            return (
              <ResultRow key={e.id}>
                <span className="grid size-14 shrink-0 place-content-center rounded-[14px] bg-tint-pink text-center text-pink-ink">
                  <span className="text-[11px] font-bold uppercase" suppressHydrationWarning>
                    {when.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                  <span className="text-[20px] leading-6 font-extrabold" suppressHydrationWarning>
                    {when.getDate()}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14.5px] font-extrabold text-ink">
                    <Link
                      to="/c/$slug/events"
                      params={{ slug: e.communityId }}
                      className="k-focus after:absolute after:inset-0 after:rounded-card after:content-['']"
                    >
                      {e.title}
                    </Link>
                  </h3>
                  <p className="truncate text-[12.5px] text-muted" suppressHydrationWarning>
                    {e.communityName} ·{" "}
                    {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <p className="text-[11.5px] font-semibold text-subtle">
                    {compactNumber(e.rsvpCount)} going{e.going ? " · You're going" : ""}
                  </p>
                </div>
                <ChevronRight className="size-[18px] text-subtle" aria-hidden />
              </ResultRow>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A community in search results: square picture, name, text, faces, members and category, Join. */
function CommunityResult({
  c,
  index,
  joined,
  busy,
  onJoin,
}: {
  c: CommunityCardData;
  index: number;
  joined: boolean;
  busy: boolean;
  onJoin: () => void;
}) {
  return (
    <ResultRow>
      <Picture
        src={c.icon || c.cover}
        hue={c.hue}
        className="size-14 shrink-0 rounded-[14px]"
        icon={<span className="text-[22px] font-extrabold">{c.name.charAt(0).toUpperCase()}</span>}
      />
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1 text-[14.5px] font-extrabold text-ink">
          <Link
            to="/c/$slug"
            params={{ slug: c.id }}
            className="k-focus truncate after:absolute after:inset-0 after:rounded-card after:content-['']"
          >
            {c.name}
          </Link>
          {c.verified ? <VerifiedTick size={13} /> : null}
        </h3>
        <p className="truncate text-[12.5px] text-muted">{c.tagline || c.description}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <AvatarStack people={c.memberFaces.map(personFromChip)} size={16} max={3} />
          <span className="truncate text-[11.5px] font-semibold text-subtle">
            {compactNumber(c.memberCount)} members · {c.category}
          </span>
        </div>
      </div>
      <JoinButton
        tone={toneAt(index)}
        size="sm"
        joined={joined}
        busy={busy}
        name={c.name}
        onClick={onJoin}
      />
    </ResultRow>
  );
}

// ── Filter panel ─────────────────────────────────────────────────────────────

/** Category, sort, size, language and safe search for Explore search. */
export function FilterSheet({
  open,
  onOpenChange,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: SearchFilters;
  onApply: (f: SearchFilters) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Each time the panel opens, start from the filters that are on now.
    setWasOpen(open);
    if (open) setDraft(value);
  }
  const set = <K extends keyof SearchFilters>(key: K, v: SearchFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: v }));
  const categories = CATEGORY_LIST.filter((c) => c.key !== "forYou" && c.key !== "more");
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Filters">
      <FilterGroup title="Category">
        <Choice label="✨ Any" on={!draft.category} onClick={() => set("category", "")} />
        {categories.map((c) => (
          <Choice
            key={c.key}
            label={`${c.emoji} ${c.label}`}
            on={draft.category === c.key}
            onClick={() => set("category", draft.category === c.key ? "" : c.key)}
          />
        ))}
      </FilterGroup>
      <FilterGroup title="Sort by">
        {SORT_OPTIONS.map((o) => (
          <Choice key={o.value} label={o.label} on={draft.sort === o.value} onClick={() => set("sort", o.value)} />
        ))}
      </FilterGroup>
      <FilterGroup title="Community size">
        {SIZE_OPTIONS.map((o) => (
          <Choice
            key={o.value}
            label={o.label}
            on={draft.minMembers === o.value}
            onClick={() => set("minMembers", o.value)}
          />
        ))}
      </FilterGroup>
      <FilterGroup title="Language">
        {LANGUAGE_OPTIONS.map((o) => (
          <Choice
            key={o.value || "any"}
            label={o.label}
            on={draft.language === o.value}
            onClick={() => set("language", o.value)}
          />
        ))}
      </FilterGroup>
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink">Safe search</span>
          <span className="block text-[12.5px] text-muted">
            Hide 16+ communities and ones with content warnings.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={draft.safe}
          onChange={(e) => set("safe", e.target.checked)}
          className="k-focus peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-violet",
            draft.safe ? "bg-violet-strong" : "bg-border",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left]",
              draft.safe ? "left-[22px]" : "left-0.5",
            )}
          />
        </span>
      </label>
      <div className="flex items-center gap-2.5 pt-1">
        <OutlineButton size="md" onClick={() => setDraft(DEFAULT_FILTERS)} className="h-12 text-ink">
          Reset
        </OutlineButton>
        <GradientButton
          size="md"
          className="h-12 min-w-0 flex-1"
          onClick={() => {
            onApply(draft);
            onOpenChange(false);
          }}
        >
          Show results
        </GradientButton>
      </div>
    </Sheet>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-[14px] font-extrabold text-ink">{title}</legend>
      <div className="flex flex-wrap gap-[7px]">{children}</div>
    </fieldset>
  );
}

function Choice({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "k-focus k-hit h-8 rounded-full border-[1.5px] px-[13px] text-[12.5px] whitespace-nowrap transition-colors",
        on
          ? "border-violet bg-tint-violet font-bold text-violet-ink"
          : "border-border bg-surface font-semibold text-ink hover:bg-surface-alt",
      )}
    >
      {label}
    </button>
  );
}
