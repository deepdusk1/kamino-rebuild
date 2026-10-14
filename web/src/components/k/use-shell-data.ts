import { useQuery } from "@tanstack/react-query";
import { useEffect,useState } from 'react';
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootstrap, listRooms } from "@/lib/kamino/server";

/**
 * What the app header and bottom nav need about the signed-in viewer: their profile
 * (avatar, handle), unread notifications and unread chats.
 *
 * `bootstrap` also creates the profile on first visit and refreshes achievements, so it runs
 * once per page view (cached for 30 s) like it did in the old shell.
 * Query keys start with "shell" so pages can refresh them after marking things read:
 *   queryClient.invalidateQueries({ queryKey: ["shell"] })
 */
export function useShellData() {
  const session = useCurrentUserState();
  // Better Auth may already have a client session when SSR has no hook snapshot.
  // Keep the header's first browser render identical to SSR, then show the member.
  const [hydrated,setHydrated]=useState(false);
  useEffect(()=>setHydrated(true),[]);
  const user=hydrated?session.user:null,isPending=!hydrated||session.isPending;
  const boot = useQuery({
    queryKey: ["shell", "bootstrap", user?.id ?? null],
    queryFn: () => bootstrap(),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const rooms = useQuery({
    queryKey: ["shell", "rooms", user?.id ?? null],
    queryFn: () => listRooms(),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadChats = (rooms.data ?? []).reduce((n, r) => n + (r.muted ? 0 : r.unread || 0), 0);
  const profile = boot.data?.profile ?? null;
  return {
    user,
    isPending,
    profile,
    /** Unread notifications (bell dot). */
    unreadNotifications: boot.data?.unread ?? 0,
    /** Unread chat messages, muted chats left out (Chats dot). */
    unreadChats,
    /** Where "Profile" goes: own page when the handle is known, otherwise /me (which redirects). */
    profileHref: profile?.handle ? `/u/${encodeURIComponent(profile.handle)}` : "/me",
    /** True when the 18+ birthday check is still missing. */
    needsAge: profile ? !profile.minAgeConfirmed : false,
    refetchBootstrap: boot.refetch,
  };
}
