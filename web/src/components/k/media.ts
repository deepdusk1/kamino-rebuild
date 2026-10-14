/** Avatar data and picture addresses (plain helpers, no React). */

/** What any avatar needs. A picture is optional: without one we draw a colourful initial. */
export type AvatarPerson = {
  name: string;
  hue: number;
  /** Direct picture address. */
  src?: string | null;
  /** Or: a profile photo stored by Kamino (shown when `avatarV` is above 0). */
  userId?: string;
  avatarV?: number;
};

/** Picture address for a person, or null when they have no photo. */
export function avatarSrc(p: Pick<AvatarPerson, "src" | "userId" | "avatarV">): string | null {
  if (p.src) return p.src;
  if (p.userId && p.avatarV && p.avatarV > 0) {
    return `/api/v1/media/avatar/${encodeURIComponent(p.userId)}?v=${p.avatarV}`;
  }
  return null;
}
