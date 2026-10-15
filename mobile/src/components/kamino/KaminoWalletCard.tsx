import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { kamino } from "@/api/kamino";
import { GradientButton } from "@/components/k";
import { Button, PressableScale, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { openInWallet, pollUntil, shortAddress } from "@/lib/kamino-wallet";
import { font, radius, shadow, useTheme } from "@/theme";

/**
 * Your KAMINO balance and the wallet tips are paid into.
 *
 * Linking a wallet opens your Solana wallet app with a small "memo" transaction to approve. Signing it proves the
 * wallet is yours (no tokens move; only the network fee of a fraction of a cent). Kamino stores the public address
 * only. Your keys stay in your wallet app.
 */
export function KaminoWalletCard() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const wallet = useQuery({ queryKey: ["kaminoWallet"], queryFn: kamino.wallet, staleTime: 30_000 });
  const [linking, setLinking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const data = wallet.data;
  if (wallet.isPending) {
    return (
      <View style={{ padding: 20 }}>
        <ActivityIndicator color={theme.violet} />
      </View>
    );
  }
  if (!data?.enabled) return null;

  const link = async () => {
    haptic.tap();
    setNote(null);
    setLinking(true);
    try {
      const { code, url } = await kamino.startLink();
      await openInWallet(url);
      const controller = new AbortController();
      abort.current = controller;
      const result = await pollUntil(() => kamino.checkLink(code), (r) => r.status !== "pending", { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result?.status === "linked") {
        haptic.success();
        setNote("Wallet linked. People can now tip you in KAMINO.");
      } else if (result?.status === "failed") {
        setNote("That wallet is already linked to another Kamino account.");
      } else {
        setNote("We didn't see the approval. If you approved it, wait a moment and pull to refresh.");
      }
      await queryClient.invalidateQueries({ queryKey: ["kaminoWallet"] });
    } catch (error) {
      setNote(errorMessage(error));
    } finally {
      setLinking(false);
    }
  };

  const unlink = () =>
    Alert.alert("Remove this wallet?", "You won't receive KAMINO tips until you link a wallet again. Your tokens stay in your wallet.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void kamino
            .unlink()
            .then(() => queryClient.invalidateQueries({ queryKey: ["kaminoWallet"] }))
            .catch((error: unknown) => setNote(errorMessage(error))),
      },
    ]);

  const copy = async () => {
    if (!data.address) return;
    await Clipboard.setStringAsync(data.address);
    haptic.tap();
    setNote("Address copied.");
  };

  return (
    <View style={[{ backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 12 }, shadow.card]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.tints.violet, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="diamond-outline" size={18} color={theme.toneText.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 16, color: theme.ink }}>
            {`${data.symbol} wallet`}
          </Txt>
          <Txt variant="caption" tone="muted">
            {data.address ? "Tips are paid into this wallet" : "Link a Solana wallet to see your balance and get tips"}
          </Txt>
        </View>
      </View>

      {data.address ? (
        <>
          <View accessible accessibilityLabel={`Balance: ${data.balance ?? "unavailable"} ${data.symbol}`}>
            <Txt style={{ fontFamily: font.heavy, fontSize: 30, lineHeight: 36, color: theme.ink }}>
              {data.balance ?? "—"}
              <Txt style={{ fontFamily: font.bold, fontSize: 15, color: theme.muted }}>{`  ${data.symbol}`}</Txt>
            </Txt>
            {data.balanceError ? <Txt variant="small" tone="muted">{data.balanceError}</Txt> : null}
          </View>
          <PressableScale
            onPress={() => void copy()}
            accessibilityRole="button"
            accessibilityLabel="Copy wallet address"
            scaleTo={0.98}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: theme.surfaceAlt }}
          >
            <Ionicons name="wallet-outline" size={16} color={theme.muted} />
            <Txt style={{ flex: 1, fontFamily: font.semibold, fontSize: 13.5, color: theme.text }}>{shortAddress(data.address)}</Txt>
            <Ionicons name="copy-outline" size={16} color={theme.muted} />
          </PressableScale>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label={linking ? "Waiting for your wallet…" : "Change wallet"} variant="secondary" busy={linking} onPress={() => void link()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Remove" variant="secondary" disabled={linking} onPress={unlink} />
            </View>
          </View>
        </>
      ) : (
        <GradientButton
          label={linking ? "Approve in your wallet…" : "Link a wallet"}
          icon="link"
          full
          busy={linking}
          onPress={() => void link()}
        />
      )}

      {note ? (
        <Txt variant="small" tone="muted" accessibilityLiveRegion="polite">
          {note}
        </Txt>
      ) : null}
      <Txt variant="caption" tone="subtle">
        {"Kamino never sees your private keys or recovery phrase and can't move your tokens. Use Phantom, Solflare or another Solana wallet app."}
      </Txt>
    </View>
  );
}
