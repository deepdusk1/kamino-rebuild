/**
 * Small helpers that turn a chat room into what the Chats list and the chat header show (title, avatar, preview).
 * Plain functions, the same as the phone app's `src/components/chat/rooms.ts`.
 */
import type { AvatarPerson } from "@/components/k";
import { previewText } from "@/lib/kamino/stickers";
import type { ChatOverviewRoom, ChatRoom } from "@/lib/kamino/types";

/** A stable colour for things without their own (group chats). */
export function hueFromText(text: string): number {
  let sum = 0;
  for (const char of text) sum = (sum * 31 + char.charCodeAt(0)) % 360;
  return sum;
}

/** "Mika" for a DM, "Game Squad" for a group, "Anime Haven · Lobby" for a community's lobby. */
export function roomTitle(
  room: Pick<ChatRoom, "kind" | "name" | "peerName"> & { communityName?: string | null },
): string {
  if (room.kind === "dm") return room.peerName ?? "Direct message";
  if (room.name.toLowerCase() === "lobby" && room.communityName)
    return `${room.communityName} · Lobby`;
  return room.name;
}

/** The face for a room: the other person in a DM, otherwise a colourful initial (a lobby uses its community's name). */
export function roomPerson(
  room: Pick<ChatRoom, "kind" | "name" | "peerName" | "peerHue" | "peerUserId" | "peerAvatarV"> & {
    communityName?: string | null;
  },
): AvatarPerson {
  if (room.kind === "dm")
    return {
      name: room.peerName ?? "?",
      hue: room.peerHue,
      userId: room.peerUserId ?? undefined,
      avatarV: room.peerAvatarV,
    };
  const name =
    room.name.toLowerCase() === "lobby" && room.communityName ? room.communityName : room.name;
  return { name, hue: hueFromText(name) };
}

/** Live rooms (voice and watch-together). */
export function isLiveKind(kind: ChatRoom["kind"]): boolean {
  return kind === "voice" || kind === "screening";
}

export type RoomPreview = {
  text: string;
  author?: string;
  icon?: "image" | "audio" | "video" | "live";
};

/** The last message line: "You:" / "Alex:" prefix, an icon for photos, voice notes and clips. */
export function roomPreview(room: ChatOverviewRoom): RoomPreview {
  const author =
    room.lastAuthor === "You"
      ? "You:"
      : room.kind !== "dm" && room.lastAuthor
        ? `${room.lastAuthor}:`
        : undefined;
  if (!room.lastAt && !room.lastMessage) {
    if (room.awaitingAccept) return { text: "Waiting for them to accept your message" };
    if (isLiveKind(room.kind))
      return { text: room.topic ? `${room.topic} · live room` : "Live room", icon: "live" };
    return { text: "No messages yet. Say hello!" };
  }
  const own = author === "You:" ? author : undefined;
  if (room.lastKind === "image") return { text: "Sent a photo", author: own, icon: "image" };
  if (room.lastKind === "audio") return { text: "Voice message", author: own, icon: "audio" };
  if (room.lastKind === "video") return { text: "Sent a video", author: own, icon: "video" };
  return { text: previewText(room.lastMessage ?? ""), author };
}

/** Which icon a live room's Join button gets, by its topic. */
export type TopicIcon = "music" | "game" | "art" | "film" | "book" | "people";

export function topicIcon(topic: string): TopicIcon {
  const t = topic.toLowerCase();
  if (t.includes("music") || t.includes("k-pop") || t.includes("kpop")) return "music";
  if (t.includes("gam")) return "game";
  if (t.includes("art") || t.includes("draw")) return "art";
  if (t.includes("anime") || t.includes("movie") || t.includes("watch")) return "film";
  if (t.includes("study") || t.includes("writ") || t.includes("book")) return "book";
  return "people";
}

/** "now", "2m", "3h", "1d" for list rows. */
export function shortAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}
