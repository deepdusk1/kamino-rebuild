import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { applyLiveKitWebhook } from "@/lib/kamino/calls.server";
import { liveKitClients, liveKitConfig, readLiveKitWebhook } from "@/lib/kamino/livekit.server";

/**
 * POST /api/livekit-webhook — LiveKit tells Kamino when people join or leave a call.
 *
 * This is how the server finds out that a phone dropped out of a call without hanging up (switched off, lost
 * signal, app killed): their "in the call" mark is cleared and, for a 1:1 call, the call ends for the other person.
 * Set the webhook address in the LiveKit dashboard (Settings > Webhooks) to https://<your server>/api/livekit-webhook,
 * signed with the same API key Kamino uses. Requests without a valid LiveKit signature are refused.
 */
export const Route = createFileRoute("/api/livekit-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const config = liveKitConfig();
        if (!config) return new Response("LiveKit is not configured", { status: 404 });
        const body = await request.text();
        const event = await readLiveKitWebhook(config, body, request.headers.get("authorization"));
        if (!event) return new Response("Invalid signature", { status: 401 });
        const { rooms } = liveKitClients(config);
        const sql = await getSql();
        const result = await applyLiveKitWebhook(sql, event, (room, identity) =>
          rooms.getParticipant(room, identity).then(
            () => true,
            () => false,
          ),
        );
        return Response.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
