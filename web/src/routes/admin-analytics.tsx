import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { getPlatformAnalytics } from "@/lib/kamino/platform-analytics";
const metricNames: Record<string, string> = {
  members: "Members",
  dau: "Active today",
  wau: "Active in 7 days",
  mau: "Active in 30 days",
  newMembers7: "New in 7 days",
};

export const Route = createFileRoute("/admin-analytics")({ component: Analytics });
function Analytics() {
  const q = useQuery({ queryKey: ["platformAnalytics"], queryFn: () => getPlatformAnalytics() });
  return (
    <AppShell padded back title="Growth & retention">
      <a className="text-violet underline" href="/admin">
        Platform dashboard
      </a>
      {q.isPending ? (
        <p role="status">Loading analytics…</p>
      ) : q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : q.data ? (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(q.data.metrics).map(([k, v]) => (
              <article key={k} className="rounded-2xl border border-border bg-surface p-4">
                <p className="text-xs text-muted">{metricNames[k]}</p>
                <strong className="text-2xl">{v}</strong>
              </article>
            ))}
          </div>
          <p className="text-sm text-muted">{q.data.definition}</p>
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-lg font-bold">Daily activity & signups</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">UTC day</th>
                    <th className="p-2">Active</th>
                    <th className="p-2">New members</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.activity
                    .slice()
                    .reverse()
                    .map((r) => (
                      <tr key={r.day} className="border-t border-border">
                        <td className="p-2">{r.day}</td>
                        <td className="p-2">{r.activeMembers}</td>
                        <td className="p-2">{r.newMembers}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="text-lg font-bold">Signup cohorts</h2>
            <p className="mt-2 text-sm text-muted">
              A dash means the window is incomplete or fewer than five eligible members are
              available.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Signup week</th>
                    <th className="p-2">Members</th>
                    <th className="p-2">7-day return</th>
                    <th className="p-2">30-day return</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.cohorts.map((r) => (
                    <tr key={r.week} className="border-t border-border">
                      <td className="p-2">{r.week}</td>
                      <td className="p-2">{r.members ?? "—"}</td>
                      <td className="p-2">{r.retention7 === null ? "—" : `${r.retention7}%`}</td>
                      <td className="p-2">{r.retention30 === null ? "—" : `${r.retention30}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
