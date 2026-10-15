import { Platform } from "react-native";

/**
 * The LiveKit calling stack. It only exists in a real build of the app (EAS development or store build), not in
 * Expo Go or the web preview.
 *
 * Loaded on demand inside a try block because merely importing it throws when the native part is missing, which
 * would otherwise crash the app at start-up. Mirrors the pattern in `./webrtc`.
 *
 * `registerGlobals` (from `@livekit/react-native`) wires the native WebRTC module into the JavaScript globals that
 * `livekit-client` uses, so it runs before `livekit-client` is loaded. `AudioSession` routes call audio (speaker,
 * earpiece, Bluetooth) and holds audio focus on Android while a call is on.
 */
type ReactNativeLiveKit = typeof import("@livekit/react-native");
type LiveKitClient = typeof import("livekit-client");

export type LiveKitModule = {
  Room: LiveKitClient["Room"];
  RoomEvent: LiveKitClient["RoomEvent"];
  Track: LiveKitClient["Track"];
  DisconnectReason: LiveKitClient["DisconnectReason"];
  AudioSession: ReactNativeLiveKit["AudioSession"];
  AndroidAudioTypePresets: ReactNativeLiveKit["AndroidAudioTypePresets"];
};

let cached: LiveKitModule | null | undefined;

/** Loads the LiveKit native module, or null where it is not part of the app. */
export function loadLiveKit(): LiveKitModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === "web") return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require("@livekit/react-native") as ReactNativeLiveKit;
    rn.registerGlobals();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const client = require("livekit-client") as LiveKitClient;
    cached = {
      Room: client.Room,
      RoomEvent: client.RoomEvent,
      Track: client.Track,
      DisconnectReason: client.DisconnectReason,
      AudioSession: rn.AudioSession,
      AndroidAudioTypePresets: rn.AndroidAudioTypePresets,
    };
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Starts call audio: voice-call mode with audio focus, sound from the loudspeaker unless headphones or a Bluetooth
 * headset are connected. Must run before connecting to a call.
 */
export async function startCallAudio(lk: LiveKitModule): Promise<void> {
  try {
    await lk.AudioSession.configureAudio({
      android: {
        preferredOutputList: ["bluetooth", "headset", "speaker", "earpiece"],
        audioTypeOptions: lk.AndroidAudioTypePresets.communication,
      },
      ios: { defaultOutput: "speaker" },
    });
    await lk.AudioSession.startAudioSession();
  } catch {
    // The call still works with the phone's default audio route.
  }
}

/** Gives the audio route and audio focus back when the call ends. */
export async function stopCallAudio(lk: LiveKitModule): Promise<void> {
  try {
    await lk.AudioSession.stopAudioSession();
  } catch {
    // Already stopped.
  }
}

/** Switches call sound between the loudspeaker and the earpiece (headphones and Bluetooth win when connected). */
export async function routeCallAudio(lk: LiveKitModule, speaker: boolean): Promise<void> {
  if (Platform.OS === "ios") {
    await lk.AudioSession.selectAudioOutput(speaker ? "force_speaker" : "default");
    return;
  }
  const outputs = await lk.AudioSession.getAudioOutputs();
  // With headphones or Bluetooth plugged in, "earpiece" means "the headset", like the phone app does.
  const wired = outputs.find((o) => o === "bluetooth" || o === "headset");
  const target = speaker ? "speaker" : wired ?? "earpiece";
  if (outputs.includes(target)) await lk.AudioSession.selectAudioOutput(target);
}
