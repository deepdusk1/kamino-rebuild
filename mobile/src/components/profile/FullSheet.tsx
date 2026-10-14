import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PressableScale, Txt } from "@/components/ui";
import { font, useTheme } from "@/theme";

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Extra content under the title (tabs, filters). */
  header?: ReactNode;
  children: ReactNode;
};

/**
 * A full-height page that slides up over the profile: follower lists, all achievements, a category's posts.
 * (The phone app has no separate screens for these, so they open in place and close with the ✕ or back.)
 */
export function FullSheet({ visible, title, subtitle, onClose, header, children }: Props) {
  const theme = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
          <View style={{ flex: 1 }}>
            <Txt accessibilityRole="header" numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: theme.ink }}>{title}</Txt>
            {subtitle ? <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: theme.muted }}>{subtitle}</Txt> : null}
          </View>
          <PressableScale onPress={onClose} accessibilityLabel="Close" scaleTo={0.88} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close" size={20} color={theme.ink} />
            </View>
          </PressableScale>
        </View>
        {header}
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaView>
    </Modal>
  );
}
