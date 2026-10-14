// ===== FILE: mobile/src/app/(tabs)/chats.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import { useSSEListener } from "@/api/sse";
import type { ChatOverviewRoom } from "@/api/types";
import { ActionMenu, type MenuItem } from "@/components/community/ActionMenu";
import { confirmAction, notify } from "@/components/community/platform";
import {
  AppHeader,
  EmptyHint,
  GradientButton,
  LiveBadge,
  PersonAvatar,
  Pill,
  SectionHeader,
  VerifiedTick,
} from "@/components/k";
import {
  ErrorState,
  Field,
  PressableScale,
  Sheet,
  SkeletonList,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { showError } from "@/lib/errors";
import { compactNumber, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { previewText } from "@/lib/stickers";
import { useDebounced } from "@/lib/useDebounced";
import { font, radius, shadow, useTheme } from "@/theme";

type ChatFolderTab = "inbox" | "groups" | "requests";

type ChatsOverviewPayload = {
  rooms: ChatOverviewRoom[];
  requests: number;
};

type OpenDmRpcResult = {
  roomId: number;
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

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeOverviewRoom(raw: unknown): ChatOverviewRoom | null {
  if (!isRecord(raw)) return null;
  const id = toFiniteNumber(raw.id ?? raw.roomId, 0);
  if (!id) return null;

  const rawKind = toStringOrEmpty(raw.kind);
  const kind: ChatOverviewRoom["kind"] =
    rawKind === "dm" ||
    rawKind === "voice" ||
    rawKind === "screening" ||
    rawKind === "public"
      ? rawKind
      : Boolean(raw.isGroup)
        ? "public"
        : "dm";

  const isGroup =
    typeof raw.isGroup === "boolean" ? raw.isGroup : kind !== "dm";
  const isRequest = Boolean(raw.isRequest ?? raw.request);

  return {
    id,
    name: toStringOrEmpty(raw.name) || (isGroup ? "Community Group" : "Member"),
    topic: toStringOrEmpty(raw.topic),
    kind,
    communityId:
      typeof raw.communityId === "string" && raw.communityId
        ? raw.communityId
        : null,
    communityName:
      typeof raw.communityName === "string" && raw.communityName
        ? raw.communityName
        : null,
    hue: toFiniteNumber(raw.hue ?? raw.avatarHue, 260),
    unread: Math.max(0, toFiniteNumber(raw.unread ?? raw.unreadCount, 0)),
    muted: Boolean(raw.muted),
    pinned: Boolean(raw.pinned),
    isGroup,
    isRequest,
    lastAt:
      typeof raw.lastAt === "string" && raw.lastAt
        ? raw.lastAt
        : typeof raw.updatedAt === "string" && raw.updatedAt
          ? raw.updatedAt
          : null,
    lastMessage:
      typeof raw.lastMessage === "string"
        ? raw.lastMessage
        : typeof raw.snippet === "string"
          ? raw.snippet
          : null,
    lastAuthor:
      typeof raw.lastAuthor === "string" && raw.lastAuthor
        ? raw.lastAuthor
        : null,
    liveCount: toFiniteNumber(raw.liveCount ?? raw.onlineCount, 0),
    peerHandle:
      typeof raw.peerHandle === "string" && raw.peerHandle
        ? raw.peerHandle
        : null,
    peerOnline: Boolean(raw.peerOnline ?? raw.online),
    peerVerified: Boolean(raw.peerVerified ?? raw.verified),
  };
}

function normalizeListRoomsPayload(raw: unknown): ChatsOverviewPayload {
  if (Array.isArray(raw)) {
    const rooms = raw
      .map(normalizeOverviewRoom)
      .filter((r): r is ChatOverviewRoom => r !== null);
    const requests = rooms.filter((r) => r.isRequest).length;
    return { rooms, requests };
  }
  if (isRecord(raw)) {
    const listRaw = Array.isArray(raw.rooms)
      ? raw.rooms
      : Array.isArray(raw.items)
        ? raw.items
        : [];
    const rooms = listRaw
      .map(normalizeOverviewRoom)
      .filter((r): r is ChatOverviewRoom => r !== null);
    const explicitReq = toFiniteNumber(raw.requests, -1);
    const requests =
      explicitReq >= 0 ? explicitReq : rooms.filter((r) => r.isRequest).length;
    return { rooms, requests };
  }
  return { rooms: [], requests: 0 };
}

/**
 * Chat Inbox Screen (`mobile/src/app/(tabs)/chats.tsx`) — Pixel-faithful to Mockup 4 Left Pane:
 * - Header with "Messages" title, unread summary, New Message button, and Chat Tools button
 * - Search bar filtering conversations by name, @handle, community, or message snippet
 * - 3 folder tabs with live unread badges: Inbox · Groups · Requests
 * - Pinned Conversations section at the top of the active folder
 * - Rich conversation rows: Avatar with green online dot (or group badge), Display Name,
 *   Verified tick, community/topic tag, formatted last message preview (handling stickers/attachments),
 *   relative timestamp, pin/mute indicators, and gradient unread counter pill
 * - Long-press action menu (Pin/Unpin, Mute/Unmute, Mark as Read, Leave/Delete)
 * - Wired to `rpc("listRooms")` (cached under `["chatsOverview"]` so `sse.ts` patches it directly in memory)
 * - Realtime updates via `useSSEListener` (`chat.message`, `chat.read`, `chat.typing`) — ZERO timer polling!
 */
export default function ChatsTabScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();

  const [folder, setFolder] = useState<ChatFolderTab>("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<ChatOverviewRoom | null>(
    null,
  );
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [startingDm, setStartingDm] = useState(false);
  const [typingByRoom, setTypingByRoom] = useState<Record<number, string>>({});

  const debouncedSearch = useDebounced(searchQuery.trim().toLowerCase(), 200);

  // Wired to exact `listRooms` RPC (with fallback to `api.chatsOverview`),
  // stored under `["chatsOverview"]` so `sse.ts` mutates it directly on `chat.message` — NO refetchInterval!
  const roomsQuery = useQuery({
    queryKey: ["chatsOverview"],
    queryFn: async (): Promise<ChatsOverviewPayload> => {
      try {
        const res = await rpc<unknown>("listRooms", {});
        const normalized = normalizeListRoomsPayload(res);
        if (normalized.rooms.length > 0) return normalized;
      } catch {
        // Fallback to api.chatsOverview wrapper
      }
      const fallback = await api.chatsOverview();
      return normalizeListRoomsPayload(fallback);
    },
  });

  // Realtime SSE listener — ZERO timer polling
  useSSEListener((event) => {
    if (
      event.type === "chat.typing" ||
      event.type === "typing.update"
    ) {
      const rId = event.roomId;
      if (rId === null) return;
      const names = Array.isArray(event.payload.names)
        ? event.payload.names.filter((n): n is string => typeof n === "string")
        : typeof event.payload.name === "string"
          ? [event.payload.name]
          : [];
      setTypingByRoom((prev) => {
        const next = { ...prev };
        if (names.length > 0) {
          next[rId] =
            names.length === 1
              ? `${names[0]} is typing…`
              : `${names[0]} & ${names.length - 1} more typing…`;
        } else {
          delete next[rId];
        }
        return next;
      });
      return;
    }

    if (
      event.type === "chat.message" ||
      event.type === "message.new" ||
      event.type === "message"
    ) {
      if (event.roomId !== null) {
        setTypingByRoom((prev) => {
          if (!(event.roomId! in prev)) return prev;
          const next = { ...prev };
          delete next[event.roomId!];
          return next;
        });
      }
      // If a brand-new room arrived that wasn't in the list yet, refresh `listRooms`
      const currentRooms =
        queryClient.getQueryData<ChatsOverviewPayload>(["chatsOverview"])
          ?.rooms ?? [];
      if (
        event.roomId !== null &&
        !currentRooms.some((r) => r.id === event.roomId)
      ) {
        void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      }
    }

    if (event.type === "chat.read" || event.type === "message.read") {
      if (event.roomId !== null) {
        queryClient.setQueryData<ChatsOverviewPayload>(
          ["chatsOverview"],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              rooms: old.rooms.map((r) =>
                r.id === event.roomId ? { ...r, unread: 0 } : r,
              ),
            };
          },
        );
      }
    }
  });

  const allRooms = roomsQuery.data?.rooms ?? [];

  // Compute unread badge counts per folder tab
  const folderCounts = useMemo(() => {
    let inboxUnread = 0;
    let groupsUnread = 0;
    let requestsCount = 0;

    for (const r of allRooms) {
      if (r.isRequest) {
        requestsCount += 1;
      } else if (r.isGroup) {
        groupsUnread += r.unread;
      } else {
        inboxUnread += r.unread;
      }
    }
    return {
      inbox: inboxUnread,
      groups: groupsUnread,
      requests: Math.max(requestsCount, roomsQuery.data?.requests ?? 0),
    };
  }, [allRooms, roomsQuery.data?.requests]);

  // Filter rooms by active folder tab and search query
  const filteredRooms = useMemo(() => {
    return allRooms.filter((r) => {
      if (folder === "requests") {
        if (!r.isRequest) return false;
      } else if (folder === "groups") {
        if (r.isRequest || !r.isGroup) return false;
      } else {
        // Inbox shows all active DMs and joined conversations that aren't pending requests
        if (r.isRequest) return false;
      }

      if (!debouncedSearch) return true;
      const haystack = [
        r.name,
        r.peerHandle ? `@${r.peerHandle}` : "",
        r.communityName ?? "",
        r.topic ?? "",
        r.lastMessage ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(debouncedSearch);
    });
  }, [allRooms, folder, debouncedSearch]);

  const pinnedRooms = useMemo(
    () => filteredRooms.filter((r) => r.pinned),
    [filteredRooms],
  );
  const regularRooms = useMemo(
    () => filteredRooms.filter((r) => !r.pinned),
    [filteredRooms],
  );

  const patchRoomInCache = (
    roomId: number,
    updater: (r: ChatOverviewRoom) => ChatOverviewRoom | null,
  ) => {
    queryClient.setQueryData<ChatsOverviewPayload>(
      ["chatsOverview"],
      (old) => {
        if (!old) return old;
        const nextRooms: ChatOverviewRoom[] = [];
        for (const r of old.rooms) {
          if (r.id !== roomId) {
            nextRooms.push(r);
          } else {
            const updated = updater(r);
            if (updated) nextRooms.push(updated);
          }
        }
        return { ...old, rooms: nextRooms };
      },
    );
  };

  const handleTogglePin = async (room: ChatOverviewRoom) => {
    const nextPinned = !room.pinned;
    haptic.tap();
    patchRoomInCache(room.id, (r) => ({ ...r, pinned: nextPinned }));
    try {
      await api.pinRoom(room.id, nextPinned);
    } catch (err) {
      patchRoomInCache(room.id, (r) => ({ ...r, pinned: room.pinned }));
      showError(err);
    }
  };

  const handleToggleMute = async (room: ChatOverviewRoom) => {
    const nextMuted = !room.muted;
    haptic.tap();
    patchRoomInCache(room.id, (r) => ({ ...r, muted: nextMuted }));
    try {
      await api.muteRoom(room.id, nextMuted);
      notify(
        nextMuted ? "Conversation muted" : "Conversation unmuted",
        nextMuted
          ? `You won't receive push alerts from ${room.name}.`
          : `Push alerts re-enabled for ${room.name}.`,
      );
    } catch (err) {
      patchRoomInCache(room.id, (r) => ({ ...r, muted: room.muted }));
      showError(err);
    }
  };

  const handleMarkRoomRead = async (room: ChatOverviewRoom) => {
    haptic.tap();
    patchRoomInCache(room.id, (r) => ({ ...r, unread: 0 }));
    try {
      await api.markRoomRead(room.id, 999_999_999);
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch (err) {
      showError(err);
    }
  };

  const handleLeaveOrDeleteRoom = async (room: ChatOverviewRoom) => {
    const ok = await confirmAction(
      room.isGroup ? `Leave ${room.name}?` : `Remove chat with ${room.name}?`,
      room.isGroup
        ? "You can rejoin from the community page anytime."
        : "This removes the thread from your inbox.",
      room.isGroup ? "Leave" : "Remove",
      true,
    );
    if (!ok) return;
    patchRoomInCache(room.id, () => null);
    try {
      await api.leaveRoom(room.id);
    } catch (err) {
      void roomsQuery.refetch();
      showError(err);
    }
  };

  const handleStartNewDm = async () => {
    const target = recipientInput.trim().replace(/^@/, "");
    if (!target || startingDm) return;
    setStartingDm(true);
    try {
      let roomId: number | null = null;
      try {
        const profile = await api.profileOverview(target);
        const dm = await api.openDm(profile.profile.userId);
        roomId = dm.roomId;
      } catch {
        const dm = await rpc<OpenDmRpcResult>("openDm", { userId: target });
        roomId = dm.roomId;
      }
      setNewChatOpen(false);
      setRecipientInput("");
      haptic.success();
      void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      if (roomId) {
        router.push(`/chat/${roomId}`);
      }
    } catch (err) {
      showError(err, "Couldn't open direct message");
    } finally {
      setStartingDm(false);
    }
  };

  const openRoom = (room: ChatOverviewRoom) => {
    haptic.tap();
    if (room.unread > 0) {
      patchRoomInCache(room.id, (r) => ({ ...r, unread: 0 }));
    }
    if (room.kind === "voice") {
      router.push(`/live/${room.id}`);
    } else if (room.kind === "screening") {
      router.push(`/chat/watch/${room.id}`);
    } else {
      router.push(`/chat/${room.id}`);
    }
  };

  const roomMenuItems: MenuItem[] = selectedRoom
    ? [
        {
          key: "open",
          label: "Open conversation",
          icon: "chatbubble-ellipses-outline",
          tone: "violet",
          onPress: () => openRoom(selectedRoom),
        },
        {
          key: "pin",
          label: selectedRoom.pinned ? "Unpin from top" : "Pin to top",
          icon: "pin-outline",
          tone: "blue",
          onPress: () => void handleTogglePin(selectedRoom),
        },
        ...(selectedRoom.unread > 0
          ? [
              {
                key: "read",
                label: "Mark as read",
                icon: "checkmark-done-outline" as const,
                tone: "green" as const,
                onPress: () => void handleMarkRoomRead(selectedRoom),
              },
            ]
          : []),
        {
          key: "mute",
          label: selectedRoom.muted
            ? "Unmute notifications"
            : "Mute notifications",
          icon: selectedRoom.muted
            ? "notifications-outline"
            : "notifications-off-outline",
          tone: "orange",
          onPress: () => void handleToggleMute(selectedRoom),
        },
        {
          key: "leave",
          label: selectedRoom.isGroup
            ? "Leave group room"
            : "Remove conversation",
          icon: "trash-outline",
          destructive: true,
          onPress: () => void handleLeaveOrDeleteRoom(selectedRoom),
        },
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader
        actions={[
          {
            key: "tools",
            icon: "sparkles-outline",
            label: "Chat Tools & Cosmetics",
            onPress: () => router.push("/inbox-tools"),
          },
          {
            key: "compose",
            icon: "create-outline",
            label: "New Message",
            onPress: () => setNewChatOpen(true),
          },
          "bell",
          "avatar",
        ]}
      />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: tabSpace + 24,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={roomsQuery.isRefetching}
            onRefresh={() => void roomsQuery.refetch()}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {/* Top Title & New Chat CTA */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Txt
              accessibilityRole="header"
              style={{
                fontFamily: font.heavy,
                fontSize: 28,
                lineHeight: 34,
                letterSpacing: -0.6,
                color: theme.ink,
              }}
            >
              Messages
            </Txt>
            <Txt
              style={{
                fontFamily: font.regular,
                fontSize: 13,
                lineHeight: 17,
                color: theme.muted,
              }}
            >
              Direct messages, community lounges, and live rooms
            </Txt>
          </View>

          <PressableScale
            onPress={() => setNewChatOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Start a new message"
            scaleTo={0.94}
            style={[
              styles.newChatPillBtn,
              shadow.glow(theme.violet, 0.35),
            ]}
          >
            <LinearGradient
              colors={theme.gradPrimary}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
            />
            <Ionicons name="add" size={17} color="#FFFFFF" />
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 12.5,
                color: "#FFFFFF",
              }}
            >
              New Chat
            </Txt>
          </PressableScale>
        </View>

        {/* Search Conversations Bar */}
        <View style={{ paddingHorizontal: 16 }}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: theme.surface,
                borderColor: searchQuery ? theme.accent : theme.border,
              },
              shadow.card,
            ]}
          >
            <Ionicons name="search-outline" size={18} color={theme.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages, @handles, or group rooms…"
              placeholderTextColor={theme.subtle}
              returnKeyType="search"
              autoCorrect={false}
              selectionColor={theme.accent}
              onSubmitEditing={() => Keyboard.dismiss()}
              accessibilityLabel="Search conversations"
              style={[styles.searchInput, { color: theme.ink }]}
            />
            {searchQuery.length > 0 ? (
              <PressableScale
                onPress={() => setSearchQuery("")}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
                scaleTo={0.88}
              >
                <Ionicons name="close-circle" size={18} color={theme.subtle} />
              </PressableScale>
            ) : null}
          </View>
        </View>

        {/* 3 Folder Tabs with Unread Badges: Inbox · Groups · Requests (Mockup 4 Left Pane) */}
        <View style={{ paddingHorizontal: 16 }}>
          <View
            style={[
              styles.folderTabsBar,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
              },
            ]}
          >
            {(
              [
                {
                  key: "inbox" as const,
                  label: "Inbox",
                  badge: folderCounts.inbox,
                },
                {
                  key: "groups" as const,
                  label: "Groups",
                  badge: folderCounts.groups,
                },
                {
                  key: "requests" as const,
                  label: "Requests",
                  badge: folderCounts.requests,
                },
              ] as const
            ).map((tab) => {
              const selected = folder === tab.key;
              return (
                <PressableScale
                  key={tab.key}
                  onPress={() => {
                    haptic.tap();
                    setFolder(tab.key);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${tab.label}${tab.badge > 0 ? `, ${tab.badge} unread` : ""}`}
                  scaleTo={0.96}
                  style={[
                    styles.folderTabItem,
                    selected && {
                      backgroundColor: theme.surface,
                      ...shadow.card,
                    },
                  ]}
                >
                  <Txt
                    style={{
                      fontFamily: selected ? font.heavy : font.semibold,
                      fontSize: 13,
                      color: selected ? theme.ink : theme.muted,
                    }}
                  >
                    {tab.label}
                  </Txt>
                  {tab.badge > 0 ? (
                    <View
                      style={[
                        styles.tabBadgePill,
                        {
                          backgroundColor:
                            tab.key === "requests"
                              ? theme.pink
                              : selected
                                ? theme.violet
                                : theme.tints.violet,
                        },
                      ]}
                    >
                      <Txt
                        style={{
                          fontFamily: font.heavy,
                          fontSize: 10.5,
                          lineHeight: 13,
                          color:
                            tab.key === "requests" || selected
                              ? "#FFFFFF"
                              : theme.toneText.violet,
                        }}
                      >
                        {compactNumber(tab.badge)}
                      </Txt>
                    </View>
                  ) : null}
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* Loading Shimmer vs Error vs Conversation Lists */}
        {roomsQuery.isPending && !roomsQuery.data ? (
          <View style={{ paddingHorizontal: 16 }}>
            <SkeletonList count={6} />
          </View>
        ) : roomsQuery.isError ? (
          <ErrorState
            error={roomsQuery.error}
            onRetry={() => void roomsQuery.refetch()}
          />
        ) : filteredRooms.length === 0 ? (
          <EmptyHint
            emoji={
              folder === "requests"
                ? "💌"
                : folder === "groups"
                  ? "🪐"
                  : "💬"
            }
            title={
              debouncedSearch
                ? `No conversations matching “${searchQuery.trim()}”`
                : folder === "requests"
                  ? "No message requests"
                  : folder === "groups"
                    ? "No group rooms yet"
                    : "Your inbox is quiet"
            }
            text={
              folder === "requests"
                ? "When someone outside your communities messages you, their request appears here."
                : folder === "groups"
                  ? "Join topic rooms and live lounges inside your favorite communities."
                  : "Start a 1:1 chat with a friend or hop into a community topic lounge!"
            }
            actionLabel={
              folder === "groups" ? "Explore Communities" : "Start a Chat"
            }
            onAction={() =>
              folder === "groups"
                ? router.push("/explore")
                : setNewChatOpen(true)
            }
            style={{ marginHorizontal: 16 }}
          />
        ) : (
          <View style={{ gap: 16, paddingHorizontal: 16 }}>
            {/* Pinned Section */}
            {pinnedRooms.length > 0 ? (
              <View style={{ gap: 8 }}>
                <SectionHeader title="Pinned" />
                <View style={{ gap: 8 }}>
                  {pinnedRooms.map((room) => (
                    <ConversationRow
                      key={room.id}
                      room={room}
                      typingLabel={typingByRoom[room.id]}
                      onPress={() => openRoom(room)}
                      onLongPress={() => {
                        haptic.pop();
                        setSelectedRoom(room);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {/* All Messages / Groups / Requests Section */}
            {regularRooms.length > 0 ? (
              <View style={{ gap: 8 }}>
                {pinnedRooms.length > 0 ? (
                  <SectionHeader
                    title={
                      folder === "groups"
                        ? "All Group Rooms"
                        : folder === "requests"
                          ? "Pending Requests"
                          : "Recent Messages"
                    }
                  />
                ) : null}
                <View style={{ gap: 8 }}>
                  {regularRooms.map((room) => (
                    <ConversationRow
                      key={room.id}
                      room={room}
                      typingLabel={typingByRoom[room.id]}
                      onPress={() => openRoom(room)}
                      onLongPress={() => {
                        haptic.pop();
                        setSelectedRoom(room);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Long-Press Conversation Options Menu */}
      <ActionMenu
        visible={Boolean(selectedRoom)}
        title={selectedRoom?.name ?? "Conversation"}
        items={roomMenuItems}
        onClose={() => setSelectedRoom(null)}
      />

      {/* Start New Direct Message Sheet */}
      <Sheet
        visible={newChatOpen}
        title="New Direct Message"
        onClose={() => setNewChatOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13.5,
            lineHeight: 19,
            color: theme.muted,
          }}
        >
          Enter a member’s @handle to open a 1:1 conversation or jump to our
          Find Your People directory.
        </Txt>
        <Field
          label="Recipient @handle"
          value={recipientInput}
          onChangeText={setRecipientInput}
          placeholder="e.g. @luna or riku"
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => void handleStartNewDm()}
        />
        <GradientButton
          label={startingDm ? "Opening Chat…" : "Open Conversation"}
          icon="chatbubble-ellipses"
          gradient="hero"
          size="lg"
          full
          busy={startingDm}
          disabled={!recipientInput.trim()}
          onPress={() => void handleStartNewDm()}
        />
        <PressableScale
          onPress={() => {
            setNewChatOpen(false);
            router.push("/smart-search");
          }}
          accessibilityRole="button"
          accessibilityLabel="Browse people directory"
          scaleTo={0.97}
          style={[
            styles.browseDirectoryBtn,
            {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <Ionicons name="compass-outline" size={17} color={theme.violet} />
          <Txt
            style={{
              fontFamily: font.bold,
              fontSize: 13,
              color: theme.toneText.violet,
            }}
          >
            Find People by Shared Fandoms ›
          </Txt>
        </PressableScale>
      </Sheet>
    </View>
  );
}

/**
 * Rich Conversation Row matching Mockup 4 Left Pane:
 * - Avatar with green online status dot (or group/live badge)
 * - Display name + Verified tick + Community pill (for group rooms)
 * - Live typing indicator or formatted last message snippet
 * - Timestamp + Pin/Mute icons + Unread count badge
 */
function ConversationRow({
  room,
  typingLabel,
  onPress,
  onLongPress,
}: {
  room: ChatOverviewRoom;
  typingLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const hasUnread = room.unread > 0;
  const isLiveRoom = room.kind === "voice" || room.kind === "screening";

  const formattedSnippet = useMemo(() => {
    if (typingLabel) return typingLabel;
    const raw = room.lastMessage ? previewText(room.lastMessage) : "";
    if (!raw) {
      return room.topic || "Say hi to start the conversation 👋";
    }
    if (room.isGroup && room.lastAuthor) {
      return `${room.lastAuthor}: ${raw}`;
    }
    return raw;
  }, [typingLabel, room.lastMessage, room.topic, room.isGroup, room.lastAuthor]);

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${room.name}${room.peerVerified ? ", verified" : ""}${room.peerOnline ? ", online" : ""}. ${formattedSnippet}. ${room.lastAt ? timeAgo(room.lastAt) : ""}${hasUnread ? `, ${room.unread} unread messages` : ""}`}
      scaleTo={0.985}
      style={[
        styles.rowCard,
        {
          backgroundColor: hasUnread ? theme.surfaceAi : theme.surface,
          borderColor: hasUnread ? theme.violet : theme.border,
        },
        shadow.card,
      ]}
    >
      {/* Left Avatar with Online Dot or Group Indicator */}
      <View style={{ position: "relative" }}>
        <PersonAvatar
          person={{
            name: room.name,
            hue: room.hue,
            userId: room.peerHandle ?? undefined,
          }}
          size={52}
          online={!room.isGroup ? room.peerOnline : undefined}
        />
        {room.isGroup ? (
          <View
            style={[
              styles.groupCornerBadge,
              {
                backgroundColor: isLiveRoom ? theme.pink : theme.violet,
                borderColor: theme.surface,
              },
            ]}
          >
            <Ionicons
              name={
                room.kind === "voice"
                  ? "mic"
                  : room.kind === "screening"
                    ? "film"
                    : "people"
              }
              size={10}
              color="#FFFFFF"
            />
          </View>
        ) : null}
      </View>

      {/* Center Name, Verified Tick, Community Tag & Snippet */}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Txt
            numberOfLines={1}
            style={{
              fontFamily: hasUnread ? font.heavy : font.bold,
              fontSize: 15,
              lineHeight: 19,
              color: theme.ink,
              flexShrink: 1,
            }}
          >
            {room.name}
          </Txt>
          {room.peerVerified ? <VerifiedTick size={14} /> : null}
          {isLiveRoom ? (
            <LiveBadge
              label={room.kind === "screening" ? "WATCH" : "LIVE"}
            />
          ) : room.communityName ? (
            <Pill
              label={room.communityName}
              tone="violet"
              style={{ height: 18, paddingHorizontal: 6 }}
            />
          ) : null}
        </View>

        <Txt
          numberOfLines={1}
          style={{
            fontFamily: typingLabel
              ? font.bold
              : hasUnread
                ? font.semibold
                : font.regular,
            fontSize: 13,
            lineHeight: 17,
            color: typingLabel
              ? theme.violet
              : hasUnread
                ? theme.ink
                : theme.muted,
          }}
        >
          {formattedSnippet}
        </Txt>
      </View>

      {/* Right Timestamp, Pin/Mute Icons & Unread Pill */}
      <View style={styles.rowRightMeta}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {room.pinned ? (
            <Ionicons name="pin" size={12} color={theme.violet} />
          ) : null}
          {room.muted ? (
            <Ionicons
              name="notifications-off"
              size={12}
              color={theme.subtle}
            />
          ) : null}
          {room.lastAt ? (
            <Txt
              style={{
                fontFamily: hasUnread ? font.bold : font.regular,
                fontSize: 11.5,
                lineHeight: 15,
                color: hasUnread ? theme.violet : theme.subtle,
              }}
            >
              {timeAgo(room.lastAt)}
            </Txt>
          ) : null}
        </View>

        {hasUnread ? (
          <LinearGradient
            colors={theme.gradPrimary}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.unreadBadge}
          >
            <Txt
              style={{
                fontFamily: font.heavy,
                fontSize: 11,
                lineHeight: 14,
                color: "#FFFFFF",
              }}
            >
              {compactNumber(room.unread)}
            </Txt>
          </LinearGradient>
        ) : room.liveCount > 0 && room.isGroup ? (
          <View style={styles.liveActiveCountPill}>
            <View
              style={[styles.liveGreenDot, { backgroundColor: theme.ok }]}
            />
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 10.5,
                color: theme.ok,
              }}
            >
              {compactNumber(room.liveCount)}
            </Txt>
          </View>
        ) : (
          <View style={{ height: 20 }} />
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 4,
    gap: 12,
  },
  newChatPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13.5,
    paddingVertical: 8,
    outlineWidth: 0,
  },
  folderTabsBar: {
    flexDirection: "row",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  folderTabItem: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tabBadgePill: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  groupCornerBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowRightMeta: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 40,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  liveActiveCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  browseDirectoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});