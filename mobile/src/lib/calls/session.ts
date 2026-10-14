/**
 * A live call from the phone: audio (and optionally video) between everyone who joined a chat room.
 *
 * It speaks the same little protocol as the website (`/api/rtc`: a roster poll plus offers, answers and network
 * candidates relayed by the server), so phones and browsers can be in the same call. Every pair of people gets its own
 * direct connection; the server only introduces them.
 *
 * The WebRTC classes and `fetch` are handed in, which keeps this file free of native code. That is what lets the unit
 * tests run it here with pretend connections, and lets the app skip calls gracefully where the native part is missing
 * (Expo Go).
 *
 * Negotiation follows the "perfect negotiation" pattern, like the website: when both sides offer at the same moment,
 * the "polite" one (the smaller id) steps back, so a pair can never get stuck.
 */

export type SignalKind = "offer" | "answer" | "ice";

/** The few members of a WebRTC connection that this file uses. The real `RTCPeerConnection` satisfies it. */
export interface ChannelLike {
  label: string;
  readyState: string;
  send(data: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}
export interface TrackLike {
  kind: string;
  enabled: boolean;
  stop(): void;
}
export interface StreamLike {
  getTracks(): TrackLike[];
  getVideoTracks(): TrackLike[];
  getAudioTracks(): TrackLike[];
}
export interface PeerConnectionLike {
  connectionState: string;
  signalingState: string;
  localDescription: { toJSON(): unknown } | null;
  remoteDescription: unknown;
  onicecandidate: ((event: { candidate: { toJSON(): unknown } | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  onnegotiationneeded: (() => void) | null;
  ondatachannel: ((event: { channel: ChannelLike }) => void) | null;
  ontrack: ((event: { streams: StreamLike[]; track: TrackLike }) => void) | null;
  setLocalDescription(description?: unknown): Promise<void>;
  setRemoteDescription(description: unknown): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  addTrack(track: TrackLike, stream: StreamLike): unknown;
  removeTrack(sender: unknown): void;
  getSenders(): { track: TrackLike | null }[];
  createDataChannel(label: string, init?: { ordered?: boolean; maxRetransmits?: number }): ChannelLike;
  restartIce(): void;
  close(): void;
}

export interface RtcApi {
  createConnection(config: { iceServers: unknown[] }): PeerConnectionLike;
  createCandidate(init: unknown): unknown;
}

export interface PeerState {
  id: string;
  name: string;
  /** "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed" */
  state: string;
}

export interface CallOptions {
  api: RtcApi;
  /** e.g. "https://kamino.example.com" */
  baseUrl: string;
  token: () => string | null;
  fetch: typeof fetch;
  roomKey: string;
  selfId: string;
  name: string;
  iceServers?: unknown[];
  localStream?: StreamLike | null;
  onPeers?: (peers: PeerState[]) => void;
  onRemoteStream?: (peerId: string, stream: StreamLike) => void;
  onConnected?: () => void;
  /** The call cannot continue (signed out, no longer allowed in the room). */
  onEnded?: (reason: string) => void;
  /** Turn the timers off (tests drive `pollOnce` by hand). */
  autoPoll?: boolean;
}

interface Slot {
  pc: PeerConnectionLike;
  name: string;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: unknown[];
  lastProgressAt: number;
  recoveryAttempts: number;
  terminal: boolean;
  state?: ChannelLike;
  reliable?: ChannelLike;
  connectionState: string;
}

const FAST_POLL_MS = 400;
const IDLE_POLL_MS = 2000;
const WATCHDOG_MS = 2000;
const STALL_MS = 10_000;
const MAX_RECOVERY_ATTEMPTS = 3;
const SIGNAL_RETRY_DELAYS_MS = [250, 750];

export class CallSession {
  private readonly o: CallOptions;
  private readonly peers = new Map<string, Slot>();
  private readonly signalQueues = new Map<string, Promise<void>>();
  private cursor = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private everPolled = false;
  private lastFingerprint = "";
  private localStream: StreamLike | null;

  constructor(options: CallOptions) {
    this.o = options;
    this.localStream = options.localStream ?? null;
  }

  /** Joining is the first poll: it puts this phone on the roster. A failed first poll is simply retried. */
  async join(): Promise<void> {
    try {
      await this.pollOnce();
    } catch {
      /* the loop below retries */
    }
    if (this.closed || this.o.autoPoll === false) return;
    this.schedulePoll();
    this.watchdogTimer = setInterval(() => this.watchdog(), WATCHDOG_MS);
  }

  /** Leaves the call: closes every connection and tells the server, so the others drop this phone straight away. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    for (const slot of this.peers.values()) slot.pc.close();
    this.peers.clear();
    void this.o
      .fetch(`${this.o.baseUrl}/api/rtc`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify({ op: "leave", room: this.o.roomKey, peer: this.o.selfId }),
      })
      .catch(() => undefined);
  }

  peerList(): PeerState[] {
    return [...this.peers.entries()].map(([id, slot]) => ({ id, name: slot.name, state: slot.connectionState }));
  }

  /**
   * Swaps the phone's own microphone/camera. Adding or removing tracks makes each connection renegotiate.
   * To mute, flip `track.enabled` instead of calling this.
   */
  setLocalStream(stream: StreamLike | null): void {
    const previous = this.localStream;
    this.localStream = stream;
    for (const slot of this.peers.values()) {
      if (previous) {
        const old = previous.getTracks();
        for (const sender of slot.pc.getSenders()) {
          if (sender.track && old.includes(sender.track)) {
            try {
              slot.pc.removeTrack(sender);
            } catch {
              /* already gone */
            }
          }
        }
      }
      if (stream) for (const track of stream.getTracks()) slot.pc.addTrack(track, stream);
    }
  }

  // ── talking to the server ────────────────────────────────────────────────

  private headers(json: boolean): Record<string, string> {
    const token = this.o.token();
    return { ...(json ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
  }

  /** One round of "who is here, and did anyone send me something?". Public so tests can step through a call. */
  async pollOnce(): Promise<void> {
    const params = new URLSearchParams({ room: this.o.roomKey, peer: this.o.selfId, name: this.o.name, since: String(this.cursor) });
    const res = await this.o.fetch(`${this.o.baseUrl}/api/rtc?${params.toString()}`, { headers: this.headers(false) });
    if (this.closed) return;
    if (res.status === 401 || res.status === 403) {
      this.end(res.status === 401 ? "You were signed out." : "You can't join this call.");
      return;
    }
    if (!res.ok) throw new Error(`signaling poll failed: ${res.status}`);
    const body = (await res.json()) as { peers: { id: string; name: string }[]; signals: { id: number; from: string; kind: SignalKind; payload: unknown }[] };
    if (this.closed) return;
    if (!this.everPolled) {
      this.everPolled = true;
      this.o.onConnected?.();
    }
    this.reconcileRoster(body.peers);
    const roster = new Set(body.peers.map((p) => p.id));
    for (const signal of body.signals) {
      this.cursor = Math.max(this.cursor, signal.id);
      await this.onSignal(signal.from, signal.kind, signal.payload, roster);
      if (this.closed) return;
    }
  }

  private end(reason: string): void {
    this.close();
    this.o.onEnded?.(reason);
  }

  private schedulePoll(): void {
    if (this.closed || this.o.autoPoll === false) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      void this.pollOnce()
        .catch(() => undefined) // a dropped connection for a moment is normal on a phone; try again
        .finally(() => this.schedulePoll());
    }, this.anyConnecting() ? FAST_POLL_MS : IDLE_POLL_MS);
  }

  private anyConnecting(): boolean {
    for (const slot of this.peers.values()) if (!slot.terminal && slot.connectionState !== "connected") return true;
    return false;
  }

  private reconcileRoster(roster: { id: string; name: string }[]): void {
    const alive = new Set(roster.map((p) => p.id));
    for (const person of roster) {
      if (person.id === this.o.selfId) continue;
      const existing = this.peers.get(person.id);
      if (existing) existing.name = person.name;
      // Exactly one side of each pair dials; the other waits for the offer.
      else this.connectTo(person.id, person.name, this.o.selfId > person.id);
    }
    for (const [id, slot] of this.peers) {
      if (!alive.has(id)) {
        slot.pc.close();
        this.peers.delete(id);
      }
    }
    this.emitPeers();
  }

  // ── one connection per person ────────────────────────────────────────────

  private connectTo(peerId: string, name: string, initiator: boolean): Slot | null {
    if (this.closed) return null;
    const pc = this.o.api.createConnection({ iceServers: this.o.iceServers ?? DEFAULT_ICE });
    const slot: Slot = {
      pc,
      name,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      lastProgressAt: Date.now(),
      recoveryAttempts: 0,
      terminal: false,
      connectionState: pc.connectionState,
    };
    this.peers.set(peerId, slot);

    pc.onicecandidate = (event) => {
      if (event.candidate) void this.sendSignal(peerId, "ice", event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      slot.connectionState = pc.connectionState;
      if (pc.connectionState === "connecting" || pc.connectionState === "connected") slot.lastProgressAt = Date.now();
      if (pc.connectionState === "connected") {
        slot.recoveryAttempts = 0;
        slot.terminal = false;
      }
      this.emitPeers();
      // A failed path triggers a fresh offer through the server, so one lost message cannot leave a pair stuck.
      if (pc.connectionState === "failed") pc.restartIce();
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") this.schedulePoll();
    };
    pc.onnegotiationneeded = () => {
      void (async () => {
        try {
          slot.makingOffer = true;
          await pc.setLocalDescription();
          await this.sendSignal(peerId, "offer", pc.localDescription!.toJSON());
        } catch {
          /* retried on the next negotiationneeded */
        } finally {
          slot.makingOffer = false;
        }
      })();
    };
    pc.ondatachannel = (event) => this.attachChannel(slot, event.channel);
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) this.o.onRemoteStream?.(peerId, stream);
    };
    if (this.localStream) for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);

    if (initiator) {
      // The website opens these two channels too. Creating them is also what starts the first offer when there is no
      // microphone yet.
      this.attachChannel(slot, pc.createDataChannel("state", { ordered: false, maxRetransmits: 0 }));
      this.attachChannel(slot, pc.createDataChannel("reliable", { ordered: true }));
    }
    return slot;
  }

  private attachChannel(slot: Slot, channel: ChannelLike): void {
    if (channel.label === "state") slot.state = channel;
    else slot.reliable = channel;
    channel.onopen = () => {
      slot.lastProgressAt = Date.now();
    };
    channel.onmessage = (event) => {
      // The website measures the delay with ping/pong. Answering keeps its "connection quality" display working.
      try {
        const message = JSON.parse(String(event.data)) as { t?: string };
        if (message.t === "ping" && slot.state?.readyState === "open") slot.state.send(JSON.stringify({ t: "pong" }));
      } catch {
        /* not for us */
      }
    };
  }

  private async flushCandidates(slot: Slot): Promise<void> {
    while (slot.pendingCandidates.length > 0) {
      const candidate = slot.pendingCandidates.shift();
      try {
        await slot.pc.addIceCandidate(this.o.api.createCandidate(candidate));
      } catch {
        /* a stale candidate is harmless */
      }
      if (this.closed) return;
    }
  }

  private async onSignal(from: string, kind: SignalKind, payload: unknown, roster: Set<string>): Promise<void> {
    if (this.closed) return;
    let slot = this.peers.get(from);
    if (!slot) {
      // Only listen to people the roster vouches for; signals can outlive membership.
      if (!roster.has(from)) return;
      const created = this.connectTo(from, "", false);
      if (!created) return;
      slot = created;
    }
    const polite = this.o.selfId < from;
    try {
      if (kind === "offer" || kind === "answer") {
        const collision = kind === "offer" && (slot.makingOffer || slot.pc.signalingState !== "stable");
        slot.ignoreOffer = !polite && collision;
        if (slot.ignoreOffer) return;
        try {
          await slot.pc.setRemoteDescription(payload);
        } catch (error) {
          // A connection that woke from sleep can refuse any new offer. Rebuild it once and apply the same offer.
          if (kind !== "offer") throw error;
          const { name, recoveryAttempts } = slot;
          slot.pc.close();
          this.peers.delete(from);
          const fresh = this.connectTo(from, name, false);
          if (!fresh) return;
          fresh.recoveryAttempts = recoveryAttempts;
          slot = fresh;
          await slot.pc.setRemoteDescription(payload);
        }
        if (this.closed) return;
        await this.flushCandidates(slot);
        if (this.closed) return;
        if (kind === "offer") {
          await slot.pc.setLocalDescription();
          if (this.closed) return;
          await this.sendSignal(from, "answer", slot.pc.localDescription!.toJSON());
        }
      } else if (kind === "ice") {
        if (!slot.pc.remoteDescription) {
          // The candidate arrived before its offer; keep it until the offer lands.
          slot.pendingCandidates.push(payload);
          return;
        }
        try {
          await slot.pc.addIceCandidate(this.o.api.createCandidate(payload));
        } catch {
          /* ignored, like on the website */
        }
      }
    } catch {
      /* negotiation problems settle on the next offer */
    }
  }

  /** Signals to one person go out in order (a candidate must never overtake its offer) and are retried briefly. */
  private sendSignal(to: string, kind: SignalKind, payload: unknown): Promise<void> {
    const previous = this.signalQueues.get(to) ?? Promise.resolve();
    const next = previous.then(() => this.postSignal(to, kind, payload));
    this.signalQueues.set(to, next.catch(() => undefined));
    return next;
  }

  private async postSignal(to: string, kind: SignalKind, payload: unknown): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      if (this.closed) return;
      try {
        const res = await this.o.fetch(`${this.o.baseUrl}/api/rtc`, {
          method: "POST",
          headers: this.headers(true),
          body: JSON.stringify({ op: "signal", room: this.o.roomKey, from: this.o.selfId, to, kind, payload }),
        });
        if (res.ok) return;
        throw new Error(`signal failed: ${res.status}`);
      } catch {
        if (attempt >= SIGNAL_RETRY_DELAYS_MS.length) return; // the pair recovers on the next offer
        await new Promise((resolve) => setTimeout(resolve, SIGNAL_RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  /**
   * Stuck-connection recovery. A pair that has made no progress for 10 seconds is rebuilt from scratch by whichever side
   * dials it, up to three times; after that it is marked as given up and no longer slows the polling down.
   */
  watchdog(): void {
    if (this.closed) return;
    const now = Date.now();
    for (const [peerId, slot] of this.peers) {
      const live = slot.pc.connectionState;
      if (live !== slot.connectionState) {
        slot.connectionState = live;
        if (live === "connecting" || live === "connected") slot.lastProgressAt = now;
        this.emitPeers();
      }
      if (slot.terminal || live === "connected") continue;
      if (now - slot.lastProgressAt <= STALL_MS) continue;
      if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        slot.terminal = true;
        this.emitPeers();
        continue;
      }
      slot.recoveryAttempts += 1;
      slot.lastProgressAt = now;
      if (this.o.selfId > peerId) {
        const { name, recoveryAttempts } = slot;
        slot.pc.close();
        this.peers.delete(peerId);
        const fresh = this.connectTo(peerId, name, true);
        if (fresh) fresh.recoveryAttempts = recoveryAttempts;
        this.schedulePoll();
      }
    }
  }

  private emitPeers(): void {
    const list = this.peerList();
    const fingerprint = JSON.stringify(list.map((p) => [p.id, p.name, p.state]));
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;
    this.o.onPeers?.(list);
  }
}

/** Free public STUN servers, used when the server cannot be asked for its own list. */
export const DEFAULT_ICE: unknown[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
