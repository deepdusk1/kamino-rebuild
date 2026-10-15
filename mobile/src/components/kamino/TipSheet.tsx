import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { kamino, type KaminoTipTarget } from "@/api/kamino";
import { GradientButton } from "@/components/k";
import { Field, PressableScale, Sheet, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { cleanAmountInput, openInWallet, pollUntil } from "@/lib/kamino-wallet";
import { font, radius, useTheme } from "@/theme";

const PRESETS = ["10", "50", "100", "500"];

type Phase = "choose" | "starting" | "waiting" | "done" | "problem";

/**
 * Tipping someone in KAMINO: pick an amount, then the person's own wallet app (Phantom, Solflare…) opens with the
 * transfer to approve. Kamino waits for it to land on Solana and confirms it. Kamino never holds the tokens.
 */
export function TipSheet({
  visible,
  onClose,
  recipient,
  target,
}: {
  visible: boolean;
  onClose: () => void;
  recipient: { userId: string; name: string };
  target: KaminoTipTarget;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("50");
  const [phase, setPhase] = useState<Phase>("choose");
  const [note, setNote] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const abort = useRef<AbortController | null>(null);

  // Stop waiting when the sheet goes away.
  useEffect(() => () => abort.current?.abort(), []);

  const close = () => {
    abort.current?.abort();
    abort.current = null;
    setPhase("choose");
    setNote(null);
    onClose();
  };

  const send = async () => {
    if (!amount || phase === "starting" || phase === "waiting") return;
    haptic.tap();
    setPhase("starting");
    setNote(null);
    try {
      const tip = await kamino.startTip({ recipientUserId: recipient.userId, amount, targetType: target.type, targetId: target.id });
      setLabel(tip.amountLabel);
      setPhase("waiting");
      await openInWallet(tip.url);
      const controller = new AbortController();
      abort.current = controller;
      const result = await pollUntil(
        () => kamino.checkTip(tip.tipId),
        (r) => r.status !== "pending",
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      void queryClient.invalidateQueries({ queryKey: ["kaminoTips"] });
      void queryClient.invalidateQueries({ queryKey: ["kaminoWallet"] });
      if (result?.status === "confirmed") {
        haptic.success();
        setPhase("done");
      } else {
        setPhase("problem");
        setNote(
          result?.status === "failed"
            ? "The transaction didn't match this tip, so it wasn't counted."
            : result?.status === "expired"
              ? "The tip wasn't approved in time. Nothing was sent."
              : "We haven't seen the tip arrive yet. If you approved it, it will show in your tip history once Solana confirms it.",
        );
      }
    } catch (error) {
      setPhase("problem");
      setNote(errorMessage(error));
    }
  };

  return (
    <Sheet visible={visible} title={`Tip ${recipient.name}`} onClose={close}>
      {phase === "done" ? (
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
          <Ionicons name="checkmark-circle" size={48} color={theme.ok} />
          <Txt style={{ fontFamily: font.heavy, fontSize: 18, color: theme.ink }}>{`You tipped ${label}`}</Txt>
          <Txt tone="muted" style={{ textAlign: "center" }}>{`${recipient.name} will get a notification.`}</Txt>
          <GradientButton label="Done" full onPress={close} />
        </View>
      ) : phase === "waiting" ? (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 16 }}>
          <ActivityIndicator color={theme.violet} />
          <Txt style={{ fontFamily: font.bold, fontSize: 15, color: theme.ink }}>Approve the tip in your wallet</Txt>
          <Txt tone="muted" style={{ textAlign: "center" }}>
            {`Come back here after approving ${label}. We'll confirm it as soon as it lands on Solana.`}
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {PRESETS.map((preset) => {
              const selected = amount === preset;
              return (
                <PressableScale
                  key={preset}
                  onPress={() => setAmount(preset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${preset} KAMINO`}
                  scaleTo={0.95}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: radius.pill,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1.5,
                    borderColor: selected ? theme.violet : theme.border,
                    backgroundColor: selected ? theme.tints.violet : theme.surface,
                  }}
                >
                  <Txt style={{ fontFamily: font.bold, fontSize: 14.5, color: selected ? theme.toneText.violet : theme.ink }}>{preset}</Txt>
                </PressableScale>
              );
            })}
          </View>
          <Field
            label="Amount (KAMINO)"
            value={amount}
            onChangeText={(text) => setAmount(cleanAmountInput(text))}
            keyboardType="decimal-pad"
            placeholder="Any amount from 1"
          />
          <Txt variant="small" tone="muted">
            {"Your wallet app (Phantom, Solflare or another Solana wallet) opens to approve the transfer. Kamino never holds your tokens or keys. Tips can't be undone, and the Solana network fee is paid in SOL."}
          </Txt>
          {note ? (
            <Txt tone={phase === "problem" ? "danger" : "muted"} accessibilityLiveRegion="polite">
              {note}
            </Txt>
          ) : null}
          <GradientButton
            label={amount ? `Tip ${amount} KAMINO` : "Choose an amount"}
            icon="gift"
            full
            busy={phase === "starting"}
            disabled={!amount}
            onPress={() => void send()}
          />
        </View>
      )}
    </Sheet>
  );
}
