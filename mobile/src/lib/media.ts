import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
// The stable "legacy" file API is the simplest way to read a file as base64 in SDK 57.
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";

/**
 * Limits mirror the server (see checkedChatMedia in web/src/lib/kamino/server.ts).
 * Staying under them on the phone avoids a slow upload that the server would refuse anyway.
 */
export const LIMITS = { photoBytes: 2_000_000, videoBytes: 12_000_000, voiceBytes: 1_500_000, voiceSeconds: 45 } as const;

export class MediaError extends Error {}

const base64Bytes = (base64: string) => Math.floor((base64.length * 3) / 4);

/** Opens the photo library (or camera) and returns a compressed JPEG as a data URL, or null if cancelled. */
export async function pickPhoto(source: "library" | "camera" = "library", maxBytes: number = LIMITS.photoBytes): Promise<string | null> {
  const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new MediaError(source === "camera" ? "Allow camera access in Settings to take photos." : "Allow photo access in Settings to choose pictures.");

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, allowsEditing: false };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;

  // Shrink to a sensible size, then lower the quality until it fits the server limit.
  const longest = Math.max(asset.width, asset.height);
  const target = longest > 1600 ? { [asset.width >= asset.height ? "width" : "height"]: 1600 } : {};
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    const context = ImageManipulator.manipulate(asset.uri);
    if (Object.keys(target).length) context.resize(target);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
    if (saved.base64 && base64Bytes(saved.base64) <= maxBytes) return `data:image/jpeg;base64,${saved.base64}`;
  }
  throw new MediaError("That photo is too large. Try a smaller one.");
}

/** Picks or records a short video (max 30 s) and returns it as a data URL, or null if cancelled. */
export async function pickVideo(source: "library" | "camera" = "library",maxBytes:number=LIMITS.videoBytes): Promise<string | null> {
  const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new MediaError("Allow camera or photo access in Settings to share videos.");

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["videos"],
    videoMaxDuration: 30,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;

  if (asset.fileSize && asset.fileSize > maxBytes) throw new MediaError(`Videos must be under ${maxBytes/1_000_000} MB. Try a shorter clip.`);
  const base64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
  if (base64Bytes(base64) > maxBytes) throw new MediaError(`Videos must be under ${maxBytes/1_000_000} MB. Try a shorter clip.`);
  const mime = asset.mimeType && /^video\/(mp4|quicktime|webm|3gpp)$/.test(asset.mimeType) ? asset.mimeType : "video/mp4";
  return `data:${mime};base64,${base64}`;
}

/** Reads a recorded voice note (.m4a) as a data URL. */
export async function voiceNoteDataUrl(uri: string): Promise<string> {
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  if (base64Bytes(base64) > LIMITS.voiceBytes) throw new MediaError("That voice note is too long. Keep it under 45 seconds.");
  return `data:audio/mp4;base64,${base64}`;
}

/** Limit mirrors the server (setAvatar in web/src/lib/kamino/extras.ts): about 220 KB. */
const AVATAR_BYTES = 215_000;

/**
 * Lets the person choose a picture, crop it to a square, and shrinks it to 320 × 320.
 * Returns a data URL ready for `api.setAvatar`, or null if they cancelled.
 */
export async function pickAvatar(source: "library" | "camera" = "library"): Promise<string | null> {
  const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new MediaError(source === "camera" ? "Allow camera access in Settings to take a photo." : "Allow photo access in Settings to choose a picture.");

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;

  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const image = await ImageManipulator.manipulate(asset.uri).resize({ width: 320, height: 320 }).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
    if (saved.base64 && base64Bytes(saved.base64) <= AVATAR_BYTES) return `data:image/jpeg;base64,${saved.base64}`;
  }
  throw new MediaError("That picture is too large. Try a different one.");
}
