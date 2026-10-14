import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { radius, shadow, space, useTheme } from "@/theme";
import { Appear, PressableScale } from "./Motion";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Position in a list: the card floats in, slightly after the one above it. */
  index?: number;
  /** Inner padding (default 16). Pass 0 for cards with an edge-to-edge picture. */
  padding?: number;
};

/**
 * A white card: radius 18, a 1px hairline and a very soft shadow (spec: `0 4px 16px rgba(20,17,43,0.06)`).
 * Tappable (with a springy press) when `onPress` is given.
 */
export function Card({ children, onPress, onLongPress, style, accessibilityLabel, index, padding = space.lg }: Props) {
  const theme = useTheme();
  const surface: ViewStyle = {
    backgroundColor: theme.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: theme.border,
    padding,
    gap: space.sm,
    ...shadow.card,
  };

  const body = onPress ? (
    <PressableScale onPress={onPress} onLongPress={onLongPress} accessibilityLabel={accessibilityLabel} style={[surface, style]} scaleTo={0.98}>
      {children}
    </PressableScale>
  ) : (
    <View style={[surface, style]}>{children}</View>
  );

  return index === undefined ? body : <Appear index={index}>{body}</Appear>;
}
