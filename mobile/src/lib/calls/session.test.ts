import assert from "node:assert/strict";
import { test } from "node:test";
import { CallSession, type ChannelLike, type PeerConnectionLike, type RtcApi, type SignalKind } from "./session.ts";

/** A pretend WebRTC connection that records what the call engine asks of it. */
class FakePc implements PeerConnectionLike {
  connectionState = "new";
  signalingState = "stable";
  localDescription: { toJSON(): unknown } | null = null;
  remoteDescription: unknown = null;
  onicecandidate: PeerConnectionLike["onicecandidate"] = null;
  onconnectionstatechange: (() => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  ondatachannel: PeerConnectionLike["ondatachannel"] = null;
  ontrack: PeerConnectionLike["ontrack"] = null;
  channels: string[] = [];
  remote: unknown[] = [];
  candidates: unknown[] = [];
  closed = false;
  restarted = false;
  negotiationQueued = false;
  async setLocalDescription() {
    const type = this.signalingState === "have-remote-offer" ? "answer" : "offer";
    this.localDescription = { toJSON: () => ({ type, sdp: "fake-sdp" }) };
  }
  async setRemoteDescription(description: unknown) {
    this.remote.push(description);
    this.remoteDescription = description;
    this.signalingState = (description as { type: string }).type === "offer" ? "have-remote-offer" : "stable";
  }
  async addIceCandidate(candidate: unknown) {
    this.candidates.push(candidate);
  }
  addTrack() {
    return {};
  }
  removeTrack() {}
  getSenders() {
    return [];
  }
  createDataChannel(label: string): ChannelLike {
    this.channels.push(label);
    // Like a real connection, several changes in a row lead to a single "negotiation needed".
    if (!this.negotiationQueued) {
      this.negotiationQueued = true;
      queueMicrotask(() => this.onnegotiationneeded?.());
    }
    return { label, readyState: "connecting", send() {}, onopen: null, onmessage: null };
  }
  restartIce() {
    this.restarted = true;
  }
  close() {
    this.closed = true;
  }
}

type Sent = { url: string; method: string; body: Record<string, unknown> | null };

function setup(selfId: string, opts: { status?: number } = {}) {
  const pcs: FakePc[] = [];
  const sent: Sent[] = [];
  let roster: { id: string; name: string }[] = [];
  let signals: { id: number; from: string; kind: SignalKind; payload: unknown }[] = [];
  const fakeFetch = (async (url: string, init?: { method?: string; body?: string }) => {
    if (!init?.method || init.method === "GET") {
      sent.push({ url, method: "GET", body: null });
      if (opts.status && opts.status !== 200) return { ok: false, status: opts.status, json: async () => ({}) };
      const body = { peers: roster, signals };
      signals = [];
      return { ok: true, status: 200, json: async () => body };
    }
    sent.push({ url, method: init.method, body: JSON.parse(init.body ?? "null") });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }) as unknown as typeof fetch;
  const api: RtcApi = {
    createConnection: () => {
      const pc = new FakePc();
      pcs.push(pc);
      return pc;
    },
    createCandidate: (init) => init,
  };
  const events = { peers: [] as string[][], ended: [] as string[], connected: 0 };
  const session = new CallSession({
    api,
    baseUrl: "https://kamino.test",
    token: () => "secret-token",
    fetch: fakeFetch,
    roomKey: "k-live-7",
    selfId,
    name: "Me",
    autoPoll: false,
    onPeers: (list) => events.peers.push(list.map((p) => p.id)),
    onEnded: (reason) => events.ended.push(reason),
    onConnected: () => (events.connected += 1),
  });
  return {
    session,
    pcs,
    sent,
    events,
    setRoster: (r: { id: string; name: string }[]) => (roster = r),
    queueSignal: (s: { id: number; from: string; kind: SignalKind; payload: unknown }) => signals.push(s),
  };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
const posts = (sent: Sent[]) => sent.filter((s) => s.method === "POST").map((s) => s.body!);

test("joining polls with the room, own name and the sign-in token, then reports connected once", async () => {
  const t = setup("m");
  t.setRoster([{ id: "m", name: "Me" }]);
  await t.session.pollOnce();
  await t.session.pollOnce();
  assert.equal(t.events.connected, 1);
  const url = new URL(t.sent[0]!.url);
  assert.equal(url.pathname, "/api/rtc");
  assert.equal(url.searchParams.get("room"), "k-live-7");
  assert.equal(url.searchParams.get("peer"), "m");
  assert.equal(url.searchParams.get("since"), "0");
  assert.equal(t.pcs.length, 0, "nobody else is there yet");
});

test("only one side of each pair dials: the one with the larger id", async () => {
  const t = setup("m");
  t.setRoster([{ id: "a", name: "Alice" }, { id: "m", name: "Me" }, { id: "z", name: "Zed" }]);
  await t.session.pollOnce();
  await flush();
  assert.equal(t.pcs.length, 2);
  const dialled = t.pcs.filter((pc) => pc.channels.length > 0);
  assert.equal(dialled.length, 1, "m dials a (m > a) and waits for z (m < z)");
  assert.deepEqual(dialled[0]!.channels, ["state", "reliable"]);
  const offers = posts(t.sent).filter((b) => b.kind === "offer");
  assert.equal(offers.length, 1);
  assert.equal(offers[0]!.to, "a");
  assert.equal(offers[0]!.from, "m");
  assert.equal(offers[0]!.op, "signal");
});

test("an offer is answered, and a network candidate that came first is kept until then", async () => {
  const t = setup("a");
  t.setRoster([{ id: "a", name: "Me" }, { id: "z", name: "Zed" }]);
  t.queueSignal({ id: 1, from: "z", kind: "ice", payload: { candidate: "c1" } });
  t.queueSignal({ id: 2, from: "z", kind: "offer", payload: { type: "offer", sdp: "their-offer" } });
  await t.session.pollOnce();
  const pc = t.pcs[0]!;
  assert.equal(pc.remote.length, 1);
  assert.deepEqual(pc.candidates, [{ candidate: "c1" }], "the early candidate was applied after the offer");
  const answers = posts(t.sent).filter((b) => b.kind === "answer");
  assert.equal(answers.length, 1);
  assert.equal(answers[0]!.to, "z");
});

test("signals continue after the last one seen (nothing is handled twice)", async () => {
  const t = setup("a");
  t.setRoster([{ id: "a", name: "Me" }, { id: "z", name: "Zed" }]);
  t.queueSignal({ id: 5, from: "z", kind: "offer", payload: { type: "offer", sdp: "x" } });
  await t.session.pollOnce();
  await t.session.pollOnce();
  assert.equal(new URL(t.sent.filter((s) => s.method === "GET")[1]!.url).searchParams.get("since"), "5");
});

test("when both sides offer at once, the polite side (smaller id) accepts and the other ignores", async () => {
  // "a" is polite towards "z": it accepts even in the middle of its own offer.
  const polite = setup("a");
  polite.setRoster([{ id: "a", name: "Me" }, { id: "z", name: "Zed" }]);
  await polite.session.pollOnce();
  polite.pcs[0]!.signalingState = "have-local-offer";
  polite.queueSignal({ id: 1, from: "z", kind: "offer", payload: { type: "offer", sdp: "x" } });
  await polite.session.pollOnce();
  assert.equal(polite.pcs[0]!.remote.length, 1);

  // "z" is impolite towards "a": while it is mid-offer it ignores a's offer.
  const impolite = setup("z");
  impolite.setRoster([{ id: "a", name: "Alice" }, { id: "z", name: "Me" }]);
  await impolite.session.pollOnce();
  await flush();
  impolite.pcs[0]!.signalingState = "have-local-offer";
  impolite.queueSignal({ id: 1, from: "a", kind: "offer", payload: { type: "offer", sdp: "x" } });
  await impolite.session.pollOnce();
  assert.equal(impolite.pcs[0]!.remote.length, 0);
});

test("signals from people who are not on the roster are ignored", async () => {
  const t = setup("a");
  t.setRoster([{ id: "a", name: "Me" }]);
  t.queueSignal({ id: 1, from: "stranger", kind: "offer", payload: { type: "offer", sdp: "x" } });
  await t.session.pollOnce();
  assert.equal(t.pcs.length, 0);
});

test("people who leave are dropped and their connection is closed", async () => {
  const t = setup("a");
  t.setRoster([{ id: "a", name: "Me" }, { id: "z", name: "Zed" }]);
  await t.session.pollOnce();
  const pc = t.pcs[0]!;
  t.setRoster([{ id: "a", name: "Me" }]);
  await t.session.pollOnce();
  assert.equal(pc.closed, true);
  assert.deepEqual(t.session.peerList(), []);
  assert.deepEqual(t.events.peers.at(-1), []);
});

test("hanging up closes every connection and tells the server", async () => {
  const t = setup("a");
  t.setRoster([{ id: "a", name: "Me" }, { id: "z", name: "Zed" }]);
  await t.session.pollOnce();
  t.session.close();
  t.session.close(); // a second hang-up does nothing
  await flush();
  assert.equal(t.pcs[0]!.closed, true);
  const leaves = posts(t.sent).filter((b) => b.op === "leave");
  assert.equal(leaves.length, 1);
  assert.deepEqual(leaves[0], { op: "leave", room: "k-live-7", peer: "a" });
});

test("being refused (signed out, or no longer allowed in the room) ends the call once, with a reason", async () => {
  const refused = setup("a", { status: 403 });
  await refused.session.pollOnce();
  assert.deepEqual(refused.events.ended, ["You can't join this call."]);
  const signedOut = setup("a", { status: 401 });
  await signedOut.session.pollOnce();
  assert.deepEqual(signedOut.events.ended, ["You were signed out."]);
});

test("a connection that failed asks for a fresh offer", async () => {
  const t = setup("a");
  t.setRoster([{ id: "a", name: "Me" }, { id: "z", name: "Zed" }]);
  await t.session.pollOnce();
  const pc = t.pcs[0]!;
  pc.connectionState = "failed";
  pc.onconnectionstatechange?.();
  assert.equal(pc.restarted, true);
  assert.equal(t.session.peerList()[0]!.state, "failed");
});
