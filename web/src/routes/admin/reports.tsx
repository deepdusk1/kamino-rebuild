import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ScreenTitle } from "@/components/k";
import { SiteReports } from "@/components/site-reports";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getSafetyRole } from "@/lib/kamino/ai-features";

export const Route = createFileRoute("/admin/reports")({ component: SiteReportsPage });

function SiteReportsPage() {
  const { user, isPending } = useCurrentUserState();
  const role = useQuery({ queryKey: ["safetyRole"], queryFn: () => getSafetyRole(), enabled: !!user });
  if (!isPending && !user) return <RedirectToSignIn />;
  return <AppShell><div className="mx-auto max-w-[900px] space-y-4 px-4 py-5">
    <ScreenTitle title="Site reports" subtitle="Review reports from members across Kamino." />
    <a href="/admin/safety" className="text-sm font-semibold text-accent">Open safety queue</a>
    {isPending || role.isPending ? <p className="text-sm text-muted">Checking access…</p> : role.isError ? <p role="alert" className="text-sm text-danger">{role.error.message}</p> : role.data?.siteAdmin ? <SiteReports /> : <p className="text-sm text-muted">Site reports are available to verified platform administrators.</p>}
  </div></AppShell>;
}
