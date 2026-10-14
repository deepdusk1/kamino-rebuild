import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KaminoWordmark, ProgressSegments } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { font, useTheme } from "@/theme";

type Props = {
  /** Shows "<" before the logo. */
  onBack?: () => void;
  /** Violet "Skip" on the right (or pass your own `right`). */
  onSkip?: () => void;
  skipLabel?: string;
  right?: ReactNode;
  /** Onboarding step (1–5). Leave out to hide the progress bar. */
  step?: number;
  total?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The top of every onboarding step (02-interests): logo on the left, "Skip" on the right, and the five
 * progress segments with "2 / 5" underneath. Also used by the sign-in and birthday screens (step 1).
 */
export function StepHeader({ onBack, onSkip, skipLabel = "Skip", right, step, total = 5, style }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ paddingTop: insets.top + 14, gap: 14 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, minHeight: 44 }}>
        {onBack ? (
          <PressableScale onPress={onBack} accessibilityLabel="Go back" scaleTo={0.85} style={{ width: 36, height: 44, justifyContent: "center", marginLeft: -6 }}>
            <Ionicons name="chevron-back" size={26} color={theme.ink} />
          </PressableScale>
        ) : null}
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          <KaminoWordmark size={24} />
        </View>
        {right ??
          (onSkip ? (
            <PressableScale onPress={onSkip} accessibilityLabel={skipLabel} hitSlop={10} scaleTo={0.92} style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}>
              <Txt style={{ fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: theme.accent }}>{skipLabel}</Txt>
            </PressableScale>
          ) : null)}
      </View>
      {step ? <ProgressSegments current={step} total={total} style={{ paddingLeft: 52, paddingRight: 18 }} /> : null}
    </View>
  );
}
