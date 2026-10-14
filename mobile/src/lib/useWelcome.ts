import { useQuery } from "@tanstack/react-query";
import { router, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { api } from "@/api/endpoints";
import { readSecret, writeSecret } from "@/auth/storage";

const key = (userId: string) => `kamino.onboarding-shown.${userId}`;

/** Remembers on this phone that onboarding was shown to this person (so they are only sent there once). */
export async function markOnboardingShown(userId: string): Promise<void> {
  await writeSecret(key(userId), "1");
}

// Also remembered for this app session, so a slow phone storage write can't cause a second redirect.
const shownThisSession = new Set<string>();

/**
 * Call once from the root layout. A signed-in person who has not finished onboarding
 * (`profile.onboardedAt` is null) is sent to the onboarding screen once. Skipping or closing it is fine:
 * they won't be sent again on this phone, and finishing it sets `onboardedAt` on the server.
 */
export function useOnboardingRedirect(signedIn: boolean) {
  const navReady = !!useRootNavigationState()?.key;
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap, enabled: signedIn });
  const profile = signedIn ? boot.data?.profile : null;
  const userId = profile?.userId;
  const needsOnboarding = !!profile && !profile.onboardedAt;

  useEffect(() => {
    if (!navReady || !userId || !needsOnboarding || shownThisSession.has(userId)) return;
    let cancelled = false;
    readSecret(key(userId)).then((shown) => {
      if (cancelled || shown || shownThisSession.has(userId)) return;
      shownThisSession.add(userId);
      void markOnboardingShown(userId);
      router.replace("/onboarding");
    });
    return () => {
      cancelled = true;
    };
  }, [navReady, userId, needsOnboarding]);
}
