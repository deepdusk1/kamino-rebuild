/**
 * Who may speak in a call, worked out from the live stage. The same rules as the server's `liveKitRoleFor`
 * (web/src/lib/kamino/livekit.server.ts), which is what LiveKit actually enforces; keeping them equal means the
 * Mute button never offers something the server will refuse.
 */
export type StageView = {
  enabled: boolean;
  participants: { userId: string; role: string; muted: boolean; cohost: boolean }[];
};

export function canSpeakIn(stage: StageView, userId: string): boolean {
  const me = stage.participants.find((p) => p.userId === userId);
  if (!me) return false;
  if (me.role === "host") return true; // the room's creator
  if (me.muted) return false; // a host muted them
  if (me.cohost) return true;
  if (!stage.enabled) return true; // stage off: everyone talks
  return me.role === "speaker";
}
