import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";
import { isSiteAdmin } from "./safety.server";

export const getPlatformAnalytics = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db();
    if (!(await isSiteAdmin(sql, context.userId)))
      throw new Error("Verified platform administrator access required.");
    const { collectPlatformAnalytics } = await import("./platform-analytics.server");
    return collectPlatformAnalytics(sql);
  });
