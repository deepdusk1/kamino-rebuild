import { authHeaders, getAuthToken, imageSource, postImageUrl } from "@/api/client";
import type { Post } from "@/api/types";
import type { Src } from "@/components/k";

/**
 * Picture sources for posts and communities. Pictures on Kamino's server may need the sign-in token (private
 * communities), so they go through `imageSource` / `authHeaders`, which only ever send it to Kamino's own server.
 *
 * Each source is made once and then reused (a small cache): the image component reloads a picture whenever it gets
 * a *new* source object, so making a fresh one on every screen update would download the same picture again and again.
 */
type Source = { uri: string; headers?: Record<string, string> };
const cache = new Map<string, Source>();

function remember(key: string, make: () => Source): Source {
  const full = `${getAuthToken() ?? ""}|${key}`;
  let hit = cache.get(full);
  if (!hit) {
    if (cache.size > 600) cache.clear();
    hit = make();
    cache.set(full, hit);
  }
  return hit;
}

/** A server path or web address → an image source (or null for none). */
export function serverImage(path: string | null | undefined): Src {
  if (!path) return null;
  // Pictures sent inline (data: addresses) are long; they are cached by their length and ends.
  const key = path.startsWith("data:") ? `data:${path.length}:${path.slice(-40)}` : path;
  return remember(key, () => imageSource(path));
}

/** Every picture of a post: the cover first, then the album pictures (`albumCount` more). */
export function postPictures(post: Pick<Post, "id" | "cover" | "payload">): Source[] {
  const album = Array.from({ length: post.payload.albumCount ?? 0 }, (_, i) =>
    remember(`post:${post.id}:${i + 1}`, () => ({ uri: postImageUrl(post.id, i + 1), headers: authHeaders() })),
  );
  const cover = post.cover ? (serverImage(post.cover) as Source) : null;
  return cover ? [cover, ...album] : album;
}
