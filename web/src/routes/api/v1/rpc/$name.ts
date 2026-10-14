/**
 * Mobile RPC bridge.
 *
 * The web app talks to the backend through TanStack "server functions", whose wire
 * format is private to the web client. Native apps cannot use it, so this route
 * exposes the very same functions as plain JSON:
 *
 *   POST /api/v1/rpc/<functionName>      body: { "data": { ...arguments } }
 *   Authorization: Bearer <session token>   (optional for public reads)
 *
 * Every call goes through the same middleware, validation and permission checks
 * as the web app because we invoke the real server function — nothing is
 * re-implemented here. Only functions listed by `mobileApi` can be called.
 */
import { createFileRoute } from "@tanstack/react-router";
import { mobileApi } from "@/lib/kamino/mobile-api";

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Turn any thrown value into a stable `{ error: { message, status } }` payload. */
function failure(err: unknown): Response {
  const status =
    typeof (err as { status?: unknown })?.status === "number"
      ? ((err as { status: number }).status)
      : 400;
  const message = err instanceof Error ? err.message : "Request failed";
  return json({ error: { message, status } }, status);
}

async function handle({ request, params }: { request: Request; params: { name: string } }) {
  const fn = mobileApi[params.name];
  if (!fn) return json({ error: { message: `Unknown function "${params.name}"`, status: 404 } }, 404);
  if (request.method === "GET" && fn.method !== "GET") {
    return json({ error: { message: "This action requires POST.", status: 405 } }, 405);
  }

  let data: unknown = undefined;
  try {
    if (request.method === "POST") {
      const text = await request.text();
      if (text) data = (JSON.parse(text) as { data?: unknown }).data;
    } else {
      const raw = new URL(request.url).searchParams.get("data");
      if (raw) data = JSON.parse(raw);
    }
  } catch {
    return json({ error: { message: "Body must be valid JSON", status: 400 } }, 400);
  }

  try {
    const result = await fn({ data });
    // `undefined` results (void mutations) are returned as null so clients can always parse JSON.
    return json({ result: result ?? null });
  } catch (err) {
    return failure(err);
  }
}

export const Route = createFileRoute("/api/v1/rpc/$name")({
  server: { handlers: { GET: handle, POST: handle } },
});
