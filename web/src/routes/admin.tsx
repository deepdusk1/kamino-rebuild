import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PlatformTools } from "@/components/platform-tools";
export const Route = createFileRoute("/admin")({ component: AdminRoute });

function AdminRoute() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  return pathname === "/admin" || pathname === "/admin/" ? <PlatformTools mode="admin" /> : <Outlet />;
}
