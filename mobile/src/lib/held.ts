import { Alert } from "react-native";

/** Same words as the website (web/src/lib/kamino/held.ts). */
export const HELD_TITLE = "Waiting for a moderator";
export const HELD_MESSAGE = "Kamino's safety check paused this. A moderator will look at it soon, and it appears once they approve it.";

/** Tells the person, once, that what they just shared was paused for review. Does nothing when it was not. */
export function tellIfHeld(result: { held?: boolean } | null | undefined): void {
  if (result?.held) Alert.alert(HELD_TITLE, HELD_MESSAGE);
}
