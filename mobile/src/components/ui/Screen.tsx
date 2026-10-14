import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useTheme } from "@/theme";
import { useTabBarSpace } from "./TabBar";

type Props = {
  children: ReactNode;
  /** Scrolls the content (default). Turn off when the screen contains its own FlatList. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  /** Keep content clear of the top status bar (tab screens have their own header, so they don't need it). */
  topInset?: boolean;
  /** Leave room at the bottom for the floating tab bar (screens inside the tabs). */
  inTabs?: boolean;
  contentStyle?: ViewStyle;
};

/**
 * Standard page: safe areas, keyboard handling and pull-to-refresh. It is see-through on purpose:
 * the navigator draws the animated aurora behind every screen (see `app/_layout.tsx`).
 */
export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true, topInset = false, inTabs = false, contentStyle }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const pad: ViewStyle = {
    padding: padded ? space.lg : 0,
    paddingTop: (padded ? space.lg : 0) + (topInset ? insets.top : 0),
    paddingBottom: inTabs ? tabSpace + space.lg : insets.bottom + space.xl,
  };
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { gap: space.lg }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.accent} colors={[theme.accent]} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
