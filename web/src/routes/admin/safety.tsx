import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { SafetyQueue } from "@/components/safety-queue";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSafetyRole } from "@/lib/kamino/ai-features";

export const Route = createFileRoute("/admin/safety")({ component: SiteSafety });

/** The site owner's view: serious items from every community, plus profile walls and direct messages. */
function SiteSafety() {
  const { user, isPending } = useCurrentUserState();
  const role = useQuery({
    queryKey: ["safety-role"],
    queryFn: () => getSafetyRole(),
    enabled: !!user,
  });
  if (isPending)
    return (
      <AppShell title="Site safety">
        <div className="h-24" />
      </AppShell>
    );
  if (!user) return <RedirectToSignIn />;
  return (
    <AppShell title="Site safety">
      <div className="space-y-4 px-4 py-5">
        {role.data?.siteAdmin ? <a href="/admin/reports" className="text-sm font-semibold text-accent">Review reports from members</a> : null}
        {role.data && !role.data.siteAdmin ? (
          <p className="text-sm text-muted">
            This page is for the site owner. Add your sign-in email to{" "}
            <code>KAMINO_ADMIN_EMAILS</code> on the server to use it.
          </p>
        ) : role.data?.siteAdmin ? (
          <SafetyQueue />
        ) : role.isError ? <p role="alert" className="text-sm text-danger">{role.error.message}</p> : <p className="text-sm text-muted">Checking access…</p>}
      </div>
    </AppShell>
  );
}
