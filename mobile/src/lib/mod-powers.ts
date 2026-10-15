/**
 * Which moderation buttons someone sees for another member (no React here, so it can be unit tested). This mirrors the
 * server's rules, so people aren't shown buttons that would only fail; the server still checks every action.
 *
 * Roles, highest first: agent (the owner), leader (co-leader), curator, member.
 */

const RANK: Record<string, number> = { member: 0, curator: 1, leader: 2, agent: 3 };
const rank = (role: string) => RANK[role] ?? 0;
const isLeader = (role: string) => role === "agent" || role === "leader";

export type ModerationPowers = {
  /** Timed mute (moderators, on people ranked below them). */
  mute: boolean;
  /** Strikes (three remove someone): leaders, on members and curators. */
  strike: boolean;
  /** Make / unmake curator: leaders, on members and curators. */
  curator: boolean;
  /** Remove (ban) from the community: leaders, on members and curators. */
  remove: boolean;
  /** Appoint or remove a co-leader: the owner only. */
  coLeader: boolean;
  /** Hand the community over: the owner, to a co-leader. */
  transfer: boolean;
};

export function moderationPowers(myRole: string, targetRole: string): ModerationPowers {
  const targetIsStaffBelowLeader = targetRole === "member" || targetRole === "curator";
  const leader = isLeader(myRole);
  return {
    mute: rank(myRole) >= 1 && rank(targetRole) < rank(myRole),
    strike: leader && targetIsStaffBelowLeader,
    curator: leader && targetIsStaffBelowLeader,
    remove: leader && targetIsStaffBelowLeader,
    coLeader: myRole === "agent" && targetRole !== "agent",
    transfer: myRole === "agent" && targetRole === "leader",
  };
}
