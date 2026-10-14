import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Compass, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  CardRow,
  CategoryChips,
  CommunityCard,
  EXPLORE_CATEGORIES,
  EmptyHint,
  GradientButton,
  HeroCarousel,
  ScreenTitle,
  SearchField,
  SectionHeader,
} from "@/components/k";
import { FilterSheet, RecentSearches, SearchResults, TagChip } from "@/components/community/explore-search";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  personFromChip,
  bannerAction,
  type SearchFilters,
} from "@/components/community/helpers";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { heroArt } from "@/lib/brand-art";
import { joinCommunity, leaveCommunity } from "@/lib/kamino/server";
import { exploreOverview } from "@/lib/kamino/social";
import type { CommunityCardData } from "@/lib/kamino/types";

type ExploreSearch = { q?: string; sort?: SearchFilters["sort"] };
const SORTS = ["trending", "new", "growing", "members"] as const;

export const Route = createFileRoute("/explore")({
  // `?q=` opens a search (a hashtag tapped anywhere goes to `/explore?q=%23tag`); `?sort=` browses every community.
  validateSearch: (s: Record<string, unknown>): ExploreSearch => ({
    q: typeof s.q === "string" && s.q.trim() ? s.q.slice(0, 60) : undefined,
    sort: SORTS.includes(s.sort as (typeof SORTS)[number])
      ? (s.sort as ExploreSearch["sort"])
      : s.browse
        ? "trending"
        : undefined,
  }),
  loader: () => exploreOverview({ data: {} }),
  component: Explore,
});

/** Waits until `value` has stopped changing for `ms` milliseconds. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}

const SEARCH_INPUT_ID = "explore-search";

/**
 * Explore = the "Communities" tab (mockup 04-explore), the same screen as the phone app.
 * Title, a search box with a filter button, category chips (they filter everything below), banners,
 * "Recommended Communities" (two rows of four, with Join), "Trending Tags" (click = search that tag), then your
 * communities, new ones and fast-growing ones.
 * Typing (or the header's search icon, which opens `/explore#search`) switches to search: recent searches, then
 * results in six tabs, with filters in a panel.
 */
function Explore() {
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const hash = useRouterState({ select: (s) => s.location.hash });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUserState();

  const [query, setQuery] = useState(search.q ?? "");
  // (The "#search" part of an address never reaches the server, so it is handled after the page loads, below.)
  const [searching, setSearching] = useState(!!search.q || !!search.sort);
  const [category, setCategory] = useState("forYou");
  const [filters, setFilters] = useState<SearchFilters>(
    search.sort ? { ...DEFAULT_FILTERS, sort: search.sort } : DEFAULT_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // A new `?q=` or `?sort=` (a hashtag clicked in the results, a banner) starts that search.
  const incoming = `${search.q ?? ""}|${search.sort ?? ""}`;
  const [handled, setHandled] = useState(incoming);
  if (incoming !== handled) {
    setHandled(incoming);
    if (search.q) setQuery(search.q);
    if (search.sort) setFilters({ ...DEFAULT_FILTERS, sort: search.sort });
    if (search.q || search.sort) setSearching(true);
  }

  // The header's search icon (`#search`) puts the cursor in the search box.
  useEffect(() => {
    if (hash !== "search") return;
    setSearching(true);
    const el = document.getElementById(SEARCH_INPUT_ID);
    el?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [hash]);

  const interest = category === "forYou" ? undefined : category;
  const overview = useQuery({
    queryKey: ["exploreOverview", interest ?? "forYou"],
    queryFn: () => exploreOverview({ data: { category: interest } }),
    initialData: interest ? undefined : initial,
    placeholderData: keepPreviousData,
  });
  const data = overview.data;

  const term = useDebounced(query.trim(), 350);
  const filterCount = activeFilterCount(filters);
  const showResults = term.replace(/^#/, "").length >= 2 || (!term && filterCount > 0);

  function scrollUp() {
    top.current?.scrollIntoView({ block: "start" });
  }
  function startSearch() {
    setSearching(true);
    document.getElementById(SEARCH_INPUT_ID)?.focus({ preventScroll: true });
    scrollUp();
  }
  function stopSearch() {
    setQuery("");
    setFilters(DEFAULT_FILTERS);
    setSearching(false);
    if (search.q || search.sort || hash)
      void navigate({ to: "/explore", search: {}, hash: "", replace: true });
  }
  function pickQuery(q: string) {
    setQuery(q);
    setSearching(true);
    scrollUp();
  }
  /** "Browse All", "See All": list every community (sorted) with the search filters. */
  function browse(sort: SearchFilters["sort"]) {
    setQuery("");
    setFilters({ ...DEFAULT_FILTERS, category: interest ?? "", sort });
    setSearching(true);
    scrollUp();
  }

  // Join / leave changes every cached copy of the explore cards at once, so all sections agree straight away.
  function patch(slug: string, joined: boolean) {
    queryClient.setQueriesData<typeof initial>({ queryKey: ["exploreOverview"] }, (o) => {
      if (!o) return o;
      const fix = (c: CommunityCardData) =>
        c.id === slug
          ? { ...c, joined, memberCount: Math.max(0, c.memberCount + (joined ? 1 : -1)) }
          : c;
      return {
        ...o,
        recommended: o.recommended.map(fix),
        newest: o.newest.map(fix),
        growing: o.growing.map(fix),
        joined: o.joined.map(fix),
      };
    });
  }
  async function toggleJoin(c: CommunityCardData) {
    if (!user) return void navigate({ to: "/login" });
    // Private communities ask questions first: their page has the join form.
    if (!c.joined && c.visibility === "private")
      return void navigate({ to: "/c/$slug", params: { slug: c.id } });
    setBusy(c.id);
    try {
      if (c.joined) {
        await leaveCommunity({ data: c.id });
        patch(c.id, false);
      } else {
        const res = await joinCommunity({ data: { slug: c.id } });
        if (res.pending)
          toast.success("Request sent", {
            description: "The leaders will review your request. You'll get a notification when you're in.",
          });
        else {
          patch(c.id, true);
          toast.success(`Welcome to ${c.name}!`);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["exploreOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const card = (c: CommunityCardData, i: number, variant: "grid" | "vertical" | "compact") => (
    <CommunityCard
      key={c.id}
      community={c}
      variant={variant}
      index={i}
      joined={c.joined}
      joinBusy={busy === c.id}
      faces={c.memberFaces.map(personFromChip)}
      onJoin={variant === "compact" ? undefined : () => void toggleJoin(c)}
    />
  );

  return (
    <AppShell>
      <div ref={top} className="scroll-mt-20 space-y-3 px-4 pt-1 lg:space-y-5 lg:pt-4">
        {!searching && (
          <ScreenTitle
            title="Explore"
            subtitle="Discover communities, meet amazing people, and find your next favorite space."
          />
        )}

        <div className="flex items-center gap-2 lg:max-w-3xl">
          <SearchField
            id={SEARCH_INPUT_ID}
            value={query}
            onChange={(t) => {
              setQuery(t);
              if (t) setSearching(true);
            }}
            onSubmit={() => (document.activeElement as HTMLElement | null)?.blur()}
            onFilter={() => setFiltersOpen(true)}
            filterActive={filterCount > 0}
            className="min-w-0 flex-1 [&_input:focus-visible]:outline-none"
          />
          {searching && (
            <button
              type="button"
              onClick={stopSearch}
              className="k-focus k-hit shrink-0 rounded-full px-1.5 text-[14px] font-bold text-violet"
            >
              Cancel
            </button>
          )}
        </div>
        {/* Typing into the field also opens search (the field itself can't know about focus here). */}
        <SearchFocusWatcher onFocus={() => setSearching(true)} />

        {searching ? (
          <div className="pt-1.5">
            {showResults ? (
              <div className="space-y-2">
                {!term ? (
                  <SectionHeader icon={<Compass className="text-violet" strokeWidth={2.6} />} title="All communities" />
                ) : null}
                <SearchResults term={term} filters={filters} onPickQuery={pickQuery} />
              </div>
            ) : (
              <RecentSearches tags={data?.trendingTags ?? []} onPick={pickQuery} />
            )}
          </div>
        ) : (
          <>
            <CategoryChips
              items={EXPLORE_CATEGORIES}
              value={category}
              onChange={setCategory}
              showArrow
              label="Categories"
              className="-mt-1"
            />

            {overview.isError || !data ? (
              overview.isPending ? (
                <div className="space-y-3" aria-busy="true" aria-label="Loading">
                  <div className="h-[138px] animate-pulse rounded-hero bg-surface-alt" />
                  <div className="h-40 animate-pulse rounded-card bg-surface-alt" />
                </div>
              ) : (
                <EmptyHint
                  icon="☁️"
                  title="Explore didn't load"
                  text="Check your connection and try again."
                  action={
                    <GradientButton size="sm" onClick={() => void overview.refetch()}>
                      Try again
                    </GradientButton>
                  }
                />
              )
            ) : (
              <div className="space-y-4 lg:space-y-7">
                {data.banners.length ? (
                  <HeroCarousel
                    label="Explore highlights"
                    heightClassName="h-[152px] sm:h-[200px] lg:h-[280px]"
                    slides={data.banners.map((b, i) => {
                      const action = bannerAction(b.href);
                      return {
                        id: b.id,
                        title: b.title,
                        text: b.text,
                        cta: b.cta,
                        image: heroArt[b.art] ?? heroArt[`explore-${(i % 3) + 1}`],
                        to: action.kind === "go" ? action.href : undefined,
                        onCta: action.kind === "browse" ? () => browse(action.sort) : undefined,
                      };
                    })}
                  />
                ) : null}

                <section className="space-y-1.5 lg:space-y-3" aria-label="Recommended communities">
                  <SectionHeader
                    icon="⭐"
                    title="Recommended Communities"
                    onSeeAll={() => browse("trending")}
                    seeAllIcon="chevron"
                  />
                  {data.recommended.length ? (
                    <div className="grid grid-cols-4 gap-2 lg:gap-4">
                      {data.recommended.slice(0, 8).map((c, i) => card(c, i, "grid"))}
                    </div>
                  ) : (
                    <EmptyHint
                      icon="🌱"
                      title="Nothing here yet"
                      text="No communities in this category yet. Why not start one?"
                      action={
                        <GradientButton size="sm" to="/new">
                          Create a community
                        </GradientButton>
                      }
                    />
                  )}
                </section>

                {data.trendingTags.length ? (
                  <section className="space-y-1.5 lg:space-y-3" aria-label="Trending tags">
                    <SectionHeader
                      icon={<TrendingUp className="text-pink" strokeWidth={2.6} />}
                      title="Trending Tags"
                      onSeeAll={startSearch}
                      seeAllIcon="chevron"
                    />
                    <div className="relative flex items-center">
                      <div className="k-row -ml-4 min-w-0 flex-1 gap-2 py-0.5 pr-11 pl-4 lg:ml-0 lg:flex-wrap lg:pr-0 lg:pl-0">
                        {data.trendingTags.map((t, i) => (
                          <TagChip key={t.tag} tag={t.tag} index={i} onPick={pickQuery} />
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="More tags"
                        onClick={startSearch}
                        className="k-focus k-hit absolute right-0 grid size-7 place-items-center rounded-full border border-border bg-surface text-ink shadow-card before:pointer-events-none before:absolute before:inset-y-[-4px] before:right-full before:w-8 before:bg-gradient-to-l before:from-bg before:to-transparent before:content-[''] lg:hidden"
                      >
                        <ChevronRight className="size-4" strokeWidth={2.6} aria-hidden />
                      </button>
                    </div>
                  </section>
                ) : null}

                {data.joined.length ? (
                  <section className="space-y-1.5 lg:space-y-3" aria-label="Your communities">
                    <SectionHeader
                      icon="🏡"
                      title="Your communities"
                      seeAllTo="/me"
                      seeAllIcon="chevron"
                    />
                    <CardRow perRow={4} desktopCols={6} label="Your communities">
                      {data.joined.slice(0, 12).map((c, i) => card(c, i, "compact"))}
                    </CardRow>
                  </section>
                ) : null}
                {data.newest.length ? (
                  <section className="space-y-1.5 lg:space-y-3" aria-label="New communities">
                    <SectionHeader icon="🌱" title="New communities" onSeeAll={() => browse("new")} seeAllIcon="chevron" />
                    <CardRow perRow={4} desktopCols={6} label="New communities">
                      {data.newest.slice(0, 6).map((c, i) => card(c, i, "vertical"))}
                    </CardRow>
                  </section>
                ) : null}
                {data.growing.length ? (
                  <section className="space-y-1.5 lg:space-y-3" aria-label="Fast-growing communities">
                    <SectionHeader icon="🚀" title="Fast-growing" onSeeAll={() => browse("growing")} seeAllIcon="chevron" />
                    <CardRow perRow={4} desktopCols={6} label="Fast-growing communities">
                      {data.growing.slice(0, 6).map((c, i) => card(c, i, "vertical"))}
                    </CardRow>
                  </section>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={filters}
        onApply={(f) => {
          setFilters(f);
          setSearching(true);
        }}
      />
    </AppShell>
  );
}

/** Opens search mode when the search box gets the cursor (the kit's field has no focus callback). */
function SearchFocusWatcher({ onFocus }: { onFocus: () => void }) {
  const cb = useRef(onFocus);
  useEffect(() => {
    cb.current = onFocus;
  });
  useEffect(() => {
    const el = document.getElementById(SEARCH_INPUT_ID);
    if (!el) return;
    const handler = () => cb.current();
    el.addEventListener("focus", handler);
    return () => el.removeEventListener("focus", handler);
  }, []);
  return null;
}
