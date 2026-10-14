import { ChevronDown, Mic, MicOff, Phone, PhoneOff, Play, Plus, ThumbsUp, Trash2, Video, VideoOff, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Face } from "@/components/face";
import { KAMINO_CALL_EVENT } from "@/components/incoming-call";
import {
  parseWatchInput,
  SHELF,
  twitchSource,
  vimeoId,
  youtubeId,
  type ShelfKind,
} from "@/lib/kamino/shelf";
import {
  addWatchQueueItem,
  clearWatchQueue,
  listWatchQueue,
  listWatchReady,
  playWatchQueueItem,
  removeWatchQueueItem,
  setWatchReady,
  startWatchReadyCheck,
  voteWatchQueueItem,
} from "@/lib/kamino/watch";
import { rtcPeerId, rtcRoomKey, useLiveRoom } from "@/lib/multiplayer/use-live-room";
import { cn } from "@/lib/utils";
import { getLiveStage } from '@/lib/kamino/community-v9';
import { missedCall, ringCall } from '@/lib/kamino/server';
import { getLiveKitJoin, getRoomRecordingState } from '@/lib/kamino/livekit';
import { useServerEventsLive } from '@/lib/server-events';

type WatchWire = {
  t: "watch";
  url: string;
  title: string;
  kind: ShelfKind;
  paused: boolean;
  at: number;
  ts: number;
  by: string;
};

/** What the deck needs from any embedded player, whatever the source. */
type PlayerControl = {
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  /** Current playback position in seconds (0 for live channels). */
  now: () => number;
};

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  loadVideoById: (id: string, start?: number) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void };
        },
      ) => YtPlayer;
      PlayerState?: { PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYt(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector("script[src*='youtube.com/iframe_api']")) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

type TwitchEmbedPlayer = {
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  getCurrentTime: () => number;
  getPlaybackState: () => "idle" | "loading" | "playing" | "paused" | "ended";
  addEventListener: (event: string, fn: () => void) => void;
  destroy: () => void;
};

declare global {
  interface Window {
    Twitch?: {
      Player: (new (el: HTMLElement, opts: Record<string, unknown>) => TwitchEmbedPlayer) & {
        READY: string;
      };
    };
  }
}

let twitchLoading: Promise<void> | null = null;

function loadTwitch(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Twitch?.Player) return Promise.resolve();
  twitchLoading ??= new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[src*='embed.twitch.tv']");
    const s = existing ?? document.createElement("script");
    const done = () => resolve();
    if (existing?.dataset.loaded === "1") return done();
    s.addEventListener("load", () => {
      s.dataset.loaded = "1";
      done();
    });
    s.addEventListener("error", () => reject(new Error("Twitch player failed to load.")));
    if (!existing) {
      s.src = "https://embed.twitch.tv/embed/v1.js";
      s.async = true;
      document.head.appendChild(s);
    }
  });
  return twitchLoading;
}

async function openMic(video: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: video ? { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" } : false,
  });
}

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function RemoteMedia({
  stream,
  name,
  compact,
  fill,
}: {
  stream: MediaStream;
  name: string;
  compact?: boolean;
  fill?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasVideo = stream.getVideoTracks().some((t) => t.readyState !== "ended");
  useEffect(() => {
    if (hasVideo && videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
    } else if (audioRef.current) {
      audioRef.current.srcObject = stream;
      void audioRef.current.play().catch(() => undefined);
    }
  }, [stream, hasVideo]);
  if (hasVideo) {
    if (fill) {
      return (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      );
    }
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-tile bg-surface-alt",
          compact ? "h-24 w-36" : "aspect-video w-full",
        )}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          className="h-full w-full object-cover"
        />
        <p className="absolute bottom-1 left-2 text-[11px] font-extrabold">{name}</p>
      </div>
    );
  }
  return <audio ref={audioRef} autoPlay playsInline />;
}

export function LiveStage({
  roomId,
  userId,
  name,
  kind,
  autoCall,
  watchUrl,
  watchTitle,
  peerName,
  peerHue,
  onWatchSaved,
  onVoice,
  showIdleBar = true,
}: {
  roomId: number;
  userId: string;
  name: string;
  kind: "voice" | "screening" | "dm" | "public" | "private";
  autoCall?: boolean;
  watchUrl?: string;
  watchTitle?: string;
  peerName?: string;
  peerHue?: number;
  onWatchSaved?: (url: string, title: string) => void;
  onVoice?: (on: boolean) => void;
  /**
   * Show the "Call" / "Join voice" bar while not in a call (default). The chat room turns it off for DMs, where the
   * phone button in its header starts the call instead (it sends the same event as answering an incoming call).
   */
  showIdleBar?: boolean;
}) {
  const screening = kind === "screening";
  const canCall = kind === "voice" || kind === "screening" || kind === "dm";
  const [onCall, setOnCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cam, setCam] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** DM call rang unanswered: nobody joined within the ring window. */
  const [noAnswer, setNoAnswer] = useState(false);
  const localRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const startedAt = useRef<number>(0);
  // Voice-room roster/joins arrive over SSE when connected; the 2.5s poll is the fallback.
  const pushLive = useServerEventsLive();
  const stage=useQuery({queryKey:['live-stage',roomId],queryFn:()=>getLiveStage({data:{roomId}}),enabled:kind!=='dm'&&canCall,refetchInterval:pushLive?false:2500});
  const recording=useQuery({queryKey:['room-recording',roomId],queryFn:()=>getRoomRecordingState({ data: roomId }),enabled:kind==='screening'||kind==='voice',refetchInterval:10000});
  const mine=stage.data?.participants.find(p=>p.userId===userId);
  const maySpeak=kind==='dm'||!!stage.data&&!!mine&&!mine.muted&&(!stage.data.enabled||mine.role==='host'||mine.role==='speaker');
  const speakingRef=useRef(maySpeak);speakingRef.current=maySpeak;

  // When the server has LiveKit configured, media flows through the SFU with server-enforced
  // publish rights; the peer-to-peer room stays up for watch-party sync and the roster.
  const [liveKit, setLiveKit] = useState<{ room: import("livekit-client").Room; role: string } | null>(null);
  const [liveKitStreams, setLiveKitStreams] = useState<Record<string, MediaStream>>({});
  useEffect(() => {
    return () => {
      liveKit?.room.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabled = screening || onCall;
  const live = useLiveRoom({
    roomKey: rtcRoomKey(roomId),
    selfId: rtcPeerId(userId),
    name,
    enabled,
  });

  useEffect(() => {
    if (live.joined && localRef.current) live.setLocalStream(localRef.current);
  }, [live.joined, live.setLocalStream, onCall]);

  useEffect(() => {
    if (previewRef.current && localRef.current && cam) {
      previewRef.current.srcObject = localRef.current;
    }
  }, [cam, onCall]);

  async function joinCall(withCam = false) {
    setErr(null);
    setNoAnswer(false);
    try {
      const current=kind==='dm'?null:await getLiveStage({data:{roomId}});
      const self=current?.participants.find(p=>p.userId===userId);
      if(current?.scheduledAt&&new Date(current.scheduledAt)>new Date())throw new Error('This live room has not started yet.');
      if(current?.locked&&!current.host)throw new Error('This room is locked.');
      const allowed=kind==='dm'||!!current&&!!self&&!self.muted&&(!current.enabled||self.role==='host'||self.role==='speaker');
      const joinInfo = await getLiveKitJoin({ data: roomId }).catch(() => null);
      if (joinInfo?.enabled) {
        const { Room } = await import("livekit-client");
        const room = new Room({
          adaptiveStream: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        room.on("trackSubscribed", (track, publication, participant) => {
          if (track.kind === "video" || track.kind === "audio") {
            const stream = new MediaStream([track.mediaStreamTrack]);
            setLiveKitStreams((prev) => ({ ...prev, [participant.identity]: stream }));
          }
        });
        room.on("trackUnsubscribed", (_track, _publication, participant) => {
          setLiveKitStreams((prev) => {
            const next = { ...prev };
            delete next[participant.identity];
            return next;
          });
        });
        await room.connect(joinInfo.url, joinInfo.token);
        if (allowed) await room.localParticipant.setMicrophoneEnabled(true);
        if (allowed && withCam) await room.localParticipant.setCameraEnabled(true);
        setLiveKit({ room, role: joinInfo.role });
        localRef.current = null;
        setMuted(!allowed);
        setCam(false);
        startedAt.current = Date.now();
        setOnCall(true);
        onVoice?.(true);
        // Ring the other participants (DM calls only). Skip if we're answering
        // an incoming call (sessionStorage flag set by IncomingCall).
        if (kind === "dm") {
          try {
            const answering = sessionStorage.getItem("kamino-call") === String(roomId);
            if (!answering) await ringCall({ data: roomId });
            sessionStorage.removeItem("kamino-call");
          } catch {
            /* */
          }
        }
        return;
      }
      const stream = allowed?await openMic(withCam):new MediaStream();
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = stream;
      setCam(allowed&&withCam);
      setMuted(!allowed);
      setMinimized(false);
      startedAt.current = Date.now();
      setOnCall(true);
      onVoice?.(true);
      if (live.joined) live.setLocalStream(stream);
      // Ring the other participants (DM calls only, P2P fallback path).
      if (kind === "dm") {
        try {
          const answering = sessionStorage.getItem("kamino-call") === String(roomId);
          if (!answering) await ringCall({ data: roomId });
          sessionStorage.removeItem("kamino-call");
        } catch {
          /* */
        }
      }
    } catch (error) {
      setErr(error instanceof Error?error.message:'Could not join the live room.');
    }
  }

  function hangUp() {
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    liveKit?.room.disconnect();
    setLiveKit(null);
    setLiveKitStreams({});
    live.setLocalStream(null);
    setOnCall(false);
    setCam(false);
    setMinimized(false);
    setNoAnswer(false);
    onVoice?.(false);
    // Let the header's call button (or an answered call) start a new call later.
    autoStarted.current = false;
  }

  function toggleMute() {
    if(!speakingRef.current){setErr('You are listening. Ask the host for permission to speak.');return;}
    const next = !muted;
    setMuted(next);
    if (liveKit) void liveKit.room.localParticipant.setMicrophoneEnabled(!next);
    localRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  }

  async function toggleCam() {
    if(!speakingRef.current){setErr('Only speakers can turn on a camera in this room.');return;}
    if (!onCall) {
      await joinCall(true);
      return;
    }
    if (cam) {
      localRef.current?.getVideoTracks().forEach((t) => {
        t.stop();
        localRef.current?.removeTrack(t);
      });
      setCam(false);
      live.setLocalStream(localRef.current);
      return;
    }
    try {
      const extra = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" },
      });
      if(!speakingRef.current||!localRef.current){extra.getTracks().forEach(t=>t.stop());return;}
      extra.getVideoTracks().forEach((t) => localRef.current?.addTrack(t));
      setCam(true);
      live.setLocalStream(localRef.current);
    } catch {
      setErr("Camera permission denied.");
    }
  }

  useEffect(() => {
    if(!onCall||kind==='dm')return;
    if(stage.error){hangUp();setErr('You no longer have access to this live room.');return;}
    if(!maySpeak){localRef.current?.getAudioTracks().forEach(t=>{t.enabled=false;});localRef.current?.getVideoTracks().forEach(t=>{t.enabled=false;});setMuted(true);return;}
    let cancelled=false;
    if(localRef.current&&!localRef.current.getAudioTracks().length){
      void openMic(false).then(stream=>{if(cancelled){stream.getTracks().forEach(t=>t.stop());return;}localRef.current=stream;stream.getAudioTracks().forEach(t=>{t.enabled=false;});live.setLocalStream(stream);setMuted(true);}).catch(()=>setErr('Allow microphone access to speak.'));
    }
    return()=>{cancelled=true;};
    // Each change in the server's role state immediately disables this app's outgoing media.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[onCall,maySpeak,stage.error,kind]);

  useEffect(() => {
    return () => {
      localRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoCall || autoStarted.current) return;
    autoStarted.current = true;
    void joinCall(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCall]);

  useEffect(() => {
    function onAnswer(e: Event) {
      const id = Number((e as CustomEvent).detail);
      if (id !== roomId) return;
      if (onCall || autoStarted.current) return;
      autoStarted.current = true;
      void joinCall(false);
    }
    window.addEventListener(KAMINO_CALL_EVENT, onAnswer);
    return () => window.removeEventListener(KAMINO_CALL_EVENT, onAnswer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, onCall]);

  useEffect(() => {
    if (!onCall) {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => window.clearInterval(id);
  }, [onCall]);

  const connectedNow = live.peers.filter((p) => p.connectionState === "connected").length;

  // DM calls ring for 30s: if nobody joins, show "No answer" instead of "Calling…" forever.
  // (The callee's incoming-call overlay only appears while their app is open, so unanswered
  // calls are common. 30s sits inside the server's 45s incoming-call window.)
  // In LiveKit mode the P2P mesh may never link (strict NAT) while SFU media flows fine,
  // so "answered" comes from subscribed remote SFU tracks instead of P2P connection state.
  useEffect(() => {
    if (kind !== "dm" || !onCall || noAnswer) return;
    if (liveKit ? Object.keys(liveKitStreams).length > 0 : connectedNow > 0) return;
    const t = window.setTimeout(() => setNoAnswer(true), 30_000);
    return () => window.clearTimeout(t);
  }, [kind, onCall, liveKit, liveKitStreams, connectedNow, noAnswer]);

  // WhatsApp-style record keeping: an unanswered DM call leaves "Missed call" in the
  // conversation (server de-duplicates), and a decline by the other side ends the call.
  const missedPosted = useRef(false);
  useEffect(() => {
    if (kind !== "dm" || !noAnswer || missedPosted.current) return;
    missedPosted.current = true;
    void missedCall({ data: roomId }).catch(() => undefined);
  }, [kind, noAnswer, roomId]);
  useEffect(() => {
    if (kind !== "dm") return;
    function onDeclined(e: Event) {
      const declinedRoom = Number((e as CustomEvent).detail);
      if (declinedRoom !== roomId || !onCall) return;
      setNoAnswer(true);
      setErr("Call declined.");
      hangUp();
    }
    window.addEventListener("kamino-call-declined", onDeclined);
    return () => window.removeEventListener("kamino-call-declined", onDeclined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, roomId, onCall]);

  if (!canCall && !screening) return null;

  // In LiveKit mode the P2P mesh may never link (strict NAT) while SFU media flows fine,
  // so connectedness comes from subscribed remote SFU tracks instead of P2P connection state.
  const connected = liveKit ? Object.keys(liveKitStreams).length : connectedNow;
  const failed = live.peers.filter((p) => p.connectionState === "failed");
  const otherName = live.peers[0]?.name ?? peerName ?? "Member";
  const otherHue = peerHue ?? 265;
  const remoteEntries = [
    ...Object.entries(live.streams),
    ...Object.entries(liveKitStreams),
  ].filter(([peerId])=>{
    if(kind==='dm')return true;
    const person=stage.data?.participants.find(p=>rtcPeerId(p.userId)===peerId);
    return !!person&&!person.muted&&(!stage.data?.enabled||person.role==='host'||person.role==='speaker');
  });
  const remoteVideo = remoteEntries.find(([, stream]) =>
    stream.getVideoTracks().some((t) => t.readyState !== "ended"),
  );
  const dmCall = kind === "dm" && onCall;
  // Nothing to show for a DM that isn't in a call when the header has the call button.
  if (kind === "dm" && !showIdleBar && !onCall && !err) return null;

  const pill =
    "k-focus k-hit inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-alt px-3.5 text-[13px] font-bold text-ink transition-colors hover:brightness-[0.97]";

  const controls = (
    <>
      <button
        type="button"
        onClick={toggleMute}
        className={cn(
          "grid size-14 place-items-center rounded-full",
          muted ? "bg-surface-alt text-ink" : "bg-surface text-ink shadow-card",
        )}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
      </button>
      {(kind === "dm" || screening || kind === "voice") && (
        <button
          type="button"
          onClick={() => void toggleCam()}
          className="grid size-14 place-items-center rounded-full bg-surface text-ink shadow-card"
          aria-label={cam ? "Camera off" : "Camera"}
        >
          {cam ? <VideoOff className="size-6" /> : <Video className="size-6" />}
        </button>
      )}
      <button
        type="button"
        onClick={hangUp}
        className="grid size-16 place-items-center rounded-full bg-red-strong text-white shadow-lift"
        aria-label="Hang up"
      >
        <PhoneOff className="size-7" />
      </button>
    </>
  );

  return (
    <div className="space-y-3 px-3 pt-3 lg:px-4">
      {recording.data?.recording ? (
        <div role="status" className="flex items-center gap-2 rounded-card border border-red/40 bg-red/10 px-4 py-2.5 text-sm font-bold text-ink">
          <span className="size-2 animate-pulse rounded-full bg-red-strong" aria-hidden />
          This room is being recorded. By staying in the room you agree to it.
        </div>
      ) : null}
      {screening && (
        <WatchDeck
          live={live}
          selfId={live.selfId}
          initialUrl={watchUrl ?? ""}
          initialTitle={watchTitle ?? ""}
          onWatchSaved={onWatchSaved}
          roomId={roomId}
          isHost={!!stage.data?.host || mine?.role === "host" || !!mine?.cohost}
          participants={stage.data?.participants ?? []}
        />
      )}

      {onCall && kind !== "dm" && (
        <div className="flex flex-wrap gap-2">
          {remoteEntries.map(([id, stream]) => (
            <RemoteMedia
              key={id}
              stream={stream}
              name={live.peers.find((p) => p.id === id)?.name ?? "Member"}
              compact
            />
          ))}
          {cam && (
            <div className="relative h-24 w-36 overflow-hidden rounded-tile bg-surface-alt">
              <video
                ref={previewRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              <p className="absolute bottom-1 left-2 text-[11px] font-extrabold">You</p>
            </div>
          )}
        </div>
      )}

      {dmCall && minimized && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="k-focus flex w-full items-center gap-3 rounded-tile bg-tint-green px-3 py-2 text-left"
        >
          <span className="size-2 rounded-full bg-green" />
          <Face name={otherName} hue={otherHue} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold">{otherName}</span>
            <span className="text-xs text-muted tabular-nums">
              {connected ? formatElapsed(elapsed) : noAnswer ? "No answer" : "Calling…"}
            </span>
          </span>
          <span className="rounded-full bg-green-strong px-3 py-1 text-xs font-bold text-white">
            Return
          </span>
        </button>
      )}

      {dmCall &&
        !minimized &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex flex-col bg-bg text-ink"
            role="dialog"
            aria-label="Call"
          >
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {remoteVideo ? (
                <RemoteMedia stream={remoteVideo[1]!} name={otherName} fill />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-tint-violet),var(--color-bg))]" />
              )}
              <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  className="grid size-11 place-items-center rounded-full bg-surface/70 text-ink shadow-card"
                  aria-label="Hide call"
                >
                  <ChevronDown className="size-5" />
                </button>
                <div className="rounded-full bg-surface/70 px-4 py-1.5 text-center shadow-card">
                  <p className="text-sm font-extrabold text-ink">{otherName}</p>
                  <p className="text-xs font-bold text-green-ink tabular-nums">
                    {connected ? formatElapsed(elapsed) : noAnswer ? "No answer" : "Calling…"}
                  </p>
                </div>
                <span className="size-11" />
              </div>
              {!remoteVideo && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="flex flex-col items-center gap-4">
                    <span className={cn(!connected && "k-ring relative")}>
                      <Face name={otherName} hue={otherHue} size="call" />
                    </span>
                    <p className="text-2xl font-extrabold tracking-[-0.02em] text-ink">
                      {otherName}
                    </p>
                    <p className="text-sm font-bold text-muted">
                      {connected ? "Connected" : noAnswer ? "No answer" : "Calling…"}
                    </p>
                  </div>
                </div>
              )}
              {cam && (
                <div className="absolute right-4 bottom-32 h-36 w-28 overflow-hidden rounded-tile bg-surface-alt shadow-lift">
                  <video
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
              {controls}
            </div>
          </div>,
          document.body,
        )}

      {!dmCall && (onCall || showIdleBar) && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-2.5 shadow-card">
          {onCall ? (
            <>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tint-green px-3 text-xs font-extrabold text-green-ink">
                <span className="size-2 rounded-full bg-green" />
                Live · {connected}/{live.peers.length || 0} linked
              </span>
              <button type="button" onClick={toggleMute} className={pill}>
                {muted ? (
                  <MicOff className="size-4" aria-hidden />
                ) : (
                  <Mic className="size-4" aria-hidden />
                )}
                {muted ? "Unmute" : "Mute"}
              </button>
              {(screening || kind === "voice") && (
                <button type="button" onClick={() => void toggleCam()} className={pill}>
                  {cam ? (
                    <VideoOff className="size-4" aria-hidden />
                  ) : (
                    <Video className="size-4" aria-hidden />
                  )}
                  {cam ? "Camera off" : "Camera"}
                </button>
              )}
              <button
                type="button"
                onClick={hangUp}
                className={cn(pill, "bg-red-strong text-white hover:bg-red-strong")}
              >
                <PhoneOff className="size-4" aria-hidden />
                Hang up
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void joinCall(false)}
              className={cn(pill, "bg-grad-primary text-white shadow-glow hover:brightness-105")}
            >
              {kind === "dm" ? (
                <Phone className="size-4" aria-hidden />
              ) : (
                <Mic className="size-4" aria-hidden />
              )}
              {kind === "dm" ? "Call" : "Join voice"}
            </button>
          )}
          {live.peers.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted"
            >
              <Face name={p.name} hue={210} size="sm" />
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  p.connectionState === "connected"
                    ? "bg-green"
                    : p.connectionState === "failed"
                      ? "bg-red"
                      : "bg-orange",
                )}
              />
              {p.name}
            </span>
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <p className="text-xs text-muted">
          {failed.map((p) => p.name).join(", ")} couldn’t connect — strict networks block some peer
          paths.
        </p>
      )}
      {err ? <p className="text-sm text-danger">{err}</p> : null}
    </div>
  );
}

type EmbeddedPlayerProps = {
  url: string;
  /** Hands the deck a control handle once the player is ready (null on teardown). */
  register: (control: PlayerControl | null) => void;
  /** User-driven play/pause/seek inside the player itself (the deck ignores these while applying synced state). */
  onLocalState: (paused: boolean, at: number) => void;
};

/**
 * Vimeo playback via the player's postMessage protocol ("player.js"): no extra SDK script, the
 * iframe speaks JSON over postMessage both ways once it has loaded.
 */
function VimeoFrame({ url, register, onLocalState }: EmbeddedPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeRef = useRef(0);
  const pausedRef = useRef(true);

  const post = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify(message),
      "https://player.vimeo.com",
    );
  }, []);

  useEffect(() => {
    pausedRef.current = true;
    timeRef.current = 0;
    return () => register(null);
  }, [register, url]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== "https://player.vimeo.com") return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      let data: {
        event?: string;
        method?: string;
        value?: number;
        data?: { seconds?: number; duration?: number };
      };
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data.method === "getCurrentTime" && typeof data.value === "number")
        timeRef.current = data.value;
      if (data.event === "timeupdate" && typeof data.data?.seconds === "number")
        timeRef.current = data.data.seconds;
      if (data.event === "play") {
        pausedRef.current = false;
        onLocalState(false, timeRef.current);
      }
      if (data.event === "pause") {
        pausedRef.current = true;
        onLocalState(true, timeRef.current);
      }
      if (data.event === "seeked" && typeof data.data?.seconds === "number") {
        timeRef.current = data.data.seconds;
        onLocalState(pausedRef.current, data.data.seconds);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onLocalState]);

  useEffect(() => {
    register({
      play: () => post({ method: "play" }),
      pause: () => post({ method: "pause" }),
      seek: (t) => post({ method: "seekTo", value: Math.max(0, t) }),
      now: () => {
        post({ method: "getCurrentTime" });
        return timeRef.current;
      },
    });
  }, [register, post, url]);

  const id = vimeoId(url);
  if (!id)
    return (
      <div className="grid h-full w-full place-items-center text-sm text-muted">
        This Vimeo video can’t be embedded.
      </div>
    );
  return (
    <iframe
      key={url}
      ref={iframeRef}
      src={`https://player.vimeo.com/video/${id}?controls=1&autoplay=0`}
      title="Vimeo player"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      onLoad={() => {
        for (const event of ["play", "pause", "seeked", "timeupdate"])
          post({ method: "addEventListener", value: event });
      }}
      className="h-full w-full"
    />
  );
}

/** Twitch channels and VODs via the official embed SDK (the `parent` domain is required by Twitch). */
function TwitchFrame({ url, register, onLocalState }: EmbeddedPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwitchEmbedPlayer | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    let cancelled = false;
    const source = twitchSource(url);
    if (!source || !host) return;
    void loadTwitch()
      .then(() => {
        if (cancelled || !window.Twitch?.Player) return;
        host.replaceChildren();
        const player = new window.Twitch.Player(host, {
          width: "100%",
          height: "100%",
          autoplay: false,
          parent: window.location.hostname,
          ...("channel" in source ? { channel: source.channel } : { video: source.video }),
        });
        playerRef.current = player;
        player.addEventListener(window.Twitch.Player.READY, () => {
          if (cancelled) return;
          register({
            play: () => player.play(),
            pause: () => player.pause(),
            seek: (t) => player.seek(Math.max(0, t)),
            now: () => player.getCurrentTime?.() ?? 0,
          });
        });
        player.addEventListener("playing", () => {
          if (cancelled) return;
          onLocalState(false, player.getCurrentTime?.() ?? 0);
        });
        player.addEventListener("pause", () => {
          if (cancelled) return;
          onLocalState(true, player.getCurrentTime?.() ?? 0);
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      playerRef.current = null;
      host?.replaceChildren();
      register(null);
    };
  }, [url, register, onLocalState]);

  return <div ref={hostRef} className="h-full w-full" />;
}

type StageParticipant = { userId: string; role: string; cohost?: boolean };

function WatchDeck({
  live,
  selfId,
  initialUrl,
  initialTitle,
  onWatchSaved,
  roomId,
  isHost,
  participants,
}: {
  live: ReturnType<typeof useLiveRoom>;
  selfId: string;
  initialUrl: string;
  initialTitle: string;
  onWatchSaved?: (url: string, title: string) => void;
  roomId: number;
  isHost: boolean;
  participants: StageParticipant[];
}) {
  const queryClient = useQueryClient();
  const first = SHELF[0]!;
  const [url, setUrl] = useState(initialUrl || first.url);
  const [title, setTitle] = useState(initialTitle || first.title);
  const [kind, setKind] = useState<ShelfKind>(
    youtubeId(initialUrl) ? "youtube" : vimeoId(initialUrl) ? "vimeo" : twitchSource(initialUrl) ? "twitch" : "mp4",
  );
  const [paused, setPaused] = useState(true);
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [readyPrompt, setReadyPrompt] = useState<number | null>(null);
  // Host-authoritative control: only hosts/co-hosts claim the controller seat. Everyone else
  // starts as a follower and ignores watch state from anyone the server says is not a host.
  const controller = useRef<string | null>(isHost ? selfId : null);
  const applying = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytHost = useRef<HTMLDivElement>(null);
  const yt = useRef<YtPlayer | null>(null);
  const control = useRef<PlayerControl | null>(null);
  const atRef = useRef(0);
  const emitRef = useRef<(next?: Partial<WatchWire>) => void>(() => undefined);
  const snapped = useRef(new Set<string>());

  const emit = useCallback(
    (next: Partial<WatchWire> = {}) => {
      if (!isHost) return;
      const msg: WatchWire = {
        t: "watch",
        url,
        title,
        kind,
        paused,
        at: atRef.current,
        ts: Date.now(),
        by: selfId,
        ...next,
      };
      controller.current = selfId;
      live.send(msg);
    },
    [live, url, title, kind, paused, selfId, isHost],
  );
  emitRef.current = emit;

  useEffect(() => {
    return live.onMessage((from, data) => {
      const raw = data as { t?: string } | undefined;
      if (!raw) return;
      if (raw.t === "watch-hello") {
        if (controller.current === selfId) emitRef.current({ at: atRef.current });
        return;
      }
      if (raw.t === "ready-check") {
        const round = Number((raw as { round?: unknown }).round ?? 0);
        if (Number.isFinite(round) && round > 0) setReadyPrompt(round);
        return;
      }
      const msg = data as WatchWire | undefined;
      if (!msg || msg.t !== "watch") return;
      // The data channel gives us the real sender; the payload's `by` is a claim that must match
      // it. Only senders the server says are hosts/co-hosts may drive everyone's player.
      if (msg.by !== from) return;
      const sender = participants.find((candidate) => rtcPeerId(candidate.userId) === from);
      const senderMayControl =
        !!sender && (sender.role === "host" || sender.role === "cohost" || !!sender.cohost);
      if (!senderMayControl) return;
      controller.current = from;
      applying.current = true;
      if (msg.url !== url) {
        setUrl(msg.url);
        setTitle(msg.title);
        setKind(msg.kind);
      }
      setPaused(msg.paused);
      atRef.current = msg.at;
      const driftClock = msg.paused ? msg.at : msg.at + (Date.now() - msg.ts) / 1000;
      const vid = videoRef.current;
      if (msg.kind === "mp4" && vid) {
        if (Math.abs(vid.currentTime - driftClock) > 1.2) vid.currentTime = Math.max(0, driftClock);
        if (msg.paused) void vid.pause();
        else void vid.play().catch(() => undefined);
      }
      if (msg.kind === "youtube" && yt.current) {
        const now = yt.current.getCurrentTime?.() ?? 0;
        if (Math.abs(now - driftClock) > 1.2) yt.current.seekTo(Math.max(0, driftClock), true);
        if (msg.paused) yt.current.pauseVideo();
        else yt.current.playVideo();
      }
      if ((msg.kind === "vimeo" || msg.kind === "twitch") && control.current) {
        const now = control.current.now();
        if (Math.abs(now - driftClock) > 1.5) control.current.seek(Math.max(0, driftClock));
        if (msg.paused) control.current.pause();
        else control.current.play();
      }
      window.setTimeout(() => {
        applying.current = false;
      }, 400);
    });
  }, [live, url, selfId, participants]);

  useEffect(() => {
    if (!live.joined) return;
    live.send({ t: "watch-hello" });
  }, [live.joined, live.send]);

  useEffect(() => {
    if (controller.current !== selfId) return;
    for (const p of live.peers) {
      if (p.connectionState !== "connected" || snapped.current.has(p.id)) continue;
      snapped.current.add(p.id);
      live.send(
        {
          t: "watch",
          url,
          title,
          kind,
          paused,
          at: atRef.current,
          ts: Date.now(),
          by: selfId,
        } satisfies WatchWire,
        p.id,
      );
    }
  }, [live.peers, live.send, url, title, kind, paused, selfId]);

  useEffect(() => {
    if (kind !== "youtube") {
      yt.current?.destroy();
      yt.current = null;
      return;
    }
    const id = youtubeId(url);
    if (!id || !ytHost.current) return;
    let cancelled = false;
    void loadYt().then(() => {
      if (cancelled || !window.YT?.Player || !ytHost.current) return;
      yt.current?.destroy();
      yt.current = new window.YT.Player(ytHost.current, {
        videoId: id,
        playerVars: { rel: 0, modestbranding: 1, origin: window.location.origin },
        events: {
          onStateChange: (e) => {
            if (applying.current) return;
            const playing = e.data === window.YT?.PlayerState?.PLAYING;
            const pausedNow = e.data === window.YT?.PlayerState?.PAUSED;
            if (playing || pausedNow) {
              atRef.current = yt.current?.getCurrentTime() ?? 0;
              setPaused(!playing);
              emitRef.current({ paused: !playing, at: atRef.current });
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [kind, url]);

  useEffect(() => {
    if (!live.joined) return;
    if (!isHost) return;
    const id = window.setInterval(() => {
      if (controller.current !== selfId) return;
      if (kind === "mp4" && videoRef.current) atRef.current = videoRef.current.currentTime;
      if (kind === "youtube" && yt.current)
        atRef.current = yt.current.getCurrentTime() ?? atRef.current;
      if ((kind === "vimeo" || kind === "twitch") && control.current)
        atRef.current = control.current.now();
      emitRef.current({ at: atRef.current, paused });
    }, 2000);
    return () => window.clearInterval(id);
  }, [live.joined, paused, kind, selfId, isHost]);

  function loadFilm(next: { url: string; title: string; kind: ShelfKind }) {
    setUrl(next.url);
    setTitle(next.title);
    setKind(next.kind);
    setPaused(false);
    atRef.current = 0;
    if (isHost) {
      onWatchSaved?.(next.url, next.title);
      emit({ ...next, paused: false, at: 0, ts: Date.now(), by: selfId });
    }
  }

  // Stable callbacks for the embedded players: they register a control handle once ready and
  // report local play/pause/seek, which is ignored while synced state is being applied.
  const localStateRef = useRef<(paused: boolean, at: number) => void>(() => undefined);
  localStateRef.current = (nextPaused, at) => {
    if (applying.current) return;
    setPaused(nextPaused);
    atRef.current = at;
    emitRef.current({ paused: nextPaused, at });
  };
  const onPlayerState = useCallback((p: boolean, at: number) => localStateRef.current(p, at), []);
  const registerControl = useCallback((c: PlayerControl | null) => {
    control.current = c;
  }, []);

  const queue = useQuery({
    queryKey: ["watch-queue", roomId],
    queryFn: () => listWatchQueue({ data: roomId }),
    refetchInterval: 5000,
  });
  const readyCheck = useQuery({
    queryKey: ["watch-ready", roomId],
    queryFn: () => listWatchReady({ data: roomId }),
    refetchInterval: readyPrompt === null ? 8000 : 2500,
  });

  const refreshQueue = () => void queryClient.invalidateQueries({ queryKey: ["watch-queue", roomId] });
  const addToQueue = useMutation({
    mutationFn: (value: string) => addWatchQueueItem({ data: { roomId, url: value } }),
    onSuccess: () => {
      setPaste("");
      setNote(null);
      refreshQueue();
    },
    onError: (e) => setNote(e instanceof Error ? e.message : "Could not add that video."),
  });
  const voteItem = useMutation({
    mutationFn: (id: number) => voteWatchQueueItem({ data: id }),
    onSuccess: refreshQueue,
  });
  const removeItem = useMutation({
    mutationFn: (id: number) => removeWatchQueueItem({ data: id }),
    onSuccess: refreshQueue,
  });
  const playItem = useMutation({
    mutationFn: (id: number) => playWatchQueueItem({ data: id }),
    onSuccess: (played) => {
      refreshQueue();
      loadFilm({ url: played.url, title: played.title, kind: played.kind as ShelfKind });
    },
    onError: (e) => setNote(e instanceof Error ? e.message : "Could not play that item."),
  });
  const emptyQueue = useMutation({
    mutationFn: () => clearWatchQueue({ data: roomId }),
    onSuccess: refreshQueue,
  });
  const startReady = useMutation({
    mutationFn: () => startWatchReadyCheck({ data: roomId }),
    onSuccess: (started) => {
      setReadyPrompt(started.round);
      live.send({ t: "ready-check", round: started.round });
    },
  });
  const markReady = useMutation({
    mutationFn: (round: number) => setWatchReady({ data: { roomId, round } }),
    onSuccess: () => {
      setReadyPrompt(null);
      void queryClient.invalidateQueries({ queryKey: ["watch-ready", roomId] });
    },
  });

  const readyRound = readyCheck.data?.round ?? 0;
  const readyEntries = readyCheck.data?.entries ?? [];
  const myReady = readyEntries.find((e) => e.mine)?.ready ?? false;
  const readyCount = readyEntries.filter((e) => e.ready).length;
  const waiting = readyEntries.filter((e) => !e.ready).map((e) => e.name);

  const smallPill =
    "k-focus k-hit inline-flex h-7 items-center gap-1 rounded-full bg-surface-alt px-2.5 text-xs font-bold text-ink transition-colors hover:brightness-[0.97] disabled:opacity-50";

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="relative aspect-video bg-surface-alt">
        {kind === "mp4" ? (
          <video
            ref={videoRef}
            key={url}
            src={url}
            className="h-full w-full object-contain"
            controls
            playsInline
            onPlay={() => {
              if (applying.current) return;
              setPaused(false);
              atRef.current = videoRef.current?.currentTime ?? 0;
              emit({ paused: false, at: atRef.current });
            }}
            onPause={() => {
              if (applying.current) return;
              setPaused(true);
              atRef.current = videoRef.current?.currentTime ?? 0;
              emit({ paused: true, at: atRef.current });
            }}
            onSeeked={() => {
              if (applying.current) return;
              atRef.current = videoRef.current?.currentTime ?? 0;
              emit({ at: atRef.current });
            }}
          />
        ) : kind === "youtube" ? (
          <div ref={ytHost} className="h-full w-full" />
        ) : kind === "vimeo" ? (
          <VimeoFrame url={url} register={registerControl} onLocalState={onPlayerState} />
        ) : (
          <TwitchFrame url={url} register={registerControl} onLocalState={onPlayerState} />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-bg/80 to-transparent px-4 py-3">
          <p className="text-[11px] font-extrabold tracking-[0.16em] text-violet uppercase">
            Watch party
          </p>
          <p className="text-lg font-extrabold text-ink">{title}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted">
          Play, pause, and seek stay in lockstep. Netflix’s catalog can’t stream here — pick an open
          film, or paste YouTube, Vimeo, or Twitch.
        </p>
        <div className="flex gap-3 overflow-x-auto pb-1 k-scroll">
          {SHELF.map((film) => (
            <button
              key={film.id}
              type="button"
              onClick={() => loadFilm(film)}
              className={cn(
                "w-32 shrink-0 overflow-hidden rounded-2xl text-left shadow-border",
                url === film.url && "outline outline-2 outline-accent",
              )}
            >
              <img src={film.poster} alt="" className="h-20 w-full object-cover" />
              <span className="block px-2 py-1.5">
                <span className="block truncate text-xs font-extrabold">{film.title}</span>
                <span className="block text-[10px] text-subtle">
                  {film.year} · {film.tagline}
                </span>
              </span>
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseWatchInput(paste);
            if ("error" in parsed) {
              setNote(parsed.error);
              return;
            }
            setNote(null);
            loadFilm({ url: parsed.url, title: parsed.title, kind: parsed.kind });
            setPaste("");
          }}
        >
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste a YouTube, Vimeo, or Twitch link"
            aria-label="Video link"
            className="k-focus h-11 flex-1 rounded-full bg-surface-alt px-4 text-[16px] text-ink outline-none placeholder:text-[14px] placeholder:text-subtle lg:text-[15px]"
          />
          <button
            type="button"
            onClick={() => {
              if (!paste.trim()) return;
              addToQueue.mutate(paste.trim());
            }}
            disabled={addToQueue.isPending || !paste.trim()}
            className="k-focus h-11 rounded-full bg-surface-alt px-4 text-[14px] font-bold text-ink disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-4" aria-hidden />
              Queue
            </span>
          </button>
          <button
            type="submit"
            className="k-focus h-11 rounded-full bg-grad-primary px-5 text-[14px] font-bold text-white shadow-glow"
          >
            <span className="inline-flex items-center gap-1.5">
              <Play className="size-4" aria-hidden />
              Play
            </span>
          </button>
        </form>
        {note ? <p className="text-sm text-warn">{note}</p> : null}

        {(queue.data?.items.length ?? 0) > 0 && (
          <div className="rounded-tile border border-border bg-surface-alt/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-extrabold tracking-[0.14em] text-muted uppercase">
                Up next · voted by everyone
              </p>
              {isHost && (
                <button
                  type="button"
                  onClick={() => emptyQueue.mutate()}
                  className="text-xs font-bold text-subtle hover:text-danger"
                >
                  Clear
                </button>
              )}
            </div>
            <ul className="space-y-1.5">
              {queue.data?.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2">
                  <button
                    type="button"
                    onClick={() => voteItem.mutate(item.id)}
                    aria-label={item.mine ? "Remove your vote" : "Vote for this"}
                    aria-pressed={item.mine}
                    className={cn(
                      "k-focus flex h-8 flex-col items-center justify-center rounded-xl px-2 text-[11px] font-extrabold leading-none",
                      item.mine ? "bg-grad-primary text-white" : "bg-surface-alt text-muted",
                    )}
                  >
                    <ThumbsUp className="mb-0.5 size-3" aria-hidden />
                    {item.votes}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-ink">
                      {item.title}
                    </span>
                    <span className="block truncate text-[11px] text-subtle">
                      {item.kind} · added by {item.mineAdded ? "you" : item.addedName}
                    </span>
                  </span>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => playItem.mutate(item.id)}
                      disabled={playItem.isPending}
                      className={smallPill}
                    >
                      <Play className="size-3.5" aria-hidden />
                      Play
                    </button>
                  )}
                  {(item.mineAdded || isHost) && (
                    <button
                      type="button"
                      onClick={() => removeItem.mutate(item.id)}
                      aria-label="Remove from queue"
                      className="k-focus grid size-7 place-items-center rounded-full text-subtle hover:text-danger"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => startReady.mutate()}
            disabled={startReady.isPending}
            className={smallPill}
          >
            Ready check
          </button>
          {readyRound > 0 && readyEntries.length > 0 && (
            <span className="text-xs font-bold text-muted">
              {readyCount}/{readyEntries.length} ready
              {waiting.length > 0 ? ` · waiting on ${waiting.join(", ")}` : " · everyone is set"}
            </span>
          )}
        </div>
      </div>

      {readyPrompt !== null && !myReady && (
        <div className="flex items-center gap-3 border-t border-border bg-tint-violet px-4 py-3">
          <p className="min-w-0 flex-1 text-sm font-extrabold text-ink">
            Ready check! Everyone set to press play?
          </p>
          <button
            type="button"
            onClick={() => markReady.mutate(readyPrompt)}
            disabled={markReady.isPending}
            className="k-focus h-9 rounded-full bg-grad-primary px-4 text-[13px] font-bold text-white shadow-glow"
          >
            I’m ready
          </button>
          <button
            type="button"
            onClick={() => setReadyPrompt(null)}
            aria-label="Dismiss ready check"
            className="k-focus grid size-9 place-items-center rounded-full text-muted hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
