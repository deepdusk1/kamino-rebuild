# Kamino: App Store and Google Play listing (copy and paste)

> Release 9 note: refresh this kit before submission — the app now includes watch parties with a voting queue, interface translation (Spanish), referrals, offline messaging and a tablet layout. Paid features run through the website's Stripe checkout (sandbox until the operator enables live billing); there are no native in-app purchases, so do not advertise one. Update the privacy answers for the configured providers, replace device screenshots with current captures, and do not advertise a feature as live solely because its configuration screen exists.

Everything below is ready to paste into App Store Connect and the Google Play Console.
Replace `https://YOUR-SERVER` with the public address of your Kamino server (see `DEPLOY.md`).

Screenshots (high-quality JPEG, which both stores accept) and the Google Play banner are in this folder:

- `ios-6.9in-1290x2796/` – upload to App Store Connect ("iPhone 6.9-inch display").
- `android-phone-1080x1920/` – upload to Google Play ("Phone screenshots").
- `google-play-feature-graphic-1024x500.png` – Google Play "Feature graphic".
- App icon: `mobile/assets/icon.png` (1024 x 1024). Both stores ask for it.

The pictures are the real app screens filled with made-up sample people, pictures and a made-up story, so nothing in them belongs to anyone real. The live-call picture shows the real call screen with a pretend call in progress (calls only run on an installed phone app). Retake it on a real phone once you have a test build if you prefer. The full sets, including the 6.5-inch iPhone size and the 13-inch iPad size, are in the `Kamino-store-pictures` folder next to this project.

---

## 1. Store text

**App name** (30 characters max): `Kamino`

**Subtitle** (iOS, 30 max): `Communities that feel like home`

**Short description** (Google Play, 80 max):
`Find your people. Chat, share and play AI stories in communities you love.`

**Promotional text** (iOS, 170 max):
`Find your people. Join communities for the things you love, chat in rooms, build wikis together and join weekly challenges, without pushy notifications.`

**Full description** (both stores, 4000 max):

```
Kamino is a calm home for your communities.

Join or start a community for anything you love: art, anime, music, games, writing, roleplay, science and more. Share what you make, talk with people who care about the same things, and build something together.

WHAT YOU CAN DO
• Post the way you want: blogs, pictures, questions, links, polls, quizzes, wiki pages and 24-hour stories.
• Chat in group rooms or one-to-one. Send photos, voice notes and short videos, reply to messages and react.
• Build a shared wiki library for your community, with categories and suggested edits.
• Join events and challenges, and climb the weekly leaderboard.
• Follow people, collect achievements and decorate your profile with a photo, a bio and a wall.
• Discover new communities, people, posts and #hashtags with one search.
• Save posts to read later and keep drafts of what you are writing.

MADE TO BE KIND
• Free to use, with no pay-to-win: reputation and levels can't be bought.
• No notification spam: you choose exactly which notifications you get.
• Real tools for community leaders: reports, join requests, timed mutes, bans, strikes, appeals and announcements.
• Every post, comment, message and profile can be reported. You can block anyone.
• Download your data or delete your account inside the app whenever you like.

Kamino is for people aged 13 and over.

Questions or feedback? Open Settings → Contact support in the app.
```

**Keywords** (iOS, 100 characters max, comma-separated, no spaces after commas):
`community,chat,fandom,forum,groups,friends,wiki,roleplay,hobby,clubs,social,art,anime`

**Category:** Social Networking (primary). Second category (optional): Entertainment.

**Support URL:** `https://YOUR-SERVER/`
**Marketing URL** (optional): `https://YOUR-SERVER/`
**Privacy Policy URL:** `https://YOUR-SERVER/privacy`
**Terms of Use URL:** `https://YOUR-SERVER/terms`
**Account deletion URL** (Google Play asks for one): `https://YOUR-SERVER/delete-account`
**Support email:** the same address you put in `EXPO_PUBLIC_SUPPORT_EMAIL`.

**What's new** (first version): `Welcome to Kamino! This is our first release.`

**Copyright:** `© 2026 Your Name or Company`

---

## 2. Age rating questionnaires (answer honestly; these are the truthful answers for Kamino as built)

**Apple age rating**
- Unrestricted web access: No.
- User-generated content: **Yes** (posts, comments, chat).
- Violence, sexual content, profanity, horror, drugs, gambling, contests: None *by the app itself*. (Community content is moderated by reports and community leaders.)
- Result you should expect: 12+ or 17+ depending on Apple's current questions about user-generated content. Choose what Apple's form calculates. Do not pick a lower rating by hand.

**Google Play content rating (IARC)**
- Category: **Social / Communication**.
- Users can interact or exchange content: **Yes**.
- Users can share their location: No.
- Digital purchases: No.
- Contains ads: **No**.

**Minimum age:** 13 (stated in the Terms and enforced at sign-up).

---

## 3. Privacy questionnaires

The old v8 answers have been superseded. Release 9 includes first-party usage analytics. Complete the store forms against the deployed configuration and connected providers; this source inventory is not a completed privacy questionnaire.

- Account/contact data: user IDs, email, display name, profile preferences and optional configured phone sign-in.
- User content: posts, comments, messages, uploaded photos/video/audio/files, stories and profile content.
- App activity: post views, community visits, search history/feedback and distinct authenticated UTC member activity used for growth and retention.
- Optional contacts: the phone requests permission only after a tap. Names remain on the device; confirmed email addresses are processed transiently for matching. This flow must appear in the permission and privacy review.
- Delivery/authentication providers: configured email/SMS/OAuth, CAPTCHA, Expo push and optional safety/chat services process the data required by their actual integrations.
- Billing: native purchases are unavailable and the web sandbox is disabled by default. Configured Stripe test checkout stores a local order/access ledger; real-money billing and payouts are unfinished.
- Data export/deletion: available in Settings and on the web. The release notes describe retained pseudonymous accountability records and external test-subscription cancellation limits.
- Verify HTTPS on the deployed hostname, provider logging/retention, optional versus required data, purposes, deletion behavior and all current store definitions before submitting. No independent security review was performed in this session.

The source does not include a third-party analytics/tracking SDK. That statement does not replace reviewing services added or enabled by the operator. Use the current [Apple app privacy guidance](https://developer.apple.com/app-store/app-privacy-details/) and [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469).

---

## 4. Rules for apps with user-generated content (Apple 1.2, Google UGC policy)

Both stores reject social apps that lack the items below. Kamino has every one; paste this into the review notes so the reviewer finds them quickly.

1. Terms that forbid objectionable content: sign-up screen and Settings link to the Terms.
2. Filtering: automatic phrase filter for scams and harmful text.
3. Reporting: Report button on posts, comments, chat messages and profiles.
4. Blocking: profile → ••• → Block. Blocked people's content disappears.
5. Fast response: moderators get reports in Mod tools; leaders can remove content, mute (timed) or ban.
6. Published contact: Settings → Contact support.
7. Account deletion inside the app: Settings → Delete account.

---

## 5. Notes for the app reviewer (App Store Connect "App Review Information" / Play "App access")

Create a demo account on your live server first (any email and a password, plus join or create one community with a few posts), then paste:

```
Demo account
  Email:    reviewer@YOUR-DOMAIN
  Password: (the password you chose)

Kamino is a community app (similar to forums and group chats). No purchases, ads or in-app currency exist.

User-generated content safeguards (Guideline 1.2):
  • Report: tap ••• on a post or profile, or the Report link under a comment or message.
  • Block: open a profile → ••• → Block.
  • Terms/Privacy: sign-up screen and Settings.
  • Delete account: Settings → Delete account (permanent, inside the app).
  • Contact: Settings → Contact support.

Sign-in is by email and password (no third-party login).
Camera, photo library and microphone are used only when the user chooses to attach a picture, video or voice note, or joins a live call (the microphone is used only while they are in a call, the camera only if they turn video on).
Push notifications are optional and off until the user allows them.
```

---

## 6. Before you press "Submit for review" (checklist)

- [ ] Server is live on https and the app build points at it (`EXPO_PUBLIC_API_URL` in `mobile/eas.json`).
- [ ] `mobile/eas.json` and `mobile/.env` have your real support email.
- [ ] You read and adjusted `/privacy` and `/terms` (they are sensible drafts, **not legal advice**).
- [ ] Reviewer demo account exists and can sign in.
- [ ] Screenshots uploaded; icon uploaded.
- [ ] You tested the real build on a phone once (sign up, post, chat, photo, push notification).
