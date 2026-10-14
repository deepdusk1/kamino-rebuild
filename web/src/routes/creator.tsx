import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlatformTools } from "@/components/platform-tools";
import { AppShell } from "@/components/app-shell";
import { GradientButton } from "@/components/k";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  getCreatorMoney,
  requestCreatorPayout,
  startConnectOnboarding,
} from "@/lib/kamino/money";

export const Route = createFileRoute("/creator")({
  component: () => (
    <>
      <CreatorMoney />
      <PlatformTools mode="creator" />
    </>
  ),
});

function money(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(
    minor / 100,
  );
}

/**
 * Creator money: earnings balance, Stripe Connect onboarding, and payout requests. Everything
 * reflects the server's billing mode; payouts stay refused until live billing is switched on.
 */
function CreatorMoney() {
  const { user, isPending } = useCurrentUserState();
  const money_ = useQuery({ queryKey: ["creatorMoney"], queryFn: () => getCreatorMoney(), enabled: !!user });
  const onboarding = useMutation({
    mutationFn: () => startConnectOnboarding(),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start onboarding."),
  });
  const payout = useMutation({
    mutationFn: () => requestCreatorPayout({ data: {} }),
    onSuccess: (result) => toast.success(`Payout sent: ${money(result.paidMinor, result.currency)}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not request the payout."),
  });
  if (!isPending && !user) return <RedirectToSignIn />;
  const d = money_.data;
  return (
    <AppShell padded back title="Creator money">
      {money_.isPending ? (
        <p role="status">Loading your balance…</p>
      ) : money_.error ? (
        <p role="alert">{money_.error.message}</p>
      ) : d ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[13px] font-bold tracking-[0.14em] text-violet uppercase">
                  Available earnings
                </p>
                <p className="text-3xl font-extrabold tracking-[-0.02em] text-ink">
                  {money(d.availableMinor, d.currency)}
                </p>
                <p className="text-sm text-muted">
                  {money(d.lifetimeMinor, d.currency)} lifetime · {d.feePercent}% platform fee
                </p>
              </div>
              <div className="flex gap-2">
                {!d.connected ? (
                  <GradientButton onClick={() => onboarding.mutate()} disabled={onboarding.isPending}>
                    {onboarding.isPending ? "Opening…" : "Set up payouts"}
                  </GradientButton>
                ) : (
                  <GradientButton onClick={() => payout.mutate()} disabled={payout.isPending}>
                    {payout.isPending ? "Paying…" : "Request payout"}
                  </GradientButton>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{d.billingReason}</p>
          </div>
          <div className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-2 text-lg font-bold">Payout history</h2>
            {d.payouts.length === 0 ? (
              <p className="text-sm text-muted">No payouts yet.</p>
            ) : (
              <ul className="space-y-2">
                {d.payouts.map((row) => (
                  <li key={row.id} className="flex items-center justify-between border-t border-border pt-2 text-sm">
                    <span className="font-bold text-ink">{money(row.amountMinor, row.currency)}</span>
                    <span className="text-muted">
                      {row.state}
                      {row.error ? ` · ${row.error}` : ""} · {new Date(row.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
