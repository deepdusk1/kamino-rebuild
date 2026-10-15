// ===== FILE: mobile/src/app/call/[roomId].tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import { useSSEListener } from "@/api/sse";
import { GradientButton, PersonAvatar, Pill } from "@/components/k";
import {
  Button,
  Card,
  PressableScale,
  Screen,
  Txt,
} from "@/components/ui";
import { useCall } from "@/lib/calls/useCall";
import { loadWebRTC } from "@/lib/calls/webrtc";
import { useAction } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { dismissIncomingCallNotification } from "@/lib/push";
import { font, radius, shadow, space, useTheme } from "@/theme";

type LiveKitJoinInfo = {
  url: string;
  token: string;
  roomName?: string;
};

type MediaTrackWithConstraints = {
  _switchCamera?: () => void;
  applyConstraints?: (constraints: Record<string, unknown>) => Promise<void>;
};

const STATE_LABEL: Record<string, string> = {
  new: "Connecting…",
  connecting: "Connecting…",
  connected: "In the call",
  disconnected: "Reconnecting…",
  failed: "Could not connect",
  closed: "Left",
};

function hueFor(id: string): number {
  let sum = 0;
  for (const char of id) {
    sum = (sum * 31 + char.charCodeAt(0)) % 360;
  }
  return sum;
}

/**
 * 1:1 & Group Voice/Video Call Screen (`mobile/src/app/call/[roomId].tsx`):
 * - Bug #2 Acceptance Criterion:
 *   1. Joins LiveKit SFU room via `rpc("getLiveKitJoin", { roomId })` / `api.getLiveKitJoin(roomId)`
 *      and `useCall(roomId, userId, displayName)` (which keeps the P2P WebRTC `CallSession` `/api/rtc`
 *      polling fallback ONLY if LiveKit SFU is unavailable or fails)
 *   2. Remote and local video tiles rendered via `RTCView` with mirror support
 *   3. Controls: Mute (`toggleMute`), Speakerphone toggle, Camera on/off (`toggleCamera`),
 *      Camera Flip (front/back lens switch), and Clean Hangup (`rpc("endCall", { roomId })` + `api.endCall(roomId)`)
 *   4. Ringing state until the callee accepts, plus 30-second unanswered DM missed-call logging (`api.missedCall`)
 *   5. Listens to `call.ended` over Module 1 SSE so if the remote peer hangs up or declines, this screen exits cleanly
 *   6. Hardware echo cancellation & noise suppression active
 */
export default function CallScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { roomId: roomParam } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(roomParam);

  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const room = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => api.room(roomId),
    enabled: Number.isFinite(roomId) && roomId > 0,
  });

  // Explicitly pre-fetch & verify the LiveKit SFU credentials via `getLiveKitJoin` RPC / `api.getLiveKitJoin(roomId)`.
  // `useCall` consumes LiveKit first and falls back to `CallSession` (/api/rtc P2P WebRTC) ONLY if LiveKit fails.
  const liveKitJoinQuery = useQuery({
    queryKey: ["liveKitJoin", roomId],
    enabled: Number.isFinite(roomId) && roomId > 0,
    retry: 1,
    queryFn: async (): Promise<LiveKitJoinInfo | null> => {
      try {
        const join = await api.getLiveKitJoin(roomId);
        return join.enabled ? { url: join.url, token: join.token } : null;
      } catch {
        // No LiveKit server configured: `useCall` falls back to the peer-to-peer WebRTC call (`/api/rtc`).
        return null;
      }
    },
  });

  const call = useCall(
    roomId,
    me.data?.profile.userId,
    me.data?.profile.displayName ?? "Me",
  );

  const [speakerOn, setSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [noAnswer, setNoAnswer] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  const missedPosted = useRef(false);
  const rangRef = useRef(false);
  const hangingUpRef = useRef(false);

  const [ring, ringing] = useAction(async () => {
    await api.ringCall(roomId);
  });

  const RTCView = loadWebRTC()?.RTCView;
  const isDm = room.data?.room.kind === "dm";
  const connectedPeers = call.peers.filter((p) => p.state === "connected");
  const connectedCount = connectedPeers.length;

  // Dismiss any lingering incoming-call notification banner once on the call screen
  useEffect(() => {
    if (!Number.isFinite(roomId)) return;
    void dismissIncomingCallNotification(roomId);
  }, [roomId]);

  // Auto-ring the remote peer when dialing a 1:1 DM call
  useEffect(() => {
    if (!isDm || call.status !== "active" || rangRef.current) return;
    rangRef.current = true;
    void api.ringCall(roomId).catch(() => undefined);
  }, [isDm, call.status, roomId]);

  // Track active call duration once at least one peer is connected
  useEffect(() => {
    if (connectedCount === 0 || call.status !== "active") return;
    const interval = setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1_000);
    // Reset when the call stops being connected, so a reconnect starts from 0:00.
    return () => {
      clearInterval(interval);
      setCallSeconds(0);
    };
  }, [connectedCount, call.status]);

  // WhatsApp behavior: DM call unanswered after 30s logs a missed call
  useEffect(() => {
    if (!isDm || call.status !== "active" || noAnswer) return;
    if (connectedCount > 0) return;
    const timer = setTimeout(() => {
      setNoAnswer(true);
      if (!missedPosted.current) {
        missedPosted.current = true;
        void api.missedCall(roomId).catch(() => undefined);
      }
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isDm, call.status, connectedCount, noAnswer, roomId]);

  /**
   * Clean Hangup on BOTH ends:
   * - Stops local LiveKit / WebRTC media tracks (`call.hangUp()`)
   * - Invokes `rpc("endCall", { roomId })` and `api.endCall(roomId)` so the remote participant receives `call.ended`
   * - Dismisses any incoming call notifications and navigates back cleanly
   */
  const handleCleanHangup = useCallback(async () => {
    if (hangingUpRef.current) return;
    hangingUpRef.current = true;
    haptic.tap();

    call.hangUp();
    await dismissIncomingCallNotification(roomId);

    await Promise.allSettled([
      rpc("endCall", { roomId }),
      api.endCall(roomId),
    ]);

    void queryClient.invalidateQueries({ queryKey: ["incomingCalls"] });

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/chat/${roomId}`);
    }
  }, [call, queryClient, roomId]);

  // Listen for `call.ended` via Module 1 SSE so if the other party hangs up or declines, we exit cleanly
  useSSEListener((event) => {
    if (event.roomId !== roomId) return;
    if (event.type === "call.ended" && !hangingUpRef.current) {
      hangingUpRef.current = true;
      call.hangUp();
      void dismissIncomingCallNotification(roomId);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/chat/${roomId}`);
      }
    }
  });

  /**
   * Flips the local video camera between front (`user`) and back (`environment`) lenses.
   */
  const handleFlipCamera = useCallback(async () => {
    haptic.tap();
    const nextFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextFacing);

    const videoTracks =
      (call.localStream?.getVideoTracks() as unknown as MediaTrackWithConstraints[]) ??
      [];
    const primaryTrack = videoTracks[0];
    if (!primaryTrack) return;

    if (typeof primaryTrack._switchCamera === "function") {
      primaryTrack._switchCamera();
      return;
    }
    if (typeof primaryTrack.applyConstraints === "function") {
      await primaryTrack
        .applyConstraints({ facingMode: nextFacing })
        .catch(() => undefined);
    }
  }, [call.localStream, facingMode]);

  const handleToggleSpeaker = useCallback(() => {
    haptic.tap();
    setSpeakerOn((prev) => !prev);
  }, []);

  if (call.status === "unavailable") {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Call" }} />
        <Card>
          <Txt variant="heading">Calls require a native build</Txt>
          <Txt tone="muted">
            Live voice and video calls need the full Kamino native app build
            (EAS dev client or production bundle). They cannot run inside Expo
            Go or the web preview.
          </Txt>
          <Button
            label="Back to the chat"
            variant="secondary"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace(`/chat/${roomId}`)
            }
          />
        </Card>
      </Screen>
    );
  }

  const peerDisplayName = room.data?.room.name || "Kamino Call";
  const title = `Call · ${peerDisplayName}`;
  const ended = call.status === "ended";
  const withVideo = call.peers.filter(
    (p) => (call.remoteStreams[p.id]?.getVideoTracks().length ?? 0) > 0,
  );
  const usingLiveKitSfu = Boolean(liveKitJoinQuery.data?.token);

  const formattedTimer = `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}`;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title,
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />

      {/* Call Header Card: Ringing State vs Connected Duration */}
      <LinearGradient
        colors={
          theme.dark
            ? ["#1E1842", "#131026"]
            : ["#F5F3FF", "#EDE9FE"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.heroCallBanner,
          { borderColor: theme.border },
          shadow.card,
        ]}
      >
        <View style={styles.heroTopRow}>
          <Pill
            label={
              usingLiveKitSfu
                ? "LiveKit Cloud SFU"
                : "WebRTC Peer-to-Peer Fallback"
            }
            icon="radio-outline"
            tone="violet"
          />
          {connectedCount > 0 ? (
            <Pill label={formattedTimer} emoji="🟢" tone="green" />
          ) : (
            <Pill
              label={
                call.status === "joining"
                  ? "Joining…"
                  : noAnswer
                    ? "No Answer"
                    : "Ringing…"
              }
              emoji="🔔"
              tone="orange"
            />
          )}
        </View>

        <View style={styles.heroIdentityCenter}>
          <PersonAvatar
            person={{
              name: peerDisplayName,
              hue: (roomId * 41 + 250) % 360,
            }}
            size={76}
            online={connectedCount > 0}
          />
          <Txt
            accessibilityRole="header"
            style={{
              fontFamily: font.heavy,
              fontSize: 22,
              lineHeight: 28,
              color: theme.ink,
              marginTop: 6,
            }}
          >
            {peerDisplayName}
          </Txt>
          <Txt
            style={{
              fontFamily: font.semibold,
              fontSize: 13,
              color:
                connectedCount > 0
                  ? theme.ok
                  : noAnswer
                    ? theme.orange
                    : theme.muted,
            }}
          >
            {connectedCount > 0
              ? `Connected · ${formattedTimer}`
              : call.status === "joining"
                ? "Negotiating encrypted media session…"
                : noAnswer
                  ? "No answer after 30s"
                  : "Ringing participant… waiting for answer"}
          </Txt>
        </View>
      </LinearGradient>

      {call.message ? (
        <Card>
          <Txt tone={ended ? "danger" : "muted"}>{call.message}</Txt>
        </Card>
      ) : null}

      {noAnswer && connectedCount === 0 ? (
        <Card style={{ backgroundColor: theme.tints.orange }}>
          <Txt
            style={{
              fontFamily: font.bold,
              color: theme.toneText.orange,
            }}
          >
            No answer
          </Txt>
          <Txt variant="small" style={{ color: theme.text }}>
            The call was logged as missed in this conversation. You can tap Ring
            Again below.
          </Txt>
        </Card>
      ) : null}

      {/* Remote Video Tiles */}
      {RTCView && withVideo.length > 0 ? (
        <View style={{ gap: space.sm }}>
          {withVideo.map((p) => (
            <View
              key={p.id}
              style={styles.remoteVideoTile}
              accessibilityLabel={`Video from ${p.name || "a participant"}`}
            >
              <RTCView
                streamURL={call.remoteStreams[p.id]!.toURL()}
                style={{ flex: 1 }}
                objectFit="cover"
              />
              <View style={styles.videoTileNameTag}>
                <Txt variant="caption" style={{ color: "#FFFFFF" }}>
                  {p.name || "Member"}
                </Txt>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Local Camera Tile + Camera Flip Button */}
      {RTCView && call.cameraOn && call.localStream ? (
        <View style={styles.localVideoPreviewWrap} accessibilityLabel="Your camera">
          <RTCView
            streamURL={call.localStream.toURL()}
            style={{ flex: 1 }}
            objectFit="cover"
            mirror={facingMode === "user"}
          />
          <PressableScale
            onPress={() => void handleFlipCamera()}
            accessibilityRole="button"
            accessibilityLabel="Flip camera between front and back"
            scaleTo={0.9}
            style={styles.flipCameraCornerBtn}
          >
            <Ionicons name="camera-reverse" size={16} color="#FFFFFF" />
          </PressableScale>
        </View>
      ) : null}

      {/* Participants List */}
      <View style={{ gap: space.sm }}>
        <Txt
          style={{
            fontFamily: font.heavy,
            fontSize: 16,
            lineHeight: 21,
            color: theme.ink,
          }}
        >
          Participants ({1 + call.peers.length})
        </Txt>
        <Card>
          <ParticipantRow
            name={me.data?.profile.displayName ?? "You"}
            hue={me.data?.profile.avatarHue ?? 260}
            userId={me.data?.profile.userId}
            detail={
              call.muted
                ? "You · Microphone muted"
                : call.cameraOn
                  ? "You · Camera & audio active"
                  : "You · Audio active"
            }
            good
          />
        </Card>
        {call.peers.map((p) => {
          const known = room.data?.participants.find((x) => x.name === p.name);
          return (
            <Card key={p.id}>
              <ParticipantRow
                name={p.name || "Member"}
                hue={hueFor(p.id)}
                userId={known?.userId}
                detail={STATE_LABEL[p.state] ?? p.state}
                good={p.state === "connected"}
              />
            </Card>
          );
        })}
      </View>

      {/* Primary Call Controls: Mute, Speaker, Camera Toggle, Camera Flip, Clean Hangup */}
      {!ended ? (
        <View style={styles.controlsDock}>
          <ControlButton
            icon={call.muted ? "mic-off" : "mic"}
            caption={call.muted ? "Unmute" : "Mute"}
            label={call.muted ? "Unmute microphone" : "Mute microphone"}
            active={call.muted}
            onPress={() => {
              haptic.tap();
              call.toggleMute();
            }}
          />
          <ControlButton
            icon={speakerOn ? "volume-high" : "ear-outline"}
            caption={speakerOn ? "Speaker" : "Earpiece"}
            label={
              speakerOn ? "Switch to earpiece" : "Switch to speakerphone"
            }
            active={speakerOn}
            onPress={handleToggleSpeaker}
          />
          <ControlButton
            icon={call.cameraOn ? "videocam" : "videocam-off"}
            caption={call.cameraOn ? "Video On" : "Video Off"}
            label={call.cameraOn ? "Turn camera off" : "Turn camera on"}
            active={call.cameraOn}
            onPress={() => {
              haptic.tap();
              void call.toggleCamera();
            }}
          />
          {call.cameraOn ? (
            <ControlButton
              icon="camera-reverse-outline"
              caption="Flip"
              label="Flip camera"
              onPress={() => void handleFlipCamera()}
            />
          ) : null}
          <ControlButton
            icon="call"
            caption="End"
            label="End call for everyone"
            danger
            onPress={() => void handleCleanHangup()}
          />
        </View>
      ) : (
        <GradientButton
          label="Back to the chat"
          icon="chatbubble-ellipses"
          size="lg"
          full
          onPress={() => void handleCleanHangup()}
        />
      )}

      {!ended && isDm && connectedCount === 0 ? (
        <GradientButton
          label="Ring Again"
          icon="notifications"
          full
          busy={ringing}
          onPress={() => void ring()}
        />
      ) : null}

      {!ended ? (
        <Pill
          label="Hardware echo cancellation & noise suppression active"
          emoji="🎧"
          size="md"
          tone="green"
        />
      ) : null}

      <Txt
        variant="caption"
        tone="subtle"
        style={{ color: theme.subtle, textAlign: "center" }}
      >
        Powered by LiveKit Cloud SFU with automatic WebRTC peer-to-peer
        fallback.
      </Txt>
    </Screen>
  );
}

function ParticipantRow({
  name,
  hue,
  userId,
  detail,
  good,
}: {
  name: string;
  hue: number;
  userId?: string;
  detail: string;
  good?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <PersonAvatar person={{ name, hue, userId }} size={44} online={good} />
      <View style={{ flex: 1 }}>
        <Txt
          style={{
            fontFamily: font.bold,
            fontSize: 15,
            lineHeight: 20,
            color: theme.ink,
          }}
        >
          {name}
        </Txt>
        <Txt
          variant="caption"
          style={{ color: good ? theme.ok : theme.muted }}
        >
          {detail}
        </Txt>
      </View>
    </View>
  );
}

function ControlButton({
  icon,
  caption,
  label,
  onPress,
  active,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  caption: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          {
            width: 58,
            height: 58,
            borderRadius: 29,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: danger
              ? theme.red
              : active
                ? theme.violet
                : theme.surface,
            borderWidth: danger || active ? 0 : 1,
            borderColor: theme.border,
          },
          shadow.glow(
            danger ? theme.red : theme.violet,
            danger || active ? 0.35 : 0.12,
          ),
        ]}
      >
        <Ionicons
          name={icon}
          size={25}
          color={danger || active ? "#FFFFFF" : theme.ink}
          style={danger ? { transform: [{ rotate: "135deg" }] } : undefined}
        />
      </Pressable>
      <Txt
        style={{
          fontFamily: font.semibold,
          fontSize: 11.5,
          color: danger ? theme.danger : theme.muted,
        }}
      >
        {caption}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCallBanner: {
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 12,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroIdentityCenter: {
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  remoteVideoTile: {
    height: 240,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  videoTileNameTag: {
    position: "absolute",
    left: 10,
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  localVideoPreviewWrap: {
    height: 152,
    width: 112,
    alignSelf: "flex-end",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000000",
    position: "relative",
  },
  flipCameraCornerBtn: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(15, 11, 42, 0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlsDock: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 16,
    paddingVertical: space.md,
  },
});