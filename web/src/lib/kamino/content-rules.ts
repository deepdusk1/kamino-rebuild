export const POST_EMOJI = ["💜", "😂", "🔥", "👏", "✨", "😮", "💡", "🎉"] as const;
export const CONTENT_LIMITS: Record<string, number> = {
  image: 2_000_000,
  gif: 4_000_000,
  video: 12_000_000,
  short: 12_000_000,
  audio: 8_000_000,
  file: 8_000_000,
};
const TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  gif: ["image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/3gpp"],
  short: ["video/mp4", "video/quicktime", "video/webm", "video/3gpp"],
  audio: ["audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/aac"],
  file: [
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};
/** Validate size and MIME before any storage allocation. Executables and HTML are never accepted. */
export function checkedContentMedia(kind: string, dataUrl: string, premium = false) {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || !TYPES[kind]?.includes(match[1]!))
    throw new Error("Choose a supported media file.");
  const bytes =
    Math.floor((match[2]!.length * 3) / 4) -
    (match[2]!.endsWith("==") ? 2 : match[2]!.endsWith("=") ? 1 : 0);
  const limit = CONTENT_LIMITS[kind]! * (premium ? 2 : 1);
  if (bytes < 1 || bytes > limit)
    throw new Error(`This attachment must be under ${limit / 1_000_000} MB.`);
  const head = atob(match[2]!.slice(0, 64));
  const mime = match[1]!;
  if (mime === "image/gif" && !/^GIF8[79]a/.test(head))
    throw new Error("The file is not a valid GIF.");
  if (mime === "image/png" && !head.startsWith("\x89PNG\r\n\x1a\n"))
    throw new Error("The file is not a PNG.");
  if (mime === "image/jpeg" && !head.startsWith("\xff\xd8\xff"))
    throw new Error("The file is not a JPEG.");
  if (mime === "image/webp" && !(head.startsWith("RIFF") && head.slice(8, 12) === "WEBP"))
    throw new Error("The file is not a WebP image.");
  if (mime === "application/pdf" && !head.startsWith("%PDF-"))
    throw new Error("The file is not a PDF.");
  if ((mime === "application/zip" || mime.includes("openxmlformats")) && !head.startsWith("PK"))
    throw new Error("The file is not a supported document archive.");
  if (
    ["video/mp4", "video/quicktime", "video/3gpp", "audio/mp4"].includes(mime) &&
    !["ftyp", "moov"].includes(head.slice(4, 8))
  )
    throw new Error("The file is not valid MP4 media.");
  if (["video/webm", "audio/webm"].includes(mime) && !head.startsWith("\x1a\x45\xdf\xa3"))
    throw new Error("The file is not valid WebM media.");
  if (mime === "audio/wav" && !(head.startsWith("RIFF") && head.slice(8, 12) === "WAVE"))
    throw new Error("The file is not valid WAV audio.");
  if (mime === "audio/ogg" && !head.startsWith("OggS"))
    throw new Error("The file is not valid Ogg audio.");
  if (
    mime === "audio/mpeg" &&
    !(head.startsWith("ID3") || (head.charCodeAt(0) === 255 && (head.charCodeAt(1) & 224) === 224))
  )
    throw new Error("The file is not valid MP3 audio.");
  if (mime === "audio/aac" && !(head.charCodeAt(0) === 255 && (head.charCodeAt(1) & 246) === 240))
    throw new Error("The file is not valid AAC audio.");
  return { mime, bytes };
}
export function safeFilename(value: string) {
  return (
    Array.from(value)
      .map((c) => (c.charCodeAt(0) < 32 || /[\\/"<>:|?*]/.test(c) ? "_" : c))
      .join("")
      .slice(0, 120) || "attachment"
  );
}
export function captionsToVtt(value: string) {
  if (value.trimStart().startsWith("WEBVTT"))
    return value.replace(/\r/g, "").trim().slice(0, 12000) + "\n";
  const clean = value.replace(/\r/g, "").replace(/-->/g, "→").trim().slice(0, 12000);
  return `WEBVTT\n\n00:00:00.000 --> 00:10:00.000\n${clean}\n`;
}
