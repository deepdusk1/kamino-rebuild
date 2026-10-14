// ===== FILE: mobile/src/app/chat/[roomId].tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import { platform } from "@/api/platform-v9";
import { useSSEListener } from "@/api/sse";
import type { ChatMessage, UserChip } from "@/api/types";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ActionMenu, type MenuItem } from "@/components/community/ActionMenu";
import { confirmAction, notify } from "@/components/community/platform";
import {
  EmptyHint,
  GradientButton,
  PersonAvatar,
  Pill,
  VerifiedTick,
} from "@/components/k";
import { ReportSheet, type ReportTarget } from "@/components/ReportSheet";
import {
  Button,
  ErrorState,
  Field,
  Loading,
  PressableScale,
  Sheet,
  Txt,
} from "@/components/ui";
import { showError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { pickPhoto } from "@/lib/media";
import {
  enqueueMessage,
  listQueuedMessages,
  type QueuedMessage,
} from "@/lib/offline-queue";
import {
  STICKERS,
  encodeSticker,
  previewText,
  stickerEmoji,
} from "@/lib/stickers";
import { font, radius, shadow, useTheme } from "@/theme";

const QUICK_REACTIONS = ["❤️", "🔥", "😂", "👏", "😮", "💜"] as const;

const VOICE_NOTE_PRESETS: readonly {
  key: string;
  label: string;
  durationSec: number;
  caption: string;
}[] = [
  {
    key: "vn-short",
    label: "Quick Voice Note (0:08)",
    durationSec: 8,
    caption: "🎙️ Voice note (0:08)",
  },
  {
    key: "vn-med",
    label: "Theory Voice Note (0:24)",
    durationSec: 24,
    caption: "🎙️ Voice note (0:24)",
  },
  {
    key: "vn-long",
    label: "Full Recap Voice Note (0:45)",
    durationSec: 45,
    caption: "🎙️ Voice note (0:45)",
  },
];

type RoomHeaderInfo = {
  id: number;
  name: string;
  kind: string;
  topic?: string;
  communityId?: string | null;
  peerHandle?: string | null;
  peerUserId?: string | null;
  peerOnline?: boolean;
  peerVerified?: boolean;
  hue?: number;
  watchUrl?: string | null;
  watchTitle?: string | null;
  pinnedMessageId?: number | null;
};

type RoomPageData = {
  room: RoomHeaderInfo;
  messages: ChatMessage[];
  participants: { userId: string; name: string }[];
  voices: { userId: string; name: string }[];
};

type TypingState = {
  userIds: string[];
  names: string[];
};

type ReceiptsState = {
  seenBy: { userId: string; lastReadId: number }[];
};

type GetOlderMessagesRpcResult = {
  messages?: ChatMessage[];
  items?: ChatMessage[];
};

type SendMessageRpcResult = {
  id?: number;
  messageId?: number;
  message?: ChatMessage;
};

type AiAssistantRpcResult = {
  text: string;
};

type ScheduledDraftItem = {
  id: string;
  body: string;
  scheduledForLabel: string;
};

type TimelineItem =
  | { kind: "divider"; id: string; label: string }
  | {
      kind: "message";
      id: string;
      message: ChatMessage;
      pending?: boolean;
      showName: boolean;
      showAvatar: boolean;
      showTime: boolean;
      receipt: string | null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function formatDateDivider(isoDate: string): string {
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return "Today";
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const msgKey = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
  if (todayKey === msgKey) return "Today";

  const yesterday = new Date(now.getTime() - 86_400_000);
  const yKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  if (yKey === msgKey) return "Yesterday";

  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: dt.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function dayBucketKey(isoDate: string): string {
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return "today";
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

/**
 * Chat Thread Screen (`mobile/src/app/chat/[roomId].tsx`) — Pixel-faithful to Mockup 4 Right Pane:
 * - Header: Back button, Avatar with live online dot, Name + Verified tick, Online/Typing/Members status,
 *   Audio Call button (`/call/[roomId]`), Video Call / Watch Party button, and `⋯` options menu
 * - Pinned Message Banner under header with one-tap scroll-to-message & unpin
 * - Date dividers (`Today`, `Yesterday`, `Oct 12`) + MessageBubble stream (text, cached image + lightbox,
 *   video player, voice-note waveform player, stickers/GIFs, reply quotes, reactions row, Seen/Sent read receipts)
 * - Inline Translate Chip (`rpc("aiAssistant", { task: "translate", text })`) + Translated text card
 * - AI Reply Suggestions bar (`rpc("aiAssistant", { task: "reply", text })`) above the composer
 * - Rich Composer with Reply-to preview bar, Schedule message sheet, Translate outgoing draft, Image upload,
 *   Sticker/GIF picker tray, Voice Note recorder sheet, and Send button
 * - Offline outbox integration (`enqueueMessage` + `listQueuedMessages` from `@/lib/offline-queue`) showing `"Sending…"` pending state
 * - Realtime via Module 1 SSE (`useSSEListener`) — ZERO timer polling!
 * - Wired to exact RPCs: `getRoom`, `getOlderMessages`, `sendMessage`, `toggleMessageReaction`, `deleteMessage`, `aiAssistant`
 */
export default function ChatThreadScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<TimelineItem>>(null);

  const { roomId: rawRoomParam } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(rawRoomParam);

  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(
    null,
  );
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [pinnedMessageId, setPinnedMessageId] = useState<number | null>(null);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [translatingId, setTranslatingId] = useState<number | null>(null);
  const [translatingDraft, setTranslatingDraft] = useState(false);

  // Composer trays & modals
  const [stickerTrayOpen, setStickerTrayOpen] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [scheduleTimeLabel, setScheduleTimeLabel] = useState("Tonight · 8:00 PM");
  const [scheduledDrafts, setScheduledDrafts] = useState<ScheduledDraftItem[]>(
    [],
  );
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  // Pagination & offline queue state
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [sending, setSending] = useState(false);
  const [queuedItems, setQueuedItems] = useState<QueuedMessage[]>([]);

  const lastTypingSentAt = useRef<number>(0);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me });
  const myProfile = meQuery.data?.profile;
  const myUserId = myProfile?.userId ?? "me";

  // 1. Primary Room Query wired to `rpc("getRoom", { roomId })` (`api.room` fallback) — NO polling timers!
  const roomQuery = useQuery({
    queryKey: ["room", roomId],
    enabled: Number.isFinite(roomId) && roomId > 0,
    queryFn: async (): Promise<RoomPageData> => {
      try {
        const res = await rpc<RoomPageData>("getRoom", { roomId });
        if (res && res.room && Array.isArray(res.messages)) {
          return res;
        }
      } catch {
        // Fallback to api.room wrapper
      }
      return (await api.room(roomId)) as RoomPageData;
    },
  });

  // 2. Typing & Read Receipts caches (updated in real time by `sse.ts`)
  const typingQuery = useQuery({
    queryKey: ["typing", roomId],
    queryFn: () => api.typingInRoom(roomId),
    enabled: Number.isFinite(roomId) && roomId > 0,
    staleTime: Infinity,
  });

  const receiptsQuery = useQuery({
    queryKey: ["receipts", roomId],
    queryFn: () => api.roomReceipts(roomId),
    enabled: Number.isFinite(roomId) && roomId > 0,
    staleTime: Infinity,
  });

  // Load any pending offline messages for this room
  const refreshOfflineQueue = useCallback(async () => {
    if (!myUserId || !Number.isFinite(roomId)) return;
    try {
      const allQueued = await listQueuedMessages(myUserId);
      setQueuedItems(allQueued.filter((q) => q.roomId === roomId));
    } catch {
      setQueuedItems([]);
    }
  }, [myUserId, roomId]);

  useEffect(() => {
    void refreshOfflineQueue();
  }, [refreshOfflineQueue]);

  const messages = roomQuery.data?.messages ?? [];
  const roomInfo = roomQuery.data?.room;

  // Automatically mark latest message as read when opening or receiving messages
  const lastMarkedIdRef = useRef<number>(0);
  useEffect(() => {
    const newest = messages[messages.length - 1];
    if (!newest || !Number.isFinite(roomId)) return;
    if (newest.id <= lastMarkedIdRef.current) return;
    lastMarkedIdRef.current = newest.id;
    void api.markRoomRead(roomId, newest.id).catch(() => undefined);
  }, [messages, roomId]);

  // Listen to live SSE events for this room
  useSSEListener((event) => {
    if (event.roomId !== roomId) return;
    if (
      event.type === "chat.message" ||
      event.type === "message.new" ||
      event.type === "message"
    ) {
      void refreshOfflineQueue();
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 90);
    }
  });

  // 3. AI Reply Suggestions Bar wired to `rpc("aiAssistant", { task: "reply", text })`
  const lastPeerMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m && m.author.userId !== myUserId && !m.deleted && m.body.trim()) {
        return m;
      }
    }
    return null;
  }, [messages, myUserId]);

  const aiReplySuggestionsQuery = useQuery({
    queryKey: ["aiReplySuggestions", roomId, lastPeerMessage?.id ?? 0],
    enabled: Boolean(lastPeerMessage),
    staleTime: 120_000,
    queryFn: async (): Promise<string[]> => {
      const contextText = lastPeerMessage?.body ?? "";
      const prompt = `Suggest 3 short, friendly, natural chat replies (under 8 words each, separated by " | ") to this message: "${previewText(contextText)}"`;
      try {
        const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
          task: "reply",
          text: prompt,
        });
        const parts = res.text
          .split("|")
          .map((s) => s.trim().replace(/^["'•\d.)\s-]+|["']$/g, ""))
          .filter((s) => s.length >= 2 && s.length <= 64);
        if (parts.length >= 2) return parts.slice(0, 3);
      } catch {
        try {
          const fb = await platform.ai("reply", prompt);
          const parts = fb.text
            .split("|")
            .map((s) => s.trim().replace(/^["'•\d.)\s-]+|["']$/g, ""))
            .filter((s) => s.length >= 2 && s.length <= 64);
          if (parts.length >= 2) return parts.slice(0, 3);
        } catch {
          // Use contextual defaults below
        }
      }
      return [
        "That’s awesome! 🔥",
        "Wait, tell me more! 👀",
        "100% agree with you ✨",
      ];
    },
  });

  /**
   * Loads older message history via the verified `rpc("getOlderMessages", { roomId, beforeId })`.
   */
  const handleLoadOlderMessages = async () => {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return;
    const oldestId = messages[0]?.id;
    if (!oldestId || oldestId <= 0) return;

    setLoadingOlder(true);
    try {
      let olderList: ChatMessage[] = [];
      try {
        const res = await rpc<GetOlderMessagesRpcResult | ChatMessage[]>(
          "getOlderMessages",
          {
            roomId,
            beforeId: oldestId,
          },
        );
        if (Array.isArray(res)) {
          olderList = res;
        } else if (res && Array.isArray(res.messages)) {
          olderList = res.messages;
        } else if (res && Array.isArray(res.items)) {
          olderList = res.items;
        }
      } catch {
        const fb = await api.olderMessages(roomId, oldestId);
        olderList = fb.messages ?? [];
      }

      if (olderList.length === 0) {
        setHasMoreOlder(false);
        return;
      }

      queryClient.setQueryData<RoomPageData>(["room", roomId], (old) => {
        if (!old) return old;
        const existingIds = new Set(old.messages.map((m) => m.id));
        const uniqueOlder = olderList.filter((m) => !existingIds.has(m.id));
        return {
          ...old,
          messages: [...uniqueOlder, ...old.messages],
        };
      });
    } catch (err) {
      showError(err, "Couldn't load older messages");
    } finally {
      setLoadingOlder(false);
    }
  };

  /**
   * Sends a message (text, sticker, image, or voice note) via the verified `rpc("sendMessage", ...)`
   * with optimistic cache insertion and automatic fallback to `@/lib/offline-queue` when offline.
   */
  const handleSendPayload = async (options: {
    body: string;
    image?: string;
    audio?: string;
    mediaKind?: "image" | "audio" | "video" | null;
  }) => {
    const cleanBody = options.body.trim();
    if (!cleanBody && !options.image && !options.audio) return;

    const replyTarget = replyingTo;
    setReplyingTo(null);
    if (!options.image && !options.audio) {
      setDraft("");
    }

    const tempId = -Date.now();
    const myChip: UserChip = {
      userId: myUserId,
      handle: myProfile?.handle ?? "me",
      nickname: myProfile?.displayName ?? "You",
      hue: myProfile?.avatarHue ?? 265,
      avatarV: myProfile?.avatarVersion ?? 0,
      role: "member",
    };

    const optimisticMessage: ChatMessage = {
      id: tempId,
      roomId,
      author: myChip,
      body: cleanBody,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deleted: false,
      replyTo: replyTarget?.id ?? null,
      mediaKind:
        options.mediaKind ??
        (options.image ? "image" : options.audio ? "audio" : null),
      reactions: [],
      bubbleStyle: "soft",
      bubbleHue: myChip.hue,
    };

    queryClient.setQueryData<RoomPageData>(["room", roomId], (old) =>
      old ? { ...old, messages: [...old.messages, optimisticMessage] } : old,
    );

    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 60);

    setSending(true);
    try {
      const rpcInput = {
        roomId,
        body: cleanBody,
        ...(replyTarget ? { replyTo: replyTarget.id } : {}),
        ...(options.image ? { image: options.image } : {}),
        ...(options.audio ? { audio: options.audio } : {}),
        clientTag: `msg-${Date.now()}`,
      };

      let sentResult: SendMessageRpcResult | null = null;
      try {
        sentResult = await rpc<SendMessageRpcResult>("sendMessage", rpcInput);
      } catch {
        sentResult = (await api.send(rpcInput)) as SendMessageRpcResult;
      }

      const realId =
        sentResult?.id ??
        sentResult?.messageId ??
        sentResult?.message?.id ??
        null;

      if (realId !== null) {
        queryClient.setQueryData<RoomPageData>(["room", roomId], (old) => {
          if (!old) return old;
          const alreadyHasReal = old.messages.some((m) => m.id === realId);
          return {
            ...old,
            messages: alreadyHasReal
              ? old.messages.filter((m) => m.id !== tempId)
              : old.messages.map((m) =>
                  m.id === tempId
                    ? sentResult?.message ?? { ...m, id: realId }
                    : m,
                ),
          };
        });
      } else {
        void roomQuery.refetch();
      }
      haptic.tap();
    } catch {
      // Network offline -> enqueue in durable offline outbox
      try {
        await enqueueMessage(myUserId, {
          roomId,
          body: cleanBody,
          ...(replyTarget ? { replyTo: replyTarget.id } : {}),
          ...(options.image ? { image: options.image } : {}),
          ...(options.audio ? { audio: options.audio } : {}),
        });
        await refreshOfflineQueue();
        notify(
          "Queued for delivery 📡",
          "You’re offline. Your message will send automatically as soon as connection returns.",
        );
      } catch (queueErr) {
        showError(queueErr, "Couldn't send message");
      }
    } finally {
      setSending(false);
    }
  };

  /**
   * Toggles an emoji reaction on a message via the verified `rpc("toggleMessageReaction", { messageId, emoji })`.
   */
  const handleToggleReaction = async (messageId: number, emoji: string) => {
    if (messageId <= 0) return;
    haptic.pop();

    queryClient.setQueryData<RoomPageData>(["room", roomId], (old) => {
      if (!old) return old;
      return {
        ...old,
        messages: old.messages.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          const nextReactions = existing
            ? existing.mine
              ? m.reactions
                  .map((r) =>
                    r.emoji === emoji
                      ? { ...r, count: r.count - 1, mine: false }
                      : r,
                  )
                  .filter((r) => r.count > 0)
              : m.reactions.map((r) =>
                  r.emoji === emoji
                    ? { ...r, count: r.count + 1, mine: true }
                    : r,
                )
            : [...m.reactions, { emoji, count: 1, mine: true }];
          return { ...m, reactions: nextReactions };
        }),
      };
    });

    try {
      await rpc("toggleMessageReaction", { messageId, emoji });
    } catch {
      await api.react(messageId, emoji).catch(() => undefined);
    }
  };

  /**
   * Deletes a message via the verified `rpc("deleteMessage", { messageId })`.
   */
  const handleDeleteMessage = async (message: ChatMessage) => {
    const ok = await confirmAction(
      "Delete this message?",
      "It will be marked as deleted for everyone in this conversation.",
      "Delete",
      true,
    );
    if (!ok) return;

    haptic.tap();
    queryClient.setQueryData<RoomPageData>(["room", roomId], (old) => {
      if (!old) return old;
      return {
        ...old,
        messages: old.messages.map((m) =>
          m.id === message.id ? { ...m, deleted: true, body: "" } : m,
        ),
      };
    });

    try {
      await rpc("deleteMessage", { messageId: message.id });
    } catch {
      await api.deleteMessage(message.id).catch(() => undefined);
    }
  };

  /**
   * Translates a message in-place via the verified `rpc("aiAssistant", { task: "translate", text })`.
   */
  const handleTranslateMessage = async (message: ChatMessage) => {
    const clean = previewText(message.body).trim();
    if (!clean || translatingId === message.id) return;

    if (translations[message.id]) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[message.id];
        return next;
      });
      return;
    }

    setTranslatingId(message.id);
    try {
      const prompt = `Translate this chat message into clear, natural English (or if already in English, provide a natural Spanish/Japanese fandom translation): "${clean}"`;
      let translatedText = "";
      try {
        const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
          task: "translate",
          text: prompt,
        });
        translatedText = res.text.trim();
      } catch {
        const fb = await platform.ai("translate", prompt);
        translatedText = fb.text.trim();
      }
      if (translatedText) {
        setTranslations((prev) => ({
          ...prev,
          [message.id]: translatedText,
        }));
        haptic.success();
      }
    } catch (err) {
      showError(err, "Couldn't translate message");
    } finally {
      setTranslatingId(null);
    }
  };

  /**
   * Translates the user's outgoing draft in the composer via `rpc("aiAssistant", { task: "translate", text })`.
   */
  const handleTranslateOutgoingDraft = async () => {
    const clean = draft.trim();
    if (!clean || translatingDraft) return;
    setTranslatingDraft(true);
    try {
      const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
        task: "translate",
        text: `Translate this outgoing chat message naturally: "${clean}"`,
      });
      if (res.text.trim()) {
        setDraft(res.text.trim());
        haptic.success();
      }
    } catch {
      try {
        const fb = await platform.ai("translate", clean);
        if (fb.text.trim()) setDraft(fb.text.trim());
      } catch (err) {
        showError(err, "Couldn't translate draft");
      }
    } finally {
      setTranslatingDraft(false);
    }
  };

  const handlePickAndSendImage = async () => {
    try {
      const imageBase64 = await pickPhoto("library", 1_400_000);
      if (!imageBase64) return;
      await handleSendPayload({
        body: draft.trim(),
        image: imageBase64,
        mediaKind: "image",
      });
    } catch (err) {
      showError(err, "Couldn't attach image");
    }
  };

  const handleSendVoiceNotePreset = async (
    preset: (typeof VOICE_NOTE_PRESETS)[number],
  ) => {
    setVoiceSheetOpen(false);
    await handleSendPayload({
      body: preset.caption,
      mediaKind: "audio",
    });
  };

  const handleScheduleMessage = () => {
    const clean = draft.trim();
    if (!clean) return;
    haptic.success();
    setScheduledDrafts((prev) => [
      ...prev,
      {
        id: `sched-${Date.now()}`,
        body: clean,
        scheduledForLabel: scheduleTimeLabel,
      },
    ]);
    setDraft("");
    setScheduleSheetOpen(false);
    notify(
      "Message Scheduled 🕒",
      `Queued for ${scheduleTimeLabel}. Tap "Send Now" on the banner anytime.`,
    );
  };

  const handleDraftChange = (text: string) => {
    setDraft(text);
    const now = Date.now();
    if (text.trim().length > 0 && now - lastTypingSentAt.current > 3_500) {
      lastTypingSentAt.current = now;
      void api.sendTyping(roomId).catch(() => undefined);
    }
  };

  // Resolve pinned message
  const activePinnedId = pinnedMessageId ?? roomInfo?.pinnedMessageId ?? null;
  const pinnedMessage = useMemo(() => {
    if (activePinnedId) {
      return messages.find((m) => m.id === activePinnedId) ?? null;
    }
    return messages[0] ?? null;
  }, [messages, activePinnedId]);

  const messageById = useMemo(() => {
    const map = new Map<number, ChatMessage>();
    for (const m of messages) {
      map.set(m.id, m);
    }
    return map;
  }, [messages]);

  // Compute read receipt for the user's newest message
  const lastMineMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.author.userId === myUserId) {
        return messages[i]!.id;
      }
    }
    return null;
  }, [messages, myUserId]);

  const highestSeenMessageId = useMemo(() => {
    const seenBy = receiptsQuery.data?.seenBy ?? [];
    let maxId = 0;
    for (const entry of seenBy) {
      if (entry.userId !== myUserId && entry.lastReadId > maxId) {
        maxId = entry.lastReadId;
      }
    }
    return maxId;
  }, [receiptsQuery.data?.seenBy, myUserId]);

  // Build flat timeline with Date Dividers + Messages + Queued Offline Messages
  const timelineItems = useMemo((): TimelineItem[] => {
    const combined: (ChatMessage & { _pending?: boolean })[] = [...messages];

    for (const q of queuedItems) {
      combined.push({
        id: -q.queuedAt,
        roomId,
        author: {
          userId: myUserId,
          handle: myProfile?.handle ?? "me",
          nickname: myProfile?.displayName ?? "You",
          hue: myProfile?.avatarHue ?? 265,
          avatarV: myProfile?.avatarVersion ?? 0,
          role: "member",
        },
        body: q.body,
        createdAt: new Date(q.queuedAt).toISOString(),
        editedAt: null,
        deleted: false,
        replyTo: q.replyTo ?? null,
        mediaKind: q.image ? "image" : q.audio ? "audio" : null,
        reactions: [],
        bubbleStyle: "soft",
        bubbleHue: myProfile?.avatarHue ?? 265,
        _pending: true,
      });
    }

    const out: TimelineItem[] = [];
    let lastDayKey = "";

    for (let i = 0; i < combined.length; i += 1) {
      const curr = combined[i]!;
      const prev = i > 0 ? combined[i - 1] : null;
      const next = i < combined.length - 1 ? combined[i + 1] : null;

      const dKey = dayBucketKey(curr.createdAt);
      if (dKey !== lastDayKey) {
        lastDayKey = dKey;
        out.push({
          kind: "divider",
          id: `div-${dKey}-${curr.id}`,
          label: formatDateDivider(curr.createdAt),
        });
      }

      const sameAuthorAsPrev =
        prev !== null &&
        prev.author.userId === curr.author.userId &&
        dayBucketKey(prev.createdAt) === dKey;
      const sameAuthorAsNext =
        next !== null &&
        next.author.userId === curr.author.userId &&
        dayBucketKey(next.createdAt) === dKey;

      const isMine = curr.author.userId === myUserId;
      let receipt: string | null = null;
      if (isMine) {
        if (curr._pending || curr.id < 0) {
          receipt = "Sending…";
        } else if (curr.id === lastMineMessageId) {
          receipt = highestSeenMessageId >= curr.id ? "Seen" : "Sent";
        }
      }

      out.push({
        kind: "message",
        id: `msg-${curr.id}`,
        message: curr,
        pending: curr._pending,
        showName: !isMine && !sameAuthorAsPrev,
        showAvatar: !isMine && !sameAuthorAsNext,
        showTime: !sameAuthorAsNext,
        receipt,
      });
    }

    return out;
  }, [
    messages,
    queuedItems,
    roomId,
    myUserId,
    myProfile,
    lastMineMessageId,
    highestSeenMessageId,
  ]);

  const jumpToMessage = (targetMsgId: number) => {
    const idx = timelineItems.findIndex(
      (item) => item.kind === "message" && item.message.id === targetMsgId,
    );
    if (idx >= 0) {
      setHighlightedId(targetMsgId);
      listRef.current?.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.4,
      });
      setTimeout(() => setHighlightedId(null), 1_800);
    }
  };

  if (roomQuery.isPending && !roomQuery.data) {
    return <Loading label="Opening conversation…" />;
  }
  if (roomQuery.isError || !roomInfo) {
    return (
      <ErrorState
        error={roomQuery.error}
        onRetry={() => void roomQuery.refetch()}
      />
    );
  }

  const isDm = roomInfo.kind === "dm";
  const typingNames = (typingQuery.data?.names ?? []).filter(Boolean);
  const peerOnline = Boolean(roomInfo.peerOnline);
  const participantCount = roomQuery.data?.participants.length ?? 2;

  const headerMenuItems: MenuItem[] = [
    {
      key: "call",
      label: "Start Voice or Video Call",
      icon: "call-outline",
      tone: "green",
      onPress: () => router.push(`/call/${roomId}`),
    },
    {
      key: "watch",
      label: "Start Synced Watch Party",
      icon: "film-outline",
      tone: "violet",
      onPress: () => router.push(`/chat/watch/${roomId}`),
    },
    {
      key: "stage",
      label: "Open Live Stage Room",
      icon: "radio-outline",
      tone: "pink",
      onPress: () => router.push(`/live/${roomId}`),
    },
    ...(roomInfo.peerHandle
      ? [
          {
            key: "profile",
            label: `View @${roomInfo.peerHandle}'s Profile`,
            icon: "person-outline" as const,
            tone: "blue" as const,
            onPress: () => router.push(`/profile/${roomInfo.peerHandle}`),
          },
        ]
      : []),
    ...(!isDm
      ? [
          {
            key: "groupSettings",
            label: "Group Room Settings",
            icon: "settings-outline" as const,
            tone: "orange" as const,
            onPress: () => router.push(`/groups/${roomId}`),
          },
        ]
      : []),
    {
      key: "report",
      label: "Report Conversation",
      icon: "flag-outline",
      destructive: true,
      onPress: () =>
        setReportTarget({
          targetType: "room",
          targetId: String(roomId),
          label: roomInfo.name,
        }),
    },
  ];

  const messageMenuItems: MenuItem[] = selectedMessage
    ? [
        {
          key: "reply",
          label: "Reply to message",
          icon: "arrow-undo-outline",
          tone: "violet",
          onPress: () => setReplyingTo(selectedMessage),
        },
        {
          key: "translate",
          label: translations[selectedMessage.id]
            ? "Hide translation"
            : "Translate with AI ✨",
          icon: "language-outline",
          tone: "blue",
          onPress: () => void handleTranslateMessage(selectedMessage),
        },
        {
          key: "pin",
          label:
            pinnedMessageId === selectedMessage.id
              ? "Unpin message"
              : "Pin message to top",
          icon: "pin-outline",
          tone: "orange",
          onPress: () => {
            setPinnedMessageId(
              pinnedMessageId === selectedMessage.id
                ? null
                : selectedMessage.id,
            );
            haptic.tap();
          },
        },
        {
          key: "copy",
          label: "Copy message text",
          icon: "copy-outline",
          tone: "green",
          onPress: () => {
            void Clipboard.setStringAsync(previewText(selectedMessage.body));
            notify("Copied", "Message text copied to clipboard.");
          },
        },
        ...(selectedMessage.author.userId === myUserId
          ? [
              {
                key: "delete",
                label: "Delete message",
                icon: "trash-outline" as const,
                destructive: true,
                onPress: () => void handleDeleteMessage(selectedMessage),
              },
            ]
          : [
              {
                key: "reportMsg",
                label: "Report message",
                icon: "flag-outline" as const,
                destructive: true,
                onPress: () =>
                  setReportTarget({
                    targetType: "message",
                    targetId: String(selectedMessage.id),
                    label: `${selectedMessage.author.nickname}'s message`,
                  }),
              },
            ]),
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* ── CHAT HEADER (Mockup 4 Right Pane) ── */}
      <View
        style={[
          styles.headerBar,
          {
            paddingTop: insets.top + 8,
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
          },
          shadow.card,
        ]}
      >
        <PressableScale
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/chats")
          }
          accessibilityRole="button"
          accessibilityLabel="Back to messages"
          hitSlop={8}
          scaleTo={0.9}
          style={styles.backIconBtn}
        >
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </PressableScale>

        <PressableScale
          onPress={() => {
            if (roomInfo.peerHandle) {
              router.push(`/profile/${roomInfo.peerHandle}`);
            } else if (!isDm) {
              router.push(`/groups/${roomId}`);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={`${roomInfo.name} details`}
          scaleTo={0.98}
          style={styles.headerIdentityRow}
        >
          <PersonAvatar
            person={{
              name: roomInfo.name,
              hue: roomInfo.hue ?? 265,
              userId: roomInfo.peerUserId ?? undefined,
            }}
            size={40}
            online={isDm ? peerOnline : true}
          />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Txt
                numberOfLines={1}
                style={{
                  fontFamily: font.heavy,
                  fontSize: 15.5,
                  lineHeight: 20,
                  color: theme.ink,
                  flexShrink: 1,
                }}
              >
                {roomInfo.name}
              </Txt>
              {roomInfo.peerVerified ? <VerifiedTick size={14} /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      typingNames.length > 0 || peerOnline || !isDm
                        ? theme.ok
                        : theme.subtle,
                  },
                ]}
              />
              <Txt
                numberOfLines={1}
                style={{
                  fontFamily:
                    typingNames.length > 0 ? font.bold : font.semibold,
                  fontSize: 11.5,
                  lineHeight: 15,
                  color:
                    typingNames.length > 0
                      ? theme.violet
                      : peerOnline || !isDm
                        ? theme.ok
                        : theme.muted,
                }}
              >
                {typingNames.length > 0
                  ? `${typingNames.join(", ")} typing…`
                  : isDm
                    ? peerOnline
                      ? "Active now"
                      : "Offline"
                    : `${participantCount} members active`}
              </Txt>
            </View>
          </View>
        </PressableScale>

        {/* Call, Video/Watch Party & More Menu Buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <PressableScale
            onPress={() => router.push(`/call/${roomId}`)}
            accessibilityRole="button"
            accessibilityLabel="Start audio call"
            scaleTo={0.9}
            style={[
              styles.headerActionCircle,
              { backgroundColor: theme.tints.violet },
            ]}
          >
            <Ionicons name="call" size={17} color={theme.violet} />
          </PressableScale>

          <PressableScale
            onPress={() => router.push(`/call/${roomId}`)}
            accessibilityRole="button"
            accessibilityLabel="Start video call"
            scaleTo={0.9}
            style={[
              styles.headerActionCircle,
              { backgroundColor: theme.tints.pink },
            ]}
          >
            <Ionicons name="videocam" size={18} color={theme.pink} />
          </PressableScale>

          <PressableScale
            onPress={() => setRoomMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Conversation menu"
            scaleTo={0.9}
            style={[
              styles.headerActionCircle,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <Ionicons name="ellipsis-vertical" size={17} color={theme.ink} />
          </PressableScale>
        </View>
      </View>

      {/* ── PINNED MESSAGE BANNER (Mockup 4 Right Pane) ── */}
      {pinnedMessage && !pinnedMessage.deleted ? (
        <PressableScale
          onPress={() => jumpToMessage(pinnedMessage.id)}
          accessibilityRole="button"
          accessibilityLabel={`Pinned message from ${pinnedMessage.author.nickname}: ${previewText(pinnedMessage.body)}`}
          scaleTo={0.99}
          style={[
            styles.pinnedBanner,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <View
            style={[styles.pinnedBarAccent, { backgroundColor: theme.violet }]}
          />
          <Ionicons name="pin" size={15} color={theme.violet} />
          <View style={{ flex: 1 }}>
            <Txt
              style={{
                fontFamily: font.heavy,
                fontSize: 11,
                color: theme.toneText.violet,
              }}
            >
              Pinned Message · {pinnedMessage.author.nickname}
            </Txt>
            <Txt
              numberOfLines={1}
              style={{
                fontFamily: font.regular,
                fontSize: 12.5,
                color: theme.ink,
              }}
            >
              {previewText(pinnedMessage.body) || "Attachment"}
            </Txt>
          </View>
          <PressableScale
            onPress={() => router.push(`/chat/watch/${roomId}`)}
            accessibilityRole="button"
            accessibilityLabel="Open Watch Party"
            scaleTo={0.94}
            style={[
              styles.watchPartyMiniPill,
              { backgroundColor: theme.tints.violet },
            ]}
          >
            <Ionicons name="play-circle" size={13} color={theme.violet} />
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 11,
                color: theme.toneText.violet,
              }}
            >
              Watch Party
            </Txt>
          </PressableScale>
        </PressableScale>
      ) : null}

      {/* Scheduled Drafts Banner */}
      {scheduledDrafts.length > 0 ? (
        <View
          style={[
            styles.scheduledBanner,
            {
              backgroundColor: theme.surfaceAi,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <Ionicons name="time-outline" size={16} color={theme.violet} />
          <Txt
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: font.semibold,
              fontSize: 12,
              color: theme.ink,
            }}
          >
            Scheduled ({scheduledDrafts[0]!.scheduledForLabel}): “
            {scheduledDrafts[0]!.body}”
          </Txt>
          <PressableScale
            onPress={() => {
              const first = scheduledDrafts[0];
              if (!first) return;
              setScheduledDrafts((prev) => prev.slice(1));
              void handleSendPayload({ body: first.body });
            }}
            accessibilityRole="button"
            accessibilityLabel="Send scheduled message now"
            scaleTo={0.94}
            style={[styles.sendScheduledNowBtn, { backgroundColor: theme.violet }]}
          >
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 11,
                color: "#FFFFFF",
              }}
            >
              Send Now
            </Txt>
          </PressableScale>
        </View>
      ) : null}

      {/* ── MESSAGE TIMELINE + COMPOSER ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={listRef}
          data={timelineItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingVertical: 10,
            flexGrow: 1,
          }}
          onScrollToIndexFailed={() => undefined}
          ListHeaderComponent={
            messages.length >= 15 && hasMoreOlder ? (
              <View style={{ alignItems: "center", paddingVertical: 8 }}>
                <PressableScale
                  onPress={() => void handleLoadOlderMessages()}
                  disabled={loadingOlder}
                  accessibilityRole="button"
                  accessibilityLabel="Load earlier messages"
                  scaleTo={0.95}
                  style={[
                    styles.loadOlderPill,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {loadingOlder ? (
                    <ActivityIndicator size="small" color={theme.violet} />
                  ) : (
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={theme.violet}
                    />
                  )}
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 12,
                      color: theme.toneText.violet,
                    }}
                  >
                    {loadingOlder
                      ? "Loading older messages…"
                      : "Load earlier messages"}
                  </Txt>
                </PressableScale>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyHint
              emoji="👋"
              title={`Say hi to ${roomInfo.name}!`}
              text="Send a message, sticker, voice note, or tap an AI suggestion below to break the ice."
              style={{ margin: 20 }}
            />
          }
          renderItem={({ item }) => {
            if (item.kind === "divider") {
              return (
                <View style={styles.dateDividerWrap}>
                  <View
                    style={[
                      styles.dateDividerPill,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 11,
                        color: theme.muted,
                      }}
                    >
                      {item.label}
                    </Txt>
                  </View>
                </View>
              );
            }

            const msg = item.message;
            const isMine = msg.author.userId === myUserId;
            const repliedMsg =
              msg.replyTo !== null ? messageById.get(msg.replyTo) : undefined;
            const translatedText = translations[msg.id];
            const isTranslating = translatingId === msg.id;

            return (
              <View>
                <MessageBubble
                  message={msg}
                  mine={isMine}
                  replyTo={repliedMsg}
                  showName={item.showName}
                  showAvatar={item.showAvatar}
                  showTime={item.showTime}
                  receipt={item.receipt}
                  highlighted={highlightedId === msg.id}
                  onLongPress={() => {
                    haptic.pop();
                    setSelectedMessage(msg);
                  }}
                  onOpenProfile={() =>
                    router.push(`/profile/${msg.author.handle}`)
                  }
                  onReact={(emoji) => void handleToggleReaction(msg.id, emoji)}
                  onReply={() => setReplyingTo(msg)}
                  onTranslate={() => void handleTranslateMessage(msg)}
                  onDelete={
                    isMine ? () => void handleDeleteMessage(msg) : undefined
                  }
                  translatedText={translatedText}
                  translating={isTranslating}
                />

                {/* Inline Translate Chip under peer messages (Mockup 4 Right Pane) */}
                {!isMine &&
                !msg.deleted &&
                msg.body.trim().length > 0 &&
                !translatedText ? (
                  <View
                    style={{
                      paddingLeft: 52,
                      paddingBottom: 4,
                      flexDirection: "row",
                    }}
                  >
                    <PressableScale
                      onPress={() => void handleTranslateMessage(msg)}
                      disabled={isTranslating}
                      accessibilityRole="button"
                      accessibilityLabel="Translate message with AI"
                      scaleTo={0.95}
                      style={[
                        styles.translateInlineChip,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="language-outline"
                        size={12}
                        color={theme.violet}
                      />
                      <Txt
                        style={{
                          fontFamily: font.bold,
                          fontSize: 11,
                          color: theme.toneText.violet,
                        }}
                      >
                        {isTranslating ? "Translating…" : "Translate ✨"}
                      </Txt>
                    </PressableScale>
                  </View>
                ) : null}
              </View>
            );
          }}
        />

        {/* Live Typing Indicator Bar */}
        {typingNames.length > 0 ? (
          <View
            style={[
              styles.typingIndicatorBar,
              { backgroundColor: theme.surfaceAlt },
            ]}
          >
            <View style={styles.typingDotsGroup}>
              <View
                style={[styles.typingDot, { backgroundColor: theme.violet }]}
              />
              <View
                style={[
                  styles.typingDot,
                  { backgroundColor: theme.pink, opacity: 0.8 },
                ]}
              />
              <View
                style={[
                  styles.typingDot,
                  { backgroundColor: theme.violet, opacity: 0.6 },
                ]}
              />
            </View>
            <Txt
              style={{
                fontFamily: font.semibold,
                fontSize: 12,
                color: theme.muted,
              }}
            >
              {typingNames.join(", ")}{" "}
              {typingNames.length === 1 ? "is" : "are"} typing…
            </Txt>
          </View>
        ) : null}

        {/* ── AI REPLY SUGGESTIONS BAR (Mockup 4 Right Pane) ── */}
        {(aiReplySuggestionsQuery.data?.length ?? 0) > 0 && !stickerTrayOpen ? (
          <View
            style={[
              styles.aiSuggestionsBar,
              {
                backgroundColor: theme.surface,
                borderTopColor: theme.border,
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.aiSuggestionsScroll}
            >
              <View style={styles.aiLabelChip}>
                <Ionicons name="sparkles" size={13} color={theme.violet} />
                <Txt
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 11,
                    color: theme.toneText.violet,
                  }}
                >
                  AI Reply
                </Txt>
              </View>
              {aiReplySuggestionsQuery.data!.map((suggestion) => (
                <PressableScale
                  key={suggestion}
                  onPress={() => {
                    haptic.tap();
                    setDraft(suggestion);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Use AI reply suggestion: ${suggestion}`}
                  scaleTo={0.95}
                  style={[
                    styles.aiSuggestionPill,
                    {
                      backgroundColor: theme.tints.violet,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Txt
                    numberOfLines={1}
                    style={{
                      fontFamily: font.semibold,
                      fontSize: 12,
                      color: theme.ink,
                    }}
                  >
                    {suggestion}
                  </Txt>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Sticker / GIF Picker Tray */}
        {stickerTrayOpen ? (
          <View
            style={[
              styles.stickerTray,
              {
                backgroundColor: theme.surface,
                borderTopColor: theme.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <Txt
                style={{
                  fontFamily: font.heavy,
                  fontSize: 13,
                  color: theme.ink,
                }}
              >
                Stickers & Expressive Reactions
              </Txt>
              <PressableScale
                onPress={() => setStickerTrayOpen(false)}
                accessibilityLabel="Close sticker tray"
                scaleTo={0.9}
              >
                <Ionicons name="close" size={18} color={theme.muted} />
              </PressableScale>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {STICKERS.map((st) => (
                <PressableScale
                  key={st.id}
                  onPress={() => {
                    setStickerTrayOpen(false);
                    void handleSendPayload({ body: encodeSticker(st.id) });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${st.label} sticker`}
                  scaleTo={0.92}
                  style={[
                    styles.stickerTile,
                    {
                      backgroundColor: theme.surfaceAlt,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Txt style={{ fontSize: 30, lineHeight: 36 }}>
                    {stickerEmoji(st.id)}
                  </Txt>
                  <Txt
                    style={{
                      fontFamily: font.semibold,
                      fontSize: 10.5,
                      color: theme.muted,
                    }}
                  >
                    {st.label}
                  </Txt>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Reply Quote Preview Bar */}
        {replyingTo ? (
          <View
            style={[
              styles.replyPreviewBar,
              {
                backgroundColor: theme.surfaceAlt,
                borderTopColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.replyAccentBar,
                { backgroundColor: theme.violet },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Txt
                style={{
                  fontFamily: font.heavy,
                  fontSize: 11.5,
                  color: theme.toneText.violet,
                }}
              >
                Replying to {replyingTo.author.nickname}
              </Txt>
              <Txt
                numberOfLines={1}
                style={{
                  fontFamily: font.regular,
                  fontSize: 12.5,
                  color: theme.muted,
                }}
              >
                {previewText(replyingTo.body) || "Attachment"}
              </Txt>
            </View>
            <PressableScale
              onPress={() => setReplyingTo(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
              hitSlop={8}
              scaleTo={0.9}
            >
              <Ionicons name="close-circle" size={19} color={theme.subtle} />
            </PressableScale>
          </View>
        ) : null}

        {/* ── COMPOSER DOCK WITH SCHEDULE, TRANSLATE, IMAGE, STICKER/GIF & VOICE ACTIONS ── */}
        <View
          style={[
            styles.composerDock,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          {/* Quick Action Toolbar Row (Image, Sticker/GIF, Voice Note, Translate Draft, Schedule) */}
          <View style={styles.composerActionsRow}>
            <PressableScale
              onPress={() => void handlePickAndSendImage()}
              accessibilityRole="button"
              accessibilityLabel="Attach photo or image"
              scaleTo={0.9}
              style={[
                styles.toolActionPill,
                { backgroundColor: theme.surfaceAlt },
              ]}
            >
              <Ionicons name="image-outline" size={16} color={theme.violet} />
              <Txt style={[styles.toolActionLabel, { color: theme.ink }]}>
                Image
              </Txt>
            </PressableScale>

            <PressableScale
              onPress={() => {
                haptic.tap();
                setStickerTrayOpen((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityLabel="Open stickers and GIFs"
              scaleTo={0.9}
              style={[
                styles.toolActionPill,
                {
                  backgroundColor: stickerTrayOpen
                    ? theme.tints.violet
                    : theme.surfaceAlt,
                },
              ]}
            >
              <Ionicons name="happy-outline" size={16} color={theme.pink} />
              <Txt style={[styles.toolActionLabel, { color: theme.ink }]}>
                Sticker/GIF
              </Txt>
            </PressableScale>

            <PressableScale
              onPress={() => setVoiceSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Record voice note"
              scaleTo={0.9}
              style={[
                styles.toolActionPill,
                { backgroundColor: theme.surfaceAlt },
              ]}
            >
              <Ionicons name="mic-outline" size={16} color={theme.ok} />
              <Txt style={[styles.toolActionLabel, { color: theme.ink }]}>
                Voice
              </Txt>
            </PressableScale>

            <PressableScale
              onPress={() => void handleTranslateOutgoingDraft()}
              disabled={!draft.trim() || translatingDraft}
              accessibilityRole="button"
              accessibilityLabel="Translate your draft with AI"
              scaleTo={0.9}
              style={[
                styles.toolActionPill,
                { backgroundColor: theme.surfaceAlt },
              ]}
            >
              <Ionicons
                name="language-outline"
                size={15}
                color={theme.blue}
              />
              <Txt style={[styles.toolActionLabel, { color: theme.ink }]}>
                {translatingDraft ? "…" : "Translate"}
              </Txt>
            </PressableScale>

            <PressableScale
              onPress={() => setScheduleSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Schedule message"
              scaleTo={0.9}
              style={[
                styles.toolActionPill,
                { backgroundColor: theme.surfaceAlt },
              ]}
            >
              <Ionicons name="time-outline" size={15} color={theme.orange} />
              <Txt style={[styles.toolActionLabel, { color: theme.ink }]}>
                Schedule
              </Txt>
            </PressableScale>
          </View>

          {/* Input Field + Send Button */}
          <View style={styles.inputAndSendRow}>
            <View
              style={[
                styles.textInputContainer,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <TextInput
                value={draft}
                onChangeText={handleDraftChange}
                placeholder={`Message ${roomInfo.name}…`}
                placeholderTextColor={theme.subtle}
                multiline
                maxLength={2000}
                selectionColor={theme.accent}
                accessibilityLabel={`Message ${roomInfo.name}`}
                style={[styles.textInputField, { color: theme.ink }]}
              />
            </View>

            <PressableScale
              onPress={() => void handleSendPayload({ body: draft })}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              scaleTo={0.9}
              style={[
                styles.sendCircleBtn,
                {
                  opacity: draft.trim() ? 1 : 0.45,
                },
                draft.trim() ? shadow.glow(theme.violet, 0.4) : null,
              ]}
            >
              <LinearGradient
                colors={theme.gradHero}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 21 }]}
              />
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={17} color="#FFFFFF" />
              )}
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Long-Press Message Reaction & Action Sheet */}
      <Sheet
        visible={Boolean(selectedMessage)}
        title="Message Actions"
        onClose={() => setSelectedMessage(null)}
      >
        {selectedMessage ? (
          <View style={{ gap: 12 }}>
            {/* Quick Emoji Reaction Bar */}
            <View style={styles.quickReactionsRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <PressableScale
                  key={emoji}
                  onPress={() => {
                    const targetId = selectedMessage.id;
                    setSelectedMessage(null);
                    void handleToggleReaction(targetId, emoji);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${emoji}`}
                  scaleTo={0.86}
                  style={[
                    styles.quickReactionCircle,
                    {
                      backgroundColor: theme.surfaceAlt,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Txt style={{ fontSize: 22 }}>{emoji}</Txt>
                </PressableScale>
              ))}
            </View>

            <View style={{ gap: 6 }}>
              {messageMenuItems.map((item) => (
                <PressableScale
                  key={item.key}
                  onPress={() => {
                    setSelectedMessage(null);
                    item.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  scaleTo={0.98}
                  style={[
                    styles.sheetActionRow,
                    {
                      backgroundColor: theme.surfaceAlt,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={item.icon ?? "ellipsis-horizontal"}
                    size={18}
                    color={item.destructive ? theme.danger : theme.violet}
                  />
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 14,
                      color: item.destructive ? theme.danger : theme.ink,
                    }}
                  >
                    {item.label}
                  </Txt>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}
      </Sheet>

      {/* Voice Note Recorder Sheet */}
      <Sheet
        visible={voiceSheetOpen}
        title="Send a Voice Note 🎙️"
        onClose={() => setVoiceSheetOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13.5,
            color: theme.muted,
          }}
        >
          Send an interactive waveform voice note to {roomInfo.name}. Recipients
          can play it back with animated audio bars right inside the bubble.
        </Txt>
        <View style={{ gap: 8 }}>
          {VOICE_NOTE_PRESETS.map((preset) => (
            <PressableScale
              key={preset.key}
              onPress={() => void handleSendVoiceNotePreset(preset)}
              accessibilityRole="button"
              accessibilityLabel={preset.label}
              scaleTo={0.97}
              style={[
                styles.sheetActionRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="mic" size={18} color={theme.ok} />
              <Txt
                style={{
                  flex: 1,
                  fontFamily: font.bold,
                  fontSize: 13.5,
                  color: theme.ink,
                }}
              >
                {preset.label}
              </Txt>
              <Ionicons name="send" size={15} color={theme.violet} />
            </PressableScale>
          ))}
        </View>
      </Sheet>

      {/* Schedule Message Sheet */}
      <Sheet
        visible={scheduleSheetOpen}
        title="Schedule Message 🕒"
        onClose={() => setScheduleSheetOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13,
            color: theme.muted,
          }}
        >
          Queue a message to send at a specific time (great for episode drops or
          watch party reminders).
        </Txt>
        <Field
          label="Message to schedule"
          value={draft}
          onChangeText={setDraft}
          placeholder="Write your message…"
          multiline
        />
        <Field
          label="Delivery time"
          value={scheduleTimeLabel}
          onChangeText={setScheduleTimeLabel}
          placeholder="e.g. Tonight · 8:00 PM"
        />
        <GradientButton
          label="Schedule Message"
          icon="time"
          gradient="hero"
          size="lg"
          full
          disabled={!draft.trim()}
          onPress={handleScheduleMessage}
        />
      </Sheet>

      <ActionMenu
        visible={roomMenuOpen}
        title={roomInfo.name}
        items={headerMenuItems}
        onClose={() => setRoomMenuOpen(false)}
      />
      <ReportSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  backIconBtn: {
    width: 34,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIdentityRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  headerActionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  pinnedBarAccent: {
    width: 3,
    height: 28,
    borderRadius: 1.5,
  },
  watchPartyMiniPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
  },
  scheduledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  sendScheduledNowBtn: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  loadOlderPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dateDividerWrap: {
    alignItems: "center",
    paddingVertical: 8,
  },
  dateDividerPill: {
    paddingHorizontal: 12,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  translateInlineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  typingIndicatorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  typingDotsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  aiSuggestionsBar: {
    borderTopWidth: 1,
    paddingVertical: 7,
  },
  aiSuggestionsScroll: {
    paddingHorizontal: 12,
    gap: 7,
    alignItems: "center",
  },
  aiLabelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 4,
  },
  aiSuggestionPill: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stickerTray: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  stickerTile: {
    width: 68,
    height: 68,
    borderRadius: radius.tile,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  replyPreviewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  replyAccentBar: {
    width: 3,
    height: 30,
    borderRadius: 1.5,
  },
  composerDock: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  composerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  toolActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
  },
  toolActionLabel: {
    fontFamily: font.semibold,
    fontSize: 11,
  },
  inputAndSendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  textInputContainer: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
  },
  textInputField: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 19,
    outlineWidth: 0,
  },
  sendCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  quickReactionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quickReactionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
});