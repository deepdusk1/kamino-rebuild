import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Linking, Pressable, View } from "react-native";
import { api } from "@/api/endpoints";
import { Button, Card, EmptyState, ErrorState, Field, Loading, Sheet, Txt } from "@/components/ui";
import { showError, useAction } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { childFolders, normalizeFolder } from "@/lib/folders";
import { space, useTheme } from "@/theme";
import { withCommunityTheme } from "@/components/CommunityTheme";

/** Shared links and notes for the community (guides, references, folders). */
function Files() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const files = useQuery({ queryKey: ["shared", slug], queryFn: () => api.shared(slug!), enabled: !!slug });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [folder, setFolder] = useState("");
  const [level, setLevel] = useState("");
  /** The folder being looked at, such as "Guides/Maps". "" is the top level. */
  const [here, setHere] = useState("");

  const [add, adding] = useAction(async () => {
    if (title.trim().length < 2) throw new Error("Give it a title.");
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) throw new Error("Links must start with http:// or https://");
    const minLevel = Number(level);
    await api.addShared({
      slug: slug!, title: title.trim(), url: url.trim() || undefined, note: note.trim() || undefined,
      folder: normalizeFolder(folder) || undefined, minLevel: isLead && minLevel > 1 ? minLevel : undefined,
    });
    setTitle(""); setUrl(""); setNote(""); setLevel("");
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["shared", slug] });
  });

  const remove = (id: number) =>
    Alert.alert("Remove this item?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          api.deleteShared(slug!, id).then(() => queryClient.invalidateQueries({ queryKey: ["shared", slug] }), showError);
        },
      },
    ]);

  const all = files.data?.items;
  const shown = useMemo(() => (all ?? []).filter((item) => item.folder === here), [all, here]);
  const subfolders = useMemo(() => childFolders((all ?? []).map((item) => item.folder), here), [all, here]);

  if (files.isPending) return <Loading />;
  if (files.isError || !files.data) return <ErrorState error={files.error} onRetry={() => void files.refetch()} />;
  const canAdd = files.data.member?.status === "active";
  const isMod = !!files.data.member && ["leader", "agent", "curator"].includes(files.data.member.role);
  const isLead = !!files.data.member && ["leader", "agent"].includes(files.data.member.role);
  const crumbs = here ? here.split("/") : [];

  return (
    <>
      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
        refreshing={files.isRefetching}
        onRefresh={() => void files.refetch()}
        ListHeaderComponent={
          <View style={{ gap: space.sm }}>
            {canAdd ? <Button label="Share a link or note" small onPress={() => { setFolder(here); setOpen(true); }} style={{ alignSelf: "flex-start" }} /> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
              <Pressable onPress={() => setHere("")} accessibilityRole="button" accessibilityLabel="All files"><Txt variant="label" tone={here ? "accent" : "default"}>All files</Txt></Pressable>
              {crumbs.map((name, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                  <Ionicons name="chevron-forward" size={12} color={theme.subtle} />
                  <Pressable onPress={() => setHere(crumbs.slice(0, i + 1).join("/"))} accessibilityRole="button"><Txt variant="label" tone={i < crumbs.length - 1 ? "accent" : "default"}>{name}</Txt></Pressable>
                </View>
              ))}
            </View>
            {subfolders.map((f) => (
              <Card key={f.folder} onPress={() => setHere(f.folder)} accessibilityLabel={`Open folder ${f.name}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Ionicons name="folder-outline" size={20} color={theme.accent} />
                  <Txt variant="heading" style={{ flex: 1 }} numberOfLines={1}>{f.name}</Txt>
                  <Txt variant="caption" tone="muted">{f.count}</Txt>
                </View>
              </Card>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Ionicons name={item.locked ? "lock-closed-outline" : item.url ? "link-outline" : "document-text-outline"} size={20} color={theme.accent} />
              <Txt variant="heading" style={{ flex: 1 }} numberOfLines={2}>{item.title}</Txt>
              {isMod ? (
                <Pressable onPress={() => remove(item.id)} accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={theme.danger} />
                </Pressable>
              ) : null}
            </View>
            {item.locked ? <Txt tone="muted">Opens at level {item.minLevel}. Keep taking part to get there.</Txt> : null}
            {item.note ? <Txt tone="muted">{item.note}</Txt> : null}
            {item.url ? <Button label="Open link" small variant="secondary" onPress={() => void Linking.openURL(item.url)} style={{ alignSelf: "flex-start" }} /> : null}
            <Txt variant="caption" tone="subtle">{timeAgo(item.createdAt)}{item.minLevel > 1 && !item.locked ? ` · level ${item.minLevel}+` : ""}</Txt>
          </Card>
        )}
        ListEmptyComponent={subfolders.length ? null : <EmptyState icon="folder-open-outline" title="Nothing here yet" body="Guides, references and links from members show up here." />}
      />
      <Sheet visible={open} title="Share with the community" onClose={() => setOpen(false)}>
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Link (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
        <Field label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={1000} />
        <Field label="Folder (optional)" value={folder} onChangeText={setFolder} maxLength={120} placeholder="e.g. Guides/Maps" />
        {isLead ? <Field label="Level needed to open it (optional)" value={level} onChangeText={(text) => setLevel(text.replace(/[^0-9]/g, ""))} keyboardType="number-pad" maxLength={2} hint="Leave empty for everyone." /> : null}
        <Button label="Share" onPress={() => void add()} busy={adding} />
      </Sheet>
    </>
  );
}

export default withCommunityTheme(Files);
