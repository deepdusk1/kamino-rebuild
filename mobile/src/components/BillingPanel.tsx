import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import { platform } from "@/api/platform-v9";
import { Button, Card, Chip, Txt } from "@/components/ui";

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
    [busy, setBusy] = useState(false);
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
  return (
    <>
      <Card>
        <Txt variant="heading">Purchases & subscriptions</Txt>
        <Txt tone="muted">
          Mobile purchases are unavailable until app-store billing is
          configured.
        </Txt>
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
              history.data.entitlements.map((e, i) => (
                <View key={`${e.offerId}:${i}`}>
                  <Txt>{e.title}</Txt>
                  <Txt variant="caption" tone="muted">
                    {e.state} · test mode
                    {e.expiresAt
                      ? ` · until ${new Date(e.expiresAt).toLocaleDateString()}`
                      : ""}
                  </Txt>
                </View>
              ))
            ) : (
              <Txt tone="muted">No purchased access yet.</Txt>
            )}
            <Txt variant="cardTitle">Order history</Txt>
            {history.data.orders.length ? (
              history.data.orders.map((o) => (
                <View key={o.id}>
                  <Txt>{o.title}</Txt>
                  <Txt variant="caption" tone="muted">
                    {(o.priceMinor / 100).toFixed(2)} {o.currency.toUpperCase()}{" "}
                    · {o.status} · test mode
                  </Txt>
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
            Link a listed offer to your community, content or event after
            sandbox checkout is configured.
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
