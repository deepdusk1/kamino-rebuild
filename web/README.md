# Kamino

Updated from `tqGkLPgNgn4QudrX-grok-workspace.zip`, keeping its community, profile, messaging, rewards, moderation, and live-room features.

## Run locally

Use Node.js 24 or a compatible current Node.js release.

On Windows, double-click `Launch-Kamino.cmd` after installing Node.js. It installs dependencies when needed and starts the local app. Or use the commands below.

```sh
npm ci
npm run dev
```

Open http://localhost:8080. Create an account using the sign-in screen. Local accounts and community content are stored in `.local-data`; the local signing secret is stored in `.local-secret`. Keep both when restarting. They are deliberately excluded from this distribution.

The included communities and members are sample content, not real users. No shared preview credentials are required. The original ZIPs are unchanged.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

With the development server running, `npm run test:integration`, `npm run test:creator`, and `npm run test:chat-media` test real HTTP endpoints using synthetic accounts. They create sample posts, chats, and communities in that server's database, so run them against a development instance only.

`npm run test:legacy-scaffold` also runs the original generator/platform fixture tests. Some of those expect the old Grok workspace layout, disabled authentication, and platform-specific symlinks; they are retained separately from the application tests.

## Production

Provision PostgreSQL and an HTTPS Node.js hosting environment. Configure `DATABASE_URL`, a new random `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` (the public HTTPS origin). Set these in the host environment for both build and runtime. Run `npm ci`, `npm run build`, then `npm start`. The build applies the database migrations when DATABASE_URL is present. Back up the database before deploying changes to an existing installation. Set `KAMINO_SAMPLE_CONTENT=off` to start with an empty site instead of the built-in sample communities and members (recommended for a public server; the root `render.yaml` does this). Migrations also run on every `npm start`. A one-click Render recipe and a step-by-step guide are in the root `DEPLOY.md`.

The production start command checks configuration rather than silently starting an empty temporary database. The local preview is not a public deployment. OAuth requires your own broker/provider configuration and is hidden by default. Live voice/video uses WebRTC; real-device and restrictive-network testing, plus TURN service configuration, are still needed before promising universal call connectivity.

## Branding

The Kamino K mark is in `public/kamino-logo.svg`, with a matching favicon and reusable React component. It uses a lavender-to-teal gradient and scales without losing sharpness. The interface uses brighter pastel colors, frosted glass panels, and gentle animation. Reduced-motion preferences are respected.

Chat supports bounded photo attachments (2 MB), recorded voice notes (1.5 MB or 45 seconds), reactions, per-member pin/mute settings, older-message paging and text search. By default media is stored in the database, which is fine for a first community. Set the `KAMINO_S3_*` variables (see `.env.example`) to keep files in an S3-compatible bucket instead; existing files stay where they are and both kinds are served side by side. Microphone access requires browser permission and a secure context outside localhost.

Approved public wiki pages can be pinned to profiles. Community members can copy approved pages into their own draft with a source link. Author edits keep earlier versions; only the author can restore them. Other members can propose edits to an approved page; the author accepts or rejects each proposal and accepted contributors are credited.

Community leaders can show, hide, and reorder the main community tabs from the moderation screen. This changes navigation presentation; it does not grant or revoke access to the underlying pages.

See `../FEATURE-STATUS.md` for the current feature status and verification summary.

## Amino feature review

The companion `Amino-vs-Kamino.html` and `Amino-vs-Kamino.md` files in the download folder compare 69 capabilities. The original 2022 Amino APK and captured entry screens are kept separately under `Amino-reference`, outside the Kamino source ZIP. Video attachments and native push (via the companion `mobile` app) are now covered. Paid features run through the website's Stripe checkout — a sandbox by default, with live billing and creator payouts behind an explicit operator switch (see `BILLING.md`) — and a production hosting setup is still yours to provision. This source package does not claim full Amino parity; see `../Amino-vs-Kamino.md` for the capability-by-capability comparison.

## Mobile app and API

The native iOS + Android app lives in the sibling `mobile` folder (see its README). It calls this
server through one generic route, `POST /api/v1/rpc/<functionName>` with body `{"data": ...}` and
the header `Authorization: Bearer <token>`. The token is the `set-auth-token` response header from
`/api/auth/sign-in/email` or `/api/auth/sign-up/email`. Every call runs the same server function the
website uses, so all permission checks are shared. Other mobile-related pieces:

- `GET /api/v1/media/message/<roomId>/<messageId>` streams chat photos, voice notes and video (supports byte ranges).
- Push: the app registers an Expo push token (`registerPushToken`); `notify()` then also sends a push through Expo's push service. A failed push never blocks the action that caused it.
- Moderation additions: timed mutes, appeals, wiki category trees, RSS news feeds (https only, public addresses only, no redirects), invite codes.
- Account safety required by the app stores: password reset by email (set `RESEND_API_KEY` and `MAIL_FROM`, or reset links are printed to the server log in development), in-app account deletion, and public `/privacy`, `/terms` and `/delete-account` pages.
- `GET /api/v1/media/post/<postId>/<n>` serves the pictures of a post with the same access rules as the post: 0 is the cover, 1 to 5 the album or story scenes, 100 and up the pictures of quiz questions (only after you start the quiz).
- `GET /api/v1/media/community/<slug>/<cover|icon>` serves a community's own cover and icon.
- `/api/rtc` is the call service (roster and offers between people in a room). The website and the phone app both use it, so phones and browsers can share a call.
- `npm run test:mobile` exercises all of the above against a running dev server.

## Running the automatic checks

```sh
npm run typecheck && npm run lint && npm test        # 151 unit tests
npm run dev                                          # in one terminal (bulk tests need KAMINO_RATE_LIMIT=off)
npm run test:mobile && npm run test:integration && npm run test:creator && npm run test:chat-media && npm run test:wallet
npm run check:contract                               # phone app and server agree on data shapes
```

`npm run test:limits` needs a dev server started WITHOUT `KAMINO_RATE_LIMIT=off`, because it proves the limits work. `npm run test:storage` needs a dev server started with the `KAMINO_S3_*` variables pointing at `127.0.0.1:9100`; the script starts a pretend bucket there that checks every request signature.

## Operating a real server

- **Backups:** `DATABASE_URL=... npm run backup` writes one compressed file from a consistent snapshot; `npm run restore -- <file>` brings it back (inside one transaction, and it checks the row counts). Keep copies off the server.
- **Abuse limits:** built in and on by default (answers HTTP 429 with a friendly message). `KAMINO_RATE_LIMIT=off` switches them off for tests only.
- **Calls on strict networks:** set `KAMINO_TURN_URLS` with `KAMINO_TURN_SECRET` (coturn) or `KAMINO_TURN_USERNAME` and `KAMINO_TURN_CREDENTIAL` (a TURN service). See `.env.example`.
- **Files on object storage:** with `KAMINO_S3_*` set, new photos, videos, voice notes, covers and quiz pictures go to the bucket and the database keeps only a reference. Keep the bucket **private** and turn on the bucket's own versioning or backup: `npm run backup` saves the database, **not** the files in the bucket. Deleting a post, message or account deletes its files too.
- **Safety checks and the AI:** every post, comment, chat message, wall note and role-play turn goes through built-in rules (always on, free). With `KAMINO_MODERATION_API_KEY` the free OpenAI moderation check also reads text and pictures. Likely illegal or dangerous content is **held** (hidden) until a moderator restores or removes it in the community's Mod page; weaker signals are only flagged. Serious cases, direct messages and profile walls also reach the site owners in `KAMINO_ADMIN_EMAILS` at `/admin/safety`. Nothing is banned automatically. `npm run test:ai` checks all of this against a pretend AI service (start the dev server with the settings listed at the top of `scripts/smoke-ai.mjs`).
- **Role-play stories:** the "Stories" tab. With `KAMINO_AI_API_KEY` (Groq's free tier by default) the storyteller sets up stories, narrates after each turn, voices unclaimed characters and writes alternate endings. It tries the models in `KAMINO_AI_MODEL` one after another (each has its own free allowance) and `KAMINO_AI_DAILY_LIMIT` (default 300 replies a day) keeps it inside the free allowance; the free tier is limited, not unlimited (see `.env.example`). Without a key, members play and narrate themselves.
- **Age gate:** sign-up asks for a birthday once, keeps only "confirmed 13 or older", and erases accounts of anyone younger.
