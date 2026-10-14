import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { font, radius, space, useTheme } from "@/theme";
import { PressableScale } from "./Motion";
import { Txt } from "./Txt";

type Props = { label: string; selected?: boolean; onPress?: () => void; tone?: "default" | "danger" | "ok" };

/**
 * A small pill: a filter, a tag, or a status. Unselected chips are white with a soft border; a selected chip
 * fills with the brand gradient (`gradPrimary`) and white text, like the category chips in the mockups.
 * For chips with an emoji use `CategoryChips` / `Pill` from `@/components/k`.
 */
export function Chip({ label, selected, onPress, tone = "default" }: Props) {
  const theme = useTheme();
  const bg = tone === "danger" ? theme.tints.red : tone === "ok" ? theme.tints.green : theme.surface;
  const color = selected ? "#FFFFFF" : tone === "danger" ? theme.danger : tone === "ok" ? theme.ok : theme.text;
  const body = (
    <View style={[styles.pill, { backgroundColor: selected ? "transparent" : bg, borderColor: selected || tone !== "default" ? "transparent" : theme.border }]}>
      {selected ? <LinearGradient colors={theme.gradPrimary} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
      <Txt variant="caption" style={{ color, fontFamily: selected ? font.bold : font.semibold }}>{label}</Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.94} accessibilityState={{ selected: !!selected }} accessibilityLabel={label} hitSlop={8}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.pill, paddingHorizontal: space.md + 2, paddingVertical: 7, borderWidth: 1, overflow: "hidden" },
});
