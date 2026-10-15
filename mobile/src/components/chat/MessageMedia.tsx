import { Ionicons } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from "expo-audio";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { authHeaders, messageMediaUrl } from "@/api/client";
import { Txt } from "@/components/ui";
import { space, useTheme } from "@/theme";

type Props = { roomId: number; messageId: number; kind: "image" | "audio" | "video"; /** On a coloured (gradient) bubble: draw the voice-note controls in white. */ onColor?: boolean };

/**
 * A photo, voice note or clip inside a chat bubble. Attachments are protected, so every request
 * carries the signed-in person's token.
 */
export function MessageMedia({ roomId, messageId, kind, onColor }: Props) {
  const source = { uri: messageMediaUrl(roomId, messageId), headers: authHeaders() };
  if (kind === "image") {
    return <Image source={source} style={{ width: 210, height: 210, borderRadius: 14 }} contentFit="cover" accessibilityLabel="Photo" transition={120} />;
  }
  if (kind === "video") return <ClipPlayer source={source} />;
  return <VoiceNote source={source} onColor={onColor} />;
}

type Source = { uri: string; headers: Record<string, string> };

/** Only one voice note plays at a time: starting one pauses the one before. */
let activePlayer: AudioPlayer | null = null;
/** Voice notes should be heard even with the iPhone's silent switch on (like every messaging app). */
let playbackModeReady = false;

/** A voice note that hasn't loaded after this long is treated as unplayable (bad file, or no connection). */
const LOAD_TIMEOUT_MS = 12_000;

function VoiceNote({ source, onColor }: { source: Source; onColor?: boolean }) {
  const theme = useTheme();
  const fg = onColor ? "#FFFFFF" : theme.accent;
  const track = onColor ? "rgba(255,255,255,0.35)" : theme.border;
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (status.isLoaded) return;
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status.isLoaded]);

  // Forget this player when it goes away, so the next note doesn't try to pause a released one.
  useEffect(
    () => () => {
      if (activePlayer === player) activePlayer = null;
    },
    [player],
  );

  const failed = timedOut && !status.isLoaded;

  const toggle = async () => {
    if (status.playing) return player.pause();
    if (!status.isLoaded) return;
    if (!playbackModeReady) {
      playbackModeReady = true;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => undefined);
    }
    if (activePlayer && activePlayer !== player) {
      try {
        activePlayer.pause();
      } catch {
        // That note's screen is gone.
      }
    }
    activePlayer = player;
    // Start again from the beginning once a note has finished.
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) await player.seekTo(0);
    player.play();
  };
  const shown = status.playing || status.currentTime > 0 ? status.currentTime : status.duration;

  return (
    <Pressable
      onPress={() => void toggle()}
      disabled={failed}
      accessibilityRole="button"
      accessibilityState={{ disabled: failed, busy: !status.isLoaded && !failed }}
      accessibilityLabel={failed ? "Voice message can't be played" : status.playing ? "Pause voice message" : "Play voice message"}
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 150 }}
    >
      {!status.isLoaded && !failed ? (
        <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="small" color={fg} />
        </View>
      ) : (
        <Ionicons name={failed ? "alert-circle" : status.playing ? "pause-circle" : "play-circle"} size={36} color={fg} />
      )}
      {failed ? (
        <Txt variant="caption" style={{ flex: 1, color: onColor ? "rgba(255,255,255,0.9)" : theme.muted }}>
          {"This voice message can't be played on this phone."}
        </Txt>
      ) : (
        <>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: track }}>
            <View style={{ width: `${status.duration ? Math.min(100, (status.currentTime / status.duration) * 100) : 0}%`, height: 4, borderRadius: 2, backgroundColor: fg }} />
          </View>
          <Txt variant="caption" style={{ color: onColor ? "rgba(255,255,255,0.9)" : theme.muted }}>{formatSeconds(shown)}</Txt>
        </>
      )}
    </Pressable>
  );
}

function ClipPlayer({ source }: { source: Source }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={{ width: 240, height: 180, borderRadius: 14, backgroundColor: "#000" }} nativeControls contentFit="contain" accessibilityLabel="Video" />;
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
