/** Stable account assignment keeps the same member in the same rollout cohort. */
export function platformFlagBucket(userId: string, key: string): number {
  let hash = 2166136261;
  for (const char of `${userId}:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100;
}

export function evaluatePlatformFlag(
  userId: string,
  key: string,
  enabled: boolean,
  percent: number,
): boolean {
  if (!enabled || !Number.isFinite(percent)) return false;
  return platformFlagBucket(userId, key) < Math.min(100, Math.max(0, Math.floor(percent)));
}
