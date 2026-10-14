import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { api } from "@/api/endpoints";
import type { Post } from "@/api/types";
import { Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Sheet, Txt } from "@/components/ui";
import { useAction } from "@/lib/errors";
import { plainPreview, timeAgo } from "@/lib/format";
import { space } from "@/theme";
import { withCommunityTheme } from "@/components/CommunityTheme";

const STATUS_LABEL: Record<Post["wikiStatus"], string> = { draft: "Draft", pending: "Waiting for review", approved: "Approved", rejected: "Needs changes" };

/** The community library: approved wiki pages, filtered by category and searchable. */
function Wiki() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const wiki = useQuery({ queryKey: ["wiki", slug], queryFn: () => api.wiki(slug!), enabled: !!slug });
  const categories = useQuery({ queryKey: ["wikiCategories", slug], queryFn: () => api.wikiCategories(slug!), enabled: !!slug });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draftPaths, setDraftPaths] = useState("");

  const isLeader = !!wiki.data?.member && ["leader", "agent"].includes(wiki.data.member.role);

  const entries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (wiki.data?.entries ?? []).filter((p) => {
      const inCategory = !category || p.payload.category === category || (p.payload.category ?? "").startsWith(`${category}/`);
      const matches = !term || p.title.toLowerCase().includes(term) || p.body.toLowerCase().includes(term);
      return inCategory && matches;
    });
  }, [wiki.data, search, category]);

  // Show the top-level names first; picking one reveals its sub-categories.
  const visibleCategories = useMemo(() => {
    const all = categories.data ?? [];
    const prefix = category ? `${category}/` : "";
    const level = new Set<string>();
    for (const path of all) {
      if (!path.startsWith(prefix)) continue;
      const next = path.slice(prefix.length).split("/")[0];
      if (next) level.add(prefix + next);
    }
    return [...level];
  }, [categories.data, category]);

  const [saveCategories, saving] = useAction(async () => {
    const paths = draftPaths.split("\n").map((line) => line.trim().replace(/\s*[>›]\s*/g, "/")).filter(Boolean);
    await api.setWikiCategories(slug!, paths);
    await queryClient.invalidateQueries({ queryKey: ["wikiCategories", slug] });
    setEditOpen(false);
  });

  if (wiki.isPending) return <Loading />;
  if (wiki.isError || !wiki.data) return <ErrorState error={wiki.error} onRetry={() => void wiki.refetch()} />;
  if (wiki.data.locked) return <EmptyState icon="lock-closed-outline" title="Members only" body="Join this community to read its wiki." />;

  const parent = category?.includes("/") ? category.slice(0, category.lastIndexOf("/")) : null;

  return (
    <>
      <FlatList
        data={entries}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
        refreshing={wiki.isRefetching}
        onRefresh={() => void wiki.refetch()}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Field value={search} onChangeText={setSearch} placeholder="Search the wiki" autoCorrect={false} returnKeyType="search" />
            {category || visibleCategories.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {category ? <Chip label={`‹ ${parent ? parent.split("/").join(" › ") : "All"}`} onPress={() => setCategory(parent)} /> : null}
                {category ? <Chip label={category.split("/").join(" › ")} selected /> : null}
                {visibleCategories.map((path) => (
                  <Chip key={path} label={path.split("/").pop()!} onPress={() => setCategory(path)} />
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {wiki.data.member?.status === "active" ? <Button label="New wiki page" small onPress={() => router.push(`/community/${slug}/compose`)} /> : null}
              {isLeader ? (
                <Button label="Edit categories" small variant="secondary" onPress={() => { setDraftPaths((categories.data ?? []).join("\n")); setEditOpen(true); }} />
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/community/${slug}/post/${item.id}`)} accessibilityLabel={`Open wiki page ${item.title}`}>
            <Txt variant="heading">{item.title}</Txt>
            <Txt variant="small" tone="muted" numberOfLines={2}>{plainPreview(item.body)}</Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
              {item.payload.category ? <Chip label={item.payload.category.split("/").join(" › ")} /> : null}
              {item.wikiStatus !== "approved" ? <Chip label={STATUS_LABEL[item.wikiStatus]} tone={item.wikiStatus === "rejected" ? "danger" : "default"} /> : null}
              <Txt variant="caption" tone="subtle">{item.author.nickname} · {timeAgo(item.editedAt ?? item.createdAt)}</Txt>
            </View>
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon="book-outline" title="Nothing here yet" body={search || category ? "No pages match. Try a different search or category." : "Wiki pages that leaders approve appear here."} />}
      />

      <Sheet visible={editOpen} title="Wiki categories" onClose={() => setEditOpen(false)}>
        <Txt tone="muted">One category per line. Use a slash for sub-categories, for example: Lore/Places</Txt>
        <Field value={draftPaths} onChangeText={setDraftPaths} multiline autoCapitalize="none" autoCorrect={false} placeholder={"Lore\nLore/Places\nGuides"} style={{ minHeight: 160 }} />
        <Button label="Save categories" onPress={() => void saveCategories()} busy={saving} />
      </Sheet>
    </>
  );
}

export default withCommunityTheme(Wiki);
