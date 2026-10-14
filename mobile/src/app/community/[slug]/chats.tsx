import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { api } from "@/api/endpoints";
import type { RoomKind } from "@/api/types";
import { Button, Card, Chip, EmptyState, ErrorState, Field, IconBubble, Loading, Sheet, Txt } from "@/components/ui";
import { useAction } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { space, useTheme } from "@/theme";
import { previewText } from "@/lib/stickers";
import { withCommunityTheme } from "@/components/CommunityTheme";

type NewKind = Extract<RoomKind, "public" | "voice" | "screening" | "private">;
const KINDS: { kind: NewKind; label: string }[] = [
  { kind: "public", label: "Chat" },
  { kind: "private", label: "Private" },
  { kind: "screening", label: "Watch party" },
  { kind: "voice", label: "Voice" },
];

function CommunityChats() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug!), enabled: !!slug });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NewKind>("public");

  const [create, creating] = useAction(async () => {
    if (name.trim().length < 2) throw new Error("Give the room a name.");
    const room = await api.createRoom(slug!, name.trim(), kind);
    setName("");
    setOpen(false);
    await queryClient.invalidateQueries();
    router.push(`/chat/${room.id}`);
  });

  if (page.isPending) return <Loading />;
  if (page.isError || !page.data) return <ErrorState error={page.error} onRetry={() => void page.refetch()} />;
  const active = page.data.member?.status === "active";

  return (
    <>
      <FlatList
        data={page.data.rooms}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
        refreshing={page.isRefetching}
        onRefresh={() => void page.refetch()}
        ListHeaderComponent={active ? <Button label="New room" small onPress={() => setOpen(true)} style={{ alignSelf: "flex-start", marginBottom: space.sm }} /> : null}
        renderItem={({ item, index }) => (
          <Card
            index={index}
            onPress={() => router.push(`/chat/${item.id}`)}
            accessibilityLabel={item.name}
            style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }}
          >
            <IconBubble size={42} colors={item.kind === "voice" ? theme.gradWarm : item.kind === "screening" ? theme.gradCool : theme.gradPrimary} icon={item.kind === "voice" ? "mic" : item.kind === "screening" ? "film" : item.kind === "private" ? "lock-closed" : "chatbubbles"} />
            <View style={{ flex: 1 }}>
              <Txt numberOfLines={1}>{item.name}</Txt>
              <Txt variant="small" tone="muted" numberOfLines={1}>{previewText(item.lastMessage ?? "") || "No messages yet"}</Txt>
            </View>
            <Txt variant="caption" tone="subtle">{timeAgo(item.lastAt)}</Txt>
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="No rooms yet" body="Start a room to chat with this community." />}
      />
      <Sheet visible={open} title="New room" onClose={() => setOpen(false)}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {KINDS.map((k) => <Chip key={k.kind} label={k.label} selected={kind === k.kind} onPress={() => setKind(k.kind)} />)}
        </View>
        {kind === "voice" ? <Txt variant="small" tone="muted">Voice rooms show who is in the room. Live audio is available on the website for now.</Txt> : null}
        <Field label="Name" value={name} onChangeText={setName} maxLength={60} />
        <Button label="Create room" onPress={() => void create()} busy={creating} />
      </Sheet>
    </>
  );
}

export default withCommunityTheme(CommunityChats);
