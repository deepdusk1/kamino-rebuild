import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import { rpc } from "@/api/client";
import { Txt } from "@/components/ui";
import { notify } from "@/components/community/platform";
import { useTheme } from "@/theme";
import type { MediaInput } from "@/lib/content-v9";

type GifItem = { id: string; url: string; preview: string; description: string; source: string };

/**
 * GIF search over the configured provider (Tenor or Giphy), mirroring the website's picker.
 * Selecting a result imports it through the server, so it is stored exactly like an upload.
 * Renders nothing (the caller hides it) when no provider key is configured.
 */
export function GifSearch({ onSelect }: { onSelect: (media: MediaInput) => void }) {
  const [query, setQuery] = useState("");
  const search = useQuery({
    queryKey: ["gifSearch", query],
    queryFn: () => rpc<{ items: GifItem[]; configured: boolean }>("searchGifs", { query }),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
  const importGif = useMutation({
    mutationFn: async (url: string) => {
      const result = await rpc<{ dataUrl: string }>("importGif", { url });
      onSelect({ kind: "gif", filename: "gif.gif", dataUrl: result.dataUrl, altText: "", captions: "" });
    },
    onError: (error) => notify("Could not add that GIF", errorMessageSafe(error)),
  });
  if (search.data && search.data.configured === false) return null;
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="small">Search GIFs</Txt>
      <SearchField value={query} onChange={setQuery} />
      {search.isPending ? <Txt tone="muted">Searching…</Txt> : null}
      {search.error ? <Txt tone="danger">{errorMessageSafe(search.error)}</Txt> : null}
      {(search.data?.items.length ?? 0) > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {search.data!.items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => importGif.mutate(item.url)}
              disabled={importGif.isPending}
              accessibilityRole="button"
              accessibilityLabel={item.description || "Choose GIF"}
              style={{ width: 96, height: 96, borderRadius: 12, overflow: "hidden", opacity: importGif.isPending ? 0.5 : 1 }}
            >
              <Image source={{ uri: item.preview }} style={{ width: "100%", height: "100%" }} />
            </Pressable>
          ))}
        </View>
      ) : query.trim().length >= 2 ? (
        <Txt tone="muted">No GIFs found for that.</Txt>
      ) : null}
    </View>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="Search GIFs…"
      placeholderTextColor={theme.muted}
      maxLength={80}
      autoCapitalize="none"
      accessibilityLabel="Search GIFs"
      style={{
        height: 44,
        borderRadius: 22,
        paddingHorizontal: 16,
        backgroundColor: theme.surfaceAlt ?? theme.surface,
        color: theme.text,
      }}
    />
  );
}

function errorMessageSafe(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}