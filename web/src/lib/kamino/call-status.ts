/**
 * What a 1:1 call screen says, worked out from plain facts (no React), so the website and the phone app agree and it
 * is unit tested. Kept in step with mobile/src/lib/calls/call-status.ts.
 *
 * The old screens only knew "connected" or "Calling…", so a call the other person had already answered, but whose
 * audio could not get through between the two networks, looked like it was still ringing, and after 30 seconds was
 * even recorded as a missed call.
 */

export type CallPhase = "calling" | "connecting" | "connected" | "no-answer" | "trouble";

/** How long an answered call may try to link up before the screen says it could not connect. */
export const CONNECT_TIMEOUT_MS = 20_000;

export const CALL_PHASE_TEXT: Record<CallPhase, string> = {
  calling: "Calling…",
  connecting: "Connecting…",
  connected: "Connected",
  "no-answer": "No answer",
  trouble: "Couldn't connect",
};

export const TROUBLE_HELP =
  "The call couldn't get through between your two networks. Hang up and try again, or switch one phone to Wi-Fi.";

/**
 * - connected: media is flowing with at least one person;
 * - trouble: someone joined but nothing linked up within CONNECT_TIMEOUT_MS (or the link failed);
 * - connecting: someone joined (answered) and the link is being set up;
 * - no-answer / calling: nobody has joined yet.
 */
export function callPhase(s: { connected: number; joined: number; noAnswer: boolean; trouble: boolean }): CallPhase {
  if (s.connected > 0) return "connected";
  if (s.joined > 0) return s.trouble ? "trouble" : "connecting";
  return s.noAnswer ? "no-answer" : "calling";
}
