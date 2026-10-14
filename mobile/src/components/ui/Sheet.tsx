import { useEffect, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useTheme } from "@/theme";
import { Glass } from "./Glass";
import { Txt } from "./Txt";

type Props = { visible: boolean; title: string; onClose: () => void; children: ReactNode };

/** A glass bottom sheet for short forms and menus (report, mute, appeal, reactions…). It springs up from the bottom. */
export function Sheet({ visible, title, onClose, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(400);

  useEffect(() => {
    if (visible) {
      offset.set(reduceMotion ? 0 : 400);
      offset.set(withSpring(0, { damping: 20, stiffness: 190, mass: 0.8 }));
    }
  }, [visible, reduceMotion, offset]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? "rgba(4,2,14,0.6)" : "rgba(30,16,60,0.35)" }]} onPress={onClose} />
        <Animated.View style={slide}>
          <Glass intensity={80} style={{ maxHeight: height * 0.85, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: insets.bottom + space.lg }}>
            {/* Glass alone is too see-through for forms; a stronger wash keeps text crisp. */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glassStrong, opacity: Platform.OS === "android" ? 0 : 0.55, pointerEvents: "none" }]} />
            <View style={{ alignItems: "center", paddingTop: space.sm }}>
              <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: theme.subtle, opacity: 0.4 }} />
            </View>
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
              <Txt variant="title">{title}</Txt>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md }}>
              {children}
            </ScrollView>
          </Glass>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
