import type { NotificationResponse } from "expo-notifications";

/** Browsers have no notification-tap support in Expo, so the browser preview simply never gets one. */
export function useNotificationTap(): NotificationResponse | null | undefined {
  return null;
}
