import { PermissionsAndroid, Platform } from "react-native";

/**
 * The "Kamino call in progress" notification on Android, which keeps a call running in the background.
 *
 * Android 14+ cuts off the microphone and camera of an app in the background unless it runs a foreground service
 * of the matching type with a visible notification. This starts that service when a call connects and stops it
 * when the call ends. The service itself is Notifee's, re-declared for calls by plugins/with-call-service.js.
 *
 * On iOS nothing is needed here: the `audio` background mode keeps the app running while the microphone is live.
 * In Expo Go (no native module) every call here quietly does nothing.
 */

type NotifeeModule = typeof import("@notifee/react-native");

const CHANNEL_ID = "kamino_call_ongoing_v1";
const NOTIFICATION_ID = "kamino-ongoing-call";

let cached: NotifeeModule | null | undefined;
let runnerRegistered = false;
/** Whether a call wants the service right now. A stop that arrives while a start is still running wins. */
let wanted = false;
let running = false;

function loadNotifee(): NotifeeModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== "android") return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@notifee/react-native") as NotifeeModule;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Starts (or updates) the ongoing-call notification and its foreground service. Call it while the app is on
 * screen: Android refuses to start a microphone or camera service from the background.
 *
 * `camera` adds camera access for video calls. Types are only requested for permissions the person granted, because
 * asking for a microphone service without microphone permission crashes on Android 14 (a listener in a live room
 * may never have granted it, so they get a media-playback service instead).
 */
export async function startCallService(options: { title: string; camera: boolean }): Promise<void> {
  const mod = loadNotifee();
  if (!mod) return;
  wanted = true;
  try {
    const notifee = mod.default;
    if (!runnerRegistered) {
      // Notifee needs a task that lasts as long as the service; stopForegroundService() ends it.
      notifee.registerForegroundService(() => new Promise<void>(() => undefined));
      runnerRegistered = true;
    }
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: "Ongoing calls",
      description: "Shown while you are in a call so it keeps going when Kamino is in the background",
      importance: mod.AndroidImportance.LOW,
      vibration: false,
    });
    const mic = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    const cam = options.camera && (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA));
    const T = mod.AndroidForegroundServiceType;
    const types = [mic ? T.FOREGROUND_SERVICE_TYPE_MICROPHONE : T.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK];
    if (cam) types.push(T.FOREGROUND_SERVICE_TYPE_CAMERA);
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: options.title,
      body: "Call in progress. Tap to go back to it.",
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        foregroundServiceTypes: types,
        category: mod.AndroidCategory.CALL,
        ongoing: true,
        onlyAlertOnce: true,
        color: "#6947d5",
        pressAction: { id: "default", launchActivity: "default" },
      },
    });
    running = true;
    if (!wanted) await stopCallService(); // the call ended while this was starting
  } catch {
    // Without the service the call still works while Kamino is on screen.
  }
}

/** Stops the ongoing-call notification and its service. Safe to call when nothing is running. */
export async function stopCallService(): Promise<void> {
  wanted = false;
  const mod = loadNotifee();
  if (!mod || !running) return;
  running = false;
  try {
    await mod.default.stopForegroundService();
    await mod.default.cancelNotification(NOTIFICATION_ID);
  } catch {
    // Already gone.
  }
}
