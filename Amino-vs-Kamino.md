# Amino × Kamino — feature review (corrected, release 7)

Reviewed September 29, 2026 against the code in this package, not against an older build.

**How to read this.** Amino is compared from its well-known features and the entry screens captured earlier; signed-in Amino communities were not inspected, so this is not a claim of full parity. Each row says what Kamino has **in this package**, and every "Built" row is covered by an automatic test named in the last section.

Status words: **Built** (works, tested here) · **Built differently** (same purpose, different design on purpose) · **Excluded** (against Kamino's house rules) · **Yours to provide** (needs accounts, staff or hardware that code cannot supply).

House rules (updated in the 2026 redesign): the core app stays free, no pay-to-win, no notification spam, ages 13+, low maintenance, humans decide moderation. Optional paid extras may come later; none are built yet.

## Corrections to the earlier review

The earlier review was written from a web-only build. These claims are now wrong or out of date:

| Earlier claim | Now |
| --- | --- |
| No native iOS / Android apps | Both exist (`mobile/`, Expo). They still need a first test on a real phone. |
| Only a weekly leaderboard | Activity, check-in streak and quiz boards over week, month and all time, per community. |
| Check-in is global only | Each community has its own daily check-in with a streak and a little reputation. |
| Challenges are just events | Challenges take entries (your own posts), leaders judge once (1st/2nd/3rd), reputation is awarded once, winners are notified. |
| One sticker set | Three free packs, 36 stickers, on web and phone. |
| Frames only "ring, moon, star, laurel" | Also sparkles, flame, crown and aurora; plus four chat bubble styles. All free. |
| Single-picture image posts | Albums: cover plus up to five pictures. |
| Drafts need a button press | Drafts also save themselves a few seconds after you stop typing (web and phone). |
| Shared folder is one flat list | Nested folders, moving items, and leader-set level locks that hide the link from lower levels. |
| Export only, no import | Import returns your posts and drafts as private drafts (never auto-published, safe to repeat). |
| No age check beyond a tick box | Sign-up asks a birthday once, stores only "13 or older", erases younger accounts. Teenagers cannot unlock 16+/18+ halls. |
| No abuse protection | Per-person limits on posting, commenting, messaging, reports, community creation, follows, invites and uploads (HTTP 429 with a friendly message). |
| No backup story | `npm run backup` and `npm run restore` (consistent snapshot, verified row counts, tested on real PostgreSQL). |
| Calls fail on strict networks | TURN relay settings are supported (`KAMINO_TURN_*`); you provision the relay. |

## Capability comparison

| Area | Capability | Kamino |
| --- | --- | --- |
| Communities | Public and private communities, categories, rules | Built |
| | Join questions, approval, invite codes | Built |
| | Leader / curator / member roles, titles | Built |
| | Community discovery and search (communities, posts, #hashtags, people) | Built |
| | Per-community nickname and persona bio | Built |
| | Custom look per community (name, colour, five colour styles, cover, icon) | Built, leaders only, web and phone; buttons stay readable whatever colour is chosen. Not a free-form CSS editor, on purpose. |
| Creation | Blog, image, question, link, poll, quiz, wiki, story | Built |
| | Multi-picture posts (albums) | Built |
| | Quizzes (many questions, scored, once-only rewards) | Built, with a picture per question and an optional time limit measured by the server |
| | Stories that expire after 24 hours | Built, up to six scenes with captions |
| | Role-play as story or film characters, change the ending | Built: AI storyteller (free tier) sets up stories, narrates, voices unclaimed characters, writes alternate endings; works without AI too |
| | Drafts, autosave, save a copy | Built |
| | Content warnings, comments off, announcements | Built |
| Wiki | Approved library, categories, review queue, edit history, restore | Built |
| | Proposals from other members with credit | Built |
| | Pin wiki entries to a profile | Built |
| Chat | Public, private and direct chats, replies, reactions | Built |
| | Photos, voice notes, video | Built |
| | Stickers | Built (3 free packs; nothing to buy) |
| | Pinned and muted conversations, search, older-message paging | Built |
| | Voice rooms with live audio/video/screen share (website) | Built; **not verified on two real devices here** |
| | Live calls in the phone app | Built (audio, optional video, mute, ringing, shared with the website's calls); **needs a development/store build, not Expo Go, and has not been tried between two real devices** |
| Profiles | Photo, bio, mood, status, cover, wall | Built |
| | Avatar frames and chat bubble styles | Built, all free |
| | Characters / personas, titles | Built |
| | Achievements with banners | Built: 75 in four tiers with progress bars; three shown as banners on the profile |
| | Upload your own profile wall cover | Built (web and phone) |
| | Follow, block, report | Built |
| Engagement | Daily check-in and streaks (global and per community) | Built |
| | Leaderboards | Built |
| | Events, RSVPs, challenges with judging | Built |
| | Notifications and push (you choose which) | Built; push delivery needs a first real-phone test |
| Economy | Coins, coin purchases, tipping | **Built** (subscriptions, tips, gifts, tickets and creator payouts; sandbox by default, live billing behind an explicit operator switch) |
| | Rewarded ads / offer walls | **Not built** (ads are allowed later only if carefully limited) |
| | Paid fan clubs / VIP tiers | **Built**: creator subscriptions, exclusive posts and subscriber spaces (sandbox by default) |
| | Amino+ style subscription, paid cosmetics or stickers | **Excluded** |
| Moderation | Reports, hide/remove, strikes, timed mutes, bans | Built |
| | Automatic safety checks (illegal trades, exploitation, threats) on posts, comments, chat, DMs, walls, stories and pictures, with a review queue | Built: free built-in rules always; free AI check when the key is set; held items wait for a person, no automatic bans. **Not tested against the real AI service** |
| | Appeals (bans and mutes), audit log | Built |
| | Join screening, broadcasts | Built |
| | Someone actually watching your community | **Yours to provide** |
| Accounts | Email sign-up, password reset, sign-in on web and phone | Built; email delivery needs your Resend key |
| | Phone-number or social sign-in | **Built**: phone (Twilio Verify), Google and Apple — active once the provider keys are set |
| | 13+ birthday gate | Built |
| | Export and import of your data | Built |
| | Delete my account in the app | Built |
| Delivery | Website, iOS app, Android app | Built |
| | One-command publisher for the stores (`Publish-Kamino.cmd`) | Built; needs your Expo, Apple and Google accounts |
| | Hosting, database, backups | Render blueprint included; **you provision it** |
| | Media on object storage (S3/R2) | Built (optional); tested against a signature-checking pretend bucket, **not a real provider**; bucket needs its own backup |

## What "better than Amino" still requires from you

1. **A real-device test.** Open the built apps on an iPhone and an Android phone, and try a call between two devices and between a phone and the website. Nobody has done this yet.
2. **Accounts and money for hosting and stores** (Render, Expo, Apple US$99/year, Google US$25 once).
3. **People.** Appoint leaders and curators. Kamino gives them every tool but does not replace them.
4. **A lawyer's look** at the Privacy Policy and Terms, which are drafts, not legal advice.
5. **Paid features, when you want them.** The house rules allow them, and the code is ready: web checkout runs as a sandbox by default, and live billing with creator payouts activates behind an explicit operator switch (see `web/BILLING.md`). Selling digital goods inside the native apps would additionally require Apple's and Google's in-app purchases, which is its own project.

## Not done in this release

Native in-app purchases (needs Apple/Google enrollment and native billing libraries), picture hash-matching for child-abuse imagery (PhotoDNA-style, for when you grow), a speaker/earpiece switch for phone calls, and a professional accessibility audit. Phone, Google and Apple sign-in are built and activate with provider keys.

## What was verified

Current totals: 304 web and 87 phone unit/integration checks, TypeScript and lint with no errors on web and phone, a production web build, and a phone/server contract check (214 typed responses, 323 RPC operations). See `FEATURE-STATUS.md` for the full current list.

Not verified here: the real OpenAI and Groq services, how well the AI judges real content, calls between physical devices, a real S3/R2 bucket, real email and push delivery, how the screens feel on a real phone, store submission, and staffed moderation.
