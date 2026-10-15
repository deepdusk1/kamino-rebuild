import { Appearance } from "react-native";
import { readSecret, writeSecret } from "@/auth/storage";
import { parseColorScheme, type ColorSchemeChoice } from "@/lib/settings-rules";

export type { ColorSchemeChoice } from "@/lib/settings-rules";

/** Light / dark / follow the phone. Kept on this device (it's about the screen, not the account). */
const KEY = "kamino.colorScheme";

function apply(choice: ColorSchemeChoice) {
  try {
    // "unspecified" hands the choice back to the phone's own setting.
    Appearance.setColorScheme(choice === "system" ? "unspecified" : choice);
  } catch {
    // Older phones (before iOS 13 / Android 10) and the web preview can't override it; the phone's setting is used.
  }
}

/** Reads the saved choice and applies it (call once when the app starts). */
export async function loadColorScheme(): Promise<ColorSchemeChoice> {
  const choice = parseColorScheme(await readSecret(KEY));
  apply(choice);
  return choice;
}

/** Applies a new choice straight away and remembers it. */
export async function saveColorScheme(choice: ColorSchemeChoice): Promise<void> {
  apply(choice);
  await writeSecret(KEY, choice);
}
