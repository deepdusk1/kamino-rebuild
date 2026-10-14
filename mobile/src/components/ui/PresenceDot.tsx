import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/theme";

/** A check for online and a dash for offline keep presence readable without color perception. */
export function PresenceDot({ size = 12, online = true, style }: { size?: number; online?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View accessible accessibilityRole="image" accessibilityLabel={online ? "Online" : "Offline"} style={[
    { width: size, height: size, borderRadius: size / 2, backgroundColor: online ? theme.green : theme.subtle,
      borderWidth: Math.max(2, size * 0.18), borderColor: theme.surface, alignItems: "center", justifyContent: "center" }, style,
  ]}>
    <Svg width={size * 0.65} height={size * 0.65} viewBox="0 0 24 24" accessible={false}>
      <Path d={online ? "M5 12 L10 17 L19 7" : "M6 12 H18"} fill="none" stroke={online ? "#063b27" : "#fff"} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </View>;
}
