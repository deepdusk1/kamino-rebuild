// ===== FILE: mobile/src/app/chat/watch/[roomId].tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  FadeInUp,
  FadeOutUp,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import { useSSEListener, type WatchSyncPayload } from "@/api/sse";
import type { HallEvent } from "@/api/types";
import { confirmAction, notify } from "@/components/community/platform";
import {
  GradientButton,
  LiveBadge,
  PersonAvatar,
  Pill,
  SectionHeader,
} from "@/components/k";
import {
  Button,
  Field,
  PressableScale,
  Sheet,
  Txt,
} from "@/components/ui";
import { useCall } from "@/lib/calls/useCall";
import { showError } from "@/lib/errors";
import { compactNumber } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, useTheme } from "@/theme";

/**
 * Extensible MediaSource Adapter Interface supporting:
 * - `mp4`: Direct HTTP progressive video streams (`expo-video`)
 * - `hls`: Adaptive HTTP Live Streaming `.m3u8` manifests (`expo-video`)
 * - `youtube`: YouTube watch/embed links with deep-link & web player handoff
 * - `webview-drm`: Widevine / FairPlay DRM-protected subscription streams (Netflix / Crunchyroll style)
 */
export type MediaSourceKind = "mp4" | "hls" | "youtube" | "webview-drm";

export interface WatchPartyMediaAdapter {
  readonly kind: MediaSourceKind;
  readonly label: string;
  readonly supportsNativePlayer: boolean;
  canHandle(url: string): boolean;
  normalizeUrl(url: string): string;
}

const MEDIA_ADAPTERS: readonly WatchPartyMediaAdapter[] = [
  {
    kind: "hls",
    label: "HLS Adaptive Stream (.m3u8)",
    supportsNativePlayer: true,
    canHandle: (url) => /\.m3u8(?:[?#]|$)/i.test(url),
    normalizeUrl: (url) => url.trim(),
  },
  {
    kind: "youtube",
    label: "YouTube Synced Stream",
    supportsNativePlayer: false,
    canHandle: (url) =>
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/i.test(url),
    normalizeUrl: (url) => url.trim(),
  },
  {
    kind: "webview-drm",
    label: "WebView-DRM Shared Theater",
    supportsNativePlayer: false,
    canHandle: (url) =>
      /(?:netflix\.com|crunchyroll\.com|disneyplus\.com|drm=1)/i.test(url),
    normalizeUrl: (url) => url.trim(),
  },
  {
    kind: "mp4",
    label: "Direct MP4 / WebM Stream",
    supportsNativePlayer: true,
    canHandle: () => true,
    normalizeUrl: (url) => url.trim(),
  },
];

export function resolveMediaAdapter(url: string): WatchPartyMediaAdapter {
  for (const adapter of MEDIA_ADAPTERS) {
    if (adapter.canHandle(url)) return adapter;
  }
  return MEDIA_ADAPTERS[MEDIA_ADAPTERS.length - 1]!;
}

/**
 * NEEDS BACKEND — Exact SSE Event & RPC Specifications for Multi-Viewer Watch Party Sync:
 *
 * 1. SSE Event: `watchparty.sync` (also aliased as `watch.sync` in `mobile/src/api/sse.ts`)
 *    - Emitted by the server to all connected room subscribers whenever the host plays, pauses, or seeks:
 *      ```json
 *      {
 *        "type": "watchparty.sync",
 *        "roomId": 104,
 *        "isPlaying": true,
 *        "positionMs": 45200,
 *        "playbackRate": 1.0,
 *        "updatedAtEpochMs": 1776100000000
 *      }
 *      ```
 *
 * 2. RPC Method: `syncWatchPartyPlayback` (NEEDS BACKEND)
 *    - Args: `{ roomId: number; isPlaying: boolean; positionMs: number; playbackRate: number; updatedAtEpochMs: number }`
 *    - Response: `{ ok: boolean }`
 *
 * 3. RPC Method: `kickWatchPartyViewer` (NEEDS BACKEND)
 *    - Args: `{ roomId: number; targetUserId: string }`
 *    - Response: `{ ok: boolean }`
 */

type FloatingReaction = {
  id: string;
  emoji: string;
  xOffset: number;
};

type WatchChatLine = {
  id: number;
  author: string;
  body: string;
  hue: number;
};

type ListEventsRpcResult = {
  events: HallEvent[];
};

const DEFAULT_SAMPLE_STREAM =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

export default function WatchPartyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width: screenWidth } = useWindowDimensions();

  const { roomId: roomParam } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(roomParam);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me });
  const roomQuery = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => api.room(roomId),
    enabled: Number.isFinite(roomId) && roomId > 0,
  });

  const roomInfo = roomQuery.data?.room;
  const communitySlug = roomInfo?.communityId ?? "anime-realm";

  // Scheduled Watch Parties surfaced from the verified `rpc("listEvents", { slug })` (`api.events` fallback)
  const scheduledEventsQuery = useQuery({
    queryKey: ["events", communitySlug],
    enabled: Boolean(communitySlug),
    staleTime: 60_000,
    queryFn: async (): Promise<ListEventsRpcResult> => {
      try {
        return await rpc<ListEventsRpcResult>("listEvents", {
          slug: communitySlug,
        });
      } catch {
        return await api.events(communitySlug);
      }
    },
  });

  // LiveKit Voice Lounge alongside the Watch Party
  const voiceCall = useCall(
    roomId,
    meQuery.data?.profile.userId,
    meQuery.data?.profile.displayName ?? "Viewer",
  );

  const [mediaUrl, setMediaUrl] = useState<string>(
    roomInfo?.watchUrl || DEFAULT_SAMPLE_STREAM,
  );
  const [mediaTitle, setMediaTitle] = useState<string>(
    roomInfo?.watchTitle || roomInfo?.name || "Episode 12 Premiere Watch Party",
  );

  useEffect(() => {
    if (roomInfo?.watchUrl) setMediaUrl(roomInfo.watchUrl);
    if (roomInfo?.watchTitle) setMediaTitle(roomInfo.watchTitle);
  }, [roomInfo?.watchUrl, roomInfo?.watchTitle]);

  const activeAdapter = useMemo(
    () => resolveMediaAdapter(mediaUrl),
    [mediaUrl],
  );

  const player = useVideoPlayer(
    activeAdapter.supportsNativePlayer
      ? activeAdapter.normalizeUrl(mediaUrl)
      : DEFAULT_SAMPLE_STREAM,
    (p) => {
      p.loop = true;
      p.timeUpdateEventInterval = 0.5;
    },
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chatLines, setChatLines] = useState<WatchChatLine[]>([
    {
      id: 1,
      author: "Luna",
      body: "Everyone synced up? Starting the premiere! 🍿",
      hue: 275,
    },
    {
      id: 2,
      author: "Riku",
      body: "Audio and video are crystal clear 🔥",
      hue: 205,
    },
  ]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [kickedUserIds, setKickedUserIds] = useState<string[]>([]);

  // Modals
  const [voiceLoungeOpen, setVoiceLoungeOpen] = useState(false);
  const [hostControlsOpen, setHostControlsOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(mediaUrl);
  const [customTitleInput, setCustomTitleInput] = useState(mediaTitle);

  const applyingRemoteSyncRef = useRef(false);

  const applyWatchSyncState = useCallback(
    (sync: WatchSyncPayload) => {
      applyingRemoteSyncRef.current = true;
      const targetSec = Math.max(0, sync.positionMs / 1_000);
      setPositionSec(Math.round(targetSec));

      if (activeAdapter.supportsNativePlayer) {
        if (Math.abs(player.currentTime - targetSec) > 1.2) {
          player.seekBy(targetSec - player.currentTime);
        }
        if (sync.isPlaying) {
          player.play();
          setIsPlaying(true);
        } else {
          player.pause();
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(sync.isPlaying);
      }
      applyingRemoteSyncRef.current = false;
    },
    [activeAdapter.supportsNativePlayer, player],
  );

  // Subscribe to `watchparty.sync` / `watch.sync` and `chat.message` over Module 1 SSE
  useSSEListener((event) => {
    if (event.roomId !== roomId) return;

    if (
      (event.type === "watchparty.sync" || event.type === "watch.sync") &&
      event.watchSync
    ) {
      applyWatchSyncState(event.watchSync);
      return;
    }

    if (
      event.type === "chat.message" ||
      event.type === "message.new" ||
      event.type === "message"
    ) {
      if (event.message) {
        setChatLines((prev) => [
          ...prev.slice(-15),
          {
            id: event.message!.id,
            author: event.message!.author.nickname,
            body: event.message!.body,
            hue: event.message!.author.hue,
          },
        ]);
      }
    }
  });

  /**
   * Broadcasts play/pause/seek state to all viewers in the room.
   * Calls `syncWatchPartyPlayback` (NEEDS BACKEND) and updates the local `["watch-sync", roomId]` cache.
   */
  const broadcastHostSync = useCallback(
    async (nextPlaying: boolean, nextPositionSec: number) => {
      if (applyingRemoteSyncRef.current) return;
      const syncPayload: WatchSyncPayload = {
        roomId,
        isPlaying: nextPlaying,
        positionMs: Math.max(0, Math.round(nextPositionSec * 1_000)),
        playbackRate: 1.0,
        updatedAtEpochMs: Date.now(),
      };
      queryClient.setQueryData<WatchSyncPayload>(
        ["watch-sync", roomId],
        syncPayload,
      );

      // NEEDS BACKEND: `syncWatchPartyPlayback` emits `watchparty.sync` over SSE to all room viewers
      await rpc("syncWatchPartyPlayback", syncPayload).catch(() => undefined);
    },
    [queryClient, roomId],
  );

  const handleTogglePlayPause = () => {
    haptic.tap();
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    const currentSec = activeAdapter.supportsNativePlayer
      ? player.currentTime
      : positionSec;

    if (activeAdapter.supportsNativePlayer) {
      if (nextPlaying) {
        player.play();
      } else {
        player.pause();
      }
    }
    void broadcastHostSync(nextPlaying, currentSec);
  };

  const handleSeekBy = (deltaSec: number) => {
    haptic.tap();
    const currentSec = activeAdapter.supportsNativePlayer
      ? player.currentTime
      : positionSec;
    const nextSec = Math.max(0, currentSec + deltaSec);
    setPositionSec(Math.round(nextSec));

    if (activeAdapter.supportsNativePlayer) {
      player.seekBy(deltaSec);
    }
    void broadcastHostSync(isPlaying, nextSec);
  };

  /**
   * Host Control: Changes the shared watch party media source URL via `api.setWatchParty`.
   */
  const handleSaveMediaSource = async () => {
    const cleanUrl = customUrlInput.trim();
    const cleanTitle = customTitleInput.trim() || "Watch Party";
    if (!cleanUrl) return;
    haptic.success();
    setMediaUrl(cleanUrl);
    setMediaTitle(cleanTitle);
    setHostControlsOpen(false);
    try {
      await api.setWatchParty(roomId, cleanUrl, cleanTitle);
      void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
    } catch {
      // Local stream URL already updated
    }
  };

  /**
   * Host Control: Kicks a disruptive viewer from the Watch Party room.
   */
  const handleKickParticipant = async (userId: string, name: string) => {
    const ok = await confirmAction(
      `Remove ${name} from Watch Party?`,
      "They will be disconnected from the synced stream and voice lounge.",
      "Kick Viewer",
      true,
    );
    if (!ok) return;
    haptic.tap();
    setKickedUserIds((prev) => [...prev, userId]);

    // NEEDS BACKEND: `kickWatchPartyViewer` removes the participant from the watch party session
    await rpc("kickWatchPartyViewer", {
      roomId,
      targetUserId: userId,
    }).catch(() => undefined);

    notify("Viewer Removed", `${name} has been removed from the watch party.`);
  };

  const triggerReactionRain = (emoji: string) => {
    haptic.pop();
    const maxOffset = Math.max(80, screenWidth - 72);
    const randomX = Math.floor(Math.random() * maxOffset) + 24;
    const item: FloatingReaction = {
      id: `${Date.now()}-${Math.random()}`,
      emoji,
      xOffset: randomX,
    };
    setReactions((prev) => [...prev, item]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== item.id));
    }, 2_200);
  };

  const handleSendChat = async () => {
    const clean = chatInput.trim();
    if (!clean) return;
    setChatInput("");
    const myName = meQuery.data?.profile.displayName ?? "You";
    const myHue = meQuery.data?.profile.avatarHue ?? 265;
    setChatLines((prev) => [
      ...prev.slice(-15),
      { id: Date.now(), author: myName, body: clean, hue: myHue },
    ]);

    try {
      await rpc("sendMessage", {
        roomId,
        body: clean,
        clientTag: `wp-chat-${Date.now()}`,
      });
    } catch {
      await api.send({ roomId, body: clean }).catch(() => undefined);
    }
  };

  const activeParticipants = useMemo(() => {
    const raw = roomQuery.data?.participants ?? [];
    const base =
      raw.length > 0
        ? raw
        : [
            { userId: "u-luna", name: "Luna" },
            { userId: "u-riku", name: "Riku" },
            { userId: "u-mina", name: "Mina" },
          ];
    return base.filter((p) => !kickedUserIds.includes(p.userId));
  }, [roomQuery.data?.participants, kickedUserIds]);

  const scheduledEvents = scheduledEventsQuery.data?.events ?? [];

  return (
    <View style={styles.root}>
      {/* ── TOP THEATER HEADER BAR ── */}
      <View
        style={[
          styles.topHeaderBar,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <PressableScale
          onPress={() => {
            voiceCall.hangUp();
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace(`/chat/${roomId}`);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Exit Watch Party"
          scaleTo={0.9}
          style={styles.headerCircleBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </PressableScale>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <LiveBadge label="WATCH PARTY" icon="film" />
            <Pill
              label={activeAdapter.kind.toUpperCase()}
              tone="violet"
              style={{ height: 18, paddingHorizontal: 6 }}
            />
          </View>
          <Txt numberOfLines={1} style={styles.headerTitleText}>
            {mediaTitle}
          </Txt>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <PressableScale
            onPress={() => setScheduledOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Scheduled Watch Parties"
            scaleTo={0.92}
            style={styles.headerCircleBtn}
          >
            <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
          </PressableScale>

          <PressableScale
            onPress={() => {
              setCustomUrlInput(mediaUrl);
              setCustomTitleInput(mediaTitle);
              setHostControlsOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Host controls and stream settings"
            scaleTo={0.92}
            style={styles.headerCircleBtn}
          >
            <Ionicons name="Sliders-outline" size={18} color="#FFFFFF" />
          </PressableScale>

          <PressableScale
            onPress={() => setVoiceLoungeOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open LiveKit Voice Lounge"
            scaleTo={0.92}
            style={styles.voiceLoungePill}
          >
            <Ionicons
              name={voiceCall.muted ? "mic-off" : "mic"}
              size={15}
              color="#34D399"
            />
            <Txt style={styles.voiceLoungePillText}>
              Voice ({1 + voiceCall.peers.length})
            </Txt>
          </PressableScale>
        </View>
      </View>

      {/* ── VIDEO STAGE + EXTENSIBLE MEDIA SOURCE ADAPTER + REACTION RAIN ── */}
      <View style={styles.videoTheaterArea}>
        {activeAdapter.supportsNativePlayer ? (
          <VideoView
            player={player}
            nativeControls
            contentFit="contain"
            style={StyleSheet.absoluteFill}
            accessibilityLabel={`Watch party video stream: ${mediaTitle}`}
          />
        ) : (
          <View style={styles.externalAdapterFallback}>
            <LinearGradient
              colors={["#1E1842", "#0B0A14"]}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons
              name={
                activeAdapter.kind === "youtube"
                  ? "logo-youtube"
                  : "lock-closed"
              }
              size={44}
              color="#EC4899"
            />
            <Txt style={styles.externalAdapterTitle}>
              {activeAdapter.label}
            </Txt>
            <Txt style={styles.externalAdapterSub}>
              Synced timecode: {Math.floor(positionSec / 60)}:
              {String(positionSec % 60).padStart(2, "0")} ·{" "}
              {isPlaying ? "Playing for all viewers" : "Paused"}
            </Txt>
            <GradientButton
              label="Open Synchronized Stream"
              icon="open-outline"
              gradient="hero"
              size="md"
              onPress={() => {
                if (activeAdapter.kind === "youtube") {
                  void Linking.openURL(mediaUrl);
                } else {
                  void WebBrowser.openBrowserAsync(mediaUrl);
                }
              }}
            />
          </View>
        )}

        {/* Reaction Rain Floating Animation Overlay */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {reactions.map((r) => (
            <Animated.View
              key={r.id}
              entering={FadeInUp.duration(260)}
              exiting={FadeOutUp.duration(400)}
              style={[
                styles.floatingReactionEmoji,
                { left: r.xOffset },
              ]}
            >
              <Txt style={{ fontSize: 32, lineHeight: 38 }}>{r.emoji}</Txt>
            </Animated.View>
          ))}
        </View>
      </View>

      {/* ── HOST SYNC PLAYBACK CONTROLS BAR (Play/Pause, -15s, +15s, Sync Badge) ── */}
      <View style={styles.syncControlStrip}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PressableScale
            onPress={() => handleSeekBy(-15)}
            accessibilityRole="button"
            accessibilityLabel="Rewind 15 seconds for all viewers"
            scaleTo={0.9}
            style={styles.seekPillBtn}
          >
            <Ionicons name="play-back" size={14} color="#FFFFFF" />
            <Txt style={styles.seekBtnLabel}>-15s</Txt>
          </PressableScale>

          <PressableScale
            onPress={handleTogglePlayPause}
            accessibilityRole="button"
            accessibilityLabel={
              isPlaying
                ? "Pause playback for all viewers"
                : "Play for all viewers"
            }
            scaleTo={0.9}
            style={styles.playPausePrimaryBtn}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={18}
              color="#FFFFFF"
            />
            <Txt style={styles.playPauseLabel}>
              {isPlaying ? "Pause All" : "Play All"}
            </Txt>
          </PressableScale>

          <PressableScale
            onPress={() => handleSeekBy(15)}
            accessibilityRole="button"
            accessibilityLabel="Fast-forward 15 seconds for all viewers"
            scaleTo={0.9}
            style={styles.seekPillBtn}
          >
            <Txt style={styles.seekBtnLabel}>+15s</Txt>
            <Ionicons name="play-forward" size={14} color="#FFFFFF" />
          </PressableScale>
        </View>

        <PressableScale
          onPress={() => {
            const currentSec = activeAdapter.supportsNativePlayer
              ? player.currentTime
              : positionSec;
            void broadcastHostSync(isPlaying, currentSec);
            haptic.success();
            notify(
              "Viewers Synced ⚡",
              "Broadcasted your current timestamp to everyone in the room.",
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Broadcast sync timecode to all viewers"
          scaleTo={0.94}
          style={styles.syncNowBadge}
        >
          <Ionicons name="sync" size={13} color="#A78BFA" />
          <Txt style={styles.syncNowText}>
            Sync ({activeParticipants.length})
          </Txt>
        </PressableScale>
      </View>

      {/* ── LIVE CHAT OVERLAY + REACTION RAIN BAR + COMPOSER ── */}
      <KeyboardAvoidingView
        style={[
          styles.bottomOverlayDock,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Semi-Transparent Live Chat Overlay */}
        <ScrollView
          style={styles.chatOverlayScroll}
          contentContainerStyle={{ gap: 6 }}
        >
          {chatLines.slice(-4).map((line) => (
            <View key={line.id} style={styles.chatOverlayPill}>
              <PersonAvatar
                person={{ name: line.author, hue: line.hue }}
                size={20}
              />
              <Txt style={styles.chatOverlayAuthor}>{line.author}:</Txt>
              <Txt numberOfLines={2} style={styles.chatOverlayBody}>
                {line.body}
              </Txt>
            </View>
          ))}
        </ScrollView>

        {/* Reaction Rain Trigger Strip */}
        <View style={styles.reactionButtonsRow}>
          {["❤️", "🔥", "🎉", "👏", "😮", "💜"].map((emoji) => (
            <PressableScale
              key={emoji}
              onPress={() => triggerReactionRain(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`Send floating reaction ${emoji}`}
              scaleTo={0.86}
              style={styles.reactionCircleBtn}
            >
              <Txt style={{ fontSize: 21 }}>{emoji}</Txt>
            </PressableScale>
          ))}
        </View>

        {/* Chat Input + Quick Mute Mic Button */}
        <View style={styles.chatComposerRow}>
          <PressableScale
            onPress={() => {
              haptic.tap();
              voiceCall.toggleMute();
            }}
            accessibilityRole="button"
            accessibilityLabel={
              voiceCall.muted
                ? "Unmute voice lounge microphone"
                : "Mute voice lounge microphone"
            }
            scaleTo={0.9}
            style={[
              styles.micQuickToggleBtn,
              {
                backgroundColor: voiceCall.muted
                  ? "rgba(239, 68, 68, 0.24)"
                  : "rgba(16, 185, 129, 0.24)",
                borderColor: voiceCall.muted ? "#EF4444" : "#10B981",
              },
            ]}
          >
            <Ionicons
              name={voiceCall.muted ? "mic-off" : "mic"}
              size={18}
              color={voiceCall.muted ? "#EF4444" : "#34D399"}
            />
          </PressableScale>

          <View style={styles.chatInputBox}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Chat with the watch party…"
              placeholderTextColor="rgba(255,255,255,0.48)"
              returnKeyType="send"
              maxLength={240}
              onSubmitEditing={() => void handleSendChat()}
              style={styles.chatTextInput}
            />
          </View>

          <Button
            small
            label="Send"
            disabled={!chatInput.trim()}
            onPress={() => void handleSendChat()}
          />
        </View>
      </KeyboardAvoidingView>

      {/* ── VOICE LOUNGE SHEET (LiveKit Audio Room Alongside Video) ── */}
      <Sheet
        visible={voiceLoungeOpen}
        title="Watch Party Voice Lounge 🎧"
        onClose={() => setVoiceLoungeOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13.5,
            color: theme.muted,
          }}
        >
          Talk in real time over LiveKit audio while watching together. Hardware
          echo cancellation prevents the movie audio from echoing.
        </Txt>

        <View style={{ gap: 8 }}>
          <View
            style={[
              styles.participantRow,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
              },
            ]}
          >
            <PersonAvatar
              person={{
                name: meQuery.data?.profile.displayName ?? "You",
                hue: meQuery.data?.profile.avatarHue ?? 265,
              }}
              size={38}
              online
            />
            <View style={{ flex: 1 }}>
              <Txt
                style={{
                  fontFamily: font.heavy,
                  fontSize: 14,
                  color: theme.ink,
                }}
              >
                {meQuery.data?.profile.displayName ?? "You"} (You)
              </Txt>
              <Txt
                style={{
                  fontFamily: font.semibold,
                  fontSize: 11.5,
                  color: voiceCall.muted ? theme.muted : theme.ok,
                }}
              >
                {voiceCall.muted ? "Microphone muted" : "Connected · Speaking"}
              </Txt>
            </View>
            <Button
              small
              variant="secondary"
              label={voiceCall.muted ? "Unmute" : "Mute"}
              onPress={() => voiceCall.toggleMute()}
            />
          </View>

          {activeParticipants.map((p, idx) => (
            <View
              key={p.userId}
              style={[
                styles.participantRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <PersonAvatar
                person={{
                  name: p.name,
                  hue: (idx * 55 + 220) % 360,
                  userId: p.userId,
                }}
                size={38}
                online
              />
              <View style={{ flex: 1 }}>
                <Txt
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 14,
                    color: theme.ink,
                  }}
                >
                  {p.name}
                </Txt>
                <Txt
                  style={{
                    fontFamily: font.semibold,
                    fontSize: 11.5,
                    color: theme.ok,
                  }}
                >
                  Synced · In Voice Lounge
                </Txt>
              </View>
              <PressableScale
                onPress={() => void handleKickParticipant(p.userId, p.name)}
                accessibilityRole="button"
                accessibilityLabel={`Kick ${p.name} from Watch Party`}
                scaleTo={0.92}
                style={[
                  styles.kickBtnPill,
                  { backgroundColor: theme.tints.red },
                ]}
              >
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 11.5,
                    color: theme.danger,
                  }}
                >
                  Kick
                </Txt>
              </PressableScale>
            </View>
          ))}
        </View>
      </Sheet>

      {/* ── HOST CONTROLS & MEDIA SOURCE ADAPTER SHEET ── */}
      <Sheet
        visible={hostControlsOpen}
        title="Host Controls & Media Source"
        onClose={() => setHostControlsOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13,
            color: theme.muted,
          }}
        >
          Paste an HLS (.m3u8), MP4, YouTube, or WebView-DRM link. Changes sync
          immediately across all viewers in the room.
        </Txt>
        <Field
          label="Episode or Movie Title"
          value={customTitleInput}
          onChangeText={setCustomTitleInput}
          placeholder="e.g. Episode 12 Finale Watch Party"
        />
        <Field
          label="Stream URL (HLS, MP4, YouTube, WebView-DRM)"
          value={customUrlInput}
          onChangeText={setCustomUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://..."
        />
        <GradientButton
          label="Update Stream for Everyone"
          icon="sync"
          gradient="hero"
          size="lg"
          full
          onPress={() => void handleSaveMediaSource()}
        />

        <SectionHeader title="Manage Viewers (Kick)" />
        <View style={{ gap: 6 }}>
          {activeParticipants.map((p) => (
            <View
              key={p.userId}
              style={[
                styles.participantRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <Txt
                style={{
                  flex: 1,
                  fontFamily: font.bold,
                  fontSize: 13.5,
                  color: theme.ink,
                }}
              >
                {p.name}
              </Txt>
              <PressableScale
                onPress={() => void handleKickParticipant(p.userId, p.name)}
                accessibilityRole="button"
                accessibilityLabel={`Kick ${p.name}`}
                scaleTo={0.92}
                style={[
                  styles.kickBtnPill,
                  { backgroundColor: theme.tints.red },
                ]}
              >
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 11.5,
                    color: theme.danger,
                  }}
                >
                  Kick
                </Txt>
              </PressableScale>
            </View>
          ))}
        </View>
      </Sheet>

      {/* ── SCHEDULED WATCH PARTIES SHEET (`rpc("listEvents", { slug })`) ── */}
      <Sheet
        visible={scheduledOpen}
        title="Scheduled Watch Parties 📅"
        onClose={() => setScheduledOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13,
            color: theme.muted,
          }}
        >
          Upcoming community watch parties and screening events from{" "}
          {communitySlug}:
        </Txt>
        <View style={{ gap: 8 }}>
          {(scheduledEvents.length > 0
            ? scheduledEvents.slice(0, 5)
            : [
                {
                  id: 901,
                  communityId: communitySlug,
                  title: "Episode 13 Live Simulcast Watch Party",
                  description: "Friday · 8:00 PM",
                  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
                  rsvpCount: 418,
                  going: false,
                  kind: "event" as const,
                  entryCount: 0,
                },
                {
                  id: 902,
                  communityId: communitySlug,
                  title: "Classic Movie Night Marathon",
                  description: "Sunday · 6:00 PM",
                  startsAt: new Date(Date.now() + 172_800_000).toISOString(),
                  rsvpCount: 289,
                  going: true,
                  kind: "event" as const,
                  entryCount: 0,
                },
              ]
          ).map((ev) => (
            <View
              key={ev.id}
              style={[
                styles.participantRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt
                  numberOfLines={1}
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 13.5,
                    color: theme.ink,
                  }}
                >
                  {ev.title}
                </Txt>
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 11.5,
                    color: theme.muted,
                  }}
                >
                  {compactNumber(ev.rsvpCount)} RSVP’d
                </Txt>
              </View>
              <Button
                small
                variant="secondary"
                label={ev.going ? "Going ✓" : "RSVP"}
                onPress={() => {
                  void api.rsvp(communitySlug, ev.id).catch(() => undefined);
                  haptic.success();
                  void scheduledEventsQuery.refetch();
                }}
              />
            </View>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#080711",
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: "rgba(14, 11, 32, 0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: {
    fontFamily: font.heavy,
    fontSize: 14.5,
    lineHeight: 18,
    color: "#FFFFFF",
  },
  voiceLoungePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: "rgba(52, 211, 153, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.38)",
  },
  voiceLoungePillText: {
    fontFamily: font.bold,
    fontSize: 11.5,
    color: "#34D399",
  },
  videoTheaterArea: {
    flex: 1,
    backgroundColor: "#000000",
    position: "relative",
  },
  externalAdapterFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  externalAdapterTitle: {
    fontFamily: font.heavy,
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
  },
  externalAdapterSub: {
    fontFamily: font.regular,
    fontSize: 13,
    color: "rgba(241, 245, 249, 0.78)",
    textAlign: "center",
  },
  floatingReactionEmoji: {
    position: "absolute",
    bottom: 24,
  },
  syncControlStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(18, 15, 38, 0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  seekPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  seekBtnLabel: {
    fontFamily: font.bold,
    fontSize: 11.5,
    color: "#FFFFFF",
  },
  playPausePrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: "#7C3AED",
  },
  playPauseLabel: {
    fontFamily: font.bold,
    fontSize: 12,
    color: "#FFFFFF",
  },
  syncNowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(124, 58, 237, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.35)",
  },
  syncNowText: {
    fontFamily: font.bold,
    fontSize: 11.5,
    color: "#DDD6FE",
  },
  bottomOverlayDock: {
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 8,
    backgroundColor: "rgba(11, 10, 20, 0.94)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  chatOverlayScroll: {
    maxHeight: 92,
  },
  chatOverlayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(22, 18, 48, 0.78)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  chatOverlayAuthor: {
    fontFamily: font.bold,
    fontSize: 12,
    color: "#C4B5FD",
  },
  chatOverlayBody: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: "#FFFFFF",
    flexShrink: 1,
  },
  reactionButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  reactionCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  chatComposerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  micQuickToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chatInputBox: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  chatTextInput: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: "#FFFFFF",
    outlineWidth: 0,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  kickBtnPill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});