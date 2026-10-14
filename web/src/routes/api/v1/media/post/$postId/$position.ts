/**
 * Serves one extra picture of an image post as a normal image file:
 * GET /api/v1/media/post/<post>/<position>  (position 0 is the cover, 1 and up the album).
 *
 * Access rules are those of reading the post itself; we call `getPostImage`, so private
 * communities, hidden posts and blocks are enforced in one place. Works with the website's
 * cookie or the phone's `Authorization: Bearer` token.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getPostImage } from "@/lib/kamino/library";

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is;

function plain(status: number, message: string): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function handle({ params }: { params: { postId: string; position: string } }) {
  const postId = Number(params.postId);
  const position = Number(params.position);
  if (!Number.isInteger(postId) || !Number.isInteger(position) || position < 0) return plain(400, "Bad id");
  let dataUrl: string;
  try {
    dataUrl = ((await getPostImage({ data: { postId, position } })) as { dataUrl: string }).dataUrl;
  } catch {
    return plain(404, "Picture unavailable");
  }
  const match = DATA_URL.exec(dataUrl);
  if (!match) return plain(404, "Picture unavailable");
  const bytes = Buffer.from(match[2]!, "base64");
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": match[1]!.toLowerCase(),
      "content-length": String(bytes.length),
      // Members-only content may be cached by the phone or browser, never by a shared proxy.
      "cache-control": "private, max-age=86400",
    },
  });
}

export const Route = createFileRoute("/api/v1/media/post/$postId/$position")({
  server: { handlers: { GET: handle } },
});
