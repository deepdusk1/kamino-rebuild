import { Alert, Platform, Share } from "react-native";
import { apiBaseUrl } from "@/api/config";

/**
 * Small cross-platform helpers. React Native's `Alert` does nothing in a web browser, so on the web these use the
 * browser's own boxes instead; on phones they use the normal system alerts.
 */

/** Shows a short message with an OK button. */
export function notify(title: string, message?: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Asks "are you sure?" and resolves to true when the person agrees. */
export function confirmAction(title: string, message: string, okLabel = "OK", destructive = false): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: okLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ]);
  });
}

/** The website address of a page (`/c/anime-haven`), so links shared from the phone open anywhere. */
export function webLink(path: string): string {
  return `${apiBaseUrl()}${path}`;
}

/**
 * Opens the share sheet with a title and a link. In browsers without a share sheet the link is copied instead,
 * and the person is told.
 */
export async function shareLink(title: string, path: string) {
  const url = webLink(path);
  if (Platform.OS === "web") {
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> }) : null;
    try {
      if (nav?.share) return await nav.share({ title, url });
      await nav?.clipboard?.writeText(url);
      notify("Link copied", url);
    } catch {
      // The person closed the share sheet, or the browser refused: nothing to do.
    }
    return;
  }
  try {
    await Share.share({ message: `${title}\n${url}`, url, title });
  } catch {
    // Closing the share sheet is not an error worth showing.
  }
}
