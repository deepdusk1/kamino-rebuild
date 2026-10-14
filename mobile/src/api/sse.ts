// ===== FILE: mobile/src/api/sse.ts =====
import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { apiBaseUrl } from "@/api/config";
import type { LiveStageState } from "@/api/community-v9";
import type { NotificationsFeed } from "@/api/models";
import type {
  ChatMessage,
  ChatOverviewRoom,
  NotificationItem,
  UserChip,
} from "@/api/types";
import { readSecret } from "@/auth/storage";

const SESSION_TOKEN_KEY = "kamino.session-token";
const HEARTBEAT_WATCHDOG_MS = 35_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export type KaminoRealtimeEventType =
  | "chat.message"
  | "message.new"
  | "message"
  | "chat.typing"
  | "typing.update"
  | "chat.read"
  | "message.read"
  | "call.incoming"
  | "call.ring"
  | "call.ended"
  | "stage.update"
  | "live.stage_update"
  | "watch.sync"
  | "watchparty.sync"
  | "notification.new"
  | "notification"
  | "heartbeat"
  | "ping";

export type WatchSyncPayload = {
  roomId: number;
  isPlaying: boolean;
  positionMs: number;
  playbackRate: number;
  updatedAtEpochMs: number;
};

export type KaminoRealtimeEvent = {
  id: string | null;
  type: KaminoRealtimeEventType;
  roomId: number | null;
  message: ChatMessage | null;
  notification: NotificationItem | null;
  stage: LiveStageState | null;
  watchSync: WatchSyncPayload | null;
  payload: Record<string, unknown>;
  receivedAt: number;
};

export type SSEListener = (event: KaminoRealtimeEvent) => void;

type RoomPageShape = {
  room: {
    id: number;
    name: string;
    kind: string;
    communityId?: string | null;
    peerHandle?: string | null;
    watchUrl?: string | null;
    watchTitle?: string | null;
  };
  messages: ChatMessage[];
  participants: { userId: string; name: string }[];
  voices: { userId: string; name: string }[];
};

type ChatsOverviewShape = {
  rooms: ChatOverviewRoom[];
  requests: number;
};

type TypingShape = {
  userIds: string[];
  names: string[];
};

type ReceiptsShape = {
  seenBy: { userId: string; lastReadId: number }[];
};

type IncomingCallRow = {
  id: number;
  name: string;
  href: string;
  createdAt?: string;
};

type BootstrapShape = {
  profile?: { userId: string; displayName: string; handle: string };
  unreadNotifications?: number;
  unreadMessages?: number;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseUserChip(raw: unknown): UserChip | null {
  if (!isRecord(raw)) return null;
  const userId = typeof raw.userId === "string" ? raw.userId : typeof raw.id === "string" ? raw.id : "";
  if (!userId) return null;
  return {
    userId,
    handle: typeof raw.handle === "string" ? raw.handle : userId,
    nickname:
      typeof raw.nickname === "string"
        ? raw.nickname
        : typeof raw.displayName === "string"
          ? raw.displayName
          : "Member",
    hue: typeof raw.hue === "number" && Number.isFinite(raw.hue) ? raw.hue : 260,
    avatarV: typeof raw.avatarV === "number" && Number.isFinite(raw.avatarV) ? raw.avatarV : 0,
    role:
      raw.role === "leader" ||
      raw.role === "agent" ||
      raw.role === "curator" ||
      raw.role === "member"
        ? raw.role
        : "member",
  };
}

function parseChatMessage(raw: unknown, fallbackRoomId: number | null): ChatMessage | null {
  if (!isRecord(raw)) return null;
  const id = toFiniteNumber(raw.id ?? raw.messageId);
  const roomId = toFiniteNumber(raw.roomId ?? raw.room_id) ?? fallbackRoomId;
  const author = parseUserChip(raw.author);
  if (id === null || roomId === null || !author) return null;

  const replyTo = toFiniteNumber(raw.replyTo ?? raw.reply_to);
  const mediaKind =
    raw.mediaKind === "image" || raw.mediaKind === "audio" || raw.mediaKind === "video"
      ? raw.mediaKind
      : null;

  const reactionsRaw = Array.isArray(raw.reactions) ? raw.reactions : [];
  const reactions: ChatMessage["reactions"] = [];
  for (const item of reactionsRaw) {
    if (isRecord(item) && typeof item.emoji === "string") {
      reactions.push({
        emoji: item.emoji,
        count: toFiniteNumber(item.count) ?? 1,
        mine: Boolean(item.mine),
      });
    }
  }

  return {
    id,
    roomId,
    author,
    body: typeof raw.body === "string" ? raw.body : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    editedAt: typeof raw.editedAt === "string" ? raw.editedAt : null,
    deleted: Boolean(raw.deleted),
    replyTo,
    mediaKind,
    reactions,
    bubbleStyle:
      raw.bubbleStyle === "glass" ||
      raw.bubbleStyle === "outline" ||
      raw.bubbleStyle === "bold" ||
      raw.bubbleStyle === "soft"
        ? raw.bubbleStyle
        : "soft",
    bubbleHue: typeof raw.bubbleHue === "number" && Number.isFinite(raw.bubbleHue) ? raw.bubbleHue : author.hue,
  };
}

function parseWatchSync(raw: Record<string, unknown>, roomId: number | null): WatchSyncPayload | null {
  const resolvedRoom = toFiniteNumber(raw.roomId ?? raw.room_id) ?? roomId;
  if (resolvedRoom === null) return null;
  return {
    roomId: resolvedRoom,
    isPlaying: Boolean(raw.isPlaying ?? raw.playing),
    positionMs: toFiniteNumber(raw.positionMs ?? raw.position_ms) ?? 0,
    playbackRate:
      typeof raw.playbackRate === "number" && Number.isFinite(raw.playbackRate)
        ? raw.playbackRate
        : 1.0,
    updatedAtEpochMs:
      toFiniteNumber(raw.updatedAtEpochMs ?? raw.updated_at_ms) ?? Date.now(),
  };
}

function parseLiveStage(raw: unknown): LiveStageState | null {
  if (!isRecord(raw)) return null;
  const roomId = toFiniteNumber(raw.roomId ?? raw.room_id);
  if (roomId === null) return null;
  const participantsRaw = Array.isArray(raw.participants) ? raw.participants : [];
  const participants: LiveStageState["participants"] = [];
  for (const p of participantsRaw) {
    if (!isRecord(p) || typeof p.userId !== "string") continue;
    participants.push({
      userId: p.userId,
      nickname: typeof p.nickname === "string" ? p.nickname : "Member",
      role: p.role === "host" || p.role === "speaker" ? p.role : "member",
      cohost: Boolean(p.cohost),
      muted: Boolean(p.muted),
      raised: Boolean(p.raised),
    });
  }
  return {
    roomId,
    title: typeof raw.title === "string" ? raw.title : "",
    topic: typeof raw.topic === "string" ? raw.topic : "",
    recording: Boolean(raw.recording),
    participants,
    reactions: Array.isArray(raw.reactions)
      ? raw.reactions.filter(
          (r): r is { emoji: string; userId: string; at: string } =>
            isRecord(r) && typeof r.emoji === "string" && typeof r.userId === "string" && typeof r.at === "string",
        )
      : [],
  };
}

function parseNotificationItem(raw: unknown): NotificationItem | null {
  if (!isRecord(raw)) return null;
  const id = toFiniteNumber(raw.id ?? raw.notificationId);
  if (id === null) return null;
  const actorChip = parseUserChip(raw.actor);
  return {
    id,
    title: typeof raw.title === "string" ? raw.title : "Kamino",
    body: typeof raw.body === "string" ? raw.body : "",
    verb: typeof raw.verb === "string" ? raw.verb : "",
    href: typeof raw.href === "string" ? raw.href : "",
    read: Boolean(raw.read),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    category:
      raw.category === "mentions" ||
      raw.category === "follows" ||
      raw.category === "community" ||
      raw.category === "events" ||
      raw.category === "messages"
        ? raw.category
        : "all",
    actor: actorChip
      ? {
          ...actorChip,
          headline: isRecord(raw.actor) && typeof raw.actor.headline === "string" ? raw.actor.headline : "",
          followers: isRecord(raw.actor) ? (toFiniteNumber(raw.actor.followers) ?? 0) : 0,
        }
      : null,
    actorFollowed: Boolean(raw.actorFollowed),
    action:
      raw.action === "followBack" || raw.action === "join" || raw.action === "open"
        ? raw.action
        : null,
    actionTarget: typeof raw.actionTarget === "string" ? raw.actionTarget : "",
    snippet: typeof raw.snippet === "string" ? raw.snippet : null,
    thumb: typeof raw.thumb === "string" ? raw.thumb : null,
    live: Boolean(raw.live),
    community: null,
    room: null,
    event: null,
  };
}

function normalizeEventType(rawEventName: string, payload: Record<string, unknown>): KaminoRealtimeEventType {
  const candidate = (
    rawEventName && rawEventName !== "message"
      ? rawEventName
      : typeof payload.type === "string"
        ? payload.type
        : typeof payload.event === "string"
          ? payload.event
          : rawEventName || "message"
  )
    .trim()
    .toLowerCase();

  switch (candidate) {
    case "chat.message":
    case "message.new":
    case "message":
    case "chat.typing":
    case "typing.update":
    case "chat.read":
    case "message.read":
    case "call.incoming":
    case "call.ring":
    case "call.ended":
    case "stage.update":
    case "live.stage_update":
    case "watch.sync":
    case "watchparty.sync":
    case "notification.new":
    case "notification":
    case "heartbeat":
    case "ping":
      return candidate;
    default:
      return "message";
  }
}

/**
 * Production-grade Server-Sent Events (SSE) Engine for Kamino (`GET /api/events`).
 * - Streams real-time events over persistent HTTP with `Authorization: Bearer <token>`
 * - Tracks `Last-Event-ID` header + query param for lossless resume across network drops
 * - Enforces a 35-second heartbeat watchdog timer that resets on every frame/comment/ping
 * - Exponential backoff with jitter (1s -> 2s -> 4s -> 8s -> 16s -> max 30s)
 * - Updates React Query caches directly for instant zero-polling UI reactivity
 */
class KaminoSSEManager {
  private listeners = new Set<SSEListener>();
  private queryClients = new Set<QueryClient>();
  private xhr: XMLHttpRequest | null = null;
  private lastEventId: string | null = null;
  private processedOffsets = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private desiredActive = false;
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription: { remove: () => void } | null = null;
  private connecting = false;

  public registerQueryClient(client: QueryClient): () => void {
    this.queryClients.add(client);
    return () => {
      this.queryClients.delete(client);
    };
  }

  public addListener(listener: SSEListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setSignedIn(signedIn: boolean): void {
    if (this.desiredActive === signedIn) return;
    this.desiredActive = signedIn;

    if (signedIn) {
      this.attachAppStateListener();
      this.reconnectAttempts = 0;
      void this.connect();
    } else {
      this.lastEventId = null;
      this.detachAppStateListener();
      this.teardownConnection();
    }
  }

  private attachAppStateListener(): void {
    if (this.appStateSubscription) return;
    this.appStateSubscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const wasBackground = this.appState.match(/inactive|background/);
      this.appState = nextState;
      if (wasBackground && nextState === "active" && this.desiredActive) {
        this.reconnectAttempts = 0;
        if (!this.xhr) {
          void this.connect();
        } else {
          this.resetWatchdog();
        }
      }
    });
  }

  private detachAppStateListener(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private resetWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
    }
    if (!this.desiredActive) return;
    this.watchdogTimer = setTimeout(() => {
      // 35s elapsed with zero bytes or heartbeats on the stream -> force reconnect
      this.handleDisconnect();
    }, HEARTBEAT_WATCHDOG_MS);
  }

  private teardownConnection(): void {
    this.clearTimers();
    this.connecting = false;
    if (this.xhr) {
      const current = this.xhr;
      this.xhr = null;
      current.onprogress = null;
      current.onreadystatechange = null;
      current.onerror = null;
      current.onload = null;
      try {
        current.abort();
      } catch {
        // Ignore abort errors on already-closed sockets
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.desiredActive || this.reconnectTimer) return;
    const exp = Math.min(
      MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * Math.pow(2, this.reconnectAttempts),
    );
    const jitter = Math.floor(Math.random() * 450);
    const delay = Math.min(MAX_BACKOFF_MS, exp + jitter);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.desiredActive) {
        void this.connect();
      }
    }, delay);
  }

  private handleDisconnect(): void {
    this.teardownConnection();
    if (this.desiredActive) {
      this.scheduleReconnect();
    }
  }

  private async connect(): Promise<void> {
    if (!this.desiredActive || this.connecting || this.xhr) return;
    this.connecting = true;

    try {
      const token = await readSecret(SESSION_TOKEN_KEY);
      if (!token || !this.desiredActive) {
        this.connecting = false;
        if (this.desiredActive) this.scheduleReconnect();
        return;
      }

      const base = apiBaseUrl().replace(/\/+$/, "");
      const url = this.lastEventId
        ? `${base}/api/events?lastEventId=${encodeURIComponent(this.lastEventId)}`
        : `${base}/api/events`;

      const xhr = new XMLHttpRequest();
      this.xhr = xhr;
      this.processedOffsets = 0;

      xhr.open("GET", url, true);
      xhr.setRequestHeader("Accept", "text/event-stream");
      xhr.setRequestHeader("Cache-Control", "no-cache");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      if (this.lastEventId) {
        xhr.setRequestHeader("Last-Event-ID", this.lastEventId);
      }

      this.resetWatchdog();

      xhr.onreadystatechange = () => {
        if (this.xhr !== xhr) return;
        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
          if (xhr.status >= 200 && xhr.status < 300) {
            this.reconnectAttempts = 0;
            this.resetWatchdog();
          } else if (xhr.status === 401 || xhr.status === 403) {
            this.teardownConnection();
          } else if (xhr.status >= 400) {
            this.handleDisconnect();
          }
        } else if (xhr.readyState === XMLHttpRequest.DONE) {
          this.handleDisconnect();
        }
      };

      xhr.onprogress = () => {
        if (this.xhr !== xhr) return;
        this.resetWatchdog();
        this.consumeBuffer(xhr.responseText || "");
      };

      xhr.onerror = () => {
        if (this.xhr !== xhr) return;
        this.handleDisconnect();
      };

      xhr.ontimeout = () => {
        if (this.xhr !== xhr) return;
        this.handleDisconnect();
      };

      xhr.send();
    } catch {
      this.connecting = false;
      this.handleDisconnect();
      return;
    }

    this.connecting = false;
  }

  private consumeBuffer(fullText: string): void {
    if (fullText.length <= this.processedOffsets) return;
    const unreadSlice = fullText.slice(this.processedOffsets);

    const normalized = unreadSlice.replace(/\r\n/g, "\n");
    const lastBoundary = normalized.lastIndexOf("\n\n");
    if (lastBoundary === -1) {
      return;
    }

    // Advance offset in raw responseText corresponding to complete SSE frames
    const rawBoundaryIndex = this.findRawDoubleNewlineOffset(fullText, this.processedOffsets);
    if (rawBoundaryIndex === -1) return;

    const completeFramesChunk = fullText
      .slice(this.processedOffsets, rawBoundaryIndex)
      .replace(/\r\n/g, "\n");
    this.processedOffsets = rawBoundaryIndex;

    const rawFrames = completeFramesChunk.split("\n\n");
    for (const frame of rawFrames) {
      if (!frame.trim()) continue;
      this.parseAndDispatchFrame(frame);
    }
  }

  private findRawDoubleNewlineOffset(text: string, startFrom: number): number {
    let lastMatchEnd = -1;
    let i = startFrom;
    while (i < text.length - 1) {
      if (text[i] === "\n" && text[i + 1] === "\n") {
        lastMatchEnd = i + 2;
        i += 2;
      } else if (
        text[i] === "\r" &&
        text[i + 1] === "\n" &&
        i + 3 < text.length &&
        text[i + 2] === "\r" &&
        text[i + 3] === "\n"
      ) {
        lastMatchEnd = i + 4;
        i += 4;
      } else {
        i += 1;
      }
    }
    return lastMatchEnd;
  }

  private parseAndDispatchFrame(frame: string): void {
    const lines = frame.split("\n");
    let eventName = "message";
    let eventId: string | null = null;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        // Comment / heartbeat frame (e.g. `: keepalive`) — watchdog already reset
        continue;
      }
      const colonIdx = line.indexOf(":");
      const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
      const rawVal = colonIdx === -1 ? "" : line.slice(colonIdx + 1);
      const value = rawVal.startsWith(" ") ? rawVal.slice(1) : rawVal;

      if (field === "event") {
        eventName = value;
      } else if (field === "id") {
        if (value) {
          eventId = value;
          this.lastEventId = value;
        }
      } else if (field === "data") {
        dataLines.push(value);
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join("\n").trim();
    if (!rawData) return;

    let parsedPayload: Record<string, unknown> = {};
    try {
      const json: unknown = JSON.parse(rawData);
      if (isRecord(json)) {
        parsedPayload = json;
      } else {
        parsedPayload = { value: json };
      }
    } catch {
      parsedPayload = { raw: rawData };
    }

    const type = normalizeEventType(eventName, parsedPayload);
    if (type === "heartbeat" || type === "ping") {
      return;
    }

    const resolvedId =
      eventId ??
      (typeof parsedPayload.id === "string"
        ? parsedPayload.id
        : typeof parsedPayload.id === "number"
          ? String(parsedPayload.id)
          : null);

    if (resolvedId) {
      this.lastEventId = resolvedId;
    }

    const roomId =
      toFiniteNumber(parsedPayload.roomId ?? parsedPayload.room_id) ??
      (isRecord(parsedPayload.message)
        ? toFiniteNumber(parsedPayload.message.roomId ?? parsedPayload.message.room_id)
        : null);

    const message =
      type === "chat.message" || type === "message.new" || type === "message"
        ? parseChatMessage(parsedPayload.message ?? parsedPayload, roomId)
        : null;

    const stage =
      type === "stage.update" || type === "live.stage_update"
        ? parseLiveStage(parsedPayload.stage ?? parsedPayload)
        : null;

    const watchSync =
      type === "watch.sync" || type === "watchparty.sync"
        ? parseWatchSync(
            isRecord(parsedPayload.watchSync) ? parsedPayload.watchSync : parsedPayload,
            roomId,
          )
        : null;

    const notification =
      type === "notification.new" || type === "notification"
        ? parseNotificationItem(parsedPayload.notification ?? parsedPayload)
        : null;

    const event: KaminoRealtimeEvent = {
      id: resolvedId,
      type,
      roomId: roomId ?? message?.roomId ?? stage?.roomId ?? watchSync?.roomId ?? null,
      message,
      notification,
      stage,
      watchSync,
      payload: parsedPayload,
      receivedAt: Date.now(),
    };

    this.applyQueryCacheUpdates(event);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Never allow a subscriber exception to break the SSE loop
      }
    }
  }

  private applyQueryCacheUpdates(event: KaminoRealtimeEvent): void {
    for (const client of this.queryClients) {
      switch (event.type) {
        case "chat.message":
        case "message.new":
        case "message":
          this.applyChatMessageCache(client, event);
          break;
        case "chat.typing":
        case "typing.update":
          this.applyChatTypingCache(client, event);
          break;
        case "chat.read":
        case "message.read":
          this.applyChatReadCache(client, event);
          break;
        case "call.incoming":
        case "call.ring":
          this.applyCallIncomingCache(client, event);
          break;
        case "call.ended":
          this.applyCallEndedCache(client, event);
          break;
        case "stage.update":
        case "live.stage_update":
          this.applyStageUpdateCache(client, event);
          break;
        case "watch.sync":
        case "watchparty.sync":
          this.applyWatchSyncCache(client, event);
          break;
        case "notification.new":
        case "notification":
          this.applyNotificationNewCache(client, event);
          break;
        default:
          break;
      }
    }
  }

  private applyChatMessageCache(client: QueryClient, event: KaminoRealtimeEvent): void {
    const roomId = event.roomId;
    if (roomId === null) return;

    if (event.message) {
      const incomingMsg = event.message;
      client.setQueryData<RoomPageShape>(["room", roomId], (old) => {
        if (!old) return old;
        const exists = old.messages.some((m) => m.id === incomingMsg.id);
        const nextMessages = exists
          ? old.messages.map((m) => (m.id === incomingMsg.id ? incomingMsg : m))
          : [...old.messages, incomingMsg];
        return {
          ...old,
          messages: nextMessages,
        };
      });

      client.setQueryData<ChatsOverviewShape>(["chatsOverview"], (old) => {
        if (!old) return old;
        let found = false;
        const updatedRooms = old.rooms.map((r) => {
          if (r.id !== roomId) return r;
          found = true;
          return {
            ...r,
            lastAt: incomingMsg.createdAt,
            lastMessage: incomingMsg.body,
            lastAuthor: incomingMsg.author.nickname,
            unread: (r.unread ?? 0) + 1,
          };
        });
        if (!found) return old;
        return {
          ...old,
          rooms: updatedRooms,
        };
      });

      // Clear sender from typing list once their message arrives
      client.setQueryData<TypingShape>(["typing", roomId], (old) => {
        if (!old) return old;
        const idx = old.userIds.indexOf(incomingMsg.author.userId);
        if (idx === -1) return old;
        return {
          userIds: old.userIds.filter((_, i) => i !== idx),
          names: old.names.filter((_, i) => i !== idx),
        };
      });
    } else {
      void client.invalidateQueries({ queryKey: ["room", roomId] });
      void client.invalidateQueries({ queryKey: ["chatsOverview"] });
    }
  }

  private applyChatTypingCache(client: QueryClient, event: KaminoRealtimeEvent): void {
    const roomId = event.roomId;
    if (roomId === null) return;

    const payload = event.payload;
    const userIds = Array.isArray(payload.userIds)
      ? payload.userIds.filter((x): x is string => typeof x === "string")
      : typeof payload.userId === "string"
        ? [payload.userId]
        : null;
    const names = Array.isArray(payload.names)
      ? payload.names.filter((x): x is string => typeof x === "string")
      : typeof payload.name === "string"
        ? [payload.name]
        : typeof payload.nickname === "string"
          ? [payload.nickname]
          : null;

    if (userIds && names && userIds.length === names.length) {
      client.setQueryData<TypingShape>(["typing", roomId], { userIds, names });
    } else {
      void client.invalidateQueries({ queryKey: ["typing", roomId] });
    }
  }

  private applyChatReadCache(client: QueryClient, event: KaminoRealtimeEvent): void {
    const roomId = event.roomId;
    if (roomId === null) return;

    const userId = typeof event.payload.userId === "string" ? event.payload.userId : null;
    const lastReadId = toFiniteNumber(event.payload.lastReadId ?? event.payload.messageId);

    if (userId && lastReadId !== null) {
      client.setQueryData<ReceiptsShape>(["receipts", roomId], (old) => {
        const existing = old?.seenBy ?? [];
        const hasUser = existing.some((s) => s.userId === userId);
        const nextSeenBy = hasUser
          ? existing.map((s) =>
              s.userId === userId
                ? { ...s, lastReadId: Math.max(s.lastReadId, lastReadId) }
                : s,
            )
          : [...existing, { userId, lastReadId }];
        return { seenBy: nextSeenBy };
      });
    } else {
      void client.invalidateQueries({ queryKey: ["receipts", roomId] });
    }
  }

  private applyCallIncomingCache(client: QueryClient, event: KaminoRealtimeEvent): void {
    const roomId = event.roomId;
    const callId = toFiniteNumber(event.payload.callId ?? event.payload.id) ?? Date.now();
    const callerName =
      typeof event.payload.callerName === "string"
        ? event.payload.callerName
        : typeof event.payload.name === "string"
          ? event.payload.name
          : "Kamino Member";
    const href =
      typeof event.payload.href === "string" && event.payload.href
        ? event.payload.href
        : roomId !== null
          ? `/chats/${roomId}?call=1`
          : null;

    if (href) {
      client.setQueryData<IncomingCallRow[]>(["incomingCalls"], (old) => {
        const list = old ?? [];
        if (list.some((c) => c.id === callId || c.href === href)) return list;
        return [{ id: callId, name: callerName, href, createdAt: new Date().toISOString() }, ...list];
      });
    }
    void client.invalidateQueries({ queryKey: ["incomingCalls"] });
  }

  private applyCallEndedCache(client: QueryClient, event: KaminoRealtimeEvent): void {
    const roomId = event.roomId;
    const callId = toFiniteNumber(event.payload.callId ?? event.payload.id);

    client.setQueryData<IncomingCallRow[]>(["incomingCalls"], (old) => {
      if (!old) return old;
      return old.filter((c) => {
        if (callId !== null && c.id === callId) return false;
        if (roomId !== null && c.href === `/chats/${roomId}?call=1`) return false;
        return true;
      });
    });
    void client.invalidateQueries({ queryKey: ["incomingCalls"] });
  }

  private applyStageUpdateCache(client: QueryClient, event: KaminoRealtimeEvent): void {
    const roomId = event.roomId;
    if (roomId === null) return;
    if (event.stage) {
      client.setQueryData<LiveStageState>(["live-stage", roomId], event.stage);
    } else {
      void client.invalidateQueries({ queryKey: ["live-stage", roomId] });
    }
    void client.invalidateQueries({ queryKey: ["liveRooms"] });
  }

  private applyWatchSyncCache(client: QueryClient, event: KaminoRealtimeEvent): void {
    const roomId = event.roomId;
    if (roomId === null || !event.watchSync) return;
    client.setQueryData<WatchSyncPayload>(["watch-sync", roomId], event.watchSync);
  }

  private applyNotificationNewCache(client: QueryClient, event: KaminoRealtimeEvent): void {
    if (event.notification) {
      const notif = event.notification;
      client.setQueriesData<InfiniteData<NotificationsFeed>>(
        { queryKey: ["notificationsFeed"] },
        (old) => {
          if (!old || old.pages.length === 0) return old;
          const firstPage = old.pages[0]!;
          if (firstPage.items.some((item) => item.id === notif.id)) return old;
          const updatedFirst: NotificationsFeed = {
            ...firstPage,
            unread: (firstPage.unread ?? 0) + (notif.read ? 0 : 1),
            items: [notif, ...firstPage.items],
          };
          return {
            ...old,
            pages: [updatedFirst, ...old.pages.slice(1)],
          };
        },
      );
    } else {
      void client.invalidateQueries({ queryKey: ["notificationsFeed"] });
    }

    client.setQueryData<BootstrapShape>(["bootstrap"], (old) => {
      if (!old) return old;
      const current = typeof old.unreadNotifications === "number" ? old.unreadNotifications : 0;
      return {
        ...old,
        unreadNotifications: current + 1,
      };
    });
    void client.invalidateQueries({ queryKey: ["followRequests"] });
  }
}

const sseManager = new KaminoSSEManager();

/**
 * Connects and maintains the singleton SSE connection (`GET /api/events`) while `signedIn` is true,
 * and binds the active React Query `QueryClient` for real-time cache synchronization.
 */
export function useRealtimeSSE(signedIn: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unregisterClient = sseManager.registerQueryClient(queryClient);
    return unregisterClient;
  }, [queryClient]);

  useEffect(() => {
    sseManager.setSignedIn(signedIn);
  }, [signedIn]);
}

/**
 * Subscribes a component to live SSE events without re-binding the underlying stream when the callback changes.
 */
export function useSSEListener(listener: SSEListener): void {
  const callbackRef = useRef<SSEListener>(listener);
  callbackRef.current = listener;

  useEffect(() => {
    return sseManager.addListener((event) => {
      callbackRef.current(event);
    });
  }, []);
}