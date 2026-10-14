import { createFileRoute } from "@tanstack/react-router";
import { getProfileStoryMedia } from "@/lib/kamino/profile-stories";
import { captionsToVtt, safeFilename } from "@/lib/kamino/content-rules";

async function handle({ request, params }: { request: Request; params: { storyId: string } }) {
  const storyId = Number(params.storyId);
  if (!Number.isSafeInteger(storyId) || storyId < 1)
    return new Response("Invalid attachment", { status: 400 });
  try {
    const media = await getProfileStoryMedia({ data: { storyId,track:new URL(request.url).searchParams.has("music")?"music":undefined } });
    // Caption requests share the exact same access check as the underlying attachment.
    if (new URL(request.url).searchParams.has("captions"))
      return new Response(captionsToVtt(media.captions), {
        headers: {
          "content-type": "text/vtt; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    const match = /^data:([a-z]+\/[a-z0-9.+-]+)(?:;[a-z0-9=.,-]+)*;base64,(.+)$/is.exec(
      media.dataUrl,
    );
    if (!match) return new Response("Attachment unavailable", { status: 404 });
    const bytes = Buffer.from(match[2]!, "base64"),
      headers: Record<string, string> = {
        "content-type": media.mime,
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-disposition": `${media.kind === "file" ? "attachment" : "inline"}; filename="${safeFilename(media.filename)}"`,
      };
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range) {
      let start = range[1] ? Number(range[1]) : 0,
        end = range[2] ? Number(range[2]) : bytes.length - 1;
      if (!range[1] && range[2]) {
        start = Math.max(bytes.length - Number(range[2]), 0);
        end = bytes.length - 1;
      }
      end = Math.min(end, bytes.length - 1);
      if (start > end || start >= bytes.length)
        return new Response(null, {
          status: 416,
          headers: { ...headers, "content-range": `bytes */${bytes.length}` },
        });
      const part = bytes.subarray(start, end + 1);
      return new Response(part, {
        status: 206,
        headers: {
          ...headers,
          "content-range": `bytes ${start}-${end}/${bytes.length}`,
          "content-length": String(part.length),
        },
      });
    }
    return new Response(bytes, { headers: { ...headers, "content-length": String(bytes.length) } });
  } catch {
    return new Response("Attachment unavailable", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }
}
export const Route = createFileRoute("/api/v1/profile-story-media/$storyId")({
  server: { handlers: { GET: handle } },
});
