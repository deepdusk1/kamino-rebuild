# Kamino — Rebuild

Fresh repository for the Kamino rebuild. Seeded from `feature/complete-build` of the
original project, with 20 mobile source files regenerated (October 2026) covering:

- **Module 1 — foundation:** SSE realtime client (`mobile/src/api/sse.ts`), push
  notification overhaul (`mobile/src/lib/push.ts`), root layout wiring
  (`mobile/src/app/_layout.tsx`)
- **Module 2 — onboarding/discovery:** welcome, sign-in, explore, search
- **Module 3 — communities/AI stories:** community home, new-community wizard,
  AI story scene renderer
- **Module 4 — chats:** WhatsApp-style chat list, chat room, message bubbles
- **Module 5 — calls/live/watch:** incoming-call banner, LiveKit call screen,
  live stage, watch parties
- **Module 6 — profile/notifications/settings:** creator profile, notification
  center, settings + moderation

## Backend

Live backend: `https://web-production-597bf.up.railway.app/`
API transport is RPC (`POST /api/v1/rpc/<method>`); realtime over `GET /api/events` (SSE).

## Backend contracts still needed

The client references these contracts defensively; the server does not implement
them yet:

1. SSE event `watchparty.sync` on `GET /api/events`
2. RPC `syncWatchPartyPlayback` — host playback sync
3. RPC `kickWatchPartyViewer` — remove a watch-party viewer
4. RPC `rewindAiStoryCheckpoint` — AI story checkpoint rewind
5. RPC `voteAiStoryBranch` — AI story branch voting

## Status

Generated code — not yet compiled, type-checked, or tested on devices.
Verify on real phones before any release build:

1. Killed-state incoming call → LiveKit connect → clean hangup on both sides
2. SSE reconnect + offline message-queue replay (zero polling)
3. Google/Apple OAuth deep-link flow on a release build
