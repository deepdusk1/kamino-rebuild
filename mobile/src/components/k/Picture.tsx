import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { font, hueGradient, useTheme } from "@/theme";
import { Txt } from "@/components/ui";
import { toImageSource, type IconName, type Src } from "./types";

type Props = {
  /** The picture. When missing, a colourful gradient from `hue` is shown instead (never a grey box). */
  source?: Src;
  /** 0–360, colour of the fallback gradient. */
  hue?: number;
  /** Fallback content: the first letter of `label` … */
  label?: string;
  /** … or an emoji … */
  emoji?: string;
  /** … or an icon. */
  icon?: IconName;
  /** Corner radius (default 0: the parent usually clips). */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Things drawn on top of the picture (count pills, badges). */
  children?: ReactNode;
  contentFit?: "cover" | "contain";
};

/**
 * A picture box with a colourful fallback. Use it for community covers, post pictures, room covers and
 * artwork: give it a size through `style` (e.g. `{ width: "100%", aspectRatio: 1.35 }`).
 */
export function Picture({ source, hue = 265, label, emoji, icon, radius = 0, style, children, contentFit = "cover" }: Props) {
  const theme = useTheme();
  const image = toImageSource(source);
  return (
    <View style={[{ overflow: "hidden", borderRadius: radius, backgroundColor: theme.surfaceAlt }, style]}>
      {image ? null : (
        <LinearGradient colors={hueGradient(hue, theme.dark)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
          {emoji ? (
            <Txt style={{ fontSize: 28, lineHeight: 34 }}>{emoji}</Txt>
          ) : icon ? (
            <Ionicons name={icon} size={26} color="rgba(255,255,255,0.92)" />
          ) : label ? (
            <Txt style={{ fontFamily: font.heavy, fontSize: 26, lineHeight: 32, color: "rgba(255,255,255,0.95)" }}>{(label.trim()[0] ?? "").toUpperCase()}</Txt>
          ) : null}
        </LinearGradient>
      )}
      {image ? <Image source={image} style={StyleSheet.absoluteFill} contentFit={contentFit} transition={160} cachePolicy="disk" accessible={false} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center", justifyContent: "center" } });
