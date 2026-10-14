import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { PressableScale, Sheet, Txt } from "@/components/ui";
import type { IconName } from "@/components/k";
import { font, radius, useTheme, type Tone } from "@/theme";

export type MenuItem = {
  key: string;
  label: string;
  icon: IconName;
  /** Colour of the icon circle (default violet). */
  tone?: Tone;
  /** Red text: deletes or leaves something. */
  destructive?: boolean;
  /** A second, grey line under the label. */
  hint?: string;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  items: readonly MenuItem[];
  onClose: () => void;
};

/**
 * The ⋯ menu as a bottom sheet: a list of rows with a tinted icon circle. Works the same on iPhone, Android and the
 * web (system action sheets don't exist in browsers). The sheet closes before the chosen action runs.
 */
export function ActionMenu({ visible, title, items, onClose }: Props) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View style={{ gap: 4, marginTop: -8 }}>
        {items.map((item) => {
          const tone: Tone = item.destructive ? "red" : item.tone ?? "violet";
          return (
            <PressableScale
              key={item.key}
              onPress={() => {
                onClose();
                // Let the sheet start closing first, so a second sheet or alert opens cleanly.
                setTimeout(item.onPress, 60);
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityHint={item.hint}
              scaleTo={0.98}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 4, borderRadius: radius.tile }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.tints[tone], alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={item.icon} size={19} color={item.destructive ? theme.danger : theme.toneText[tone]} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: item.destructive ? theme.danger : theme.ink }}>{item.label}</Txt>
                {item.hint ? <Txt style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 16, color: theme.muted }}>{item.hint}</Txt> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.subtle} />
            </PressableScale>
          );
        })}
      </View>
    </Sheet>
  );
}
