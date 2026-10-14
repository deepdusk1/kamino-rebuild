import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import { GradientButton, Pill } from "@/components/k";
import { Field, Sheet, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { space } from "@/theme";
import { CommunityChoice, useMyCommunities } from "./communities";

/** Labels people can pick for a live room (shown on its card, e.g. "Music"). */
export const ROOM_TOPICS = ["Just Chatting", "Music", "Gaming", "Art", "Anime", "Study", "K-Pop", "Writing"] as const;

type Props = { visible: boolean; onClose: () => void; /** Community to start with (e.g. the one chosen on Create). */ initialSlug?: string | null };

/**
 * "Start a Room": pick one of your communities, give the room a name and a topic, and go live. It opens the new
 * voice room straight away (join the call from there).
 */
export function StartRoomSheet({ visible, onClose, initialSlug }: Props) {
  const queryClient = useQueryClient();
  const { list } = useMyCommunities();
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState<string>(ROOM_TOPICS[0]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Each time the sheet opens, start from the community the screen suggests (React's "adjust state while rendering").
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSlug(initialSlug ?? null);
      setProblem(null);
    }
  }
  const chosen = list.find((c) => c.slug === slug) ?? list[0] ?? null;

  const start = async () => {
    if (!chosen) return setProblem("Join a community first, then start a room there.");
    if (name.trim().length < 2) return setProblem("Give your room a name.");
    setBusy(true);
    setProblem(null);
    try {
      const created = await api.startLiveRoom(chosen.slug, name.trim(), topic);
      void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["liveRooms"] });
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setName("");
      onClose();
      router.push(`/chat/${created.roomId}`);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="Start a Room" onClose={onClose}>
      <Txt variant="small" tone="muted">A live voice room in one of your communities. Members get a heads-up, and anyone can hop in.</Txt>
      {list.length ? (
        <View style={{ gap: space.sm }}>
          <Txt variant="caption" tone="muted">Community</Txt>
          <CommunityChoice communities={list} value={chosen?.slug ?? null} onChange={setSlug} />
        </View>
      ) : (
        <Txt tone="muted">You haven’t joined a community yet. Join one from the Communities tab, then come back.</Txt>
      )}
      <Field label="Room name" value={name} onChangeText={setName} maxLength={40} placeholder="Late Night Vibes" />
      <View style={{ gap: space.sm }}>
        <Txt variant="caption" tone="muted">Topic</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {ROOM_TOPICS.map((t) => (
            <Pill key={t} label={t} size="md" tone={t === topic ? "violet" : "neutral"} variant={t === topic ? "solid" : "tint"} onPress={() => setTopic(t)} accessibilityLabel={`Topic ${t}${t === topic ? ", chosen" : ""}`} />
          ))}
        </View>
      </View>
      {problem ? <Txt variant="small" tone="danger">{problem}</Txt> : null}
      <GradientButton label="Go live" icon="radio" size="lg" full busy={busy} disabled={!list.length} onPress={() => void start()} />
    </Sheet>
  );
}
