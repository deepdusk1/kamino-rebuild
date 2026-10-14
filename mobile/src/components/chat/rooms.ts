import type { ChatOverviewRoom, ChatRoom } from "@/api/types";
import type { IconName, Person } from "@/components/k";
import { previewText } from "@/lib/stickers";

/**
 * Small helpers that turn a chat room into what the Chats list and the chat header show (title, avatar, preview).
 */

/** A stable colour for things without their own (group chats). */
export function hueFromText(text: string): number {
  let sum = 0;
  for (const char of text) sum = (sum * 31 + char.charCodeAt(0)) % 360;
  return sum;
}

/** "Mika" for a DM, "Game Squad" for a group, "Anime Haven · Lobby" for a community's lobby. */
export function roomTitle(room: Pick<ChatRoom, "kind" | "name" | "peerName"> & { communityName?: string | null }): string {
  if (room.kind === "dm") return room.peerName ?? "Direct message";
  if (room.name.toLowerCase() === "lobby" && room.communityName) return `${room.communityName} · Lobby`;
  return room.name;
}

/** The face for a room: the other person in a DM, otherwise a colourful initial. */
export function roomPerson(room: Pick<ChatRoom, "kind" | "name" | "peerName" | "peerHue" | "peerUserId" | "peerAvatarV">): Person {
  if (room.kind === "dm") return { name: room.peerName ?? "?", hue: room.peerHue, userId: room.peerUserId ?? undefined, avatarV: room.peerAvatarV };
  return { name: room.name, hue: hueFromText(room.name) };
}

/** Live rooms (voice and watch-together). */
export function isLiveKind(kind: ChatRoom["kind"]): boolean {
  return kind === "voice" || kind === "screening";
}

/** The last message line: "You:" / "Alex:" prefix, an icon for photos, voice notes and clips. */
export function roomPreview(room: ChatOverviewRoom): { text: string; author?: string; icon?: IconName } {
  const author = room.lastAuthor === "You" ? "You:" : room.kind !== "dm" && room.lastAuthor ? `${room.lastAuthor}:` : undefined;
  if (!room.lastAt && !room.lastMessage) {
    if (room.awaitingAccept) return { text: "Waiting for them to accept your message" };
    if (isLiveKind(room.kind)) return { text: room.topic ? `${room.topic} · live room` : "Live room", icon: "radio-outline" };
    return { text: "No messages yet. Say hello!" };
  }
  if (room.lastKind === "image") return { text: "Sent a photo", author: author === "You:" ? author : undefined, icon: "image-outline" };
  if (room.lastKind === "audio") return { text: "Voice message", author: author === "You:" ? author : undefined, icon: "mic-outline" };
  if (room.lastKind === "video") return { text: "Sent a video", author: author === "You:" ? author : undefined, icon: "videocam-outline" };
  return { text: previewText(room.lastMessage ?? ""), author };
}

/** Icon for a live room's Join button, by its topic. */
export function topicIcon(topic: string): IconName {
  const t = topic.toLowerCase();
  if (t.includes("music") || t.includes("k-pop") || t.includes("kpop")) return "headset";
  if (t.includes("gam")) return "game-controller";
  if (t.includes("art") || t.includes("draw")) return "color-palette";
  if (t.includes("anime") || t.includes("movie") || t.includes("watch")) return "film";
  if (t.includes("study") || t.includes("writ") || t.includes("book")) return "book";
  return "people";
}
