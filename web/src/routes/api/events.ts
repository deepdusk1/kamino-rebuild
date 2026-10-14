import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { subscribeEvents, type ServerEvent } from "@/lib/kamino/events.server";

/**
 * GET /api/events — Server-Sent Events stream of real-time app events for the
 * signed-in user (new messages, typing, read receipts, voice-room changes,
 * incoming calls). The browser invalidates its query caches on each event
 * instead of polling every few seconds.
 *
 * Events are filtered per connection: room events only reach members of that
 * room, call events only reach the intended recipient.
 */
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response("sign in required", { status: 401 });
        const userId = session.user.id;
        const sql = await getSql();

        const stream = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            const send = (chunk: string) => {
              try {
                controller.enqueue(enc.encode(chunk));
              } catch {
                /* connection closed */
              }
            };
            // Per-connection room-access cache: typing events arrive every
            // few seconds per typer, so avoid a DB hit for each one.
            const access = new Map<number, boolean>();
            async function canSeeRoom(roomId: number): Promise<boolean> {
              const hit = access.get(roomId);
              if (hit !== undefined) return hit;
              const rows = await sql`select 1 from chat_members
                where room_id = ${roomId} and user_id = ${userId} and room_removed = false limit 1`;
              const ok = rows.length > 0;
              access.set(roomId, ok);
              return ok;
            }
            const push = async (event: ServerEvent) => {
              let visible = false;
              try {
                visible =
                  event.type === "call" || event.type === "call-declined"
                    ? event.toUserId === userId
                    : await canSeeRoom(event.roomId);
              } catch {
                visible = false;
              }
              if (visible) send(`data: ${JSON.stringify(event)}\n\n`);
            };

            send(": connected\n\n");
            const keepalive = setInterval(() => send(": ping\n\n"), 25_000);
            const off = subscribeEvents((event) => {
              void push(event);
            });
            request.signal.addEventListener("abort", () => {
              clearInterval(keepalive);
              off();
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            });
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
