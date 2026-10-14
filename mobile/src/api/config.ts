import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the Kamino server lives.
 *
 * 1. `EXPO_PUBLIC_API_URL` (set in `.env` or eas.json) always wins.
 * 2. While developing with Expo Go, the phone can find your computer by itself:
 *    Expo tells the app the address it loaded from (for example 192.168.1.20:8081),
 *    and the Kamino server runs on the same computer at port 8080.
 * 3. Android emulators reach the host computer at 10.0.2.2; iOS simulators use localhost.
 */
export function apiBaseUrl(): string {
  const configured = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  const host = hostUri?.split(":")[0];
  if (host && !host.includes("exp.direct")) return `http://${host}:8080`;

  return Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://localhost:8080";
}

export const SUPPORT_EMAIL =
  (Constants.expoConfig?.extra as { supportEmail?: string } | undefined)?.supportEmail?.trim() ||
  "info.kelnova@gmail.com";
