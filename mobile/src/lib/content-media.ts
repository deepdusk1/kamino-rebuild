import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync, EncodingType } from "expo-file-system/legacy";
import type { MediaInput } from "./content-v9";

const EXT_MIME: Record<string, string> = {
  gif: "image/gif",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export async function pickContentFile(
  kind: MediaInput["kind"],
  type: string | string[] = "*/*",
  maxBytes?: number,
): Promise<MediaInput | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const max =
    maxBytes ??
    (kind === "gif"
      ? 4_000_000
      : kind === "video" || kind === "short"
        ? 12_000_000
        : kind === "image"
          ? 2_000_000
          : 8_000_000);
  if (asset.size && asset.size > max)
    throw new Error(`Choose a file under ${max / 1_000_000} MB.`);
  const mime =
    asset.mimeType && asset.mimeType !== "application/octet-stream"
      ? asset.mimeType
      : EXT_MIME[asset.name.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime) throw new Error("Choose a file with a supported file type.");
  const base64 =
    asset.base64 ??
    (await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 }));
  if ((base64.length * 3) / 4 > max + 2)
    throw new Error(`Choose a file under ${max / 1_000_000} MB.`);
  return {
    kind,
    dataUrl: `data:${mime};base64,${base64}`,
    filename: asset.name,
    altText: "",
    captions: "",
  };
}
