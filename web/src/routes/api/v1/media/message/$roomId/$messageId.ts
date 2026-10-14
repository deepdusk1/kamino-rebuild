/**
 * Streams a chat attachment as a normal file: GET /api/v1/media/message/<room>/<message>
 * with `Authorization: Bearer <token>`.
 *
 * Phones need this instead of the JSON data-URL call because native video players
 * ask for byte ranges (to seek and to start playing before the download ends), and
 * images are cached much better when they come from a real URL. Access rules are
 * exactly those of `getMessageMedia`: we call it, so membership, blocks and deletion
 * are all enforced in one place.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getMessageMedia } from "@/lib/kamino/server";

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+)(?:;[a-z0-9=.,-]+)*;base64,(.+)$/is;

function plain(status: number, message: string): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function handle({ request, params }: { request: Request; params: { roomId: string; messageId: string } }) {
  const roomId = Number(params.roomId);
  const messageId = Number(params.messageId);
  if (!Number.isInteger(roomId) || !Number.isInteger(messageId)) return plain(400, "Bad id");

  let media: { kind: string; dataUrl: string };
  try {
    media = (await getMessageMedia({ data: { roomId, messageId } })) as { kind: string; dataUrl: string };
  } catch (error) {
    const status = (error as { status?: number }).status === 401 ? 401 : 404;
    return plain(status, status === 401 ? "Sign in first" : "Attachment unavailable");
  }
  const match = DATA_URL.exec(media.dataUrl);
  if (!match) return plain(404, "Attachment unavailable");
  const type = match[1]!.toLowerCase();
  const bytes = Buffer.from(match[2]!, "base64");

  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    // Private (per-member) content: phones may cache it, shared proxies must not.
    "cache-control": "private, max-age=86400",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range) {
    let start = range[1] ? Number(range[1]) : 0;
    let end = range[2] ? Number(range[2]) : bytes.length - 1;
    if (!range[1] && range[2]) {
      // "bytes=-N" means the last N bytes.
      start = Math.max(bytes.length - Number(range[2]), 0);
      end = bytes.length - 1;
    }
    end = Math.min(end, bytes.length - 1);
    if (start > end || start >= bytes.length)
      return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${bytes.length}` } });
    const slice = bytes.subarray(start, end + 1);
    return new Response(slice, {
      status: 206,
      headers: { ...headers, "content-length": String(slice.length), "content-range": `bytes ${start}-${end}/${bytes.length}` },
    });
  }
  return new Response(bytes, { status: 200, headers: { ...headers, "content-length": String(bytes.length) } });
}

export const Route = createFileRoute("/api/v1/media/message/$roomId/$messageId")({
  server: { handlers: { GET: handle } },
});
