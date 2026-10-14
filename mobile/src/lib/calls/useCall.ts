import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/api/client";
import { apiBaseUrl } from "@/api/config";
import { api } from "@/api/endpoints";
import { communityV9,type LiveStageState } from '@/api/community-v9';
import { rtcPeerId, rtcRoomKey } from "./ids";
import { CallSession, DEFAULT_ICE, type PeerState, type StreamLike } from "./session";
import { loadWebRTC, rtcApiFrom, type NativeWebRTC } from "./webrtc";
import { loadLiveKit, type LiveKitModule } from "./livekit";

type MediaStreamT = InstanceType<NativeWebRTC["MediaStream"]>;
type LKRoom = InstanceType<LiveKitModule["Room"]>;

export type CallStatus = "unavailable" | "joining" | "active" | "ended";

export type CallState = {
  status: CallStatus;
  /** A plain-English reason when the call could not start or ended. */
  message: string | null;
  peers: PeerState[];
  /** Video/audio from each other person, by their id. */
  remoteStreams: Record<string, MediaStreamT>;
  localStream: MediaStreamT | null;
  muted: boolean;
  cameraOn: boolean;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  hangUp: () => void;
};

/** Words for a problem starting the microphone. */
function micProblem(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Allow microphone access in Settings to join calls.";
  if (name === "NotFoundError") return "No microphone was found on this device.";
  return error instanceof Error && error.message ? error.message : "The microphone could not start.";
}

/**
 * Joins the live call of one chat room and keeps it going while the screen is open. Leaving the screen (or calling
 * `hangUp`) closes every connection, releases the microphone and camera, and marks you as no longer in the call.
 */
export function useCall(roomId: number, userId: string | undefined, displayName: string): CallState {
  const [status, setStatus] = useState<CallStatus>(() => (loadWebRTC() ? "joining" : "unavailable"));
  const [message, setMessage] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStreamT>>({});
  const [localStream, setLocalStream] = useState<MediaStreamT | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const sessionRef = useRef<CallSession | null>(null);
  const lkRoomRef = useRef<LKRoom | null>(null);
  const streamRef = useRef<MediaStreamT | null>(null);
  const hangUpRef = useRef<() => void>(() => undefined);
  const canSpeakRef=useRef(true);

  useEffect(() => {
    const webrtc = loadWebRTC();
    if (!webrtc || !userId || !Number.isFinite(roomId)) return;
    let cancelled = false;
    let ended = false;
    let micPending = false;
    let session: CallSession | null = null;
    let stream: MediaStreamT | null = null;
    let inVoice = false;
    let stageTimer:ReturnType<typeof setInterval>|null=null;
    let stageState:LiveStageState|null=null;
    let inCommunityRoom=false;
    const applyStage=(stage:LiveStageState)=>{
      stageState=stage;
      const me=stage.participants.find(p=>p.userId===userId);
      canSpeakRef.current=!!me&&!me.muted&&(!stage.enabled||me.role==='speaker'||me.role==='host');
      if(!canSpeakRef.current){for(const track of streamRef.current?.getTracks()??[])track.enabled=false;setMuted(true);setCameraOn(false);}
      setRemoteStreams(previous=>{for(const [peerId,remote] of Object.entries(previous)){const person=stage.participants.find(p=>rtcPeerId(p.userId)===peerId);const allowed=!!person&&!person.muted&&(!stage.enabled||person.role==='speaker'||person.role==='host');for(const track of remote.getTracks())track.enabled=allowed;}return {...previous};});
      if(canSpeakRef.current&&streamRef.current&&!streamRef.current.getAudioTracks().length&&!micPending){
        micPending=true;
        void webrtc.mediaDevices.getUserMedia({audio:true,video:false}).then(mic=>{if(cancelled||ended||!canSpeakRef.current){for(const track of mic.getTracks())track.stop();return;}for(const track of mic.getAudioTracks())track.enabled=false;stream=mic;streamRef.current=mic;setLocalStream(mic);session?.setLocalStream(mic as unknown as StreamLike);setMuted(true);}).catch(()=>{if(!cancelled&&!ended)setMessage('Allow microphone access to speak.');}).finally(()=>{micPending=false;});
      }
    };

    const cleanup = () => {
      ended = true;
      if(stageTimer){clearInterval(stageTimer);stageTimer=null;}
      const lkRoom = lkRoomRef.current;
      lkRoomRef.current = null;
      if (lkRoom) {
        try { void lkRoom.disconnect(); } catch { /* already gone */ }
      }
      session?.close();
      session = null;
      sessionRef.current = null;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
      streamRef.current = null;
      if (inVoice) {
        inVoice = false;
        // Best effort: the person may already be offline.
        void api.setVoice(roomId, false).catch(() => undefined);
        void api.endCall(roomId).catch(() => undefined);
      }
    };
    hangUpRef.current = () => {
      cleanup();
      setPeers([]);
      setRemoteStreams({});
      setLocalStream(null);
      setStatus("ended");
      setMessage((current) => current ?? "You left the call.");
    };

    /**
     * Joins the call through the LiveKit SFU. Returns true when LiveKit took
     * over; false when it is unavailable so the caller falls back to P2P.
     */
    const joinViaLiveKit = async (): Promise<boolean> => {
      const lk = loadLiveKit();
      const webrtc = loadWebRTC();
      if (!lk || !webrtc) return false;
      const join = await api.getLiveKitJoin(roomId).catch(() => ({ enabled: false as const }));
      if (!join.enabled || cancelled || ended) return false;

      const room = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
        // WhatsApp-level audio: hardware echo cancellation, noise suppression,
        // and auto gain control for clear calls without echo.
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      lkRoomRef.current = room;
      const streams = new Map<string, MediaStreamT>();

      const syncPeers = () => {
        const list: PeerState[] = [];
        room.remoteParticipants.forEach((p) => {
          list.push({ id: p.identity, name: p.name || p.identity, state: "connected" });
        });
        if (!cancelled) setPeers(list);
      };
      const publishStreams = () => {
        if (!cancelled) setRemoteStreams(Object.fromEntries(streams));
      };
      const rawTrack = (track: unknown): unknown =>
        (track as { mediaStreamTrack?: unknown } | null)?.mediaStreamTrack ?? track;

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
        .on(lk.RoomEvent.Disconnected, () => {
          if (!ended && !cancelled) {
            cleanup();
            setStatus("ended");
            setMessage("You were disconnected from the call.");
          }
        });

      await room.connect(join.url, join.token);
      if (cancelled || ended) {
        try { room.disconnect(); } catch { /* noop */ }
        lkRoomRef.current = null;
        return true;
      }
      if (canSpeakRef.current) {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMuted(false);
      } else {
        setMuted(true);
      }
      await api.setVoice(roomId, true);
      inVoice = true;
      if (cancelled || ended) return true;
      setStatus("active");
      syncPeers();
      return true;
    };

    void (async () => {
      try {
        const room=await api.room(roomId);
        if(cancelled||ended)return;
        inCommunityRoom=!['dm','group'].includes(room.room.kind);
        if(inCommunityRoom){
          const stage=await communityV9.stage(roomId);stageState=stage;const me=stage.participants.find(p=>p.userId===userId);
          if(stage.scheduledAt&&new Date(stage.scheduledAt)>new Date())throw new Error('This live room has not started yet.');
          if(stage.locked&&!stage.host)throw new Error('This room is locked.');
          canSpeakRef.current=!!me&&!me.muted&&(!stage.enabled||me.role==='speaker'||me.role==='host');
        }
        // LiveKit SFU first (works on strict NAT where P2P cannot link);
        // fall through to peer-to-peer when it is unavailable.
        if (await joinViaLiveKit()) return;
        if(cancelled||ended)return cleanup();
        stream = canSpeakRef.current?await webrtc.mediaDevices.getUserMedia({ audio: true, video: false }):new webrtc.MediaStream();
        setMuted(!canSpeakRef.current);
        if (cancelled||ended) return cleanup();
        streamRef.current = stream;
        setLocalStream(stream);
        await api.setVoice(roomId, true);
        inVoice = true;
        if(cancelled||ended)return cleanup();
        const iceServers = await api.iceServers().catch(() => DEFAULT_ICE);
        if (cancelled) return cleanup();
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
          onConnected: () => setStatus("active"),
          onPeers: (list) => {
            setPeers(list);
            const alive = new Set(list.map((p) => p.id));
            setRemoteStreams((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => alive.has(id))));
          },
          onRemoteStream: (peerId, remote) => {
            const incoming=remote as unknown as MediaStreamT;
            if(inCommunityRoom){const person=stageState?.participants.find(p=>rtcPeerId(p.userId)===peerId);const allowed=!!person&&!person.muted&&(!stageState?.enabled||person.role==='speaker'||person.role==='host');for(const track of incoming.getTracks())track.enabled=allowed;}
            setRemoteStreams((previous)=>({...previous,[peerId]:incoming}));
          },
          onEnded: (reason) => {
            cleanup();
            setStatus("ended");
            setMessage(reason);
          },
        });
        sessionRef.current = session;
        await session.join();
        if(inCommunityRoom)stageTimer=setInterval(()=>{void communityV9.stage(roomId).then(stage=>{if(!cancelled)applyStage(stage);}).catch(error=>{if(!cancelled){setMessage(error instanceof Error?error.message:'You no longer have access to this live room.');hangUpRef.current();}});},2500);
      } catch (error) {
        cleanup();
        if (!cancelled) {
          setStatus("ended");
          setMessage(micProblem(error));
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [roomId, userId, displayName]);

  const toggleMute = useCallback(() => {
    if(!canSpeakRef.current){setMessage('You are listening. Raise your hand to ask the host to speak.');return;}
    const lkRoom = lkRoomRef.current;
    if (lkRoom) {
      setMuted((current) => {
        const next = !current;
        void lkRoom.localParticipant.setMicrophoneEnabled(!next).catch(() => undefined);
        return next;
      });
      return;
    }
    setMuted((current) => {
      const next = !current;
      // Muting switches the microphone track off; the connection stays up.
      for (const track of streamRef.current?.getAudioTracks() ?? []) track.enabled = !next;
      return next;
    });
  }, []);

  const toggleCamera = useCallback(async () => {
    if(!canSpeakRef.current){setMessage('Only speakers can use a camera in this room.');return;}
    const lkRoom = lkRoomRef.current;
    if (lkRoom) {
      try {
        const next = !cameraOn;
        await lkRoom.localParticipant.setCameraEnabled(next);
        setCameraOn(next);
        // Local preview: wrap the published camera track for RTCView.
        const webrtc = loadWebRTC();
        if (webrtc) {
          const pubs = [...lkRoom.localParticipant.videoTrackPublications.values()];
          const videoTrack = pubs.map((p) => p.track).find((t) => !!t);
          const msTrack = (videoTrack as { mediaStreamTrack?: unknown } | null)?.mediaStreamTrack;
          setLocalStream(next && msTrack ? (new webrtc.MediaStream([msTrack as never]) as MediaStreamT) : null);
        }
      } catch (error) {
        setMessage(error instanceof Error && /denied|permission|allowed/i.test(error.message) ? "Allow camera access in Settings to turn on video." : "The camera could not start.");
      }
      return;
    }
    const webrtc = loadWebRTC();
    const session = sessionRef.current;
    const current = streamRef.current;
    if (!webrtc || !session || !current) return;
    try {
      let next: MediaStreamT;
      if (cameraOn) {
        for (const track of current.getVideoTracks()) track.stop();
        next = new webrtc.MediaStream(current.getAudioTracks());
      } else {
        const video = await webrtc.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user" } });
        if(!canSpeakRef.current||sessionRef.current!==session||streamRef.current!==current){for(const track of video.getTracks())track.stop();return;}
        next = new webrtc.MediaStream([...current.getAudioTracks(), ...video.getVideoTracks()]);
      }
      streamRef.current = next;
      setLocalStream(next);
      session.setLocalStream(next as unknown as StreamLike);
      setCameraOn(!cameraOn);
    } catch (error) {
      setMessage(error instanceof Error && /denied|permission|allowed/i.test(error.message) ? "Allow camera access in Settings to turn on video." : "The camera could not start.");
    }
  }, [cameraOn]);

  const hangUp = useCallback(() => hangUpRef.current(), []);

  return { status, message, peers, remoteStreams, localStream, muted, cameraOn, toggleMute, toggleCamera, hangUp };
}
