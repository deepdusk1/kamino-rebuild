import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { kamino, type KaminoTipItem } from "@/api/kamino";
import { EmptyHint, PersonAvatar, Pill } from "@/components/k";
import { KaminoWalletCard } from "@/components/kamino/KaminoWalletCard";
import { ErrorState, PressableScale, Screen, Segmented, Txt } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { font, radius, useTheme } from "@/theme";

const STATUS: Record<KaminoTipItem["status"], { label: string; tone: "green" | "orange" | "pink" | "violet" }> = {
  confirmed: { label: "Confirmed", tone: "green" },
  pending: { label: "Waiting", tone: "orange" },
  failed: { label: "Not counted", tone: "pink" },
  expired: { label: "Not sent", tone: "violet" },
};

/** Your KAMINO wallet (balance, linking) and the tips you received and sent. */
export default function KaminoWalletScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const wallet = useQuery({ queryKey: ["kaminoWallet"], queryFn: kamino.wallet, staleTime: 30_000 });
  const tips = useQuery({
    queryKey: ["kaminoTips", direction],
    queryFn: () => kamino.tips(direction),
    enabled: wallet.data?.enabled === true,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["kaminoWallet"] }),
      queryClient.invalidateQueries({ queryKey: ["kaminoTips"] }),
    ]);
  };

  return (
    <Screen refreshing={wallet.isRefetching || tips.isRefetching} onRefresh={() => void refresh()}>
      <Stack.Screen options={{ title: "KAMINO wallet" }} />
      {wallet.isError ? <ErrorState error={wallet.error} onRetry={() => void wallet.refetch()} /> : null}
      {wallet.data && !wallet.data.enabled ? (
        <EmptyHint emoji="💎" title="KAMINO tips aren't available yet" text="This will appear here once tipping is switched on." />
      ) : null}
      <KaminoWalletCard />

      {wallet.data?.enabled ? (
        <View style={{ gap: 10 }}>
          <Segmented
            options={[
              { key: "received", label: "Received" },
              { key: "sent", label: "Sent" },
            ]}
            value={direction}
            onChange={setDirection}
          />
          {tips.isError ? <ErrorState error={tips.error} onRetry={() => void tips.refetch()} /> : null}
          {tips.data && !tips.data.length ? (
            <EmptyHint
              emoji={direction === "received" ? "🎁" : "💸"}
              title={direction === "received" ? "No tips yet" : "You haven't sent any tips"}
              text={direction === "received" ? "Tips people send you appear here once Solana confirms them." : "Tip a creator from their profile or post."}
            />
          ) : null}
          {(tips.data ?? []).map((tip) => {
            const status = STATUS[tip.status];
            return (
              <PressableScale
                key={tip.id}
                onPress={() => (tip.otherHandle ? router.push(`/profile/${tip.otherHandle}`) : undefined)}
                accessibilityRole="button"
                accessibilityLabel={`${tip.direction === "received" ? "From" : "To"} ${tip.otherName}: ${tip.amount} KAMINO, ${status.label}, ${timeAgo(tip.createdAt)}`}
                scaleTo={0.98}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.card, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
              >
                <PersonAvatar person={{ name: tip.otherName, hue: 260, userId: tip.otherUserId || undefined }} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt style={{ fontFamily: font.bold, fontSize: 14.5, color: theme.ink }}>
                    {`${tip.direction === "received" ? "From" : "To"} ${tip.otherName}`}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {`${timeAgo(tip.createdAt)}${tip.targetType === "post" ? " · on a post" : ""}`}
                  </Txt>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Txt style={{ fontFamily: font.heavy, fontSize: 15, color: tip.direction === "received" ? theme.ok : theme.ink }}>
                    {`${tip.direction === "received" ? "+" : "−"}${tip.amount}`}
                  </Txt>
                  {tip.status !== "confirmed" || tip.direction === "sent" ? <Pill label={status.label} tone={status.tone} /> : null}
                </View>
              </PressableScale>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}
