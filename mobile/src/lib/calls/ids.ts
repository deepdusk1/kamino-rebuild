/**
 * The names the website's call service expects. They must match `rtcPeerId` / `rtcRoomKey` on the website
 * (web/src/lib/multiplayer/use-live-room.ts), because the server checks that the peer name belongs to the signed-in
 * person and that the room is one they may join.
 */
export function rtcPeerId(userId: string): string {
  const id = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return id || "peer";
}

export function rtcRoomKey(roomId: number): string {
  return `k-live-${roomId}`.slice(0, 64);
}
