const SCAM =
  /\b(discord\.gg|bit\.ly|tinyurl|t\.me\/join|free\s*nitro|crypto\s*giveaway|whatsapp\s*group|onlyfans\.com\/c|gift[\s-]*card\s*pin)\b/i;

const MINOR_SEXUAL =
  /\b(cp|child\s*porn|underage\s*(nudes?|sex)|loli\s*nsfw)\b/i;

const TITLE_BLOCK =
  /\b(sex|nudes?|porn|nsfw|xxx|slut|rape|onlyfans)\b/i;

export function scanText(text: string): string | null {
  const t = text.trim();
  if (!t) return "Write something first.";
  if (t.length > 8000) return "That’s too long.";
  if (MINOR_SEXUAL.test(t)) return "That content is not allowed on Kamino.";
  if (SCAM.test(t)) return "That looks like a scam or off-platform invite. Kamino blocks those.";
  return null;
}

export function scanTitle(label: string): string | null {
  const t = label.trim();
  if (t.length < 2) return "Title needs at least 2 characters.";
  if (t.length > 28) return "Keep titles under 28 characters.";
  if (MINOR_SEXUAL.test(t) || TITLE_BLOCK.test(t)) return "That title isn’t allowed. Keep it about the hall, not sexual content.";
  if (SCAM.test(t)) return "That looks like a scam.";
  return null;
}

export function canModerate(role: string | null | undefined): boolean {
  return role === "agent" || role === "leader" || role === "curator";
}

export function canLead(role: string | null | undefined): boolean {
  return role === "agent" || role === "leader";
}
