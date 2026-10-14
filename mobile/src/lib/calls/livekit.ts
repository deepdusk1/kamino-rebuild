import { Platform } from "react-native";

/**
 * The LiveKit native calling stack. It only exists in a real build of the app
 * (EAS dev/production), not in Expo Go or the web preview.
 *
 * Loaded on demand inside a try block because merely importing it throws when
 * the native part is missing, which would otherwise crash the app at start-up.
 * Mirrors the defensive pattern in `./webrtc`.
 *
 * `registerGlobals` comes from `@livekit/react-native` (it wires the native
 * WebRTC module into the JS globals); `Room`/`RoomEvent` come from
 * `livekit-client`, which is the documented pairing.
 */
export type LiveKitModule = {
  Room: typeof import("livekit-client").Room;
  RoomEvent: typeof import("livekit-client").RoomEvent;
};

let cached: LiveKitModule | null | undefined;
let globalsRegistered = false;

/** Loads the LiveKit native module, or null where it is not part of the app. */
export function loadLiveKit(): LiveKitModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === "web") return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require("@livekit/react-native") as { registerGlobals?: () => void };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const client = require("livekit-client") as {
      Room: LiveKitModule["Room"];
      RoomEvent: LiveKitModule["RoomEvent"];
    };
    if (!globalsRegistered && typeof rn.registerGlobals === "function") {
      rn.registerGlobals();
      globalsRegistered = true;
    }
    cached = { Room: client.Room, RoomEvent: client.RoomEvent };
  } catch {
    cached = null;
  }
  return cached;
}
