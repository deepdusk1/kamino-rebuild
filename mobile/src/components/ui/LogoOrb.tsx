import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { KMark } from "./KMark";

/** The Kamino logo, floating gently with a soft glowing pulse behind it (sign-in and welcome screens). */
export function LogoOrb({ size = 72 }: { size?: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const float = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    float.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
    pulse.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false));
  }, [reduceMotion, float, pulse]);

  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -5 + float.value * 10 }, { rotate: `${-3 + float.value * 6}deg` }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.55 }] }));

  return (
    <View style={{ width: size * 1.6, height: size * 1.6, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: theme.gradPrimary[0] }, ring]} />
      <Animated.View style={[{ shadowColor: theme.glow, shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } }, bob]}>
        <KMark size={size} />
      </Animated.View>
    </View>
  );
}
