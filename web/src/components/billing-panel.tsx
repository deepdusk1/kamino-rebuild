import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import * as billing from "@/lib/kamino/billing-v9";

const card = "rounded-2xl border border-border bg-surface p-4 space-y-3";
const button =
  "k-focus rounded-full bg-violet-strong px-4 py-2 text-sm font-bold text-white disabled:opacity-40";
const field = "mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2";
function redirectToStripe(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("Checkout is unavailable.");
  window.location.assign(url.href);
}
export function TestCheckout({
  offerId,
  kind,
  enabled,
}: {
  offerId: number;
  kind: string;
  enabled: boolean;
}) {
  const [recipient, setRecipient] = useState(""),
    [busy, setBusy] = useState(false);
  const supported = ["membership", "premium", "tip", "gift", "ticket", "marketplace"].includes(
    kind,
  );
  return (
    <div className="space-y-2">
      {kind === "gift" ? (
        <label className="block text-sm">
          Gift recipient
          <input
            className={field}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            maxLength={50}
            placeholder="@handle"
            disabled={!enabled}
          />
        </label>
      ) : null}
      <button
        className={button}
        disabled={!enabled || !supported || busy || (kind === "gift" && !recipient.trim())}
        onClick={() =>
          void (async () => {
            setBusy(true);
            try {
              const result = await billing.createStripeCheckout({
                data: {
                  offerId,
                  ...(kind === "gift" ? { recipientHandle: recipient.trim() } : {}),
                },
              });
              redirectToStripe(result.url);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not open checkout.");
            } finally {
              setBusy(false);
            }
          })()
        }
      >
        {busy
          ? "Opening…"
          : !enabled
            ? "Payments unavailable"
            : !supported
              ? "Coming soon"
              : "Open test checkout"}
      </button>
      {enabled && supported ? (
        <p className="text-xs text-muted">Sandbox checkout. No real money or creator payouts.</p>
      ) : null}
    </div>
  );
}
export function BillingPanel({ creator = false }: { creator?: boolean }) {
  const status = useQuery({
      queryKey: ["billingStatus"],
      queryFn: () => billing.getBillingStatus(),
    }),
    history = useQuery({ queryKey: ["myBilling"], queryFn: () => billing.getMyBilling() }),
    choices = useQuery({
      queryKey: ["paidChoices"],
      queryFn: () => billing.getPaidResourceChoices(),
      enabled: creator,
    }),
    cache = useQueryClient();
  const [selected, setSelected] = useState(""),
    [offerId, setOfferId] = useState(""),
    [busy, setBusy] = useState(false);
  const target = choices.data?.resources.find((r) => `${r.kind}:${r.resourceId}` === selected);
  const matching =
    choices.data?.offers.filter((o) => o.published && o.communityId === target?.communityId) ?? [];
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await cache.invalidateQueries({ queryKey: ["myBilling"] });
      await cache.invalidateQueries({ queryKey: ["profileIdentity"] });
      toast.success("Saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className={card} aria-labelledby="billing-heading">
        <h2 id="billing-heading" className="text-lg font-bold">
          Purchases & subscriptions
        </h2>
        <p className="rounded-xl bg-violet/10 p-3 text-sm">
          {status.data?.reason ?? "Checking payment availability…"}
        </p>
        {status.error || history.error ? (
          <p role="alert" className="text-sm text-red-600">
            {(status.error ?? history.error)?.message}
          </p>
        ) : null}
        {history.data ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={history.data.showSupporterBadges}
                disabled={busy}
                onChange={(e) =>
                  void run(() =>
                    billing.setSupporterBadgeVisibility({ data: { visible: e.target.checked } }),
                  )
                }
              />
              Show my supporter badges on my profile
            </label>
            <p className="text-xs text-muted">
              Badges are optional. Your order details stay private.
            </p>
            {history.data.orders.some((o) => o.subscription) ? (
              <button
                className={button}
                disabled={!status.data?.enabled || busy}
                onClick={() =>
                  void run(async () => {
                    const result = await billing.openBillingPortal();
                    redirectToStripe(result.url);
                  })
                }
              >
                Manage test subscription
              </button>
            ) : null}
            <h3 className="font-semibold">Active access</h3>
            {history.data.entitlements.length ? (
              history.data.entitlements.map((e, i) => (
                <div key={`${e.offerId}:${i}`} className="rounded-xl bg-bg p-3">
                  <strong>{e.title}</strong>
                  <p className="text-sm">
                    {e.state} · test mode
                    {e.expiresAt ? ` · until ${new Date(e.expiresAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">You have no purchased access yet.</p>
            )}
            <h3 className="font-semibold">Order history</h3>
            {history.data.orders.length ? (
              history.data.orders.map((o) => (
                <div key={o.id} className="rounded-xl bg-bg p-3">
                  <strong>{o.title}</strong>
                  <p className="text-sm">
                    {(o.priceMinor / 100).toFixed(2)} {o.currency.toUpperCase()} · {o.status} · test
                    mode
                  </p>
                  <p className="text-xs text-muted">{new Date(o.createdAt).toLocaleString()}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No orders yet.</p>
            )}
          </>
        ) : null}
      </section>
      {creator ? (
        <section className={card}>
          <h2 className="text-lg font-bold">Paid community, content & event access</h2>
          <p className="text-sm text-muted">
            Link a listed offer to something you own. Members need matching active access to open
            it. Set this up after sandbox checkout is configured.
          </p>
          {choices.error ? (
            <p role="alert" className="text-sm text-red-600">
              {choices.error.message}
            </p>
          ) : null}
          <label className="block text-sm">
            Choose content
            <select
              className={field}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setOfferId("");
              }}
            >
              <option value="">Choose an item</option>
              {choices.data?.resources.map((r) => (
                <option key={`${r.kind}:${r.resourceId}`} value={`${r.kind}:${r.resourceId}`}>
                  {r.kind}: {r.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Listed offer
            <select
              className={field}
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              disabled={!target}
            >
              <option value="">Choose an offer</option>
              {matching.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
          {target && !matching.length ? (
            <p className="text-xs text-muted">
              Create and list an offer in the same community first.
            </p>
          ) : null}
          <button
            className={button}
            disabled={!status.data?.enabled || busy || !target || !offerId}
            onClick={() =>
              target &&
              void run(() =>
                billing.setPaidResource({
                  data: {
                    kind: target.kind,
                    resourceId: target.resourceId,
                    offerId: Number(offerId),
                  },
                }),
              )
            }
          >
            Require this offer
          </button>
          {history.data?.requirements.map((r) => {
            const resource = choices.data?.resources.find(
              (item) => item.kind === r.kind && item.resourceId === r.resourceId,
            );
            const offer = choices.data?.offers.find((item) => item.id === r.offerId);
            return (
              <div key={`${r.kind}:${r.resourceId}`} className="rounded-xl bg-bg p-3">
                <p className="text-sm">
                  {resource?.title ?? `${r.kind} ${r.resourceId}`} ·{" "}
                  {offer?.title ?? "Access offer"}
                </p>
                <button
                  className="k-focus mt-2 text-sm font-bold text-violet"
                  disabled={busy}
                  onClick={() =>
                    void run(() => billing.setPaidResource({ data: { ...r, offerId: null } }))
                  }
                >
                  Make free again
                </button>
              </div>
            );
          })}
        </section>
      ) : null}
    </>
  );
}
