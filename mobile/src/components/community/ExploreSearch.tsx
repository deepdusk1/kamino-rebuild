import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Switch, View } from "react-native";
import { api } from "@/api/endpoints";
import type { CommunityCardData, HallEvent, LiveRoomCard, SearchEverything } from "@/api/types";
import { PostCard } from "@/components/PostCard";
import {
  AvatarStack, CATEGORIES, CategoryChip, EmptyHint, FilterPills, GradientButton, JoinButton, LiveBadge, Picture, PersonAvatar, SectionHeader, VerifiedTick,
  personFromChip, type FilterItem,
} from "@/components/k";
import { PressableScale, Sheet, SkeletonList, Txt } from "@/components/ui";
import { defaultCover } from "@/lib/brandArt";
import { showError } from "@/lib/errors";
import { compactNumber, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, useTheme } from "@/theme";
import { DEFAULT_FILTERS, LANGUAGE_OPTIONS, SIZE_OPTIONS, SORT_OPTIONS, cleanTag, tagLabel, type SearchFilters } from "./helpers";
import { serverImage } from "./media";
import { notify } from "./platform";

export type ResultTab = "people" | "communities" | "posts" | "tags" | "rooms" | "events";

const TABS: { key: ResultTab; label: string; icon: FilterItem["icon"] }[] = [
  { key: "people", label: "People", icon: "person-outline" },
  { key: "communities", label: "Communities", icon: "people-outline" },
  { key: "posts", label: "Posts", icon: "document-text-outline" },
  { key: "tags", label: "Tags", icon: "pricetag-outline" },
  { key: "rooms", label: "Rooms", icon: "radio-outline" },
  { key: "events", label: "Events", icon: "calendar-outline" },
];

/** Which tab to open first when the person hasn't picked one: the most useful one that has results. */
function bestTab(r: SearchEverything | undefined, isTag: boolean): ResultTab {
  if (!r) return "communities";
  const order: ResultTab[] = isTag ? ["posts", "tags", "communities", "people", "rooms", "events"] : ["communities", "posts", "people", "tags", "rooms", "events"];
  return order.find((k) => r[k].length > 0) ?? "communities";
}

// ── Recent searches (empty search box) ───────────────────────────────────────

/** Recent searches with "Clear", plus trending tags, shown while the search box is empty. */
export function RecentSearches({ tags, onPick }: { tags: { tag: string; count: number }[]; onPick: (q: string) => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const recent = useQuery({ queryKey: ["recentSearches"], queryFn: api.recentSearches });
  const clear = async () => {
    queryClient.setQueryData(["recentSearches"], []);
    try {
      await api.clearRecentSearches();
    } catch (error) {
      showError(error);
      void recent.refetch();
    }
  };
  const items = recent.data ?? [];
  return (
    <View style={{ gap: 14, paddingHorizontal: 16 }}>
      <SectionHeader
        icon="time-outline"
        title="Recent searches"
        right={items.length ? (
          <PressableScale onPress={() => void clear()} accessibilityLabel="Clear recent searches" hitSlop={10} scaleTo={0.94} style={{ minHeight: 32, justifyContent: "center" }}>
            <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, color: theme.accent }}>Clear</Txt>
          </PressableScale>
        ) : undefined}
      />
      {recent.isPending ? (
        <SkeletonList count={2} />
      ) : items.length ? (
        <View style={[{ backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 12 }, shadow.card]}>
          {items.map((r, i) => (
            <PressableScale
              key={`${r.query}-${i}`}
              onPress={() => onPick(r.query)}
              accessibilityLabel={`Search again for ${r.query}`}
              scaleTo={0.98}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}
            >
              <Ionicons name={r.query.startsWith("#") ? "pricetag-outline" : "search-outline"} size={17} color={theme.muted} />
              <Txt numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold, fontSize: 14, color: theme.ink }}>{r.query}</Txt>
              <Txt style={{ fontFamily: font.regular, fontSize: 11.5, color: theme.subtle }}>{timeAgo(r.at)}</Txt>
              <Ionicons name="arrow-up-outline" size={16} color={theme.subtle} style={{ transform: [{ rotate: "-45deg" }] }} />
            </PressableScale>
          ))}
        </View>
      ) : (
        <Txt style={{ fontFamily: font.regular, fontSize: 13.5, color: theme.muted }}>Your searches will show up here.</Txt>
      )}
      {tags.length ? (
        <>
          <SectionHeader icon="trending-up" iconColor={theme.pink} title="Trending Tags" style={{ marginTop: 6 }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tags.map((t, i) => (
              <TagChip key={t.tag} tag={t.tag} index={i} onPress={() => onPick(`#${cleanTag(t.tag)}`)} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const TAG_TONES = ["pink", "violet", "blue", "orange", "pink", "orange", "violet", "blue"] as const;

/** A tinted "#Anime" chip (Trending Tags). */
export function TagChip({ tag, index, onPress, count }: { tag: string; index: number; onPress: () => void; count?: number }) {
  const theme = useTheme();
  const tone = TAG_TONES[index % TAG_TONES.length]!;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`Search ${tagLabel(tag)}`} hitSlop={6} scaleTo={0.94} style={{ height: 26, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: theme.tints[tone], justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: theme.toneText[tone] }}>{tagLabel(tag)}</Txt>
      {count !== undefined ? <Txt style={{ fontFamily: font.regular, fontSize: 11, color: theme.muted }}>{compactNumber(count)}</Txt> : null}
    </PressableScale>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

type ResultsProps = {
  /** What was typed ("" when only filters are set: then communities are browsed). */
  term: string;
  filters: SearchFilters;
  onPickQuery: (q: string) => void;
};

/** Search results with the six tabs (People / Communities / Posts / Tags / Rooms / Events). */
export function SearchResults({ term, filters, onPickQuery }: ResultsProps) {
  const theme = useTheme();
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

  const input = { q: term, kind: "all" as const, category: filters.category || undefined, sort: filters.sort, minMembers: filters.minMembers || undefined, language: filters.language || undefined, safe: filters.safe || undefined };
  const results = useQuery({ queryKey: ["searchEverything", input], queryFn: () => api.searchEverything(input) });
  const r = results.data;
  const tab = picked ?? bestTab(r, term.startsWith("#"));

  async function toggleJoin(c: CommunityCardData) {
    const isIn = joined[c.id] ?? c.joined;
    if (!isIn && c.visibility === "private") return router.push(`/community/${c.id}`);
    setBusy(c.id);
    try {
      if (isIn) await api.leave(c.id);
      else {
        const res = await api.join({ slug: c.id });
        if (res.pending) return notify("Request sent", "The leaders will review your request.");
        haptic.success();
      }
      setJoined((m) => ({ ...m, [c.id]: !isIn }));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  async function toggleFollow(userId: string, was: boolean) {
    setBusy(userId);
    try {
      const res = await api.followProfile(userId);
      setFollowing((m) => ({ ...m, [userId]: res.following }));
      if (res.requested) notify("Request sent", "This account is private. You'll see their posts once they accept.");
      else if (!was) haptic.success();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }

  const items: FilterItem[] = TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon, count: r ? r[t.key].length : undefined }));

  return (
    <View style={{ gap: 12 }}>
      {term ? <FilterPills items={items} value={tab} onChange={(k) => setPicked(k as ResultTab)} /> : null}
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {r?.fuzzy ? <Txt style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>No exact matches, so here are the closest ones.</Txt> : null}
        {results.isPending ? (
          <SkeletonList count={3} />
        ) : results.isError ? (
          <EmptyHint icon="cloud-offline-outline" title="Search didn't load" text="Check your connection and try again." actionLabel="Try again" onAction={() => void results.refetch()} />
        ) : !r || r[tab].length === 0 ? (
          <EmptyHint emoji="🔍" title={term ? `No ${tab} for “${term}”` : "No communities match these filters"} text={term ? "Try another spelling, or a #hashtag." : "Try fewer filters."} />
        ) : tab === "communities" ? (
          r.communities.map((c, i) => (
            <CommunityResult key={c.id} c={c} index={i} joined={joined[c.id] ?? c.joined} busy={busy === c.id} onJoin={() => void toggleJoin(c)} />
          ))
        ) : tab === "people" ? (
          r.people.map((p, i) => {
            const isFollowing = following[p.userId] ?? p.following;
            return (
              <ResultRow key={p.userId} onPress={() => router.push(`/profile/${p.handle}`)} label={`${p.displayName}, @${p.handle}`}>
                <PersonAvatar person={{ name: p.displayName, hue: p.avatarHue, userId: p.userId, avatarV: p.avatarV }} size={48} online={p.online} />
                <View style={{ flex: 1, gap: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14.5, color: theme.ink, flexShrink: 1 }}>{p.displayName}</Txt>
                    {p.verified ? <VerifiedTick size={13} /> : null}
                  </View>
                  <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>@{p.handle}{p.headline ? ` · ${p.headline}` : ""}</Txt>
                  <Txt style={{ fontFamily: font.regular, fontSize: 11.5, color: theme.subtle }}>{compactNumber(p.followers)} followers{p.followsYou ? " · Follows you" : ""}</Txt>
                </View>
                <JoinButton joined={isFollowing} index={i} label="Follow" joinedLabel="Following" size="md" busy={busy === p.userId} onPress={() => void toggleFollow(p.userId, isFollowing)} accessibilityLabel={isFollowing ? `Unfollow ${p.displayName}` : `Follow ${p.displayName}`} />
              </ResultRow>
            );
          })
        ) : tab === "posts" ? (
          r.posts.map((p, i) => <PostCard key={p.id} post={p} showCommunity index={Math.min(i, 5)} />)
        ) : tab === "tags" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {r.tags.map((t, i) => <TagChip key={t.tag} tag={t.tag} count={t.count} index={i} onPress={() => onPickQuery(`#${cleanTag(t.tag)}`)} />)}
          </View>
        ) : tab === "rooms" ? (
          r.rooms.map((room) => <RoomResult key={room.roomId} room={room} />)
        ) : (
          r.events.map((e) => <EventResult key={e.id} event={e} />)
        )}
      </View>
    </View>
  );
}

/** A white rounded result row. */
function ResultRow({ children, onPress, label }: { children: ReactNode; onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} scaleTo={0.98} style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
      {children}
    </PressableScale>
  );
}

/** A community in search results: cover square, name, members and category, Join. */
export function CommunityResult({ c, index, joined, busy, onJoin }: { c: CommunityCardData; index: number; joined: boolean; busy: boolean; onJoin: () => void }) {
  const theme = useTheme();
  return (
    <ResultRow onPress={() => router.push(`/community/${c.id}`)} label={`${c.name}, ${compactNumber(c.memberCount)} members`}>
      <Picture source={c.icon ? serverImage(c.icon) : c.cover ? serverImage(c.cover) : defaultCover(c.hue)} hue={c.hue} label={c.name} radius={14} style={{ width: 56, height: 56 }} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14.5, color: theme.ink, flexShrink: 1 }}>{c.name}</Txt>
          {c.verified ? <VerifiedTick size={13} /> : null}
        </View>
        <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>{c.tagline || c.description}</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <AvatarStack people={c.memberFaces.map(personFromChip)} size={16} max={3} />
          <Txt style={{ fontFamily: font.semibold, fontSize: 11.5, color: theme.subtle }}>{compactNumber(c.memberCount)} members · {c.category}</Txt>
        </View>
      </View>
      <JoinButton joined={joined} index={index} size="md" busy={busy} onPress={onJoin} accessibilityLabel={joined ? `Leave ${c.name}` : `Join ${c.name}`} />
    </ResultRow>
  );
}

function RoomResult({ room }: { room: LiveRoomCard }) {
  const theme = useTheme();
  const open = () => router.push(room.joined ? `/chat/${room.roomId}` : `/community/${room.communityId}`);
  return (
    <ResultRow onPress={open} label={`Room ${room.title} in ${room.communityName}`}>
      <Picture source={serverImage(room.cover)} hue={250} icon="radio" radius={14} style={{ width: 56, height: 56 }}>
        {room.liveCount > 0 ? <LiveBadge style={{ position: "absolute", left: 3, top: 3 }} /> : null}
      </Picture>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14.5, color: theme.ink }}>{room.title}</Txt>
        <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>{room.communityName}{room.topic ? ` · ${room.topic}` : ""}</Txt>
        <AvatarStack people={room.faces.map(personFromChip)} size={16} max={4} label={room.liveCount ? `${compactNumber(room.liveCount)} here now` : undefined} style={{ marginTop: 2 }} />
      </View>
      <JoinButton color={room.color} icon="headset" size="md" onPress={open} accessibilityLabel={`Join ${room.title}`} />
    </ResultRow>
  );
}

function EventResult({ event }: { event: HallEvent & { communityName: string } }) {
  const theme = useTheme();
  const when = new Date(event.startsAt);
  return (
    <ResultRow onPress={() => router.push(`/community/${event.communityId}/events`)} label={`Event ${event.title}`}>
      <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: theme.tints.pink, alignItems: "center", justifyContent: "center" }}>
        <Txt style={{ fontFamily: font.bold, fontSize: 11, color: theme.toneText.pink, textTransform: "uppercase" }}>{when.toLocaleDateString(undefined, { month: "short" })}</Txt>
        <Txt style={{ fontFamily: font.heavy, fontSize: 20, lineHeight: 24, color: theme.toneText.pink }}>{when.getDate()}</Txt>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14.5, color: theme.ink }}>{event.title}</Txt>
        <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>{event.communityName} · {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Txt>
        <Txt style={{ fontFamily: font.semibold, fontSize: 11.5, color: theme.subtle }}>{compactNumber(event.rsvpCount)} going{event.going ? " · You're going" : ""}</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.subtle} />
    </ResultRow>
  );
}

// ── Filter sheet ─────────────────────────────────────────────────────────────

type FilterSheetProps = { visible: boolean; value: SearchFilters; onApply: (f: SearchFilters) => void; onClose: () => void };

/** Category, language, size, sort and safe search for Explore search. */
export function FilterSheet({ visible, value, onApply, onClose }: FilterSheetProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    // Each time the sheet opens, start from the filters that are on now.
    setWasVisible(visible);
    if (visible) setDraft(value);
  }
  const set = <K extends keyof SearchFilters>(key: K, v: SearchFilters[K]) => setDraft((d) => ({ ...d, [key]: v }));
  const categories = CATEGORIES.filter((c) => c.key !== "forYou" && c.key !== "more");

  return (
    <Sheet visible={visible} title="Filters" onClose={onClose}>
      <FilterGroup title="Category">
        <CategoryChip category={{ key: "", label: "Any", emoji: "✨" }} selected={!draft.category} onPress={() => set("category", "")} />
        {categories.map((c) => <CategoryChip key={c.key} category={c} selected={draft.category === c.key} onPress={() => set("category", draft.category === c.key ? "" : c.key)} />)}
      </FilterGroup>
      <FilterGroup title="Sort by">
        {SORT_OPTIONS.map((o) => <Choice key={o.value} label={o.label} on={draft.sort === o.value} onPress={() => set("sort", o.value)} />)}
      </FilterGroup>
      <FilterGroup title="Community size">
        {SIZE_OPTIONS.map((o) => <Choice key={o.value} label={o.label} on={draft.minMembers === o.value} onPress={() => set("minMembers", o.value)} />)}
      </FilterGroup>
      <FilterGroup title="Language">
        {LANGUAGE_OPTIONS.map((o) => <Choice key={o.value || "any"} label={o.label} on={draft.language === o.value} onPress={() => set("language", o.value)} />)}
      </FilterGroup>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 15, color: theme.ink }}>Safe search</Txt>
          <Txt style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>Hide 16+ communities and ones with content warnings.</Txt>
        </View>
        <Switch value={draft.safe} onValueChange={(v) => set("safe", v)} trackColor={{ true: theme.violet, false: theme.border }} thumbColor="#fff" accessibilityLabel="Safe search" />
      </View>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 4 }}>
        <PressableScale onPress={() => setDraft(DEFAULT_FILTERS)} accessibilityLabel="Reset filters" scaleTo={0.95} style={{ height: 48, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, justifyContent: "center" }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 15, color: theme.ink }}>Reset</Txt>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <GradientButton label="Show results" size="lg" full onPress={() => { onApply(draft); onClose(); }} style={{ height: 48 }} />
        </View>
      </View>
    </Sheet>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Txt style={{ fontFamily: font.heavy, fontSize: 14, color: theme.ink }}>{title}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{children}</View>
    </View>
  );
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: on }} hitSlop={6} scaleTo={0.95} style={{ height: 32, paddingHorizontal: 13, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1.5, borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.tint : theme.surface }}>
      <Txt style={{ fontFamily: on ? font.bold : font.semibold, fontSize: 12.5, color: on ? theme.accent : theme.ink }}>{label}</Txt>
    </PressableScale>
  );
}
