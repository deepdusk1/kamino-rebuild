// ===== FILE: mobile/src/lib/push.ts =====
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { rpc, setAuthToken } from "@/api/client";
import { api } from "@/api/endpoints";
import { deleteSecret, readSecret, writeSecret } from "@/auth/storage";

const PUSH_TOKEN_KEY = "kamino.push-token";
const DEVICE_FCM_TOKEN_KEY = "kamino.fcm-token";
const SESSION_TOKEN_KEY = "kamino.session-token";
const BACKGROUND_PUSH_TASK = "KAMINO_BACKGROUND_PUSH_TASK";

export type PushPlatform = "ios" | "android";
export type PushRegistrationStatus = "enabled" | "denied" | "unsupported";

/**
 * Android 8+ (API 26+) Notification Channel IDs.
 * High/Max importance is required on Android for heads-up banners, sound, and vibration.
 * Because Android permanently locks channel importance per channel ID once created on a device,
 * channel IDs are versioned (`_v2`) so existing installs upgrade cleanly from DEFAULT to MAX/HIGH.
 */
export const PUSH_CHANNELS = {
  MESSAGES: "kamino_messages_high_v2",
  CALLS: "kamino_calls_critical_v2",
  EVENTS: "kamino_events_high_v2",
  LIVE: "kamino_events_high_v2",
  DEFAULT: "default",
} as const;

export type PushChannelId = (typeof PUSH_CHANNELS)[keyof typeof PUSH_CHANNELS];

/**
 * Interactive Notification Categories for lockscreen and heads-up inline actions.
 */
export const PUSH_CATEGORIES = {
  CHAT_MESSAGE: "KAMINO_CHAT_MESSAGE",
  INCOMING_CALL: "KAMINO_INCOMING_CALL",
  LIVE_EVENT: "KAMINO_LIVE_EVENT",
} as const;

export type PushCategoryId = (typeof PUSH_CATEGORIES)[keyof typeof PUSH_CATEGORIES];

export type ParsedPushTarget = {
  href: string | null;
  roomId: number | null;
  callId: number | null;
  messageId: number | null;
  communitySlug: string | null;
  isCall: boolean;
  isCallEnded: boolean;
  isEventOrLive: boolean;
  isChatMessage: boolean;
  channelId: PushChannelId;
  categoryIdentifier: PushCategoryId | undefined;
};

type TaskManagerBody = {
  data?: unknown;
  error?: { message?: string } | null;
};

type TaskManagerModule = {
  isTaskDefined: (taskName: string) => boolean;
  defineTask: (taskName: string, executor: (body: TaskManagerBody) => Promise<void>) => void;
};

type FirebaseRemoteMessage = {
  messageId?: string;
  notification?: {
    title?: string;
    body?: string;
  };
  data?: Record<string, string>;
};

type FirebaseMessagingInstance = {
  getToken?: () => Promise<string>;
  onTokenRefresh?: (listener: (token: string) => void) => () => void;
  setBackgroundMessageHandler?: (
    handler: (message: FirebaseRemoteMessage) => Promise<void>,
  ) => void;
};

type FirebaseMessagingModule = {
  default?: () => FirebaseMessagingInstance;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes any server push payload (Expo push `data` or raw FCM `data` map)
 * into a strongly typed routing, channel, and category descriptor.
 */
export function extractNotificationTarget(
  data: Record<string, unknown> | undefined,
): ParsedPushTarget {
  if (!data) {
    return {
      href: null,
      roomId: null,
      callId: null,
      messageId: null,
      communitySlug: null,
      isCall: false,
      isCallEnded: false,
      isEventOrLive: false,
      isChatMessage: false,
      channelId: PUSH_CHANNELS.DEFAULT,
      categoryIdentifier: undefined,
    };
  }

  const rawHref =
    toNonEmptyString(data.href) ??
    toNonEmptyString(data.deepLink)?.replace(/^kamino:\/\//i, "/") ??
    toNonEmptyString(data.url)?.replace(/^kamino:\/\//i, "/") ??
    null;

  const parsedRoomFromHref = rawHref
    ? toFiniteInt(/^\/(?:chats|chat|call|live)\/(\d+)/.exec(rawHref)?.[1])
    : null;

  const roomId =
    toFiniteInt(data.roomId ?? data.room_id ?? data.threadId) ?? parsedRoomFromHref;

  const callId = toFiniteInt(
    data.callId ?? data.call_id ?? data.notificationId ?? data.id,
  );

  const messageId = toFiniteInt(data.messageId ?? data.message_id ?? data.lastMessageId);

  const communitySlug =
    toNonEmptyString(data.communitySlug ?? data.communityId ?? data.slug) ??
    (rawHref ? (/^\/(?:c|community)\/([a-z0-9-]+)/i.exec(rawHref)?.[1] ?? null) : null);

  const kind = (
    toNonEmptyString(data.kind) ??
    toNonEmptyString(data.type) ??
    toNonEmptyString(data.category) ??
    toNonEmptyString(data.event) ??
    ""
  ).toLowerCase();

  const isCallEnded =
    kind === "call.ended" ||
    kind === "call_ended" ||
    kind === "missed_call" ||
    data.action === "end" ||
    data.status === "ended";

  const isCall =
    !isCallEnded &&
    (kind === "call" ||
      kind === "call.incoming" ||
      kind === "call.ring" ||
      kind === "incoming_call" ||
      kind === "ring" ||
      Boolean(rawHref && /[?&]call=1\b/.test(rawHref)) ||
      Boolean(rawHref && rawHref.startsWith("/call/")));

  const isEventOrLive =
    !isCall &&
    !isCallEnded &&
    (kind === "live" ||
      kind === "live_room" ||
      kind === "stage" ||
      kind === "stage.update" ||
      kind === "watch_party" ||
      kind === "watch.sync" ||
      kind === "event" ||
      kind === "events" ||
      Boolean(rawHref && rawHref.startsWith("/live/")));

  const isChatMessage =
    !isCall &&
    !isCallEnded &&
    !isEventOrLive &&
    (kind === "chat" ||
      kind === "message" ||
      kind === "chat.message" ||
      kind === "message.new" ||
      kind === "dm" ||
      kind === "messages" ||
      roomId !== null);

  const href =
    rawHref ??
    (roomId !== null
      ? isCall
        ? `/chats/${roomId}?call=1`
        : isEventOrLive
          ? `/live/${roomId}`
          : `/chats/${roomId}`
      : communitySlug
        ? `/community/${communitySlug}`
        : null);

  const channelId: PushChannelId = isCall
    ? PUSH_CHANNELS.CALLS
    : isChatMessage
      ? PUSH_CHANNELS.MESSAGES
      : isEventOrLive
        ? PUSH_CHANNELS.EVENTS
        : PUSH_CHANNELS.DEFAULT;

  const categoryIdentifier: PushCategoryId | undefined = isCall
    ? PUSH_CATEGORIES.INCOMING_CALL
    : isChatMessage && roomId !== null
      ? PUSH_CATEGORIES.CHAT_MESSAGE
      : isEventOrLive
        ? PUSH_CATEGORIES.LIVE_EVENT
        : undefined;

  return {
    href,
    roomId,
    callId,
    messageId,
    communitySlug,
    isCall,
    isCallEnded,
    isEventOrLive,
    isChatMessage,
    channelId,
    categoryIdentifier,
  };
}

/**
 * Hydrates the bearer session token from SecureStore when a background push task
 * or cold-start inline notification action executes before React mounts.
 */
async function ensureAuthHydrated(): Promise<boolean> {
  const token = await readSecret(SESSION_TOKEN_KEY);
  if (!token) return false;
  setAuthToken(token);
  return true;
}

/**
 * Registers a push token with the backend using the canonical `registerPushToken` RPC
 * (with fallback to `api.registerPush` if aligned) and persists the token locally.
 */
async function registerTokenViaRpc(
  token: string,
  platform: PushPlatform,
  storageKey: string,
): Promise<boolean> {
  const clean = token.trim();
  if (!clean) return false;

  const hasAuth = await ensureAuthHydrated();
  if (!hasAuth) return false;

  await rpc<{ ok?: boolean }>("registerPushToken", {
    token: clean,
    platform,
  });
  await writeSecret(storageKey, clean);
  return true;
}

/**
 * Unregisters a push token from the backend using the canonical `unregisterPushToken` RPC.
 */
async function unregisterTokenViaRpc(token: string): Promise<void> {
  const clean = token.trim();
  if (!clean) return;
  await rpc<{ ok?: boolean }>("unregisterPushToken", { token: clean });
}

// Active ringing loop timers keyed by notification identifier so incoming calls
// continue vibrating and ringing across the full 30-second window until answered, declined, or ended.
const activeCallRingLoops = new Map<string, ReturnType<typeof setInterval>>();

function stopCallRingLoop(identifier: string): void {
  const existing = activeCallRingLoops.get(identifier);
  if (existing) {
    clearInterval(existing);
    activeCallRingLoops.delete(identifier);
  }
}

function stopAllCallRingLoopsForTarget(roomId: number | null, callId: number | null): void {
  if (roomId !== null) {
    stopCallRingLoop(`call-room-${roomId}`);
  }
  if (callId !== null) {
    stopCallRingLoop(`call-${callId}`);
  }
}

/**
 * Dismisses any active ringing call notifications and halts their ringtone/vibration loop.
 */
export async function dismissIncomingCallNotification(
  roomId: number | null,
  callId?: number | null,
): Promise<void> {
  stopAllCallRingLoopsForTarget(roomId, callId ?? null);
  if (roomId !== null) {
    await Notifications.dismissNotificationAsync(`call-room-${roomId}`).catch(
      () => undefined,
    );
  }
  if (callId !== undefined && callId !== null) {
    await Notifications.dismissNotificationAsync(`call-${callId}`).catch(
      () => undefined,
    );
  }
}

/**
 * Promotes a data-only FCM/Expo push payload into a high-priority heads-up system notification
 * on the appropriate Android channel (`MESSAGES`, `CALLS`, or `EVENTS`).
 * For incoming calls, schedules a sticky full-screen priority alert with a ringtone re-pulse loop
 * and cancels it immediately when `call.ended` arrives.
 */
export async function presentDataPayloadNotification(
  raw: Record<string, unknown>,
): Promise<void> {
  if (Platform.OS === "web") return;
  const target = extractNotificationTarget(raw);

  if (target.isCallEnded) {
    await dismissIncomingCallNotification(target.roomId, target.callId);
    return;
  }

  const title =
    toNonEmptyString(raw.title) ??
    (toNonEmptyString(raw.callerName)
      ? `${toNonEmptyString(raw.callerName)} is calling…`
      : null) ??
    toNonEmptyString(raw.senderName) ??
    (target.isCall
      ? "Incoming Kamino Call"
      : target.isEventOrLive
        ? "Live on Kamino"
        : null);

  const body =
    toNonEmptyString(raw.body) ??
    toNonEmptyString(raw.text) ??
    toNonEmptyString(raw.message) ??
    (target.isCall
      ? "Tap Answer to join the voice or video call"
      : target.isEventOrLive
        ? "Tap to join the live room or event"
        : null);

  if (!title && !body) return;

  await setupChannelsAndCategories();

  const identifier = target.isCall
    ? target.roomId !== null
      ? `call-room-${target.roomId}`
      : target.callId !== null
        ? `call-${target.callId}`
        : `call-active`
    : undefined;

  const contentPayload: Notifications.NotificationContentInput = {
    title: title ?? "Kamino",
    body: body ?? "Open Kamino to view",
    sound: "default",
    priority: target.isCall
      ? Notifications.AndroidNotificationPriority.MAX
      : Notifications.AndroidNotificationPriority.HIGH,
    vibrate: target.isCall
      ? [0, 800, 400, 800, 400, 800, 400, 800]
      : [0, 250, 150, 250],
    sticky: target.isCall,
    autoDismiss: !target.isCall,
    ...(target.categoryIdentifier
      ? { categoryIdentifier: target.categoryIdentifier }
      : {}),
    data: {
      ...raw,
      href: target.href,
      roomId: target.roomId,
      callId: target.callId,
      messageId: target.messageId,
      communitySlug: target.communitySlug,
      channelId: target.channelId,
      fullScreenIntent: target.isCall,
    },
  };

  const trigger: Notifications.NotificationTriggerInput =
    Platform.OS === "android" ? { channelId: target.channelId } : null;

  await Notifications.scheduleNotificationAsync({
    ...(identifier ? { identifier } : {}),
    content: contentPayload,
    trigger,
  });

  // WhatsApp-style continuous ringtone/vibration loop for incoming calls (up to 30s)
  if (target.isCall && identifier) {
    stopCallRingLoop(identifier);
    let ticks = 0;
    const interval = setInterval(() => {
      ticks += 1;
      if (ticks >= 6) {
        stopCallRingLoop(identifier);
        void Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
        return;
      }
      void Notifications.scheduleNotificationAsync({
        identifier,
        content: contentPayload,
        trigger,
      }).catch(() => {
        stopCallRingLoop(identifier);
      });
    }, 4_500);
    activeCallRingLoops.set(identifier, interval);
  }
}

/**
 * Registers headless background / killed-state push handlers for both:
 * 1. `expo-task-manager` + `Notifications.registerTaskAsync`
 * 2. `@react-native-firebase/messaging` `setBackgroundMessageHandler` (when linked in native builds)
 */
function registerHeadlessBackgroundHandlers(): void {
  if (Platform.OS === "web") return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager") as TaskManagerModule;
    if (!TaskManager.isTaskDefined(BACKGROUND_PUSH_TASK)) {
      TaskManager.defineTask(BACKGROUND_PUSH_TASK, async ({ data, error }) => {
        if (error || !data || !isRecord(data)) return;
        try {
          const notificationObj = isRecord(data.notification)
            ? data.notification
            : null;
          const requestObj =
            notificationObj && isRecord(notificationObj.request)
              ? notificationObj.request
              : null;
          const contentObj =
            requestObj && isRecord(requestObj.content)
              ? requestObj.content
              : null;

          const hasSystemAlert = Boolean(
            contentObj && toNonEmptyString(contentObj.title),
          );
          const payloadData = isRecord(data.data)
            ? data.data
            : contentObj && isRecord(contentObj.data)
              ? contentObj.data
              : data;

          const target = extractNotificationTarget(payloadData);

          if (target.isCallEnded) {
            await dismissIncomingCallNotification(target.roomId, target.callId);
            return;
          }

          // If the OS did not already display a notification alert (or if it is an incoming call
          // requiring full-screen high-priority ringing), schedule the local heads-up notification.
          if (!hasSystemAlert || target.isCall) {
            await presentDataPayloadNotification(payloadData);
          }
        } catch {
          // Never throw inside headless background task
        }
      });
    }
    void Notifications.registerTaskAsync(BACKGROUND_PUSH_TASK).catch(
      () => undefined,
    );
  } catch {
    // expo-task-manager not linked in web/preview builds
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messagingMod = require("@react-native-firebase/messaging") as FirebaseMessagingModule;
    const messaging = messagingMod.default ? messagingMod.default() : null;
    if (messaging?.setBackgroundMessageHandler) {
      messaging.setBackgroundMessageHandler(async (remoteMessage) => {
        const rawData: Record<string, unknown> = {
          ...(remoteMessage.data ?? {}),
          ...(remoteMessage.notification?.title
            ? { title: remoteMessage.notification.title }
            : {}),
          ...(remoteMessage.notification?.body
            ? { body: remoteMessage.notification.body }
            : {}),
        };
        const target = extractNotificationTarget(rawData);
        if (target.isCallEnded) {
          await dismissIncomingCallNotification(target.roomId, target.callId);
          return;
        }
        if (!remoteMessage.notification?.title || target.isCall) {
          await presentDataPayloadNotification(rawData);
        }
      });
    }
  } catch {
    // @react-native-firebase/messaging not installed; Expo's native FCM receiver handles delivery
  }
}

registerHeadlessBackgroundHandlers();

/**
 * Creates high-importance Android notification channels:
 * - `MESSAGES`: MAX importance, heads-up banner, sound, vibration, lockscreen private preview
 * - `CALLS`: MAX importance, `bypassDnd: true`, sustained ring vibration pattern, public lockscreen visibility
 * - `EVENTS`: HIGH importance, sound + vibration for live rooms, watch parties, and community events
 * - `DEFAULT`: HIGH importance fallback channel
 * And registers interactive categories (`INLINE_REPLY`, `MARK_READ`, `ACCEPT_CALL`, `DECLINE_CALL`, `JOIN_LIVE`).
 */
export async function setupChannelsAndCategories(): Promise<void> {
  if (Platform.OS === "web") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNELS.MESSAGES, {
      name: "Messages & DMs",
      description: "Direct messages, group chats, mentions, and inline replies",
      importance: Notifications.AndroidImportance.MAX,
      enableVibrate: true,
      vibrationPattern: [0, 250, 150, 250],
      enableLights: true,
      lightColor: "#7C3AED",
      sound: "default",
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    await Notifications.setNotificationChannelAsync(PUSH_CHANNELS.CALLS, {
      name: "Incoming Calls",
      description: "Full-screen 1:1 and group voice & video call alerts",
      importance: Notifications.AndroidImportance.MAX,
      enableVibrate: true,
      vibrationPattern: [0, 800, 400, 800, 400, 800, 400, 800],
      enableLights: true,
      lightColor: "#10B981",
      sound: "default",
      bypassDnd: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(PUSH_CHANNELS.EVENTS, {
      name: "Live Rooms & Events",
      description: "Live stage invites, synced watch parties, and event reminders",
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
      vibrationPattern: [0, 220, 130, 220],
      enableLights: true,
      lightColor: "#EC4899",
      sound: "default",
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(PUSH_CHANNELS.DEFAULT, {
      name: "Kamino Activity",
      description: "Likes, comments, follows, streaks, and community updates",
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
      vibrationPattern: [0, 200, 120, 200],
      enableLights: true,
      lightColor: "#7C3AED",
      sound: "default",
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await Notifications.setNotificationCategoryAsync(PUSH_CATEGORIES.CHAT_MESSAGE, [
    {
      identifier: "INLINE_REPLY",
      buttonTitle: "Reply",
      textInput: {
        submitButtonTitle: "Send",
        placeholder: "Reply…",
      },
      options: { opensAppToForeground: false },
    },
    {
      identifier: "MARK_READ",
      buttonTitle: "Mark as Read",
      options: { opensAppToForeground: false },
    },
  ]).catch(() => undefined);

  await Notifications.setNotificationCategoryAsync(PUSH_CATEGORIES.INCOMING_CALL, [
    {
      identifier: "ACCEPT_CALL",
      buttonTitle: "Answer",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "DECLINE_CALL",
      buttonTitle: "Decline",
      options: { isDestructive: true, opensAppToForeground: false },
    },
  ]).catch(() => undefined);

  await Notifications.setNotificationCategoryAsync(PUSH_CATEGORIES.LIVE_EVENT, [
    {
      identifier: "JOIN_LIVE",
      buttonTitle: "Join Now",
      options: { opensAppToForeground: true },
    },
  ]).catch(() => undefined);
}

/**
 * Configures foreground notification presentation so incoming messages, live invites,
 * and calls display heads-up banners with sound and MAX/HIGH priority while the app is open.
 */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const rawData = notification.request.content.data;
      const data = isRecord(rawData) ? rawData : undefined;
      const target = extractNotificationTarget(data);

      if (target.isCallEnded) {
        await dismissIncomingCallNotification(target.roomId, target.callId);
      }

      return {
        shouldShowBanner: !target.isCallEnded,
        shouldShowList: !target.isCallEnded,
        shouldPlaySound: !target.isCallEnded,
        shouldSetBadge: true,
        priority: target.isCall
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
      };
    },
  });

  if (Platform.OS !== "web") {
    void setupChannelsAndCategories();
  }
}

let tokenRefreshSubscription: Notifications.EventSubscription | null = null;
let firebaseTokenRefreshUnsubscribe: (() => void) | null = null;

/**
 * Requests notification permissions (including Android 13+ `POST_NOTIFICATIONS`),
 * sets up high-importance channels, registers BOTH the native FCM/APNs token and the Expo push token
 * via the `registerPushToken` RPC, and attaches live token-refresh listeners so rotated tokens
 * are automatically re-registered with the backend.
 */
export async function registerPushDevice(): Promise<PushRegistrationStatus> {
  try {
    if (Platform.OS === "web" || !Device.isDevice) {
      return "unsupported";
    }

    await setupChannelsAndCategories();

    const existingPerm = await Notifications.getPermissionsAsync();
    const finalPerm = existingPerm.granted
      ? existingPerm
      : await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });

    if (!finalPerm.granted) {
      return "denied";
    }

    const platform: PushPlatform = Platform.OS === "ios" ? "ios" : "android";
    let registeredAny = false;

    // 1. Register native FCM (Android) / APNs (iOS) token via Expo Notifications
    try {
      const nativeToken = await Notifications.getDevicePushTokenAsync();
      if (nativeToken && typeof nativeToken.data === "string" && nativeToken.data.trim()) {
        const ok = await registerTokenViaRpc(
          nativeToken.data,
          platform,
          DEVICE_FCM_TOKEN_KEY,
        );
        if (ok) registeredAny = true;
      }
    } catch {
      // Continue to Firebase / Expo token fallback if native device token is unavailable in dev client
    }

    // 2. Register native FCM token via @react-native-firebase/messaging if linked
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const messagingMod = require("@react-native-firebase/messaging") as FirebaseMessagingModule;
      const messaging = messagingMod.default ? messagingMod.default() : null;
      if (messaging?.getToken) {
        const fcmToken = await messaging.getToken();
        if (typeof fcmToken === "string" && fcmToken.trim()) {
          const ok = await registerTokenViaRpc(
            fcmToken,
            platform,
            DEVICE_FCM_TOKEN_KEY,
          );
          if (ok) registeredAny = true;
        }
      }
      if (messaging?.onTokenRefresh && !firebaseTokenRefreshUnsubscribe) {
        firebaseTokenRefreshUnsubscribe = messaging.onTokenRefresh((rotatedToken: string) => {
          if (typeof rotatedToken === "string" && rotatedToken.trim()) {
            void registerTokenViaRpc(
              rotatedToken,
              platform,
              DEVICE_FCM_TOKEN_KEY,
            ).catch(() => undefined);
          }
        });
      }
    } catch {
      // @react-native-firebase/messaging not linked; Expo's native FCM token listener is used below
    }

    // 3. Register Expo Push Token (`ExponentPushToken[...]`) when EAS projectId is configured
    const easExtra = Constants.expoConfig?.extra as
      | { eas?: { projectId?: string } }
      | undefined;
    const projectId =
      easExtra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;

    if (projectId) {
      try {
        const expoPush = await Notifications.getExpoPushTokenAsync({ projectId });
        if (expoPush?.data && typeof expoPush.data === "string") {
          const ok = await registerTokenViaRpc(
            expoPush.data,
            platform,
            PUSH_TOKEN_KEY,
          );
          if (ok) registeredAny = true;
        }
      } catch {
        // Native FCM token is still active even if Expo push service is unreachable
      }
    }

    // 4. Attach automatic token-refresh listener so rotated FCM/APNs tokens re-register immediately
    if (!tokenRefreshSubscription) {
      tokenRefreshSubscription = Notifications.addPushTokenListener((event) => {
        const rotated =
          typeof event.data === "string" ? event.data.trim() : "";
        if (!rotated) return;
        void registerTokenViaRpc(rotated, platform, DEVICE_FCM_TOKEN_KEY).catch(
          () => undefined,
        );
      });
    }

    return registeredAny ? "enabled" : "unsupported";
  } catch {
    return "unsupported";
  }
}

/**
 * Inspects cold-start notification response data (when the app is launched from a killed state
 * by tapping a notification or pressing Answer on a call alert) and returns the parsed target.
 */
export async function getColdStartNotificationTarget(): Promise<ParsedPushTarget | null> {
  if (Platform.OS === "web") return null;
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;
    const rawData = response.notification.request.content.data;
    const data = isRecord(rawData) ? rawData : undefined;
    return extractNotificationTarget(data);
  } catch {
    return null;
  }
}

/**
 * Handles user interaction with a system push notification across foreground, background,
 * and cold-start killed states:
 * - `INLINE_REPLY`: sends message via `sendMessage` RPC and marks room read without opening UI
 * - `MARK_READ`: marks the chat room read via `api.markRoomRead` without opening UI
 * - `DECLINE_CALL`: stops ringtone loop and declines/ends the call on the backend
 * - `ACCEPT_CALL` / `JOIN_LIVE` / default tap: stops ringtone loop, dismisses banner, and returns route href
 */
export async function handleNotificationResponseAction(
  response: Notifications.NotificationResponse,
): Promise<string | null> {
  const actionId = response.actionIdentifier;
  const notifId = response.notification.request.identifier;
  const rawData = response.notification.request.content.data;
  const data = isRecord(rawData) ? rawData : undefined;
  const target = extractNotificationTarget(data);

  stopAllCallRingLoopsForTarget(target.roomId, target.callId);

  // 1. Inline Reply action from notification banner
  if (actionId === "INLINE_REPLY" && target.roomId !== null) {
    const userText =
      "userText" in response && typeof response.userText === "string"
        ? response.userText.trim()
        : "";
    if (userText) {
      const authed = await ensureAuthHydrated();
      if (authed) {
        await rpc("sendMessage", {
          roomId: target.roomId,
          body: userText,
          clientTag: `push-reply-${Date.now()}`,
        }).catch(() => undefined);
        if (target.messageId !== null) {
          await api.markRoomRead(target.roomId, target.messageId).catch(() => undefined);
        }
      }
    }
    await Notifications.dismissNotificationAsync(notifId).catch(() => undefined);
    return null;
  }

  // 2. Mark as Read action from notification banner
  if (actionId === "MARK_READ" && target.roomId !== null) {
    const authed = await ensureAuthHydrated();
    if (authed) {
      const readUpToId = target.messageId ?? 999_999_999;
      await api.markRoomRead(target.roomId, readUpToId).catch(() => undefined);
    }
    await Notifications.dismissNotificationAsync(notifId).catch(() => undefined);
    return null;
  }

  // 3. Decline Incoming Call action from notification banner
  if (actionId === "DECLINE_CALL") {
    const authed = await ensureAuthHydrated();
    if (authed) {
      if (target.callId !== null) {
        await api.declineCall(target.callId).catch(() => undefined);
      } else if (target.roomId !== null) {
        await api.endCall(target.roomId).catch(() => undefined);
      }
    }
    await dismissIncomingCallNotification(target.roomId, target.callId);
    await Notifications.dismissNotificationAsync(notifId).catch(() => undefined);
    return null;
  }

  // 4. Answer Call / Join Live / Default Notification Tap
  if (actionId === "ACCEPT_CALL" && target.callId !== null) {
    void ensureAuthHydrated().then((authed) => {
      if (authed && target.callId !== null) {
        void api.dismissNotification(target.callId).catch(() => undefined);
      }
    });
  }

  await dismissIncomingCallNotification(target.roomId, target.callId);
  await Notifications.dismissNotificationAsync(notifId).catch(() => undefined);

  if (actionId === "ACCEPT_CALL" && target.roomId !== null) {
    return `/chats/${target.roomId}?call=1`;
  }
  if (actionId === "JOIN_LIVE" && target.roomId !== null) {
    return `/live/${target.roomId}`;
  }

  return target.href;
}

/**
 * Unregisters both the Expo push token and native FCM/APNs device token via the
 * `unregisterPushToken` RPC on sign-out, clears stored token secrets, and detaches listeners.
 */
export async function unregisterPushDevice(): Promise<void> {
  tokenRefreshSubscription?.remove();
  tokenRefreshSubscription = null;

  if (firebaseTokenRefreshUnsubscribe) {
    firebaseTokenRefreshUnsubscribe();
    firebaseTokenRefreshUnsubscribe = null;
  }

  for (const [id] of activeCallRingLoops) {
    stopCallRingLoop(id);
  }

  const expoToken = await readSecret(PUSH_TOKEN_KEY);
  const fcmToken = await readSecret(DEVICE_FCM_TOKEN_KEY);

  if (expoToken) {
    await unregisterTokenViaRpc(expoToken).catch(() => undefined);
    await deleteSecret(PUSH_TOKEN_KEY);
  }
  if (fcmToken && fcmToken !== expoToken) {
    await unregisterTokenViaRpc(fcmToken).catch(() => undefined);
    await deleteSecret(DEVICE_FCM_TOKEN_KEY);
  }
}