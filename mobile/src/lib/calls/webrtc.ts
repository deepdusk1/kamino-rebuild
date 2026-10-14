import { NativeModules, Platform } from "react-native";
import type { PeerConnectionLike, RtcApi } from "./session";

/**
 * The native WebRTC library (LiveKit's fork — API-compatible with the
 * standard package, and the one @livekit/react-native requires). It only
 * exists in a real build of the app, not in Expo Go or on the web.
 */
export type NativeWebRTC = typeof import("@livekit/react-native-webrtc");

let cached: NativeWebRTC | null | undefined;

/**
 * Loads the native WebRTC library, or returns null where it is not part of the app (Expo Go, the web preview).
 * It is loaded on demand inside a try block because merely importing it throws when the native part is missing,
 * which would otherwise crash the whole app at start-up.
 */
export function loadWebRTC(): NativeWebRTC | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === "web" || !NativeModules.WebRTCModule) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@livekit/react-native-webrtc") as NativeWebRTC;
  } catch {
    cached = null;
  }
  return cached;
}

export const callsAvailable = (): boolean => loadWebRTC() !== null;

/** Connects the call engine to the real library. */
export function rtcApiFrom(webrtc: NativeWebRTC): RtcApi {
  return {
    createConnection: (config) => new webrtc.RTCPeerConnection(config as ConstructorParameters<typeof webrtc.RTCPeerConnection>[0]) as unknown as PeerConnectionLike,
    createCandidate: (init) => new webrtc.RTCIceCandidate(init as ConstructorParameters<typeof webrtc.RTCIceCandidate>[0]),
  };
}
