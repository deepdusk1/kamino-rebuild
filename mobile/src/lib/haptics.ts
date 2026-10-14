import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Small, consistent vibrations. They make taps feel physical on iPhone and Android.
 * Browsers have no haptics, so these do nothing on the web. Errors are ignored on purpose:
 * a missing vibration must never break a button.
 */
const enabled = Platform.OS === "ios" || Platform.OS === "android";

export const haptic = {
  /** Any ordinary tap. */
  tap: () => {
    if (enabled) Haptics.selectionAsync().catch(() => undefined);
  },
  /** Something pleasant happened (liked, joined, sent). */
  pop: () => {
    if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  /** A bigger moment (checked in, published). */
  success: () => {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};
