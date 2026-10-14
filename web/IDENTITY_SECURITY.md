# Identity and safety setup

The web and native apps now share real email/password, email verification, authenticator/backup-code authentication, device session revocation, username choice, profile links and interests, privacy controls, birthday-based age eligibility, account suspensions/bans and optional provider sign-in. New-member tutorials can be opened from Settings; Home offers the tour until it is completed or skipped.

## Required production setup

Set a persistent Postgres `DATABASE_URL`, a strong `BETTER_AUTH_SECRET`, the canonical HTTPS `BETTER_AUTH_URL` and auth enabled. Keep `KAMINO_REQUIRE_EMAIL_VERIFICATION=true` for production (the default in production). Configure `RESEND_API_KEY` and a verified `MAIL_FROM` sender before accepting email registrations. Without these keys production logs that email was not sent; confirmation and password recovery cannot work. Development prints genuine verification links to the local terminal.

Provision administrator identities through `KAMINO_ADMIN_USER_IDS`, `KAMINO_ADMIN_EMAILS` or `identity_admin_grants`. All three paths require the Better Auth email-verified flag. A user signing up with an allowlisted but unverified email has no administrator privileges. Use the actual verification link; changing an account's public blue tick does not verify its email or grant administration.

Run every migration, including `0026_identity_privacy.sql`, `0030_identity_signin.sql` and `0031_identity_oauth_proof.sql`. Filenames, rather than numeric prefixes, identify migrations. Sessions are checked on each request; cookie caching is disabled so device revocations and bans take effect immediately. Suspensions and bans also deny new sessions. Account recovery, administrative appeals and age correction still require an operational support process.

## Optional sign-in providers

| Capability | Required configuration | Behavior without configuration |
| --- | --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; provider callback at `/api/auth/callback/google` | Sign-in button hidden; native initiation rejected |
| Apple | `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`; optional `APPLE_APP_BUNDLE_IDENTIFIER`; callback at `/api/auth/callback/apple` | Sign-in button hidden; native initiation rejected |
| Phone OTP | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Phone sign-in hidden; OTP plugin absent |
| Signup challenge | `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`; authorized hostname in Cloudflare | Challenge omitted |

Apple's client secret is a signed JWT with an expiry; generate and rotate it using the Apple developer account. Twilio Verify delivers and checks actual SMS codes. No local placeholder code can authenticate a phone account. The signup challenge uses a real Cloudflare Turnstile widget in web and a browser handoff in native; do not set only its secret without the site key.

Native Google and Apple sign-in open the system browser. The server completes the provider's Better Auth flow, then returns a deep link containing a flow ID and callback-only proof. Exchanging it also requires the device's verifier. Both proofs are stored as hashes, expire after five minutes and can be claimed once. The session token is never placed in the callback URL. Confirm the production app's `kamino` URL scheme, and prefer platform-verified app/universal links before broad release to reduce custom-scheme interception risk.

Provider credentials are not bundled. Google/Apple authorization, SMS delivery, email delivery, CAPTCHA and native browser/deep-link behavior need end-to-end validation on the deployed hostname and physical iOS/Android devices. The implementation does not claim these external services are live merely because code exists.

Official configuration references: [Better Auth Google](https://www.better-auth.com/docs/authentication/google), [Apple](https://www.better-auth.com/docs/authentication/apple), [phone number](https://www.better-auth.com/docs/plugins/phone-number), [two factor](https://www.better-auth.com/docs/plugins/2fa), [CAPTCHA](https://www.better-auth.com/docs/plugins/captcha).

## Scope and remaining launch work

Birthday eligibility is based on a member's declared date, with a one-time server-controlled calculation for 13/16/18 access. It is not government-document age verification. Teen direct/group contact requires reciprocal follows and message limits; this is a basic safety policy, not an AI grooming detector. Reconfirming or editing an age checkbox cannot raise eligibility.

Language is a saved preference consumed by discovery/profile tools; the interface still needs a full translation catalog. Contact matching accepts addresses transiently, does not store them and only returns members who allow search. Native import uses the SDK57 Expo Contacts API: permission is requested after a tap, a local preview starts unselected and only confirmed addresses are sent. Names stay on the device; previews clear after matching/canceling. Imports cap at 200 addresses, split into 100-address requests. Android write access is blocked. Contact permissions and limited-contact access require physical-device testing and a fresh native build with the config plugin. Close-friend and favorite lists are private relationships used by supported story scope and discovery features; they do not automatically make every existing content type private.

The peer-to-peer audio stage enforces entry, membership, room locks, removed users and scheduled start on the server. Official clients mute listener microphones and respect host mute. With LiveKit configured (`KAMINO_LIVEKIT_*`), stage media flows through the SFU with publish rights enforced by token grants, and hosts can record rooms; without it the peer-to-peer mesh is used. Independent age verification (Stripe Identity) is available behind `KAMINO_AGE_VERIFICATION_ENABLED` plus billing keys; the document never reaches Kamino.

## Verification

`scripts/smoke-identity.mjs` tests a disposable fixture against a running app: unverified administration denial, birthday escalation denial, 13/16/18 reads and joins, teen contacts, username uniqueness, privacy, muted/restricted people, device revocation, actual TOTP and one-use backup codes, sign-in capability behavior and tutorial completion. Run it with `TEST_ORIGIN` and `TEST_AUTH_ORIGIN` set to the running app. Local fixture signup needs email verification optional; production verification remains required.

`src/lib/auth/mobile-oauth-state.test.ts` checks the actual SQL handoff claim against isolated PGlite, including missing/wrong proofs, expiry, callback rebinding, replay and concurrent claims. `safe-redirect.test.ts` verifies invitations survive sign-in and external/ambiguous redirects are refused. These tests do not substitute for provider and physical-device checks.

`scripts/smoke-paid-access.mjs` prepares local disposable accounts and actual posts, media, private attachments and events; with the app stopped it seeds explicitly scoped test entitlements into an isolated `.test-*` directory. Its API check verifies expired/wrong-offer denial, post/repost/feed/favorite protection, private-room fulfillment, event calendars/RSVPs/attendees, linked room entry, real media retrieval, owner/moderator exceptions and discoverable purchase metadata. It makes no checkout or payment-provider request. `paid-post-policy.test.ts` also exercises recursive source protection, deleted originals and cycles against PGlite. These tests establish local authorization behavior; real provider webhooks, native permissions and deployment remain separate launch checks.

## Independent age verification (added October 5, 2026)

Declared birthdays remain the baseline gate (13+). An optional document check can be offered on
top: set `KAMINO_AGE_VERIFICATION_ENABLED=true` alongside a configured Stripe billing key. The
member starts the check from Account security; the server mints a Stripe Identity
`verification_session` and the member completes it on Stripe's hosted page. Kamino never receives
or stores the document. When the `identity.verification_session.verified` webhook arrives (same
webhook endpoint as billing), the account is stamped (`age_verifications` +
`profiles.age_verified_at`). A failed check can be retried. Operator-verified accounts (the
existing admin flow) remain equally valid.
