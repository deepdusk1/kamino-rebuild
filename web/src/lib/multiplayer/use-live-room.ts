import { useCallback, useEffect, useRef, useState } from "react";
import { getIceServers } from "@/lib/kamino/extras";
import { P2PRoom, type PeerInfo } from "./p2p";

export function rtcPeerId(userId: string): string {
  const id = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return id || "peer";
}

export function rtcRoomKey(roomId: number): string {
  return `k-live-${roomId}`.slice(0, 64);
}

export type LiveMessage = (from: string, data: unknown, channel: "state" | "reliable") => void;

export function useLiveRoom({
  roomKey,
  selfId,
  name,
  enabled,
}: {
  roomKey: string;
  selfId: string;
  name: string;
  enabled: boolean;
}) {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [joined, setJoined] = useState(false);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const roomRef = useRef<P2PRoom | null>(null);
  const listeners = useRef(new Set<LiveMessage>());

  useEffect(() => {
    if (!enabled) {
      setPeers([]);
      setJoined(false);
      setStreams({});
      return;
    }
    let cancelled = false;
    let p2p: P2PRoom | null = null;

    void (async () => {
      // Ask the server for the network servers (this includes the relay login on strict networks).
      // If that fails, the built-in free STUN servers are used.
      const iceServers = await getIceServers().catch(() => undefined);
      if (cancelled) return;
      p2p = new P2PRoom({
        room: roomKey,
        selfId,
        name,
        iceServers,
        onPeersChanged: (list) => {
          setPeers(list);
          const alive = new Set(list.map((p) => p.id));
          setStreams((prev) => {
            let changed = false;
            const next: Record<string, MediaStream> = {};
            for (const [id, stream] of Object.entries(prev)) {
              if (alive.has(id)) next[id] = stream;
              else changed = true;
            }
            return changed ? next : prev;
          });
        },
        onMessage: (from, data, channel) => {
          for (const fn of listeners.current) fn(from, data, channel);
        },
        onTrack: (from, stream) => {
          setStreams((prev) => (prev[from] === stream ? prev : { ...prev, [from]: stream }));
        },
        onConnected: () => setJoined(true),
      });
      roomRef.current = p2p;
      void p2p.join();
    })();

    return () => {
      cancelled = true;
      roomRef.current = null;
      p2p?.close();
    };
  }, [enabled, roomKey, selfId, name]);

  const broadcast = useCallback((data: unknown) => roomRef.current?.broadcast(data), []);
  const send = useCallback((data: unknown, peerId?: string) => roomRef.current?.send(data, peerId), []);
  const onMessage = useCallback((fn: LiveMessage) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  const setLocalStream = useCallback((stream: MediaStream | null) => {
    roomRef.current?.setLocalStream(stream);
  }, []);

  return { selfId, room: roomKey, peers, joined, streams, broadcast, send, onMessage, setLocalStream };
}
