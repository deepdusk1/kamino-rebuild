import { useQuery } from "@tanstack/react-query";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMe } from "@/lib/kamino/server";

/** One of my communities, as the Create screen and the "start a room" / "new event" sheets need it. */
export type MyCommunity = {
  slug: string;
  name: string;
  icon: string;
  cover: string;
  hue: number;
  memberCount: number;
  /** My role there: "leader" / "agent" can schedule events. */
  role: string;
};

/** Leaders (and the site's helpers) may schedule events. */
export function canLeadRole(role: string): boolean {
  return role === "leader" || role === "agent";
}

/** The communities I have joined (shares the `["me"]` cache with other screens). */
export function useMyCommunities() {
  const { user } = useCurrentUserState();
  const query = useQuery({ queryKey: ["me"], queryFn: () => getMe(), enabled: !!user });
  const list: MyCommunity[] = (query.data?.joined ?? []).map((j) => ({
    slug: j.community.id,
    name: j.community.name,
    icon: j.community.icon,
    cover: j.community.cover,
    hue: j.community.hue,
    memberCount: j.community.memberCount,
    role: j.role,
  }));
  return { list, query };
}
