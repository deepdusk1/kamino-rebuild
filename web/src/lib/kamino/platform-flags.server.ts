import type { Sql } from "@/lib/db";
import { evaluatePlatformFlag } from "./platform-flag-rules";
import { consumeExperiment } from "./operations-v10.server";

export async function platformFlagActive(
  sql: Sql,
  userId: string,
  key: string,
  defaultEnabled = true,
): Promise<boolean> {
  const row = (await sql`select enabled,rollout_percent from platform_flags where key=${key}`)[0];
  const enabled = row
    ? evaluatePlatformFlag(userId, key, row.enabled === true, Number(row.rollout_percent))
    : defaultEnabled;
  return consumeExperiment(sql, userId, key, enabled);
}
