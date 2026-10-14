import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { font, radius, shadow, space, useTheme } from "@/theme";
import { PressableScale } from "./Motion";
import { Txt } from "./Txt";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/**
 * The app's standard button (a pill). `primary` uses the brand gradient (`gradPrimary`, violet → blue) with a soft
 * violet shadow; `secondary` is a white pill with a hairline; `ghost` is text only; `danger` is for destructive
 * actions. Presses spring and vibrate lightly. For other gradients and icons use `GradientButton` from
 * `@/components/k`.
 */
export function Button({ label, onPress, variant = "primary", busy, disabled, small, style, accessibilityHint }: Props) {
  const theme = useTheme();
  const inactive = !!(disabled || busy);
  const height = small ? 40 : 52;
  const primary = variant === "primary";

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      scaleTo={0.96}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: !!busy }}
      hitSlop={small ? 4 : undefined}
      style={[
        styles.base,
        { height, opacity: inactive ? 0.55 : 1 },
        primary && !inactive && shadow.glow(theme.gradPrimary[1], 0.28),
        variant === "secondary" && { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
        variant === "danger" && { backgroundColor: theme.tints.red },
        variant === "ghost" && { backgroundColor: "transparent" },
        style,
      ]}
    >
      {primary ? (
        <LinearGradient colors={theme.gradPrimary} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} />
      ) : null}
      <View style={styles.inner}>
        {busy ? (
          <ActivityIndicator color={primary ? theme.accentFg : theme.accent} />
        ) : (
          <Txt variant={small ? "small" : "body"} style={{ fontFamily: font.bold }} tone={primary ? "onAccent" : variant === "danger" ? "danger" : "accent"}>
            {label}
          </Txt>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { minWidth: 96, borderRadius: radius.pill, justifyContent: "center" },
  inner: { alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
});
