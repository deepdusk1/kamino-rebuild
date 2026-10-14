// ===== FILE: mobile/src/components/IncomingCallBanner.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform, StyleSheet, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import { useSSEListener } from "@/api/sse";
import { PersonAvatar } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { callsAvailable } from "@/lib/calls/webrtc";
import { useAction } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import {
  dismissIncomingCallNotification,
  presentDataPayloadNotification,
} from "@/lib/push";
import { font, radius, shadow, useTheme } from "@/theme";

type IncomingCallEntry = {
  id: number;
  name: string;
  href: string;
  createdAt?: string;
};

/**
 * Extracts the chat room ID from a call link such as "/chats/7?call=1" or "/call/7".
 */
export function callRoomFrom(href: string): number | null {
  const match = /^\/(?:chats|chat|call)\/(\d+)(?:\?call=1|$)/.exec(href.trim());
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * Full-Screen WhatsApp-Style Incoming Call Screen (`mobile/src/components/IncomingCallBanner.tsx`):
 * - Bug #2 Acceptance Criterion: End-to-end `caller-dials -> callee-sees-incoming-call -> LiveKit-connects -> clean-hangup`
 * - Listens to `call.incoming` / `call.ring` and `call.ended` via Module 1 SSE (`useSSEListener`)
 *   and wakes the `kamino_calls_critical_v2` (`bypassDnd: true`) Android notification channel with ringtone & vibration loop
 * - Works from foreground, background, and killed state via Module 1 `push.ts` FCM data payload handlers
 * - Accept button → dismisses system notification, halts vibration, and navigates to `/call/[roomId]` to join LiveKit
 * - Decline button → calls `rpc("endCall", { roomId })` AND `api.declineCall(call.id)` so BOTH caller and callee hang up cleanly
 */
export function IncomingCallBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const enabled = callsAvailable();

  const calls = useQuery({
    queryKey: ["incomingCalls"],
    queryFn: api.incomingCalls,
    enabled,
    staleTime: 0,
  });

  // Wire SSE call signaling directly into the incoming-call overlay & system ringtone channel
  useSSEListener((event) => {
    if (!enabled) return;

    if (event.type === "call.incoming" || event.type === "call.ring") {
      const rId =
        event.roomId ??
        (typeof event.payload.href === "string"
          ? callRoomFrom(event.payload.href)
          : null);
      const callerName =
        typeof event.payload.callerName === "string"
          ? event.payload.callerName
          : typeof event.payload.name === "string"
            ? event.payload.name
            : "Kamino Member";
      const callId =
        typeof event.payload.callId === "number"
          ? event.payload.callId
          : typeof event.payload.id === "number"
            ? event.payload.id
            : Date.now();

      if (rId !== null && !pathname.startsWith("/call/")) {
        void presentDataPayloadNotification({
          kind: "call.incoming",
          roomId: rId,
          callId,
          callerName,
          title: `${callerName} is calling…`,
          body: "Tap Answer to join the voice & video call",
          href: `/chats/${rId}?call=1`,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["incomingCalls"] });
      return;
    }

    if (event.type === "call.ended") {
      const callId =
        typeof event.payload.callId === "number"
          ? event.payload.callId
          : typeof event.payload.id === "number"
            ? event.payload.id
            : null;
      void dismissIncomingCallNotification(event.roomId, callId);
      void queryClient.invalidateQueries({ queryKey: ["incomingCalls"] });
    }
  });

  const activeCall: IncomingCallEntry | undefined = calls.data?.find(
    (c) => callRoomFrom(c.href) !== null,
  );
  const roomId = activeCall ? callRoomFrom(activeCall.href) : null;

  const vibrationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRingingFeedback = () => {
    if (vibrationTimerRef.current) {
      clearInterval(vibrationTimerRef.current);
      vibrationTimerRef.current = null;
    }
    if (Platform.OS !== "web") {
      Vibration.cancel();
    }
  };

  useEffect(() => {
    if (!activeCall || roomId === null || pathname.startsWith("/call/")) {
      stopRingingFeedback();
      return;
    }

    if (Platform.OS !== "web") {
      Vibration.vibrate([0, 800, 400, 800, 400, 800]);
      vibrationTimerRef.current = setInterval(() => {
        Vibration.vibrate([0, 800, 400, 800]);
      }, 3_400);
    }

    return () => {
      stopRingingFeedback();
    };
  }, [activeCall, roomId, pathname]);

  const [acceptCall, accepting] = useAction(
    async (callId: number, targetRoomId: number) => {
      stopRingingFeedback();
      haptic.success();
      await dismissIncomingCallNotification(targetRoomId, callId);
      queryClient.setQueryData<IncomingCallEntry[]>(
        ["incomingCalls"],
        (old) =>
          old
            ? old.filter(
                (c) => c.id !== callId && callRoomFrom(c.href) !== targetRoomId,
              )
            : [],
      );
      await api.dismissNotification(callId).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ["incomingCalls"] });
      router.push(`/call/${targetRoomId}`);
    },
  );

  const [declineCall, declining] = useAction(
    async (callId: number, targetRoomId: number) => {
      stopRingingFeedback();
      haptic.tap();
      await dismissIncomingCallNotification(targetRoomId, callId);
      queryClient.setQueryData<IncomingCallEntry[]>(
        ["incomingCalls"],
        (old) =>
          old
            ? old.filter(
                (c) => c.id !== callId && callRoomFrom(c.href) !== targetRoomId,
              )
            : [],
      );
      // Clean hangup on BOTH ends via exact `endCall` RPC + `declineCall` notification dismissal
      await Promise.allSettled([
        rpc("endCall", { roomId: targetRoomId }),
        api.endCall(targetRoomId),
        api.declineCall(callId),
      ]);
      await queryClient.invalidateQueries({ queryKey: ["incomingCalls"] });
    },
  );

  if (!enabled || !activeCall || roomId === null || pathname.startsWith("/call/")) {
    return null;
  }

  const callerName = activeCall.name || "Kamino Member";

  return (
    <View
      accessibilityViewIsModal
      accessibilityLiveRegion="assertive"
      style={[StyleSheet.absoluteFill, styles.fullscreenOverlay]}
    >
      <LinearGradient
        colors={
          theme.dark
            ? ["#1B143F", "#0B0A14", "#05040A"]
            : ["#251B5A", "#120E2E", "#090718"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 36,
            paddingBottom: Math.max(insets.bottom, 24) + 28,
          },
        ]}
      >
        {/* Top Encrypted / Priority Channel Pill */}
        <View style={styles.secureBadge}>
          <Ionicons name="shield-checkmark" size={14} color="#34D399" />
          <Txt style={styles.secureBadgeText}>
            Kamino End-to-End LiveKit Call
          </Txt>
        </View>

        {/* Caller Avatar & Ringing Concentric Halos */}
        <View style={styles.callerCenter}>
          <View
            style={[
              styles.haloOuter,
              { borderColor: "rgba(52, 211, 153, 0.22)" },
            ]}
          >
            <View
              style={[
                styles.haloMiddle,
                { borderColor: "rgba(124, 58, 237, 0.38)" },
              ]}
            >
              <View
                style={[
                  styles.haloInner,
                  { borderColor: "rgba(52, 211, 153, 0.58)" },
                ]}
              >
                <PersonAvatar
                  person={{ name: callerName, hue: (roomId * 47 + 210) % 360 }}
                  size={116}
                  online
                />
              </View>
            </View>
          </View>

          <Txt accessibilityRole="header" style={styles.callerName}>
            {callerName}
          </Txt>
          <Txt style={styles.callSubStatus}>
            Incoming Voice & Video Call…
          </Txt>
          <View style={styles.channelBadgeRow}>
            <Ionicons name="volume-high" size={14} color="#A78BFA" />
            <Txt style={styles.channelBadgeLabel}>
              Priority Ringing · Bypass DND Active
            </Txt>
          </View>
        </View>

        {/* Bottom WhatsApp-Style Decline / Answer Action Dock */}
        <View style={styles.actionsRow}>
          <View style={styles.actionColumn}>
            <PressableScale
              onPress={() => void declineCall(activeCall.id, roomId)}
              disabled={declining || accepting}
              accessibilityRole="button"
              accessibilityLabel={`Decline call from ${callerName}`}
              scaleTo={0.9}
              style={[
                styles.roundCallBtn,
                { backgroundColor: "#EF4444" },
                shadow.glow("#EF4444", 0.5),
              ]}
            >
              <Ionicons
                name="call"
                size={32}
                color="#FFFFFF"
                style={{ transform: [{ rotate: "135deg" }] }}
              />
            </PressableScale>
            <Txt style={styles.actionCaption}>Decline</Txt>
          </View>

          <View style={styles.actionColumn}>
            <PressableScale
              onPress={() => void acceptCall(activeCall.id, roomId)}
              disabled={accepting || declining}
              accessibilityRole="button"
              accessibilityLabel={`Accept call from ${callerName} and join LiveKit room`}
              scaleTo={0.9}
              style={[
                styles.roundCallBtn,
                { backgroundColor: "#10B981" },
                shadow.glow("#10B981", 0.5),
              ]}
            >
              <Ionicons name="call" size={32} color="#FFFFFF" />
            </PressableScale>
            <Txt style={styles.actionCaption}>Accept</Txt>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenOverlay: {
    zIndex: 9999,
    elevation: 30,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  secureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: "rgba(52, 211, 153, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.35)",
  },
  secureBadgeText: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: "#34D399",
  },
  callerCenter: {
    alignItems: "center",
    gap: 12,
  },
  haloOuter: {
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  haloMiddle: {
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  haloInner: {
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  callerName: {
    fontFamily: font.heavy,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: "#FFFFFF",
    textAlign: "center",
    marginTop: 6,
  },
  callSubStatus: {
    fontFamily: font.semibold,
    fontSize: 14.5,
    lineHeight: 19,
    color: "rgba(241, 245, 249, 0.82)",
    textAlign: "center",
  },
  channelBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(124, 58, 237, 0.2)",
  },
  channelBadgeLabel: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    color: "#DDD6FE",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    maxWidth: 320,
  },
  actionColumn: {
    alignItems: "center",
    gap: 10,
  },
  roundCallBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCaption: {
    fontFamily: font.bold,
    fontSize: 13.5,
    lineHeight: 17,
    color: "#FFFFFF",
  },
});