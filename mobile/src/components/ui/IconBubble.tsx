import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Gradient } from "@/theme";

/** A small rounded square filled with a gradient and a white icon, like the rows in iOS Settings. */
export function IconBubble({ icon, colors, size = 34 }: { icon: keyof typeof Ionicons.glyphMap; colors: Gradient; size?: number }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={size * 0.56} color="#ffffff" />
    </LinearGradient>
  );
}
