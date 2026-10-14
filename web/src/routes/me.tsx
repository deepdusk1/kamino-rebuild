import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useShellData } from "@/components/k";
import { ProfilePage } from "@/components/profile/profile-page";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/me")({ component: Me });

/** Your own profile: the same page as /u/<your handle>, without a back button. */
function Me() {
  const { user, isPending, profile } = useShellData();
  if (!isPending && !user) return <RedirectToSignIn />;
  if (!profile?.handle) {
    return (
      <AppShell>
        <div className="space-y-3 px-4 pt-2" aria-busy="true" aria-label="Opening your profile">
          <div className="h-[150px] animate-pulse rounded-t-[22px] bg-surface-alt lg:h-[260px]" />
          <div className="h-6 w-48 animate-pulse rounded-full bg-surface-alt" />
        </div>
      </AppShell>
    );
  }
  return <ProfilePage handle={profile.handle} inTabs />;
}
