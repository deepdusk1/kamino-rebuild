/**
 * A person's profile photo as a normal image address: GET /api/v1/media/avatar/<userId>?v=<version>
 * Public (profile pages are public). The `v` number changes on every upload, so the picture can be
 * cached for a long time and still update the moment someone picks a new one.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAvatarData } from "@/lib/kamino/extras";

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/is;

async function handle({ params }: { params: { userId: string } }) {
  const { dataUrl } = (await getAvatarData({ data: params.userId })) as { dataUrl: string | null };
  const match = dataUrl ? DATA_URL.exec(dataUrl) : null;
  if (!match) return new Response("No photo", { status: 404, headers: { "content-type": "text/plain" } });
  return new Response(Buffer.from(match[2]!, "base64"), {
    status: 200,
    headers: { "content-type": match[1]!.toLowerCase(), "cache-control": "public, max-age=31536000, immutable" },
  });
}

export const Route = createFileRoute("/api/v1/media/avatar/$userId")({
  server: { handlers: { GET: handle } },
});
