import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import type { HallEvent } from "@/api/types";
import { GradientButton, JoinButton, Pill } from "@/components/k";
import { Button, PressableScale, Sheet, Txt } from "@/components/ui";
import { confirmAction } from "@/components/community/platform";
import { useAction } from "@/lib/errors";
import { font, radius, space, useTheme } from "@/theme";

const MEDAL: Record<number, string> = { 1: "🥇 1st", 2: "🥈 2nd", 3: "🥉 3rd" };

/** Entries, entering, and (for leaders) picking the winners, shown inside a challenge card. */
export function ChallengePanel({ slug, event, isMember, isLeader }: { slug: string; event: HallEvent; isMember: boolean; isLeader: boolean }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [showEntries, setShowEntries] = useState(false);
  const [entering, setEntering] = useState(false);
  const [places, setPlaces] = useState<Record<number, 1 | 2 | 3 | undefined>>({});

  const open = event.phase === "open";
  const status = { upcoming: "Not started yet", open: "Open for entries", closed: "Entries closed", judged: "Winners picked" }[event.phase];

  const entries = useQuery({ queryKey: ["challenge-entries", event.id], queryFn: () => api.challengeEntries(event.id), enabled: showEntries });
  const myPosts = useQuery({ queryKey: ["my-posts", slug], queryFn: () => api.myPostsIn(slug), enabled: entering });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["challenge-entries", event.id] });
    await queryClient.invalidateQueries({ queryKey: ["events", slug] });
  };

  const [enter, sending] = useAction(async (postId: number) => {
    await api.enterChallenge(event.id, postId);
    setEntering(false);
    setShowEntries(true);
    await refresh();
  });

  const [announce, announcing] = useAction(async () => {
    const winners = Object.entries(places)
      .filter(([, place]) => place)
      .map(([postId, place]) => ({ postId: Number(postId), place: place! }));
    await api.judgeChallenge(event.id, winners);
    await refresh();
  });

  // Works on phones and in the browser (where system alerts don't exist).
  const confirmAnnounce = async () => {
    if (await confirmAction("Announce these winners?", "This can only be done once.", "Announce")) void announce();
  };

  const cyclePlace = (postId: number) =>
    setPlaces((cur) => {
      const used = new Set(Object.entries(cur).filter(([id, place]) => place && Number(id) !== postId).map(([, place]) => place));
      const order: (1 | 2 | 3 | undefined)[] = [undefined, 1, 2, 3];
      let next = order[(order.indexOf(cur[postId]) + 1) % order.length];
      while (next && used.has(next)) next = order[(order.indexOf(next) + 1) % order.length]; // skip places already given
      return { ...cur, [postId]: next };
    });

  return (
    <View style={{ gap: space.sm, paddingTop: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Pill label={`${event.entryCount} ${event.entryCount === 1 ? "entry" : "entries"}`} icon="images-outline" tone="violet" />
          <Pill label={status} tone={open ? "green" : event.phase === "judged" ? "orange" : "neutral"} />
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          {event.entryCount > 0 ? <JoinButton label={showEntries ? "Hide entries" : "See entries"} color={theme.blue} size="md" onPress={() => setShowEntries(!showEntries)} /> : null}
          {open && isMember ? <GradientButton label={event.myEntryPostId ? "Change entry" : "Enter"} icon="trophy" size="sm" onPress={() => setEntering(true)} /> : null}
        </View>
      </View>

      {showEntries && entries.data ? (
        <View style={{ gap: space.xs }}>
          {entries.data.entries.map((entry) => (
            <View key={entry.postId} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: theme.surfaceAlt, borderRadius: radius.tile, padding: 10 }}>
              <PressableScale onPress={() => router.push(`/community/${slug}/post/${entry.postId}`)} accessibilityLabel={`Open entry ${entry.title}`} scaleTo={0.98} style={{ flex: 1 }}>
                <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, color: theme.ink }}>{entry.placement ? `${MEDAL[entry.placement]} · ` : ""}{entry.title}</Txt>
                <Txt variant="caption" tone="subtle">by {entry.author.nickname} · ♥ {entry.likeCount}</Txt>
              </PressableScale>
              {isLeader && !event.judged ? (
                <Pill label={places[entry.postId] ? MEDAL[places[entry.postId]!]! : "Place"} tone={places[entry.postId] ? "orange" : "neutral"} variant={places[entry.postId] ? "solid" : "tint"} onPress={() => cyclePlace(entry.postId)} accessibilityLabel={`Choose a place for ${entry.title}`} />
              ) : null}
            </View>
          ))}
          {isLeader && !event.judged ? (
            <GradientButton label="Announce winners" icon="trophy" size="sm" onPress={() => void confirmAnnounce()} busy={announcing} disabled={!Object.values(places).some(Boolean)} style={{ marginTop: space.xs }} />
          ) : null}
        </View>
      ) : null}

      <Sheet visible={entering} title="Enter with one of your posts" onClose={() => setEntering(false)}>
        {myPosts.isPending ? <Txt tone="muted">Loading your posts…</Txt> : null}
        {myPosts.data?.length === 0 ? <Txt tone="muted">You have no posts in this community yet. Write one, then come back to enter it.</Txt> : null}
        {myPosts.data?.map((post) => (
          <Button key={post.id} label={post.title} variant={post.id === event.myEntryPostId ? "primary" : "secondary"} busy={sending} onPress={() => void enter(post.id)} />
        ))}
      </Sheet>
    </View>
  );
}
