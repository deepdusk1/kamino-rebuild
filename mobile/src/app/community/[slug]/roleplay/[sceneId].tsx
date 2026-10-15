import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Switch, View } from "react-native";
import { api } from "@/api/endpoints";
import type { RoleplayTurn } from "@/api/types";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { StoryVote } from "@/components/community/StoryVote";
import { Avatar, Button, Card, Chip, ErrorState, Field, Loading, Screen, Txt } from "@/components/ui";
import { useAction } from "@/lib/errors";
import { tellIfHeld } from "@/lib/held";
import { radius, space, useTheme } from "@/theme";

/** One role-play story: the cast, the story so far, and (for its players) the turn box and storyteller buttons. */
function Scene() {
  const theme = useTheme();
  const { sceneId } = useLocalSearchParams<{ slug: string; sceneId: string }>();
  const id = Number(sceneId);
  const q = useQuery({ queryKey: ["scene", id], queryFn: () => api.scene(id), enabled: Number.isFinite(id), refetchInterval: 5000 });
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const [text, setText] = useState("");
  const [narrate, setNarrate] = useState(true);
  const [nudge, setNudge] = useState("");
  const [ending, setEnding] = useState("");
  const [custom, setCustom] = useState("");

  const [join, joining] = useAction(async (character: string) => {
    await api.joinScene(id, character);
    setCustom("");
    await q.refetch();
  });
  const [play, playing] = useAction(async () => {
    const res = await api.addTurn(id, text, narrate);
    tellIfHeld(res);
    if (res.aiError) Alert.alert("Storyteller", res.aiError);
    setText("");
    await q.refetch();
  });
  const [next, continuing] = useAction(async () => {
    await api.continueScene(id, nudge || undefined);
    setNudge("");
    await q.refetch();
  });
  const [writeEnding, endingBusy] = useAction(async () => {
    await api.writeEnding(id, ending);
    setEnding("");
    await q.refetch();
  });
  const [leave] = useAction(async () => {
    await api.leaveScene(id);
    await q.refetch();
  });
  const [end] = useAction(async () => {
    await api.endScene(id);
    await q.refetch();
  });
  const [remove] = useAction(async () => {
    await api.deleteScene(id);
    router.back();
  });
  const [rewind] = useAction(
    async (turnId: number) => {
      const res = await api.rewindStory(id, turnId);
      Alert.alert("Story rewound", `${res.hidden} later part${res.hidden === 1 ? " was" : "s were"} hidden. The story continues from here.`);
      await q.refetch();
    },
    { errorTitle: "Couldn't rewind" },
  );
  const askRewind = (turnId: number) =>
    Alert.alert("Rewind to here?", "Everything after this point is hidden for everyone and the story continues from here.", [
      { text: "Cancel", style: "cancel" },
      { text: "Rewind", style: "destructive", onPress: () => void rewind(turnId) },
    ]);

  if (q.isPending) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data;
  const storyteller = Boolean(ai.data?.storyteller);
  const myId = me.data?.profile.userId;
  const isOpen = s.status === "open";
  const busy = playing || continuing || endingBusy || joining;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Stack.Screen options={{ title: s.title }} />
      {s.source ? <Txt variant="caption" tone="subtle">Inspired by {s.source}</Txt> : null}
      <Txt tone="muted">{s.premise}</Txt>
      {!isOpen ? <Chip label="This story has ended" /> : null}

      <Txt variant="label" tone="subtle">Characters</Txt>
      <View style={{ gap: space.sm }}>
        {s.characters.map((c) => {
          const mine = c.playedBy?.userId === myId;
          return (
            <Card key={c.name}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="heading">{c.name}</Txt>
                  {c.description ? <Txt variant="caption" tone="muted">{c.description}</Txt> : null}
                  <Txt variant="caption" tone="subtle">
                    {c.playedBy ? `Played by ${mine ? "you" : c.playedBy.name}` : storyteller ? "Voiced by the storyteller" : "Free to play"}
                  </Txt>
                </View>
                {!c.playedBy && s.canPlay && !s.myCharacter ? <Button label="Play" small disabled={busy} onPress={() => void join(c.name)} /> : null}
              </View>
            </Card>
          );
        })}
      </View>
      {s.canPlay && !s.myCharacter ? (
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Field label="Or add your own character" value={custom} onChangeText={setCustom} maxLength={40} />
          </View>
          <Button label="Join" small variant="secondary" disabled={busy || custom.trim().length < 2} onPress={() => void join(custom)} />
        </View>
      ) : null}

      <Txt variant="label" tone="subtle">The story so far</Txt>
      {s.turns.map((t, i) => (
        <TurnView key={t.id} turn={t} onRewind={s.canManage && isOpen && i < s.turns.length - 1 ? () => askRewind(t.id) : undefined} />
      ))}
      {!s.turns.length ? <Txt tone="muted">Nothing has happened yet.</Txt> : null}

      {/* Voting on the next direction sits right under the story, where everyone reads it. */}
      {isOpen && storyteller ? <StoryVote sceneId={id} onStoryChanged={() => void q.refetch()} /> : null}

      {isOpen && s.myCharacter ? (
        <Card>
          <Field label={`What does ${s.myCharacter} say or do?`} value={text} onChangeText={setText} maxLength={1200} multiline style={{ minHeight: 90 }} />
          {storyteller ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt variant="small" tone="muted" style={{ flex: 1 }}>The storyteller continues after my turn</Txt>
              <Switch value={narrate} onValueChange={setNarrate} accessibilityLabel="The storyteller continues after my turn" trackColor={{ true: theme.accent, false: theme.border }} thumbColor="#ffffff" />
            </View>
          ) : null}
          <Button label={playing && narrate && storyteller ? "The storyteller is writing…" : "Play my turn"} busy={playing} disabled={!text.trim() || busy} onPress={() => void play()} />
          <Button label={`Stop playing ${s.myCharacter}`} small variant="ghost" onPress={() => void leave()} />
        </Card>
      ) : null}

      {isOpen && storyteller && (s.myCharacter || s.canManage) ? (
        <>
          <Card>
            <Txt variant="heading">Or suggest your own twist</Txt>
            <Field value={nudge} onChangeText={setNudge} maxLength={200} placeholder="Optional twist, e.g. a storm hits" />
            <Button label="Continue the story" small variant="secondary" busy={continuing} disabled={busy} onPress={() => void next()} />
          </Card>
          <Card>
            <Txt variant="heading">Change the ending</Txt>
            <Field value={ending} onChangeText={setEnding} maxLength={300} placeholder="How should it end?" />
            <Button label="Write this ending" small variant="secondary" busy={endingBusy} disabled={busy || ending.trim().length < 5} onPress={() => void writeEnding()} />
          </Card>
          {ai.data ? <Txt variant="caption" tone="subtle">The free storyteller has {ai.data.repliesLeft} replies left today for everyone.</Txt> : null}
        </>
      ) : null}

      {s.canManage ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {isOpen ? <Button label="End the story" small variant="secondary" onPress={() => void end()} /> : null}
          <Button
            label="Delete"
            small
            variant="ghost"
            onPress={() =>
              Alert.alert("Delete this story?", "It is removed for everyone.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => void remove() },
              ])
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}

function TurnView({ turn, onRewind }: { turn: RoleplayTurn; onRewind?: () => void }) {
  const theme = useTheme();
  const rewindLink = onRewind ? (
    <Pressable onPress={onRewind} accessibilityRole="button" accessibilityLabel="Rewind the story to here" hitSlop={8} style={{ alignSelf: "flex-start", minHeight: 28, justifyContent: "center" }}>
      <Txt variant="caption" tone="accent">↺ Rewind to here</Txt>
    </Pressable>
  ) : null;
  if (turn.kind === "ending") {
    return (
      <View style={{ borderWidth: 2, borderColor: theme.accent, borderRadius: radius.lg, padding: space.md, gap: space.xs }}>
        <Txt variant="label" tone="accent">An alternate ending</Txt>
        <Txt>{turn.body}</Txt>
        {rewindLink}
      </View>
    );
  }
  if (turn.kind === "narration" || !turn.author) {
    return (
      <View style={{ backgroundColor: theme.tint, borderRadius: radius.lg, padding: space.md, gap: space.xs }}>
        <Txt variant="caption" tone="subtle">Storyteller</Txt>
        <Txt style={{ fontStyle: "italic" }}>{turn.body}</Txt>
        {rewindLink}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <Avatar name={turn.author.name} hue={turn.author.hue} size={36} userId={turn.author.userId} version={turn.author.avatarV} />
      <Card style={{ flex: 1 }}>
        <Txt><Txt variant="heading">{turn.character}</Txt>  <Txt variant="caption" tone="subtle">played by {turn.author.name}</Txt></Txt>
        <Txt>{turn.body}</Txt>
        {rewindLink}
      </Card>
    </View>
  );
}

export default withCommunityTheme(Scene);
