/**
 * GIF search through Tenor or Giphy, whichever is configured, and a server-side importer that
 * turns a chosen GIF into stored media (same bucket/database path as every other upload).
 *
 * Dormant until a provider key is set: `KAMINO_TENOR_KEY` or `KAMINO_GIPHY_KEY`. The importer
 * only accepts URLs returned by the configured provider and enforces the same size cap as
 * uploads, so it cannot be abused as a general web proxy.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

type GifItem = { id: string; url: string; preview: string; description: string; source: "tenor" | "giphy" };

export function gifProvider(): { provider: "tenor" | "giphy"; key: string } | null {
  const tenor = process.env.KAMINO_TENOR_KEY?.trim();
  if (tenor) return { provider: "tenor", key: tenor };
  const giphy = process.env.KAMINO_GIPHY_KEY?.trim();
  if (giphy) return { provider: "giphy", key: giphy };
  return null;
}

const TENOR_HOSTS = ["media.tenor.com", "c.tenor.com"];
const GIPHY_HOSTS = ["media.giphy.com", "media3.giphy.com", "media2.giphy.com", "media1.giphy.com", "media0.giphy.com"];

export const searchGifs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ query: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const provider = gifProvider();
    if (!provider) return { items: [] as GifItem[], configured: false };
    const query = encodeURIComponent(data.query);
    let items: GifItem[] = [];
    if (provider.provider === "tenor") {
      const response = await fetch(
        `https://tenor.googleapis.com/v2/search?key=${encodeURIComponent(provider.key)}&q=${query}&limit=20&media_filter=gif,tinygif&client_key=kamino`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error("The GIF provider did not answer. Try again shortly.");
      const body = (await response.json()) as {
        results?: { id: string; content_description?: string; media_formats?: Record<string, { url?: string }> }[];
      };
      items = (body.results ?? [])
        .map((result) => ({
          id: String(result.id),
          url: String(result.media_formats?.gif?.url ?? ""),
          preview: String(result.media_formats?.tinygif?.url ?? result.media_formats?.gif?.url ?? ""),
          description: String(result.content_description ?? "GIF"),
          source: "tenor" as const,
        }))
        .filter((item) => item.url.startsWith("https://"));
    } else {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(provider.key)}&q=${query}&limit=20&rating=pg-13`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error("The GIF provider did not answer. Try again shortly.");
      const body = (await response.json()) as {
        data?: { id: string; title?: string; images?: Record<string, { url?: string }> }[];
      };
      items = (body.data ?? [])
        .map((result) => ({
          id: String(result.id),
          url: String(result.images?.original?.url ?? ""),
          preview: String(result.images?.preview_gif?.url ?? result.images?.fixed_width?.url ?? ""),
          description: String(result.title ?? "GIF"),
          source: "giphy" as const,
        }))
        .filter((item) => item.url.startsWith("https://"));
    }
    return { items, configured: true };
  });

const GIF_MAX_BYTES = 12_000_000;

/** Fetches the chosen GIF and returns it as a data URL for the normal upload path. */
export const importGif = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ url: z.string().url().max(600) }))
  .handler(async ({ data }) => {
    const provider = gifProvider();
    if (!provider) throw new Error("GIF search is not configured on this server.");
    const host = new URL(data.url).hostname.toLowerCase();
    const allowed = provider.provider === "tenor" ? TENOR_HOSTS : GIPHY_HOSTS;
    if (!allowed.includes(host)) throw new Error("That GIF did not come from the search provider.");
    const response = await fetch(data.url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("The GIF could not be fetched. Pick another one.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > GIF_MAX_BYTES) throw new Error("That GIF is too large — pick a smaller one.");
    const mime = response.headers.get("content-type")?.toLowerCase() ?? "image/gif";
    if (!mime.includes("gif")) throw new Error("That link is not a GIF.");
    return { dataUrl: `data:image/gif;base64,${bytes.toString("base64")}` };
  });
