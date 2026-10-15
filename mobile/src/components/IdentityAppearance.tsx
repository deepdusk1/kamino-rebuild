import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { api } from "@/api/endpoints";
import { useSession } from "@/auth/session";
import { loadColorScheme } from "@/lib/appearance";
import { identityApi } from "@/lib/identity-v9";
import { deviceTimeZone, timeZoneToSave } from "@/lib/settings-rules";
import { AppearanceProvider } from "@/theme";

/**
 * App-wide display settings: light / dark (saved on this phone), text size and high contrast (saved on the account),
 * and keeping the account's time zone in step with the phone so quiet hours happen at the right local time.
 */
export function IdentityAppearance({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const signedIn = status === "signedIn";
  const query = useQuery({ queryKey: ["identityDashboard"], queryFn: identityApi.dashboard, enabled: signedIn, retry: false });
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap, enabled: signedIn, retry: false });
  const synced = useRef<string | null>(null);

  useEffect(() => {
    void loadColorScheme();
  }, []);

  const savedZone = boot.data?.profile?.timezone;
  useEffect(() => {
    if (!signedIn || savedZone === undefined) return;
    const zone = timeZoneToSave(savedZone, deviceTimeZone());
    // Once per zone per app run: a phone that travels updates the account the next time the app opens.
    if (!zone || synced.current === zone) return;
    synced.current = zone;
    api.updateSettings({ timezone: zone }).catch(() => {
      synced.current = null;
    });
  }, [signedIn, savedZone]);

  const p = signedIn ? query.data?.preferences : undefined;
  return <AppearanceProvider value={{ highContrast: p?.highContrast ?? false, textScale: p?.textScale ?? "standard" }}>{children}</AppearanceProvider>;
}
