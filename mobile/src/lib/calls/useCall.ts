import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/api/client";
import { apiBaseUrl } from "@/api/config";
import { api } from "@/api/endpoints";
import { communityV9, type LiveStageState } from "@/api/community-v9";
import { startCallService, stopCallService } from "./call-service";
import { rtcPeerId, rtcRoomKey } from "./ids";
import { loadLiveKit, routeCallAudio, startCallAudio, stopCallAudio, type LiveKitModule } from "./livekit";
import { CallSession, DEFAULT_ICE, type PeerState, type StreamLike } from "./session";
import { canSpeakIn } from "./stage";
import { loadWebRTC, rtcApiFrom, type NativeWebRTC } from "./webrtc";

type MediaStreamT = InstanceType<NativeWebRTC["MediaStream"]>;
type LKRoom = InstanceType<LiveKitModule["Room"]>;

/** `idle`: waiting for the person to answer. `unavailable`: this build has no calling (Expo Go, web). */
export type CallStatus = "unavailable" | "idle" | "joining" | "active" | "ended";
/** How the call is connected: through the LiveKit server, or directly phone-to-phone. */
export type CallTransport = "livekit" | "p2p";

export type CallState = {
  status: CallStatus;
  /** A plain-English note: why the call could not start or ended, or a tip (e.g. "you can speak now"). */
  message: string | null;
  transport: CallTransport | null;
  /** True while the connection dropped and is coming back (e.g. switching from Wi-Fi to mobile data). */
  reconnecting: boolean;
  peers: PeerState[];
  /** Video/audio from each other person, by their id. */
  remoteStreams: Record<string, MediaStreamT>;
  /** Your camera preview, while the camera is on. */
  localStream: MediaStreamT | null;
  muted: boolean;
  cameraOn: boolean;
  speakerOn: boolean;
  frontCamera: boolean;
  /** Whether you may speak (a listener in a live room may not). */
  canSpeak: boolean;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  toggleSpeaker: () => void;
  flipCamera: () => Promise<void>;
  /**
   * Leaves the call. `notifyServer: false` when the call already ended elsewhere (the other person hung up), so
   * this phone doesn't send an "ended" back that could end a newer call.
   */
  hangUp: (options?: { notifyServer?: boolean }) => void;
};

/** In a 1:1 call, how long to wait for the other person to come back before ending the call. */
const ALONE_GRACE_MS = 15_000;
const LISTEN_ONLY = "You are listening. Raise your hand to ask the host if you can speak.";

/** Words for a problem starting the microphone. */
function micProblem(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? "";
  const text = error instanceof Error ? error.message : "";
  if (name === "NotAllowedError" || name === "SecurityError" || /denied|permission/i.test(text))
    return "Allow microphone access in Settings so others can hear you.";
  if (name === "NotFoundError") return "No microphone was found on this phone.";
  return "The microphone could not start.";
}

function cameraProblem(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  return /denied|permission|allowed/i.test(text)
    ? "Allow camera access in Settings to turn on video."
    : "The camera could not start.";
}

/** A message from the server or the call engine that is safe to show; anything technical becomes a plain sentence. */
function joinProblem(error: unknown): string {
  const text = error instanceof Error ? error.message.trim() : "";
  if (text && text.length < 140 && !/[{}<>]|undefined|null|TypeError|fetch/i.test(text)) return text;
  return "The call could not connect. Check your internet connection and try again.";
}

/** Errors that mean you may no longer be in the room (as opposed to a short network problem). */
const lostAccess = (error: unknown) =>
  /removed|not in this room|join this community|unavailable|locked|subscription/i.test(
    error instanceof Error ? error.message : "",
  );

/**
 * Joins the call of one chat room and keeps it going while the call screen is open (and in the background, with
 * the ongoing-call notification on Android). Leaving the screen or `hangUp` closes every connection, releases the
 * microphone and camera, and tells the server you left.
 *
 * Nothing happens until `enabled` is true, so an incoming call can ring without switching on your microphone.
 */
export function useCall(
  roomId: number,
  userId: string | undefined,
  displayName: string,
  enabled = true,
): CallState {
  const available = loadWebRTC() !== null;
  const [status, setStatus] = useState<CallStatus>("joining");
  const [message, setMessage] = useState<string | null>(null);
  const [transport, setTransport] = useState<CallTransport | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStreamT>>({});
  const [localStream, setLocalStream] = useState<MediaStreamT | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [frontCamera, setFrontCamera] = useState(true);
  const [canSpeak, setCanSpeak] = useState(true);

  // Refs hold the live values the button handlers need, so they never act on a stale render.
  const sessionRef = useRef<CallSession | null>(null);
  const lkRoomRef = useRef<LKRoom | null>(null);
  const streamRef = useRef<MediaStreamT | null>(null);
  const mutedRef = useRef(false);
  const cameraOnRef = useRef(false);
  const speakerRef = useRef(true);
  const frontRef = useRef(true);
  const canSpeakRef = useRef(true);
  const audioOnRef = useRef(false);
  const titleRef = useRef("Kamino call");
  const hangUpRef = useRef<(options?: { notifyServer?: boolean }) => void>(() => undefined);

  const setMutedState = useCallback((value: boolean) => {
    mutedRef.current = value;
    setMuted(value);
  }, []);
  const setCameraState = useCallback((value: boolean) => {
    cameraOnRef.current = value;
    setCameraOn(value);
  }, []);
  const setCanSpeakState = useCallback((value: boolean) => {
    canSpeakRef.current = value;
    setCanSpeak(value);
  }, []);

  useEffect(() => {
    const webrtc = loadWebRTC();
    if (!enabled || !webrtc || !userId || !Number.isFinite(roomId)) return;
    const lk = loadLiveKit();
    let cancelled = false; // the screen closed
    let ended = false; // the call is over (for any reason)
    let notifyServerOnEnd = true;
    let inVoice = false;
    let isDm = false;
    let inCommunityRoom = false;
    let session: CallSession | null = null;
    let stageState: LiveStageState | null = null;
    let stageTimer: ReturnType<typeof setInterval> | null = null;
    let aloneTimer: ReturnType<typeof setTimeout> | null = null;
    let hadPeer = false;
    let micPending = false;

    const startAudio = async () => {
      if (!lk || audioOnRef.current) return;
      // Marked first, so a hang-up while this is starting still stops the audio session.
      audioOnRef.current = true;
      await startCallAudio(lk);
      if (ended) {
        await stopCallAudio(lk);
        return;
      }
      if (!speakerRef.current) await routeCallAudio(lk, false).catch(() => undefined);
    };

    /**
     * Tells the server you're in the call. If the call ended while that request was on its way, the server is told
     * you left again, so you never stay listed as "in the call".
     */
    const markInCall = async (): Promise<boolean> => {
      await api.setVoice(roomId, true);
      if (ended) {
        if (notifyServerOnEnd) void api.endCall(roomId).catch(() => undefined);
        return false;
      }
      inVoice = true;
      return true;
    };

    /** Stops everything this call started. Runs once, whatever ended the call. */
    const teardown = () => {
      if (ended) return;
      ended = true;
      if (stageTimer) clearInterval(stageTimer);
      if (aloneTimer) clearTimeout(aloneTimer);
      stageTimer = null;
      aloneTimer = null;
      const room = lkRoomRef.current;
      lkRoomRef.current = null;
      if (room) void room.disconnect().catch(() => undefined);
      session?.close();
      session = null;
      sessionRef.current = null;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
      void stopCallService();
      if (lk && audioOnRef.current) {
        audioOnRef.current = false;
        void stopCallAudio(lk);
      }
      if (inVoice && notifyServerOnEnd) {
        // Takes you out of the call on the server; a 1:1 call ends for the other person too.
        void api.endCall(roomId).catch(() => undefined);
      }
      inVoice = false;
    };

    /** Ends the call and shows why. */
    const finish = (reason: string, notifyServer: boolean) => {
      if (ended) return;
      notifyServerOnEnd = notifyServer;
      teardown();
      if (cancelled) return;
      setStatus("ended");
      setReconnecting(false);
      setPeers([]);
      setRemoteStreams({});
      setLocalStream(null);
      setCameraState(false);
      setMessage(reason);
    };
    hangUpRef.current = (options) => finish("You left the call.", options?.notifyServer ?? true);

    /** 1:1 calls end when the other person is gone for a while (their phone died, lost signal, or Kamino was closed). */
    const watchAlone = (alone: boolean) => {
      if (!isDm) return;
      if (!alone) {
        hadPeer = true;
        if (aloneTimer) clearTimeout(aloneTimer);
        aloneTimer = null;
        return;
      }
      if (!hadPeer || aloneTimer) return;
      aloneTimer = setTimeout(() => finish("The other person left the call.", true), ALONE_GRACE_MS);
    };

    const updateCallService = () => {
      if (!ended && !cancelled) void startCallService({ title: titleRef.current, camera: cameraOnRef.current });
    };

    /** Applies the live stage (who may speak) after a host changes it. */
    const applyStage = (stage: LiveStageState) => {
      stageState = stage;
      const was = canSpeakRef.current;
      const can = canSpeakIn(stage, userId);
      setCanSpeakState(can);
      const room = lkRoomRef.current;
      if (!can) {
        if (room) {
          void room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
          void room.localParticipant.setCameraEnabled(false).catch(() => undefined);
        }
        for (const track of streamRef.current?.getTracks() ?? []) track.enabled = false;
        setMutedState(true);
        if (cameraOnRef.current) {
          setCameraState(false);
          setLocalStream(null);
        }
      } else if (!was && !cancelled) {
        setMessage("You can speak now. Tap Unmute when you're ready.");
      }
      if (session) {
        // Peer-to-peer: nothing stops a listener's phone from sending sound, so each phone mutes what it receives.
        setRemoteStreams((previous) => {
          for (const [peerId, remote] of Object.entries(previous)) {
            const person = stage.participants.find((p) => rtcPeerId(p.userId) === peerId);
            const allowed = person ? canSpeakIn(stage, person.userId) : false;
            for (const track of remote.getTracks()) track.enabled = allowed;
          }
          return { ...previous };
        });
        // Someone just invited to speak needs a microphone (muted until they unmute).
        if (can && streamRef.current && !streamRef.current.getAudioTracks().length && !micPending) {
          micPending = true;
          void webrtc.mediaDevices
            .getUserMedia({ audio: true, video: false })
            .then((mic) => {
              if (cancelled || ended || !canSpeakRef.current) {
                for (const track of mic.getTracks()) track.stop();
                return;
              }
              for (const track of mic.getAudioTracks()) track.enabled = false;
              streamRef.current = mic;
              session?.setLocalStream(mic as unknown as StreamLike);
              setMutedState(true);
              updateCallService();
            })
            .catch((error: unknown) => {
              if (!cancelled && !ended) setMessage(micProblem(error));
            })
            .finally(() => {
              micPending = false;
            });
        }
      }
    };

    const pollStage = () => {
      stageTimer = setInterval(() => {
        void communityV9
          .stage(roomId)
          .then((stage) => {
            if (!cancelled && !ended) applyStage(stage);
          })
          .catch((error: unknown) => {
            // A short network problem is fine (the call reconnects on its own); losing access to the room is not.
            if (!cancelled && lostAccess(error)) finish(joinProblem(error), false);
          });
      }, 2500);
    };

    /** Joins through the LiveKit server. False when the server has no LiveKit, so the caller uses peer-to-peer. */
    const joinViaLiveKit = async (): Promise<boolean> => {
      if (!lk) return false;
      // An error here (no access, room locked, not 18+) is shown as it is: falling back to peer-to-peer would
      // put this phone in a different call from everyone else.
      const join = await api.getLiveKitJoin(roomId);
      if (!join.enabled) return false;
      if (cancelled || ended) return true;
      await startAudio();
      if (cancelled || ended) return true;
      const room = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
        // Echo cancellation, noise suppression and automatic gain for clear calls on a loudspeaker.
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        videoCaptureDefaults: { facingMode: "user" },
      });
      lkRoomRef.current = room;
      setTransport("livekit");
      const streams = new Map<string, MediaStreamT>();
      const rawTrack = (track: unknown): unknown =>
        (track as { mediaStreamTrack?: unknown } | null)?.mediaStreamTrack ?? track;
      const syncPeers = () => {
        const list: PeerState[] = [];
        room.remoteParticipants.forEach((p) => {
          list.push({ id: p.identity, name: p.name || "Member", state: "connected" });
        });
        if (!cancelled && !ended) setPeers(list);
        watchAlone(list.length === 0);
      };
      const publishStreams = () => {
        if (!cancelled && !ended) setRemoteStreams(Object.fromEntries(streams));
      };

      room
        .on(lk.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (cancelled || ended) return;
          const msTrack = rawTrack(track);
          let stream = streams.get(participant.identity);
          if (!stream) {
            stream = new webrtc.MediaStream() as MediaStreamT;
            streams.set(participant.identity, stream);
          }
          const media = stream as unknown as { getTracks(): unknown[]; addTrack(t: unknown): void };
          if (!media.getTracks().includes(msTrack)) media.addTrack(msTrack);
          publishStreams();
          syncPeers();
        })
        .on(lk.RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          const stream = streams.get(participant.identity);
          if (!stream) return;
          const media = stream as unknown as { getTracks(): unknown[]; removeTrack(t: unknown): void };
          media.removeTrack(rawTrack(track));
          if (media.getTracks().length === 0) streams.delete(participant.identity);
          publishStreams();
        })
        .on(lk.RoomEvent.ParticipantConnected, syncPeers)
        .on(lk.RoomEvent.ParticipantDisconnected, (participant) => {
          streams.delete(participant.identity);
          publishStreams();
          syncPeers();
        })
        .on(lk.RoomEvent.Reconnecting, () => {
          if (!cancelled && !ended) setReconnecting(true);
        })
        .on(lk.RoomEvent.Reconnected, () => {
          if (!cancelled && !ended) setReconnecting(false);
        })
        .on(lk.RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
          // The host made you a listener: the server already stopped your microphone and camera.
          if (participant !== room.localParticipant || participant.permissions?.canPublish !== false) return;
          setMutedState(true);
          setCameraState(false);
          if (!cancelled) setLocalStream(null);
        })
        .on(lk.RoomEvent.Disconnected, (reason) => {
          if (ended || cancelled) return;
          const R = lk.DisconnectReason;
          if (reason === R.DUPLICATE_IDENTITY) finish("You joined this call on another device.", false);
          else if (reason === R.PARTICIPANT_REMOVED) finish("You were removed from the call.", false);
          else if (reason === R.ROOM_DELETED) finish("The call has ended.", false);
          else finish("You were disconnected from the call. Check your internet connection.", true);
        });

      await room.connect(join.url, join.token);
      if (cancelled || ended) return true;
      if (canSpeakRef.current) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          setMutedState(false);
        } catch (error) {
          // No microphone still lets you listen.
          setMutedState(true);
          if (!cancelled) setMessage(micProblem(error));
        }
      } else {
        setMutedState(true);
      }
      if (!(await markInCall()) || cancelled) return true;
      setStatus("active");
      syncPeers();
      updateCallService();
      return true;
    };

    /** Joins phone-to-phone through the website's signalling service (when the server has no LiveKit). */
    const joinPeerToPeer = async () => {
      const stream = canSpeakRef.current
        ? await webrtc.mediaDevices.getUserMedia({ audio: true, video: false })
        : new webrtc.MediaStream();
      if (cancelled || ended) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      setMutedState(!canSpeakRef.current);
      setTransport("p2p");
      await startAudio();
      if (cancelled || ended || !(await markInCall()) || cancelled) return;
      const iceServers = await api.iceServers().catch(() => DEFAULT_ICE);
      if (cancelled || ended) return;
      session = new CallSession({
        api: rtcApiFrom(webrtc),
        baseUrl: apiBaseUrl(),
        token: getAuthToken,
        fetch,
        roomKey: rtcRoomKey(roomId),
        selfId: rtcPeerId(userId),
        name: displayName,
        iceServers,
        localStream: stream as unknown as StreamLike,
        onConnected: () => {
          if (cancelled || ended) return;
          setStatus("active");
          updateCallService();
        },
        onPeers: (list) => {
          if (cancelled || ended) return;
          setPeers(list);
          const alive = new Set(list.map((p) => p.id));
          setRemoteStreams((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => alive.has(id))));
          watchAlone(list.length === 0);
        },
        onRemoteStream: (peerId, remote) => {
          if (cancelled || ended) return;
          const incoming = remote as unknown as MediaStreamT;
          if (inCommunityRoom && stageState) {
            const person = stageState.participants.find((p) => rtcPeerId(p.userId) === peerId);
            const allowed = person ? canSpeakIn(stageState, person.userId) : false;
            for (const track of incoming.getTracks()) track.enabled = allowed;
          }
          setRemoteStreams((previous) => ({ ...previous, [peerId]: incoming }));
        },
        onEnded: (reason) => finish(reason, true),
      });
      sessionRef.current = session;
      await session.join();
    };

    void (async () => {
      try {
        const page = await api.room(roomId);
        if (cancelled || ended) return;
        titleRef.current = page.room.name ? `Call · ${page.room.name}` : "Kamino call";
        isDm = page.room.kind === "dm";
        inCommunityRoom = !["dm", "group"].includes(page.room.kind);
        if (inCommunityRoom) {
          const stage = await communityV9.stage(roomId);
          if (cancelled || ended) return;
          if (stage.scheduledAt && new Date(stage.scheduledAt) > new Date())
            throw new Error("This live room has not started yet.");
          if (stage.locked && !stage.host) throw new Error("This room is locked.");
          stageState = stage;
          setCanSpeakState(canSpeakIn(stage, userId));
        } else {
          setCanSpeakState(true);
        }
        if (!(await joinViaLiveKit())) await joinPeerToPeer();
        if (inCommunityRoom && !cancelled && !ended) pollStage();
      } catch (error) {
        const name = (error as { name?: string } | null)?.name ?? "";
        const isMic = /NotAllowed|NotFound|Security/.test(name);
        finish(isMic ? micProblem(error) : joinProblem(error), true);
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [roomId, userId, displayName, enabled, setMutedState, setCameraState, setCanSpeakState]);

  const toggleMute = useCallback(() => {
    if (!canSpeakRef.current) {
      setMessage(LISTEN_ONLY);
      return;
    }
    const next = !mutedRef.current;
    setMutedState(next);
    const room = lkRoomRef.current;
    if (room) {
      void room.localParticipant.setMicrophoneEnabled(!next).catch((error: unknown) => {
        setMutedState(true);
        setMessage(micProblem(error));
      });
      return;
    }
    // Peer-to-peer: muting switches the microphone track off; the connection stays up.
    for (const track of streamRef.current?.getAudioTracks() ?? []) track.enabled = !next;
  }, [setMutedState]);

  /** The local camera track as a stream the preview can show (LiveKit keeps the track inside its publication). */
  const livekitPreview = useCallback((room: LKRoom): MediaStreamT | null => {
    const lk = loadLiveKit();
    const webrtc = loadWebRTC();
    if (!lk || !webrtc) return null;
    const track = room.localParticipant.getTrackPublication(lk.Track.Source.Camera)?.track;
    const msTrack = (track as { mediaStreamTrack?: unknown } | undefined)?.mediaStreamTrack;
    return msTrack ? (new webrtc.MediaStream([msTrack as never]) as MediaStreamT) : null;
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!canSpeakRef.current) {
      setMessage("Only speakers can turn on a camera in this room.");
      return;
    }
    const next = !cameraOnRef.current;
    const room = lkRoomRef.current;
    if (room) {
      try {
        await room.localParticipant.setCameraEnabled(next, { facingMode: frontRef.current ? "user" : "environment" });
        setCameraState(next);
        setLocalStream(next ? livekitPreview(room) : null);
        void startCallService({ title: titleRef.current, camera: next });
      } catch (error) {
        setMessage(cameraProblem(error));
      }
      return;
    }
    const webrtc = loadWebRTC();
    const session = sessionRef.current;
    const current = streamRef.current;
    if (!webrtc || !session || !current) return;
    try {
      let stream: MediaStreamT;
      if (!next) {
        for (const track of current.getVideoTracks()) track.stop();
        stream = new webrtc.MediaStream(current.getAudioTracks());
      } else {
        const video = await webrtc.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: frontRef.current ? "user" : "environment" },
        });
        // The call ended (or you lost speaking rights) while the camera was starting.
        if (!canSpeakRef.current || sessionRef.current !== session || streamRef.current !== current) {
          for (const track of video.getTracks()) track.stop();
          return;
        }
        stream = new webrtc.MediaStream([...current.getAudioTracks(), ...video.getVideoTracks()]);
      }
      streamRef.current = stream;
      setLocalStream(next ? stream : null);
      session.setLocalStream(stream as unknown as StreamLike);
      setCameraState(next);
      void startCallService({ title: titleRef.current, camera: next });
    } catch (error) {
      setMessage(cameraProblem(error));
    }
  }, [livekitPreview, setCameraState]);

  const flipCamera = useCallback(async () => {
    if (!cameraOnRef.current) return;
    const front = !frontRef.current;
    const facingMode = front ? "user" : "environment";
    try {
      const room = lkRoomRef.current;
      const lk = loadLiveKit();
      if (room && lk) {
        const track = room.localParticipant.getTrackPublication(lk.Track.Source.Camera)?.track as
          | { restartTrack?: (options: { facingMode: string }) => Promise<void> }
          | undefined;
        if (!track?.restartTrack) return;
        await track.restartTrack({ facingMode });
        setLocalStream(livekitPreview(room));
      } else {
        const video = streamRef.current?.getVideoTracks()[0] as
          | { applyConstraints?: (c: Record<string, unknown>) => Promise<void>; _switchCamera?: () => void }
          | undefined;
        if (!video) return;
        if (video.applyConstraints) await video.applyConstraints({ facingMode });
        else video._switchCamera?.();
      }
      frontRef.current = front;
      setFrontCamera(front);
    } catch {
      setMessage("The camera could not switch.");
    }
  }, [livekitPreview]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerRef.current;
    speakerRef.current = next;
    setSpeakerOn(next);
    const lk = loadLiveKit();
    // Before the call's audio starts, the choice is applied when it does.
    if (!lk || !audioOnRef.current) return;
    void routeCallAudio(lk, next).catch(() => {
      speakerRef.current = !next;
      setSpeakerOn(!next);
      setMessage("The sound could not be switched.");
    });
  }, []);

  const hangUp = useCallback((options?: { notifyServer?: boolean }) => hangUpRef.current(options), []);

  return {
    status: !available ? "unavailable" : !enabled ? "idle" : status,
    message,
    transport,
    reconnecting,
    peers,
    remoteStreams,
    localStream,
    muted,
    cameraOn,
    speakerOn,
    frontCamera,
    canSpeak,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    flipCamera,
    hangUp,
  };
}
