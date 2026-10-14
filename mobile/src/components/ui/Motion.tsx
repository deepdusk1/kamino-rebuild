import type { ReactNode } from "react";
import { Pressable, type AccessibilityRole, type AccessibilityState, type Insets, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";

/** Spring used for every press: quick, slightly bouncy. */
const PRESS_SPRING = { damping: 15, stiffness: 320, mass: 0.6 } as const;

// The pressable itself is animated, so layout styles (flex, width, alignSelf) work as usual.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** How far it shrinks while held (1 = not at all). */
  scaleTo?: number;
  /** Vibrate on tap (default: yes). */
  haptics?: boolean;
  disabled?: boolean;
  hitSlop?: number | Insets;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
};

/**
 * A button that gently shrinks under your finger and springs back, with a light tap vibration.
 * Used by cards, buttons, chips and icons so every touch in the app feels the same.
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  style,
  scaleTo = 0.965,
  haptics = true,
  disabled,
  hitSlop,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      style={[style, animated]}
      onPress={
        onPress && !disabled
          ? () => {
              if (haptics) haptic.tap();
              onPress();
            }
          : undefined
      }
      onLongPress={onLongPress}
      onPressIn={() => {
        if (!reduceMotion && !disabled) scale.set(withSpring(scaleTo, PRESS_SPRING));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, PRESS_SPRING));
      }}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Fades and floats its content up into place when it first appears.
 * `index` staggers items in a list so they arrive one after another (capped so long lists stay quick).
 */
export function Appear({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <Animated.View style={style}>{children}</Animated.View>;
  return (
    <Animated.View entering={FadeInDown.duration(420).delay(Math.min(index, 6) * 55).springify().damping(18)} style={style}>
      {children}
    </Animated.View>
  );
}
