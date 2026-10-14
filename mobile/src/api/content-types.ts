export type MediaInput = {
  kind: "image" | "gif" | "video" | "short" | "audio" | "file";
  dataUrl: string;
  filename: string;
  altText?: string;
  captions?: string;
};
export type ContentMediaItem = {
  id: number;
  kind: string;
  filename: string;
  altText: string;
  captions: string;
  url: string;
};
