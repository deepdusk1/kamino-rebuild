import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Keeps small secrets (the sign-in token) on the device. On iOS/Android this is the
 * system Keychain / Keystore. The browser build (used only for previews) falls back to localStorage.
 */
const web = Platform.OS === "web";

export async function readSecret(key: string): Promise<string | null> {
  try {
    if (web) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writeSecret(key: string, value: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Storage can fail on locked/unsupported devices; the session then lasts until the app closes.
  }
}

export async function deleteSecret(key: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing to clean up.
  }
}
