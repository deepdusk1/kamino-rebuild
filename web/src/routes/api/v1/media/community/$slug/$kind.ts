/**
 * A community's own banner or icon as a normal image: GET /api/v1/media/community/<slug>/cover?v=<version>
 * (or `/icon`). Public, like profile photos. The `v` number changes with every upload, so the picture can be
 * cached for a long time and still update the moment a leader picks a new one.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getCommunityMedia } from "@/lib/kamino/server";

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/is;

async function handle({ params }: { params: { slug: string; kind: string } }) {
  if (params.kind !== "cover" && params.kind !== "icon") return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  let dataUrl: string | null = null;
  try {
    dataUrl = ((await getCommunityMedia({ data: { slug: params.slug, kind: params.kind } })) as { dataUrl: string | null }).dataUrl;
  } catch {
    dataUrl = null;
  }
  const match = dataUrl ? DATA_URL.exec(dataUrl) : null;
  if (!match) return new Response("No picture", { status: 404, headers: { "content-type": "text/plain" } });
  return new Response(Buffer.from(match[2]!, "base64"), {
    status: 200,
    headers: { "content-type": match[1]!.toLowerCase(), "cache-control": "public, max-age=31536000, immutable" },
  });
}

export const Route = createFileRoute("/api/v1/media/community/$slug/$kind")({
  server: { handlers: { GET: handle } },
});
