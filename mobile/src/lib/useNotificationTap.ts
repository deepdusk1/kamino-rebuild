import * as Notifications from "expo-notifications";

/** The notification the person last tapped (or null). On iOS and Android this is the real thing. */
export function useNotificationTap(): Notifications.NotificationResponse | null | undefined {
  return Notifications.useLastNotificationResponse();
}
