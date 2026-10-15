import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import { platform } from "@/api/platform-v9";
import { Button, Card, Chip, Txt } from "@/components/ui";
import {
  accessLabel,
  formatPrice,
  isStripeReceipt,
  manageSubscriptionNote,
  orderStatusLabel,
  phonePurchaseNote,
} from "@/lib/billing-labels";

/**
 * Purchases & subscriptions on the phone. Buying and cancelling happen on the Kamino website
 * (app-store rules for digital goods), so this panel shows what you have, whether it renews,
 * and your Stripe receipts.
 */
export function BillingPanel({ creator = false }: { creator?: boolean }) {
  const status = useQuery({
      queryKey: ["billingStatus"],
      queryFn: platform.billingStatus,
    }),
    history = useQuery({ queryKey: ["myBilling"], queryFn: platform.billing }),
    choices = useQuery({
      queryKey: ["paidChoices"],
      queryFn: platform.paidChoices,
      enabled: creator,
    }),
    cache = useQueryClient();
  const [selected, setSelected] = useState(""),
    [offerId, setOfferId] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [receiptFor, setReceiptFor] = useState<string | null>(null);
  const target = choices.data?.resources.find(
      (r) => `${r.kind}:${r.resourceId}` === selected,
    ),
    matching =
      choices.data?.offers.filter(
        (o) => o.published && o.communityId === target?.communityId,
      ) ?? [];
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await cache.invalidateQueries({ queryKey: ["myBilling"] });
      await cache.invalidateQueries({ queryKey: ["profileIdentity"] });
    } catch (e) {
      Alert.alert(
        "Could not save",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openReceipt(orderId: string) {
    setReceiptFor(orderId);
    try {
      const { url } = await platform.receipt(orderId);
      if (!isStripeReceipt(url)) throw new Error("The receipt link isn't valid.");
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      Alert.alert(
        "Couldn't open the receipt",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setReceiptFor(null);
    }
  }
  const renewing = history.data?.orders.find((o) => o.renews !== null);
  const manageNote = manageSubscriptionNote(renewing?.renews ?? null);
  return (
    <>
      <Card>
        <Txt variant="heading">Purchases & subscriptions</Txt>
        <Txt tone="muted">{phonePurchaseNote(status.data?.mode)}</Txt>
        {status.error || history.error ? (
          <Txt tone="danger">{(status.error ?? history.error)?.message}</Txt>
        ) : null}
        {history.data ? (
          <>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Switch
                accessibilityLabel="Show my supporter badges"
                value={history.data.showSupporterBadges}
                disabled={busy}
                onValueChange={(visible) =>
                  void run(() => platform.supporterBadge(visible))
                }
              />
              <Txt style={{ flex: 1 }}>Show my supporter badges</Txt>
            </View>
            <Txt variant="caption" tone="muted">
              Badges are optional. Order details stay private.
            </Txt>
            <Txt variant="cardTitle">Purchased access</Txt>
            {history.data.entitlements.length ? (
              history.data.entitlements.map((e) => (
                <View key={e.orderId}>
                  <Txt>{e.title}</Txt>
                  <Txt variant="caption" tone="muted">
                    {accessLabel(e)}
                    {e.testMode ? " · test" : ""}
                  </Txt>
                </View>
              ))
            ) : (
              <Txt tone="muted">No purchased access yet.</Txt>
            )}
            {manageNote ? (
              <Txt variant="caption" tone="muted">
                {manageNote}
              </Txt>
            ) : null}
            <Txt variant="cardTitle">Order history</Txt>
            {history.data.orders.length ? (
              history.data.orders.map((o) => (
                <View key={o.id} style={{ gap: 4 }}>
                  <Txt>{o.title}</Txt>
                  <Txt variant="caption" tone="muted">
                    {formatPrice(o.priceMinor, o.currency)}
                    {o.subscription ? " / month" : ""} ·{" "}
                    {orderStatusLabel(o.status)}
                    {o.renews === false ? " · won't renew" : ""}
                    {o.testMode ? " · test" : ""}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </Txt>
                  {o.receipt ? (
                    <Button
                      small
                      variant="secondary"
                      label="View receipt"
                      busy={receiptFor === o.id}
                      disabled={receiptFor !== null && receiptFor !== o.id}
                      onPress={() => void openReceipt(o.id)}
                    />
                  ) : null}
                </View>
              ))
            ) : (
              <Txt tone="muted">No orders yet.</Txt>
            )}
          </>
        ) : null}
      </Card>
      {creator ? (
        <Card>
          <Txt variant="heading">Paid access</Txt>
          <Txt tone="muted">
            Link a listed offer to your community, content or event. Members
            need matching active access to open it.
          </Txt>
          {choices.error ? (
            <Txt tone="danger">{choices.error.message}</Txt>
          ) : null}
          <Txt variant="cardTitle">Choose content</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {choices.data?.resources.map((r) => (
              <Chip
                key={`${r.kind}:${r.resourceId}`}
                label={`${r.kind}: ${r.title}`}
                selected={selected === `${r.kind}:${r.resourceId}`}
                onPress={() => {
                  setSelected(`${r.kind}:${r.resourceId}`);
                  setOfferId(null);
                }}
              />
            ))}
          </View>
          <Txt variant="cardTitle">Listed offer</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {matching.map((o) => (
              <Chip
                key={o.id}
                label={o.title}
                selected={offerId === o.id}
                onPress={() => setOfferId(o.id)}
              />
            ))}
          </View>
          {target && !matching.length ? (
            <Txt variant="caption" tone="muted">
              Create and list an offer in the same community first.
            </Txt>
          ) : null}
          <Button
            label="Require this offer"
            busy={busy}
            disabled={!status.data?.enabled || !target || !offerId}
            onPress={() =>
              target &&
              offerId &&
              void run(() =>
                platform.paidResource(target.kind, target.resourceId, offerId),
              )
            }
          />
          {!status.data?.enabled ? (
            <Txt variant="caption" tone="muted">
              Paid access can be set once payments are switched on.
            </Txt>
          ) : null}
          {history.data?.requirements.map((r) => (
            <View key={`${r.kind}:${r.resourceId}`}>
              <Txt>
                {choices.data?.resources.find(
                  (item) =>
                    item.kind === r.kind && item.resourceId === r.resourceId,
                )?.title ?? `${r.kind} ${r.resourceId}`}
              </Txt>
              <Button
                small
                label="Make free again"
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  void run(() =>
                    platform.paidResource(r.kind, r.resourceId, null),
                  )
                }
              />
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}
