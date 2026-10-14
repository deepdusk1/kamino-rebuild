# Kamino feature status — current build

Last reviewed **October 5, 2026**. This document is the single source of truth for what is
built, what activates when its provider keys are set, and what is intentionally not part of the
product. It replaces the older release-9 audit documents (the October 3 checklist snapshot, the
September 29 audit report, the release-9 notes and the v9 archive), which described earlier
stages and have been removed.

Every claim below was verified against the code, not a screen: web production build passes,
**304** web unit/integration checks and **87** native checks pass, the phone/server contract
matches (214 typed responses, 323 RPC operations), and ESLint is clean on both apps. Features
marked **activates with keys** are complete and dormant-safe: they refuse cleanly or hide until
their environment variables are set, so nothing changes without explicit operator configuration.

## What is in this build

- **Communities**: creation (public/private/invite-only), roles with enforced permissions,
  boards, FAQs, wikis, events (recurring, RSVPs, calendar export), chats, voice stages, quests,
  earned cosmetics, collectible seasons, leaderboards, milestones, moderation dashboard with
  cases and appeals.
- **Content**: eight post types plus video, shorts, GIFs, audio and long articles with image
  blocks; stories with layers, stickers, questions and polls; drafts, scheduling, edit history,
  content warnings, spoiler and age rules; reactions, threaded replies, quote reposts, post
  analytics.
- **Watch parties**: YouTube, Vimeo, Twitch and direct-file sources; host-authoritative sync
  (2-second state broadcast, 1.2-second drift correction) over peer-to-peer data channels; a
  shared queue with voting; ready checks with live counts; the native app joins the same deck
  in-app.
- **Messaging**: DMs, group chats with moderators and co-admins, community chats, media of every
  kind, stickers, reactions, replies, pins, search, typing indicators, read receipts, voice and
  video calls, message requests, teen-contact limits.
- **Discovery and personalization**: universal search, semantic search and "Find my people"
  (embedding-based when a provider is set), trending, local area, editorial collections, feedback
  controls (More/Less/Not interested, reset), duplicate-post originality checks in the composer.
- **Referrals**: personal invite codes, sign-up attribution, +150/+50 reputation rewards —
  reputation can only be earned, never bought.
- **Interface translation**: typed catalogs with Spanish shipped (landing, sign-in, navigation,
  home, privacy dashboard) and per-key English fallback; right-to-left plumbing activates when a
  catalog for an RTL locale lands. The privacy-dashboard picker and a landing-page switcher both
  apply changes immediately.
- **Safety**: AI-assisted checks with human review, held-content queues, reports (including a
  copyright reason and a published copyright/takedown policy), appeals, timed mutes, bans,
  audit logs, CAPTCHA, teen-safety defaults, child-safety standards page, declared-birthday
  gating with an optional document check.
- **Growth and polish**: marketing landing page, invite links, in-app support, DAU/MAU and
  cohort analytics, experiments and feature switches, admin back-office, offline banner and
  cached reads on native, tablet navigation rail, installable web app.

## Activates with keys (complete, dormant-safe code)

| Feature | Environment variables | Notes |
| --- | --- | --- |
| Sandbox billing | `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET`, `KAMINO_BILLING_ORIGIN`, `KAMINO_PAYMENTS_ENABLED=true` | Test checkout, subscriptions, tips, gifts, tickets, signed webhooks, entitlements. Default state. |
| Live billing + creator payouts | the above with `sk_live_…` **and** `KAMINO_BILLING_MODE=live` | Real charging; completed orders credit a creator earnings ledger (platform fee `KAMINO_PLATFORM_FEE_PERCENT`, default 10) after a refund hold period; creators connect Stripe Express and request payouts with reserve-before-transfer accounting, per-payout idempotency keys and refund/chargeback reversals. See `web/BILLING.md` for the operator duties. |
| Independent age verification | `KAMINO_AGE_VERIFICATION_ENABLED=true` + billing keys | Stripe Identity document check; `identity.verification_session.*` webhooks stamp the profile. The document never reaches Kamino. |
| Large stages + recordings (SFU) | `KAMINO_LIVEKIT_URL`, `KAMINO_LIVEKIT_API_KEY`, `KAMINO_LIVEKIT_API_SECRET` | Publish rights enforced by token grants server-side; room recordings via egress into the media bucket. Web stage uses the SFU; native stays on the P2P mesh until a dev build ships with the native SDK. |
| Auto-captions | `KAMINO_TRANSCRIBE_URL`, `KAMINO_TRANSCRIBE_KEY`, `KAMINO_TRANSCRIBE_MODEL` | Any Whisper-compatible endpoint; background worker stores WebVTT captions on media rows. |
| Transcoding | `KAMINO_TRANSCODE_ENABLED=true` + ffmpeg on the host (`KAMINO_FFMPEG_PATH`) | Uploads re-encode to 720p H.264 in the background. |
| GIF search | `KAMINO_TENOR_KEY` or `KAMINO_GIPHY_KEY` | Content Studio picker on web and native; imports go through server storage with size/mime checks. |
| Sign-in providers | Google/Apple OAuth, `TWILIO_*`, Resend (`RESEND_API_KEY`), Turnstile | Email/password works out of the box; providers activate with keys. |
| AI features | `KAMINO_AI_API_KEY`, `KAMINO_MODERATION_API_KEY` | Summaries, translation helper, description drafting, moderation checks, discovery assistant. |
| Push and email digests | Expo push project id, `RESEND_API_KEY`, `KAMINO_JOB_SECRET` | Minute worker runs notifications, digests, media jobs; receipts and retries built in. |

## Not part of the product (intentional)

- **Licensed music catalogs** — requires licensing deals, not code.
- **Professional accessibility audit** — the built-in supports (dark mode, text scaling, high
  contrast, reduced motion, alt text, manual captions, color-safe indicators) are done; an audit
  is human work.
- **Native in-app store purchases** — requires Apple/Google developer enrollment plus native
  billing libraries; web checkout covers paid features meanwhile.
- **Desktop executable** — excluded by decision; the website installs as a PWA.
- **Rewarded ads / offer walls** — excluded unless carefully limited later.

## What still needs a person, not code

- Apply migrations `0043`–`0045` on deploy (the deploy script runs every migration file).
- Set the provider keys for the features you want, in order of rollout.
- Build and test signed iOS/Android dev clients on real devices (push, calls, the new native
  screens: watch party, offline queue, nav rail, GIF search).
- Run a real Stripe test-account pass (checkout, webhook, refund, renewal, payout) before
  flipping `KAMINO_BILLING_MODE=live`.
- Production hosting with a paid database, object storage, backups and TURN — the render
  blueprint defaults are free-tier and will sleep/wipe.
- Legal pages review (privacy, terms, copyright agent address is a placeholder).
