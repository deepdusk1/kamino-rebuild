# Notifications, case management, experiments and seasons

Members use `/operations` for weekly email preferences, delivery status, moderation decisions, appeals, season progress and collectible claims. Verified platform administrators use `/admin/operations` for delivery health, member reports, case assignment and history, independent appeal decisions, feature experiments and season publication. Web and native clients call the same authenticated functions.

## Delivery configuration

Schedule `POST /api/v1/jobs` at least once every five minutes with `Authorization: Bearer <KAMINO_JOB_SECRET>`. Keep this secret in the scheduler and server environment. The protected job also runs media deletion and explicitly configured semantic indexing. Notification content is still created in the app when delivery providers are unavailable.

Set `KAMINO_PUSH_ENABLED=true` only after configuring the native project's APNs/FCM credentials and testing registered Expo tokens. If enhanced Expo push security is enabled, also set `EXPO_ACCESS_TOKEN`. Default push delivery is disabled. Expo receives generic lock-screen text and a local app link, rather than another member's name, text, community or media. Each notification/token pair is queued exactly once. Workers recheck account status, current access, blocks, mutes, category switches, legacy switches and quiet hours. Four workers process a bounded batch; transient failures use backoff and stop after six send attempts. Tickets are checked after 15 minutes. Receipt lookup failures keep the existing ticket and never blindly resend. `DeviceNotRegistered` deletes the token. A “delivered” status means APNs/FCM accepted the message, not proof that a device displayed it. Stale intents expire after two days; terminal queue records expire after 30 days.

Weekly digests reuse `RESEND_API_KEY` and `MAIL_FROM`; `BETTER_AUTH_URL` supplies the app links. Members must explicitly opt in and have a verified email. After their local 09:00, one queue entry per UTC week captures the prior completed week's visible community totals. Held, hidden, blocked and muted contributions are excluded. Emails contain totals and links, without copying private content into provider messages. Opt-out cancels pending deliveries. Retries retain the same Resend idempotency key and stop before its 24-hour window closes. Unconfigured providers are reported as unavailable, never as successfully delivered. Stale pending digests expire after 14 days and terminal history after 90 days.

## Moderation and appeals

Each case has an account subject, an optional originating report, an assignee, internal evidence, priority, investigation status, events and an explicit public decision reason. Decisions support no action, warnings, suspension and bans. Account sanctions and case/audit writes commit together; sanctions revoke existing sessions. The issuing administrator cannot review their own decision's appeal. Overturning an account sanction uses its exact revision, issuer and status, so it cannot erase a newer action. Existing content moderation screens remain responsible for separate content restoration/removal.

Sanctioned members use the public `/appeal` page. A configured email provider sends a signed link only to a matching verified email address. The case number is optional; otherwise the latest matching case is selected. The response does not reveal whether an account or case exists. The proof binds one account and one case, expires within one hour, and grants access only to public decision details, member-visible case notes and the member's own appeal. Internal evidence and other accounts remain inaccessible. The native public appeal screen accepts the emailed link. Account deletion redacts and pseudonymizes retained case accountability records through the shared deletion workflow.

## Experiments

Experiments have two fixed variants and can consume only `related_discovery` or `discovery_assistant`. The real server-side feature consumer records stable per-account exposure; the control feature is off and treatment is on. Platform switches remain a master off control. Starting an experiment freezes its feature/allocation; ended experiments cannot restart. A successful discovery interaction or actual assistant answer records at most one outcome per exposed account. Administrator reporting shows exposures, outcomes and observed rates for both variants. These counts are descriptive; they do not assert statistical significance or causal uplift.

## Seasons and limited rewards

Administrators publish dated seasons with up to four limited colour sets. Progress is derived from published non-held participation: each UTC day counts at most five posts at ten points, ten replies at two points, and one check-in at five points. New seasons calculate a fresh total without resetting reputation or deleting historical rewards. Claiming verifies server progress, locks the finite inventory and commits one account/set award atomically. Collectibles can be equipped from the season card using the existing earned-cosmetic API. Ending a season stops new claims and preserves history. Reputation and these rewards cannot be purchased.

## Verification

`operations-v10.server.test.ts` covers real SQL migrations, provider mocks, bounded delivery attempts, receipt handling, concurrency, deletion, digest totals and consent, signed proofs, experiments, finite reward inventory and case/appeal transactions. `smoke-operations-v10.mjs` exports `verifyOperationsV10(testFixtures)` for authenticated local API checks including a signed-out banned member's proof-only appeal. Real devices and configured provider credentials must be checked before enabling external delivery in a release environment.
