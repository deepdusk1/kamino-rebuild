// ===== FILE: mobile/src/lib/push.ts =====
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { rpc, setAuthToken } from "@/api/client";
import { api } from "@/api/endpoints";
import { deleteSecret, readSecret, writeSecret } from "@/auth/storage";

const PUSH_TOKEN_KEY = "kamino.push-token";
const LEGACY_DEVICE_TOKEN_KEY = "kamino.fcm-token";
const SESSION_TOKEN_KEY = "kamino.session-token";
const BACKGROUND_PUSH_TASK = "KAMINO_BACKGROUND_PUSH_TASK";

/**
 * Tracks notification IDs already presented in this session to prevent duplicates.
 * The system notification and the app's background handler can both fire for the same
 * push — this ensures the user only sees one notification per event.
 */
const presentedNotificationIds = new Set<string>();
const MAX_TRACKED_IDS = 100;

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
  /** Not "default": Android keeps the first importance a channel id was created with, and older installs have a quiet "default". */
  DEFAULT: "kamino_general_v2",
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
 * Rejects strings that look like stringified JSON payloads (e.g. '{"href":"/chats/15",...}').
 * These leak into notification title/body when FCM delivers a data payload that the system
 * tries to display directly. Never show raw JSON to the user — fall back to human-readable text.
 */
function toDisplayString(value: unknown): string | null {
  const s = toNonEmptyString(value);
  if (!s) return null;
  const t = s.trim();
  // JSON objects/arrays start with { or [ — never valid notification text
  if (t.startsWith("{") || t.startsWith("[")) return null;
  return s;
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

  // Deduplicate: if we've already shown a notification for this ID, skip it.
  // The system and the background handler can both fire for the same push.
  const notifId = raw.notificationId != null ? String(raw.notificationId) : null;
  if (notifId) {
    if (presentedNotificationIds.has(notifId)) return;
    presentedNotificationIds.add(notifId);
    // Prevent unbounded growth
    if (presentedNotificationIds.size > MAX_TRACKED_IDS) {
      const first = presentedNotificationIds.values().next().value;
      if (first) presentedNotificationIds.delete(first);
    }
  }

  const target = extractNotificationTarget(raw);

  if (target.isCallEnded) {
    await dismissIncomingCallNotification(target.roomId, target.callId);
    return;
  }

  const title =
    toDisplayString(raw.title) ??
    (toDisplayString(raw.callerName)
      ? `${toDisplayString(raw.callerName)} is calling…`
      : null) ??
    toDisplayString(raw.senderName) ??
    (target.isCall
      ? "Incoming Kamino Call"
      : target.isEventOrLive
        ? "Live on Kamino"
        : null);

  const body =
    toDisplayString(raw.body) ??
    toDisplayString(raw.text) ??
    toDisplayString(raw.message) ??
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
 * Background push handling (app in the background or killed): runs for data-only pushes. Pushes that carry a
 * title are shown by the system itself on the right channel, so here we only (a) show data-only pushes and
 * (b) take down a ringing call when a "call ended" push arrives. A visible push is never shown twice.
 */
function registerHeadlessBackgroundHandlers(): void {
  if (Platform.OS === "web") return;
  if (!TaskManager.isTaskDefined(BACKGROUND_PUSH_TASK)) {
    TaskManager.defineTask<Record<string, unknown>>(BACKGROUND_PUSH_TASK, async ({ data, error }) => {
      if (error || !data || !isRecord(data)) return;
      try {
        const notificationObj = isRecord(data.notification) ? data.notification : null;
        const requestObj = notificationObj && isRecord(notificationObj.request) ? notificationObj.request : null;
        const contentObj = requestObj && isRecord(requestObj.content) ? requestObj.content : null;
        const hasSystemAlert = Boolean(contentObj && toNonEmptyString(contentObj.title));
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
        if (!hasSystemAlert) await presentDataPayloadNotification(payloadData);
      } catch {
        // Never throw inside a background task.
      }
    });
  }
  void Notifications.registerTaskAsync(BACKGROUND_PUSH_TASK).catch(() => undefined);
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
      description: "Ringing alerts for incoming voice and video calls",
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

/** Gets this phone's Expo push token and saves it on the server. False when there is no EAS project or no token. */
async function registerExpoToken(platform: PushPlatform): Promise<boolean> {
  const easExtra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = easExtra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
  if (!projectId) return false;
  try {
    const expoPush = await Notifications.getExpoPushTokenAsync({ projectId });
    if (typeof expoPush?.data !== "string" || !expoPush.data) return false;
    return await registerTokenViaRpc(expoPush.data, platform, PUSH_TOKEN_KEY);
  } catch {
    // Usually a missing google-services.json (Android) or no network; push stays off until the next launch.
    return false;
  }
}

/**
 * Asks for notification permission (Android 13+ `POST_NOTIFICATIONS` too), creates the Android channels, saves the
 * Expo push token on the server, and re-saves it whenever the phone's token rotates.
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
    // Kamino sends through Expo's push service, which delivers over FCM (Android) and APNs (iOS). Only the
    // Expo token is registered: registering the raw FCM/APNs token too would make every alert arrive twice.
    const registeredAny = await registerExpoToken(platform);

    // When the phone's FCM/APNs token rotates, ask Expo again so the server always has a working token.
    if (!tokenRefreshSubscription) {
      tokenRefreshSubscription = Notifications.addPushTokenListener(() => {
        void registerExpoToken(platform).catch(() => undefined);
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
 * On sign-out: removes this phone's push token from the server, clears the saved token, and stops listening for
 * token changes.
 */
export async function unregisterPushDevice(): Promise<void> {
  tokenRefreshSubscription?.remove();
  tokenRefreshSubscription = null;

  for (const [id] of activeCallRingLoops) {
    stopCallRingLoop(id);
  }

  const expoToken = await readSecret(PUSH_TOKEN_KEY);
  // Builds before this change also saved the raw device token; clear it if it is still there.
  const legacyDeviceToken = await readSecret(LEGACY_DEVICE_TOKEN_KEY);

  if (expoToken) {
    await unregisterTokenViaRpc(expoToken).catch(() => undefined);
    await deleteSecret(PUSH_TOKEN_KEY);
  }
  if (legacyDeviceToken) await deleteSecret(LEGACY_DEVICE_TOKEN_KEY);
}