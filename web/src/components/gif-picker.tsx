import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { searchGifs, importGif } from "@/lib/kamino/gifs";
import type { Media } from "@/routes/content-studio";

/**
 * GIF search over the configured provider (Tenor or Giphy — see `gifs.server.ts`). Picking a
 * result imports it through the server so it lands in the same storage as every upload.
 * Hidden entirely when no provider key is configured.
 */
export function GifPicker({ onSelect }: { onSelect: (media: Media) => void }) {
  const [query, setQuery] = useState("");
  const search = useQuery({
    queryKey: ["gifSearch", query],
    queryFn: () => searchGifs({ data: { query } }),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
  const import_ = useMutation({
    mutationFn: (url: string) => importGif({ data: { url } }),
    onSuccess: (result) =>
      onSelect({ kind: "gif", dataUrl: result.dataUrl, filename: "gif.gif", altText: "", captions: "" }),
  });
  const configured = search.data?.configured ?? true;

  if (!configured)
    return (
      <p className="text-xs text-muted">
        GIF search needs a provider key on this server (Tenor or Giphy). You can still upload a GIF file.
      </p>
    );

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search GIFs…"
        aria-label="Search GIFs"
        maxLength={80}
        className="k-focus h-10 w-full rounded-full bg-surface-alt px-4 text-sm text-ink outline-none"
      />
      {search.isPending ? (
        <p role="status" className="text-xs text-muted">
          Searching…
        </p>
      ) : search.error ? (
        <p role="alert" className="text-xs text-warn">
          {search.error instanceof Error ? search.error.message : "Search failed."}
        </p>
      ) : (search.data?.items.length ?? 0) > 0 ? (
        <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto k-scroll sm:grid-cols-4">
          {search.data?.items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={import_.isPending}
              onClick={() => import_.mutate(item.url)}
              aria-label={item.description || "Choose GIF"}
              className="k-focus overflow-hidden rounded-tile bg-surface-alt disabled:opacity-50"
            >
              <img src={item.preview} alt={item.description} className="h-24 w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : query.trim().length >= 2 ? (
        <p className="text-xs text-muted">No GIFs found for that.</p>
      ) : null}
    </div>
  );
}
