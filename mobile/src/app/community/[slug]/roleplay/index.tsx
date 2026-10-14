import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { api } from "@/api/endpoints";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Screen, Sheet, Txt } from "@/components/ui";
import { useAction } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { tellIfHeld } from "@/lib/held";
import { space, useTheme } from "@/theme";

type CharacterDraft = { name: string; description: string };

/** A community's role-play stories, and a sheet to start one (by hand, or set up by the AI storyteller). */
function Stories() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const scenes = useQuery({ queryKey: ["scenes", slug], queryFn: () => api.scenes(slug!), enabled: !!slug });
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus });
  const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug!), enabled: !!slug });
  const isMember = page.data?.member?.status === "active";

  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [characters, setCharacters] = useState<CharacterDraft[]>([{ name: "", description: "" }]);
  const [opening, setOpening] = useState("");
  const [playAs, setPlayAs] = useState("");

  const [draft, drafting] = useAction(async () => {
    const d = await api.draftScene(slug!, idea, source);
    setTitle(d.title);
    setPremise(d.premise);
    setCharacters(d.characters);
    setOpening(d.opening);
    setPlayAs(d.characters[0]?.name ?? "");
  });

  const named = characters.filter((c) => c.name.trim());
  const [create, creating] = useAction(async () => {
    const res = await api.createScene({ slug: slug!, title, source, premise, characters: named, opening: opening || undefined, playAs: playAs || undefined });
    tellIfHeld(res);
    if (res.aiError) Alert.alert("Storyteller", res.aiError);
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["scenes", slug] });
    router.push(`/community/${slug}/roleplay/${res.id}`);
  });

  if (scenes.isPending) return <Loading />;
  if (scenes.isError) return <ErrorState error={scenes.error} onRetry={() => void scenes.refetch()} />;

  return (
    <Screen refreshing={scenes.isRefetching} onRefresh={() => void scenes.refetch()}>
      <Txt tone="muted">
        Play characters from the stories and films you love, and change how they end.{" "}
        {ai.data?.storyteller ? "The AI storyteller narrates the rest." : "The AI storyteller is not set up on this server, so members narrate."}
      </Txt>
      {isMember ? <Button label="Start a new story" onPress={() => setOpen(true)} /> : null}

      {(scenes.data ?? []).map((s) => (
        <Card key={s.id} onPress={() => router.push(`/community/${slug}/roleplay/${s.id}`)} accessibilityLabel={`Open story ${s.title}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Txt variant="heading" numberOfLines={1} style={{ flex: 1 }}>{s.title}</Txt>
            <Chip label={s.status === "open" ? "Open" : "Ended"} tone={s.status === "open" ? "ok" : "default"} />
          </View>
          {s.source ? <Txt variant="caption" tone="subtle">Inspired by {s.source}</Txt> : null}
          <Txt tone="muted" numberOfLines={3}>{s.premise}</Txt>
          <Txt variant="caption" tone="subtle">
            {s.castCount} playing · {s.turnCount} turns{s.endingCount ? ` · ${s.endingCount} endings` : ""} · {timeAgo(s.updatedAt)}
          </Txt>
        </Card>
      ))}
      {!(scenes.data ?? []).length ? (
        <EmptyState icon="sparkles-outline" title="No stories yet" body={isMember ? "Start the first one!" : "Join the community to start one."} />
      ) : null}

      <Sheet visible={open} title="New story" onClose={() => setOpen(false)}>
        {ai.data?.storyteller ? (
          <Card>
            <Txt variant="heading">Let the storyteller set it up</Txt>
            <Field label="Inspired by (optional)" value={source} onChangeText={setSource} maxLength={80} placeholder="A book, film, game…" />
            <Field label="Your idea" value={idea} onChangeText={setIdea} maxLength={400} multiline placeholder="e.g. the ship never sinks and everyone reaches New York" />
            <Button label={drafting ? "Setting it up…" : "Set it up for me"} small busy={drafting} disabled={idea.trim().length < 5} onPress={() => void draft()} />
          </Card>
        ) : null}
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} />
        {!ai.data?.storyteller ? <Field label="Inspired by (optional)" value={source} onChangeText={setSource} maxLength={80} /> : null}
        <Field label="What happens, and what is different" value={premise} onChangeText={setPremise} maxLength={1500} multiline />
        <Txt variant="label" tone="subtle">Characters people can play</Txt>
        {characters.map((c, i) => (
          <View key={i} style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
            <View style={{ flex: 2 }}>
              <Field value={c.name} maxLength={40} placeholder="Name" onChangeText={(name) => setCharacters((all) => all.map((x, n) => (n === i ? { ...x, name } : x)))} />
            </View>
            <View style={{ flex: 3 }}>
              <Field value={c.description} maxLength={200} placeholder="Who they are" onChangeText={(description) => setCharacters((all) => all.map((x, n) => (n === i ? { ...x, description } : x)))} />
            </View>
            {characters.length > 1 ? (
              <Pressable onPress={() => setCharacters((all) => all.filter((_, n) => n !== i))} accessibilityRole="button" accessibilityLabel={`Remove character ${i + 1}`} hitSlop={10} style={{ paddingTop: 12 }}>
                <Ionicons name="trash-outline" size={20} color={theme.danger} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {characters.length < 8 ? <Button label="Add a character" small variant="ghost" onPress={() => setCharacters((all) => [...all, { name: "", description: "" }])} /> : null}
        {named.length ? (
          <View style={{ gap: space.sm }}>
            <Txt variant="label" tone="subtle">I’ll play</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {named.map((c) => <Chip key={c.name} label={c.name} selected={playAs === c.name} onPress={() => setPlayAs(playAs === c.name ? "" : c.name)} />)}
            </View>
          </View>
        ) : null}
        {opening ? <Txt tone="muted" style={{ fontStyle: "italic" }}>{opening}</Txt> : null}
        <Button label="Start the story" busy={creating} disabled={title.trim().length < 3 || premise.trim().length < 10 || !named.length} onPress={() => void create()} />
      </Sheet>
    </Screen>
  );
}

export default withCommunityTheme(Stories);
