/**
 * How a community's Join button behaves (no React or network code here, so it can be unit tested).
 *
 * Only open public communities can be joined with one tap from a list. Private communities, leader-approval ones
 * (they may ask join questions) and invite-only ones open the community page, where the join sheet asks for answers
 * or an invite code.
 */

export type JoinView = {
  visibility: string;
  /** Missing on data from an older server: treated as "open". */
  joinPolicy?: string;
  joined: boolean;
  pending?: boolean;
};

/** One tap joins straight away (open, not private, not already in or waiting). */
export function canQuickJoin(c: JoinView): boolean {
  return !c.joined && !c.pending && c.visibility !== "private" && (c.joinPolicy ?? "open") === "open";
}

/** Joining sends a request that leaders answer (instead of letting you straight in). */
export function joinNeedsApproval(c: Pick<JoinView, "visibility" | "joinPolicy">): boolean {
  return c.visibility === "private" || c.joinPolicy === "approval";
}

/** The words on the button. */
export function joinButtonLabel(c: JoinView): string {
  if (c.joined) return "Joined";
  if (c.pending) return "Requested";
  if (c.joinPolicy === "invite") return "Invite only";
  if (joinNeedsApproval(c)) return "Ask to join";
  return "Join";
}
