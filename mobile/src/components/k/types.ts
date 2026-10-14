import type { Ionicons } from "@expo/vector-icons";
import type { ImageSource } from "expo-image";
import type { ImageSourcePropType } from "react-native";
import { assetUrl } from "@/api/client";
import type { AuthorChip, Profile } from "@/api/types";

/**
 * Shared prop types for the Kamino kit. Kit components take plain data (no fetching), so screens map their API
 * data into these shapes with the small helpers below.
 */

/** A picture: a web address or server path, a bundled image (`require(...)` / `brandArt` value) or an expo-image source. */
export type Src = string | number | ImageSource | ImageSourcePropType | null | undefined;

/** Ionicons icon name (https://icons.expo.fyi, "Ionicons" set). */
export type IconName = keyof typeof Ionicons.glyphMap;

/** A person as the kit draws them: name + colour, and a photo when they have one. */
export type Person = {
  name: string;
  /** 0–360; drives the colourful fallback when there is no photo. */
  hue: number;
  /** With `avatarV` > 0, the server photo is shown. */
  userId?: string;
  avatarV?: number;
  /** Any other picture (wins over the server photo). */
  image?: Src;
};

/** `AuthorChip` (posts, comments, faces lists) → `Person`. */
export function personFromChip(chip: AuthorChip): Person {
  return { name: chip.nickname || chip.handle, hue: chip.hue, userId: chip.userId, avatarV: chip.avatarV };
}

/** `Profile` (the viewer, profile pages) → `Person`. */
export function personFromProfile(profile: Pick<Profile, "displayName" | "handle" | "avatarHue" | "userId" | "avatarVersion">): Person {
  return { name: profile.displayName || profile.handle, hue: profile.avatarHue, userId: profile.userId, avatarV: profile.avatarVersion };
}

/**
 * Turns a `Src` into something expo-image accepts (or null when there is no picture). Server paths such as
 * "/covers/x.jpg" become full addresses on the Kamino server.
 */
export function toImageSource(src: Src): number | ImageSource | null {
  if (src === null || src === undefined || src === "") return null;
  if (typeof src === "string") return { uri: assetUrl(src) };
  // React Native image sources (bundled `require(...)` numbers, `{ uri }` objects) work with expo-image as they are.
  return src as number | ImageSource;
}
