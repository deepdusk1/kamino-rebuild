import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { router } from "expo-router";
import { Alert, Pressable, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/api/endpoints";
import { apiBaseUrl } from '@/api/config';
import type { Moderation } from "@/api/models";
import { COMMUNITY_MODULES, type CommunityModule } from "@/api/types";
import { Button, Card, Chip, Field, Txt } from "@/components/ui";
import { showError, useAction } from "@/lib/errors";
import { space, useTheme } from "@/theme";

type Props = { slug: string; data: Moderation; onChanged: () => void };

const MODULE_LABEL: Record<CommunityModule, string> = { chats: "Chats", wiki: "Wiki", files: "Files", events: "Events", rank: "Rank", members: "Members", roleplay: "Stories" };

/** Community-wide tools: broadcast, invite links, join questions, news feeds and which tabs are shown. */
export function ToolsTab({ slug, data, onChanged }: Props) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const isLeader = data.role === "leader" || data.role === "agent";
  const feeds = useQuery({ queryKey: ["feeds", slug], queryFn: () => api.feeds(slug) });

  const [broadcast, setBroadcast] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [questions, setQuestions] = useState(data.joinQuestions.map((q) => q.prompt));
  const [modules, setModules] = useState<CommunityModule[]>(data.communityModules as CommunityModule[]);

  const [send, sending] = useAction(async () => {
    if (broadcast.trim().length < 3) throw new Error("Write a message first.");
    await api.broadcast(slug, broadcast.trim());
    setBroadcast("");
    await queryClient.invalidateQueries({ queryKey: ["community", slug] });
    Alert.alert("Broadcast sent", "Members see it at the top of the community page.");
  });

  const [invite, inviting] = useAction(async () => {
    const { code } = await api.createInvite(slug);
    onChanged();
    await Share.share({ message: `Join me on Kamino: ${apiBaseUrl()}/invite/${code}` });
  });

  const [addFeed, addingFeed] = useAction(async () => {
    const result = await api.addFeed(slug, feedUrl.trim());
    setFeedUrl("");
    await feeds.refetch();
    Alert.alert("Feed added", result.title);
  });

  const [saveQuestions, savingQuestions] = useAction(async () => {
    await api.setJoinQuestions(slug, questions.map((q) => q.trim()).filter(Boolean));
    onChanged();
    Alert.alert("Join questions saved");
  });

  const [saveModules, savingModules] = useAction(async () => {
    if (!modules.length) throw new Error("Keep at least one section turned on.");
    await api.setModules(slug, modules);
    await queryClient.invalidateQueries({ queryKey: ["community", slug] });
    Alert.alert("Sections updated");
  });

  const removeFeed = async (id: number) => {
    try {
      await api.removeFeed(slug, id);
      await feeds.refetch();
    } catch (error) {
      showError(error);
    }
  };

  const toggleModule = (m: CommunityModule) => setModules((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  return (
    <View style={{ gap: space.md }}>
      <Card><Txt variant="heading">Community space</Txt><Txt tone="muted">FAQs, boards, quests, permissions, member roles and analytics.</Txt><Button label="Open community tools" variant="secondary" onPress={()=>router.push(`/community/${slug}/tools`)}/></Card>
      {isLeader ? (
        <Card>
          <Txt variant="heading">Community look</Txt>
          <Txt variant="small" tone="muted">Name, words, colour, banner and icon. All free.</Txt>
          <Button label="Change how it looks" small variant="secondary" onPress={() => router.push(`/community/${slug}/look`)} />
        </Card>
      ) : null}
      <Card>
        <Txt variant="heading">Broadcast</Txt>
        <Txt variant="small" tone="muted">One short message pinned to the top of the community page. It does not send a push notification.</Txt>
        <Field value={broadcast} onChangeText={setBroadcast} multiline maxLength={300} placeholder="Write a message for everyone" />
        <Button label="Post broadcast" small onPress={() => void send()} busy={sending} />
      </Card>

      <Card>
        <Txt variant="heading">Invite links</Txt>
        {data.invites.map((i) => (
          <Txt key={i.code} variant="small" tone="muted">{i.code} · used {i.uses}{i.maxUses ? `/${i.maxUses}` : ""}</Txt>
        ))}
        <Button label="Create and share a link" small variant="secondary" onPress={() => void invite()} busy={inviting} />
      </Card>

      {isLeader ? (
        <Card>
          <Txt variant="heading">Join questions</Txt>
          <Txt variant="small" tone="muted">People answer these when asking to join.</Txt>
          {questions.map((q, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ flex: 1 }}><Field value={q} onChangeText={(text) => setQuestions((cur) => cur.map((x, j) => (j === i ? text : x)))} maxLength={200} placeholder={`Question ${i + 1}`} /></View>
              <Pressable onPress={() => setQuestions((cur) => cur.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove question ${i + 1}`} hitSlop={10}>
                <Ionicons name="close-circle" size={24} color={theme.subtle} />
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {questions.length < 5 ? <Button label="Add question" small variant="secondary" onPress={() => setQuestions((cur) => [...cur, ""])} /> : null}
            <Button label="Save" small onPress={() => void saveQuestions()} busy={savingQuestions} />
          </View>
        </Card>
      ) : null}

      <Card>
        <Txt variant="heading">News feeds</Txt>
        {(feeds.data ?? []).map((f) => (
          <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>{f.title || f.url}</Txt>
            <Pressable onPress={() => void removeFeed(f.id)} accessibilityRole="button" accessibilityLabel={`Remove feed ${f.title || f.url}`} hitSlop={10}>
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            </Pressable>
          </View>
        ))}
        <Field value={feedUrl} onChangeText={setFeedUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://example.com/feed.xml" hint="Only secure (https) feeds are accepted." />
        <Button label="Add feed" small variant="secondary" onPress={() => void addFeed()} busy={addingFeed} />
      </Card>

      {isLeader ? (
        <Card>
          <Txt variant="heading">Sections</Txt>
          <Txt variant="small" tone="muted">Choose which tabs members see.</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {COMMUNITY_MODULES.map((m) => <Chip key={m} label={MODULE_LABEL[m]} selected={modules.includes(m)} onPress={() => toggleModule(m)} />)}
          </View>
          <Button label="Save sections" small onPress={() => void saveModules()} busy={savingModules} />
        </Card>
      ) : null}
    </View>
  );
}
