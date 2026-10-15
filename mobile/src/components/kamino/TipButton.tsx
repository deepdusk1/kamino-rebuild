import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Platform } from "react-native";
import { kamino, type KaminoTipTarget } from "@/api/kamino";
import { PressableScale, Txt } from "@/components/ui";
import { font, radius, shadow, useTheme } from "@/theme";
import { TipSheet } from "./TipSheet";

/**
 * "Tip" for a profile or a post. Shows only when KAMINO tipping is on and the person has a verified wallet.
 * On iPhone, tips on posts stay hidden unless the server switches them on (App Store rules on tipping for content).
 */
export function TipButton({
  recipient,
  target,
  variant = "icon",
}: {
  recipient: { userId: string; name: string };
  target: KaminoTipTarget;
  variant?: "icon" | "inline";
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const info = useQuery({
    queryKey: ["kaminoTipInfo", recipient.userId],
    queryFn: () => kamino.tipInfo(recipient.userId),
    staleTime: 5 * 60_000,
  });
  const data = info.data;
  if (!data?.enabled || !data.canReceive) return null;
  if (Platform.OS === "ios" && target.type === "post" && !data.tipsOnIosPosts) return null;

  return (
    <>
      {variant === "icon" ? (
        <PressableScale
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Tip ${recipient.name} in KAMINO`}
          hitSlop={7}
          scaleTo={0.9}
          style={[
            {
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: theme.tints.violet,
              alignItems: "center",
              justifyContent: "center",
            },
            shadow.card,
          ]}
        >
          <Ionicons name="gift-outline" size={17} color={theme.toneText.violet} />
        </PressableScale>
      ) : (
        <PressableScale
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Tip ${recipient.name} in KAMINO`}
          hitSlop={10}
          scaleTo={0.88}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, borderRadius: radius.pill }}
        >
          <Ionicons name="gift-outline" size={21} color={theme.text} />
          <Txt style={{ fontFamily: font.semibold, fontSize: 15, color: theme.text }}>Tip</Txt>
        </PressableScale>
      )}
      <TipSheet visible={open} onClose={() => setOpen(false)} recipient={recipient} target={target} />
    </>
  );
}
