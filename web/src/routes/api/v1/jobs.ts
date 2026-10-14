import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { runNotificationJobs } from "@/lib/kamino/jobs.server";
export const Route = createFileRoute("/api/v1/jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.KAMINO_JOB_SECRET?.trim();
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
        if (
          !secret ||
          Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
        )
          return new Response("Unauthorized", { status: 401 });
        const result = await runNotificationJobs();
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
