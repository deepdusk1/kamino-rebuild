import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Vibration, View } from "react-native";
import { api } from "@/api/endpoints";
import { useSSEListener } from "@/api/sse";
import { GradientButton, PersonAvatar, Pill } from "@/components/k";
import { Button, Card, PressableScale, Screen, Txt } from "@/components/ui";
import { callRoomFrom } from "@/components/IncomingCallBanner";
import { rtcPeerId } from "@/lib/calls/ids";
import { CALL_PHASE_TEXT, CONNECT_TIMEOUT_MS, TROUBLE_HELP, callPhase } from "@/lib/calls/call-status";
import { useCall } from "@/lib/calls/useCall";
import { loadWebRTC } from "@/lib/calls/webrtc";
import { useAction } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { dismissIncomingCallNotification } from "@/lib/push";
import { font, radius, shadow, space, useTheme } from "@/theme";

/**
 * How the call screen was opened:
 * - `dial`: you started the call. In a 1:1 chat the other person is rung, and an unanswered call is logged as missed.
 * - `answer`: you accepted an incoming call (from the banner or the notification's Answer button). Joins straight away.
 * - `incoming`: you tapped an incoming-call notification. Shows Answer / Decline first; nothing is switched on
 *   (no microphone) until you answer.
 * Without a mode (e.g. "Start or join a call" in a group or live room) it joins without ringing anyone.
 */
type CallMode = "dial" | "answer" | "incoming" | "join";

const PEER_STATE: Record<string, string> = {
  new: "Connecting…",
  connecting: "Connecting…",
  connected: "In the call",
  disconnected: "Reconnecting…",
  failed: "Could not connect",
  closed: "Left",
};

const NO_ANSWER_MS = 30_000;

function hueFor(id: string): number {
  let sum = 0;
  for (const char of id) sum = (sum * 31 + char.charCodeAt(0)) % 360;
  return sum;
}

function parseMode(value: string | undefined): CallMode {
  return value === "dial" || value === "answer" || value === "incoming" ? value : "join";
}

export default function CallScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ roomId: string; mode?: string }>();
  const roomId = Number(params.roomId);
  const validRoom = Number.isFinite(roomId) && roomId > 0;
  const mode = parseMode(params.mode);

  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const room = useQuery({ queryKey: ["room", roomId], queryFn: () => api.room(roomId), enabled: validRoom });
  const incoming = useQuery({
    queryKey: ["incomingCalls"],
    queryFn: api.incomingCalls,
    enabled: mode === "incoming",
    refetchInterval: mode === "incoming" ? 5_000 : false,
  });
  const ringingCall = incoming.data?.find((c) => callRoomFrom(c.href) === roomId);

  // An incoming call only connects once you answer.
  const [answered, setAnswered] = useState(mode !== "incoming");
  const [closedNote, setDeclinedOrGone] = useState<string | null>(null);
  // The incoming call stopped ringing (the caller hung up, or it timed out) before you answered.
  const callGone = mode === "incoming" && !answered && incoming.isSuccess && !ringingCall;
  const declinedOrGone = closedNote ?? (callGone ? "This call has ended." : null);
  const call = useCall(roomId, me.data?.profile.userId, me.data?.profile.displayName ?? "Me", answered && validRoom);

  const [noAnswer, setNoAnswer] = useState(false);
  /** Someone answered, but the call could not link up between the two networks. */
  const [trouble, setTrouble] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const rangRef = useRef(false);
  const missedPosted = useRef(false);
  const leavingRef = useRef(false);

  const isDm = room.data?.room.kind === "dm";
  const connectedCount = call.peers.filter((p) => p.state === "connected").length;
  // Others in the call (they answered), even if the audio has not linked up yet.
  const joinedCount = call.peers.length;
  const linkFailed = joinedCount > 0 && call.peers.every((p) => p.state === "failed");
  const RTCView = loadWebRTC()?.RTCView;

  const [ring, ringing] = useAction(async () => {
    setNoAnswer(false);
    missedPosted.current = false;
    await api.ringCall(roomId);
  });

  // This screen replaces any ringing notification for the room.
  useEffect(() => {
    if (validRoom && answered) void dismissIncomingCallNotification(roomId);
  }, [validRoom, answered, roomId]);

  // You dialled a 1:1 call: ring the other person once you're connected.
  useEffect(() => {
    if (mode !== "dial" || !isDm || call.status !== "active" || rangRef.current) return;
    rangRef.current = true;
    void api.ringCall(roomId).catch(() => undefined);
  }, [mode, isDm, call.status, roomId]);

  // Call length, counted while someone else is connected.
  useEffect(() => {
    if (connectedCount === 0 || call.status !== "active") return;
    const started = Date.now();
    const interval = setInterval(() => setCallSeconds(Math.floor((Date.now() - started) / 1000)), 1_000);
    return () => {
      clearInterval(interval);
      setCallSeconds(0);
    };
  }, [connectedCount, call.status]);

  // Nobody picked up a 1:1 call you dialled within 30 seconds: it's logged as missed in the chat.
  useEffect(() => {
    // Answered (even if still linking up) is never a missed call.
    if (mode !== "dial" || !isDm || call.status !== "active" || noAnswer || connectedCount > 0 || joinedCount > 0) return;
    const timer = setTimeout(() => {
      setNoAnswer(true);
      if (!missedPosted.current) {
        missedPosted.current = true;
        void api.missedCall(roomId).catch(() => undefined);
      }
    }, NO_ANSWER_MS);
    return () => clearTimeout(timer);
  }, [mode, isDm, call.status, connectedCount, joinedCount, noAnswer, roomId]);

  // Answered but not linked up: give it CONNECT_TIMEOUT_MS, then say it could not connect (instead of "Ringing…").
  useEffect(() => {
    if (call.status !== "active" || joinedCount === 0 || connectedCount > 0 || trouble) return;
    const timer = setTimeout(() => setTrouble(true), CONNECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [call.status, connectedCount, joinedCount, trouble]);
  const cantConnect = connectedCount === 0 && joinedCount > 0 && (trouble || linkFailed);

  // Ring and vibrate while an incoming call waits for an answer.
  useEffect(() => {
    if (answered || declinedOrGone) return;
    Vibration.vibrate([0, 800, 400, 800], true);
    return () => Vibration.cancel();
  }, [answered, declinedOrGone]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(`/chat/${roomId}`);
  }, [roomId]);

  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    haptic.tap();
    call.hangUp();
    void dismissIncomingCallNotification(roomId);
    void queryClient.invalidateQueries({ queryKey: ["incomingCalls"] });
    close();
  }, [call, close, queryClient, roomId]);

  const [decline, declining] = useAction(async () => {
    haptic.tap();
    Vibration.cancel();
    setDeclinedOrGone("You declined the call.");
    await dismissIncomingCallNotification(roomId, ringingCall?.id ?? null);
    // Tells the caller (their screen closes and "Call declined" is posted in the chat).
    if (ringingCall) await api.declineCall(ringingCall.id).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ["incomingCalls"] });
    close();
  });

  const answer = useCallback(() => {
    haptic.success();
    Vibration.cancel();
    if (ringingCall) void api.dismissNotification(ringingCall.id).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ["incomingCalls"] });
    setAnswered(true);
  }, [queryClient, ringingCall]);

  // The other side hung up or declined: close without telling the server again (that could end a newer call).
  useSSEListener((event) => {
    if (event.roomId !== roomId || event.type !== "call.ended" || leavingRef.current) return;
    void dismissIncomingCallNotification(roomId);
    if (!answered) {
      setDeclinedOrGone("The caller hung up.");
      return;
    }
    leavingRef.current = true;
    call.hangUp({ notifyServer: false });
    close();
  });

  if (call.status === "unavailable") {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Call" }} />
        <Card>
          <Txt variant="heading">Calls need the full app</Txt>
          <Txt tone="muted">
            Voice and video calls work in the installed Kamino app, not in Expo Go or the web preview.
          </Txt>
          <Button label="Back to the chat" variant="secondary" onPress={close} />
        </Card>
      </Screen>
    );
  }

  const peerDisplayName = room.data?.room.name || ringingCall?.name || "Call";
  const ended = call.status === "ended" || Boolean(declinedOrGone);
  const withVideo = call.peers.filter((p) => (call.remoteStreams[p.id]?.getVideoTracks().length ?? 0) > 0);
  const timer = `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}`;
  const nameFor = (peerId: string) =>
    room.data?.participants.find((x) => x.userId === peerId || rtcPeerId(x.userId) === peerId);

  const headline = declinedOrGone
    ? declinedOrGone
    : !answered
      ? "Incoming call…"
      : call.status === "ended"
        ? "Call ended"
        : call.reconnecting
          ? "Reconnecting…"
          : connectedCount > 0
            ? `Connected · ${timer}`
            : call.status === "joining"
              ? "Connecting…"
              : joinedCount > 0
                ? CALL_PHASE_TEXT[callPhase({ connected: connectedCount, joined: joinedCount, noAnswer, trouble: cantConnect })]
                : noAnswer
                ? "No answer"
                : isDm && mode === "dial"
                  ? "Ringing…"
                  : "Waiting for others to join…";

  return (
    <Screen>
      <Stack.Screen options={{ title: peerDisplayName, gestureEnabled: ended, headerBackVisible: ended }} />

      <LinearGradient
        colors={theme.dark ? ["#1E1842", "#131026"] : ["#F5F3FF", "#EDE9FE"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: theme.border }, shadow.card]}
      >
        <View style={styles.heroTop}>
          {connectedCount > 0 && !ended ? (
            <Pill label={timer} emoji="🟢" tone="green" />
          ) : (
            <Pill
              label={ended ? "Ended" : !answered ? "Incoming" : call.reconnecting ? "Reconnecting" : "Calling"}
              icon={ended ? "call-outline" : "radio-outline"}
              tone={ended ? "violet" : "orange"}
            />
          )}
          {!call.canSpeak && !ended ? <Pill label="Listening" icon="headset-outline" tone="violet" /> : null}
        </View>
        <View style={styles.heroCenter}>
          <PersonAvatar
            person={{ name: peerDisplayName, hue: (roomId * 41 + 250) % 360 }}
            size={76}
            online={connectedCount > 0 && !ended}
          />
          <Txt
            accessibilityRole="header"
            style={{ fontFamily: font.heavy, fontSize: 22, lineHeight: 28, color: theme.ink, marginTop: 6 }}
          >
            {peerDisplayName}
          </Txt>
          <Txt
            accessibilityLiveRegion="polite"
            style={{
              fontFamily: font.semibold,
              fontSize: 13,
              color: connectedCount > 0 && !ended ? theme.ok : noAnswer || call.reconnecting ? theme.orange : theme.muted,
            }}
          >
            {headline}
          </Txt>
        </View>
      </LinearGradient>

      {call.message && !declinedOrGone ? (
        <Card>
          <Txt tone={call.status === "ended" ? "danger" : "muted"}>{call.message}</Txt>
        </Card>
      ) : null}

      {/* Incoming call that hasn't been answered yet */}
      {!answered && !declinedOrGone ? (
        <View style={styles.controls}>
          <ControlButton
            icon="call"
            caption="Decline"
            label="Decline the call"
            danger
            disabled={declining}
            onPress={() => void decline()}
          />
          <ControlButton icon="call" caption="Answer" label="Answer the call" accept onPress={answer} />
        </View>
      ) : null}

      {cantConnect && !ended ? (
        <Card style={{ backgroundColor: theme.tints.orange }}>
          <Txt style={{ fontFamily: font.bold, color: theme.toneText.orange }}>{CALL_PHASE_TEXT.trouble}</Txt>
          <Txt variant="small" style={{ color: theme.text }}>
            {TROUBLE_HELP}
          </Txt>
        </Card>
      ) : null}

      {noAnswer && connectedCount === 0 && joinedCount === 0 && !ended ? (
        <Card style={{ backgroundColor: theme.tints.orange }}>
          <Txt style={{ fontFamily: font.bold, color: theme.toneText.orange }}>No answer</Txt>
          <Txt variant="small" style={{ color: theme.text }}>
            A missed call was added to the chat. You can ring again or hang up.
          </Txt>
        </Card>
      ) : null}

      {/* Video from the others */}
      {RTCView && withVideo.length > 0 && !ended ? (
        <View style={{ gap: space.sm }}>
          {withVideo.map((p) => (
            <View key={p.id} style={styles.remoteVideo} accessibilityLabel={`Video from ${p.name || "a participant"}`}>
              <RTCView streamURL={call.remoteStreams[p.id]!.toURL()} style={{ flex: 1 }} objectFit="cover" />
              <View style={styles.nameTag}>
                <Txt variant="caption" style={{ color: "#FFFFFF" }}>
                  {nameFor(p.id)?.name ?? p.name ?? "Member"}
                </Txt>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Your camera */}
      {RTCView && call.cameraOn && call.localStream && !ended ? (
        <View style={styles.localVideo} accessibilityLabel="Your camera">
          <RTCView
            streamURL={call.localStream.toURL()}
            style={{ flex: 1 }}
            objectFit="cover"
            mirror={call.frontCamera}
          />
          <PressableScale
            onPress={() => void call.flipCamera()}
            accessibilityRole="button"
            accessibilityLabel="Switch between front and back camera"
            scaleTo={0.9}
            style={styles.flipButton}
          >
            <Ionicons name="camera-reverse" size={16} color="#FFFFFF" />
          </PressableScale>
        </View>
      ) : null}

      {answered && !ended ? (
        <View style={{ gap: space.sm }}>
          <Txt style={{ fontFamily: font.heavy, fontSize: 16, lineHeight: 21, color: theme.ink }}>
            In the call ({1 + call.peers.length})
          </Txt>
          <Card>
            <ParticipantRow
              name={me.data?.profile.displayName ?? "You"}
              hue={me.data?.profile.avatarHue ?? 260}
              userId={me.data?.profile.userId}
              detail={
                !call.canSpeak
                  ? "You · Listening"
                  : call.muted
                    ? "You · Muted"
                    : call.cameraOn
                      ? "You · Camera and microphone on"
                      : "You · Microphone on"
              }
              good
            />
          </Card>
          {call.peers.map((p) => {
            const known = nameFor(p.id);
            return (
              <Card key={p.id}>
                <ParticipantRow
                  name={known?.name ?? p.name ?? "Member"}
                  hue={hueFor(p.id)}
                  userId={known?.userId}
                  detail={PEER_STATE[p.state] ?? "In the call"}
                  good={p.state === "connected"}
                />
              </Card>
            );
          })}
        </View>
      ) : null}

      {answered && !ended ? (
        <View style={styles.controls}>
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
            icon={call.speakerOn ? "volume-high" : "ear-outline"}
            caption={call.speakerOn ? "Speaker" : "Phone"}
            label={call.speakerOn ? "Switch sound to the phone earpiece" : "Switch sound to the loudspeaker"}
            active={call.speakerOn}
            onPress={() => {
              haptic.tap();
              call.toggleSpeaker();
            }}
          />
          <ControlButton
            icon={call.cameraOn ? "videocam" : "videocam-off"}
            caption={call.cameraOn ? "Video on" : "Video off"}
            label={call.cameraOn ? "Turn camera off" : "Turn camera on"}
            active={call.cameraOn}
            onPress={() => {
              haptic.tap();
              void call.toggleCamera();
            }}
          />
          <ControlButton
            icon="call"
            caption={isDm ? "End" : "Leave"}
            label={isDm ? "End the call" : "Leave the call"}
            danger
            onPress={leave}
          />
        </View>
      ) : null}

      {!ended && isDm && mode === "dial" && noAnswer && connectedCount === 0 ? (
        <GradientButton label="Ring again" icon="notifications" full busy={ringing} onPress={() => void ring()} />
      ) : null}

      {ended ? (
        <GradientButton label="Back to the chat" icon="chatbubble-ellipses" size="lg" full onPress={leave} />
      ) : null}
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
        <Txt style={{ fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: theme.ink }}>{name}</Txt>
        <Txt variant="caption" style={{ color: good ? theme.ok : theme.muted }}>
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
  accept,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  caption: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  accept?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const filled = danger || accept || active;
  const color = danger ? theme.red : accept ? theme.ok : theme.violet;
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, selected: active }}
        style={[
          styles.controlButton,
          {
            backgroundColor: filled ? color : theme.surface,
            borderWidth: filled ? 0 : 1,
            borderColor: theme.border,
            opacity: disabled ? 0.6 : 1,
          },
          shadow.glow(color, filled ? 0.35 : 0.12),
        ]}
      >
        <Ionicons
          name={icon}
          size={25}
          color={filled ? "#FFFFFF" : theme.ink}
          style={danger ? { transform: [{ rotate: "135deg" }] } : undefined}
        />
      </Pressable>
      <Txt style={{ fontFamily: font.semibold, fontSize: 11.5, color: danger ? theme.danger : theme.muted }}>
        {caption}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 16, borderRadius: radius.xl, borderWidth: 1, gap: 12 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heroCenter: { alignItems: "center", gap: 3, paddingVertical: 4 },
  remoteVideo: { height: 240, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000000" },
  nameTag: {
    position: "absolute",
    left: 10,
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  localVideo: {
    height: 152,
    width: 112,
    alignSelf: "flex-end",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  flipButton: {
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
  controls: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 20, paddingVertical: space.md },
  controlButton: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
});
