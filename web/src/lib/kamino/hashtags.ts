export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[a-zA-Z][a-zA-Z0-9_]{1,23}/g) ?? [];
  const out: string[] = [];
  for (const raw of matches) {
    const tag = raw.slice(1).toLowerCase();
    if (!out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 8);
}

export function isOnline(lastSeenAt: string | null | undefined, showOnline: boolean): boolean {
  if (!showOnline || !lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 5 * 60 * 1000;
}
