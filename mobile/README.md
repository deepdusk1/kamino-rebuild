# Kamino mobile app (iOS + Android)

One codebase that builds real native apps for iPhone and Android. It is built with
[Expo](https://expo.dev) (React Native) and talks to the Kamino server in the `../web` folder.

**What is in the app:** sign-up / sign-in / password reset, a first-run welcome, home feed, global
search (communities, posts, #hashtags, people), profile photos, communities (join,
private-community questions, rules), all eight post types (blog, image, question, link, poll, quiz,
wiki, story), comments, likes, saving, drafts, wiki library with categories and edit proposals,
chat rooms and direct messages (photos, voice notes, video, replies, reactions), events and
challenges, weekly leaderboard, members, shared files, news feeds, profiles with wall and
achievements, follow / block / report, notifications and push notifications, full moderation
(reports, join requests, strikes, timed mutes, bans, appeals, broadcast, invite codes), data export
and in-app account deletion.

**How it looks and feels:** a softly moving colour "aurora" behind every screen, see-through glass cards, frosted
bars and sheets (Apple's real Liquid Glass on iOS 26 and newer, frosted blur on older iPhones and the web, a
tinted glass look on Android), a floating glass tab bar with a sliding gradient, springy buttons with
light haptics, a heart that bursts when you like something, cards that float in one after another,
animated polls, streaks and loading states. Light and dark mode follow the phone. Every animation
respects the phone's **Reduce Motion** setting, and the text colours were checked for WCAG AA contrast
on both the background and the glass.

**Current build:** everything shares the web server — content/story tools, group chats with
moderators, community roles/policies/quests, events, watch parties in-app (the website's watch
deck in a WebView), an offline message queue that replays on reconnect, a tablet navigation rail,
GIF search, and interface translation. Paid features are managed on the web (purchases are
sandbox until the operator enables live billing; native store purchases are not built). See
`../FEATURE-STATUS.md` and `../web/BILLING.md`.

---

## 1. Try it on your own phone in about 10 minutes

You need Node.js, an installed Kamino development build, and your phone on the **same Wi-Fi** as your computer.
`expo-dev-client` is included. Build a development client using your Expo account with
`npx eas-cli build --profile development --platform android` (or `ios`), or compile locally with
`npx expo run:android` / `npx expo run:ios` when the appropriate native toolchain is installed.

**Easiest way:** in the folder *above* this one, double-click `Start-Kamino.cmd` (Windows) or run
`./start.sh` (Mac/Linux). It installs everything, starts the server and this app, and shows a QR code.

**Manual way** (two terminal windows):

```sh
# window 1: the server
cd web
npm ci          # first time only
npm run dev     # leave open; listens on port 8080

# window 2: the phone app
cd mobile
npm install     # first time only
npx expo start --dev-client
```

A QR code appears. Open it with your installed Kamino development client.
The app finds your computer by itself; you do not need to type any address.

> **It says "Network request failed" or can't reach the server?**
> 1. Both devices must be on the same Wi-Fi (guest / office networks often block this).
> 2. On Windows, allow Node.js through the firewall when Windows asks (choose *Private networks*).
> 3. Still stuck? Create a file named `.env` in this folder containing
>    `EXPO_PUBLIC_API_URL=http://192.168.1.20:8080` (use your computer's own address), then run
>    `npx expo start --clear`.

**Good to know:** this app uses native calling, contact and sharing plugins. Use a fresh development
or store build. Expo Go is insufficient. Bundle export verifies JavaScript compilation; it does not
prove device permissions, push delivery, microphone routing or two-phone calling.

---

## 2. Check that everything is healthy

```sh
npm run typecheck   # TypeScript finds mistakes before you run the app
npm run lint        # code style + common bugs
npm test            # small unit tests (validation, dates, links)
npm run export:check  # builds the real iOS and Android bundles to prove they compile
```

All four should finish without errors. In the `web` folder, `npm run check:contract` also confirms
that every piece of data the phone reads has the same shape the server actually sends.

---

## 3. Build real apps (for TestFlight, Google Play, or friends)

You do **not** need a Mac or Android Studio: Expo builds the apps in the cloud.

1. Make a free account at [expo.dev](https://expo.dev), then in this folder run:
   ```sh
   npx eas-cli login
   npx eas-cli init
   ```
   `init` prints a **project ID**. Paste it into `app.config.ts` on the line
   `const EAS_PROJECT_ID = "";`. (This is what switches push notifications on.)
2. Point the app at your **public server address** (https): `npm run set-server https://your-server.example you@your-email.example`.
   This updates `eas.json` and `.env` for you. Phones cannot use `localhost`; a real build must point
   at a server on the internet (the root `DEPLOY.md` shows how to host one).
3. Build:
   ```sh
   npx eas-cli build --profile preview --platform android   # installable .apk to share
   npx eas-cli build --profile production --platform all    # store-ready builds
   ```
   The first iOS build asks you to sign in to your Apple Developer account (US$99/year);
   EAS creates the certificates for you. Google Play needs a one-time US$25 developer account.
4. Submit: `npx eas-cli submit --platform ios` and `npx eas-cli submit --platform android`.

Change the app's permanent ID (`com.kelnovalabs.kamino`) in `app.config.ts` **before** the first
store upload if you want a different one — it can never be changed afterwards.

### App Store / Google Play review checklist

Apple and Google reject apps with user-generated content unless these exist. They are all built in:

- Report button on posts, comments, chat messages and profiles (`ReportSheet`).
- Block a person (profile → •••), which hides their posts and messages.
- Terms and Privacy links on the sign-up screen and in Settings.
- **Delete my account** inside the app (Settings).
- A working support contact — set `EXPO_PUBLIC_SUPPORT_EMAIL` in `.env` and in `eas.json`.
- Minimum age 13, stated in the terms.

You must still do these yourself: read and adjust the Privacy Policy and Terms on the server
(`web/src/routes/privacy.tsx`, `terms.tsx` — they are sensible drafts, **not legal advice**),
fill in the store listing (ready-made text and screenshots are in the root `store/` folder), and answer the age-rating and data-safety
questionnaires honestly (the app collects email, display name, and what people post; it has no ads
and no tracking).

---

## 4. How the code is organised

```
src/
  app/            One file = one screen (Expo Router). Folders in [brackets] are URL parameters.
    (tabs)/       The five bottom tabs: Home, Explore, Create, Chats, Me
    community/[slug]/…   Community home, post, compose, wiki, events, rank, members, files, news, chats, mod, standing
    chat/[roomId].tsx    A chat room
    profile/[handle].tsx Someone's profile
  api/            Talking to the server. endpoints.ts has one typed function per server call.
  auth/           Sign-in state and secure token storage (Keychain / Keystore).
  components/     Reusable pieces. ui/ is the design kit: Aurora (background), Glass, Card, Button,
                  Chip, Field, Sheet, Segmented, TabBar, Motion (PressableScale, Appear), States.
  lib/            Helpers with unit tests (dates, links, post validation, media limits).
  theme/          Colours (light + dark), spacing and fonts.
```

How a button press reaches the database: a screen calls `api.something()` →
`POST /api/v1/rpc/<name>` on the server → the *same* server function the website uses, with the
same permission checks. So the app can never do anything the website would refuse.

If you change a data type on the server, run `npm run sync-types` here to copy it across.

## 4b. New in release 7

- **Stories (role-play):** open a community, tap *Stories*. Claim a character, write your turns, and (when the server has the free AI storyteller switched on) the story continues by itself; ask for a twist or a whole new ending.
- **Safety tab** for moderators (Mod → Safety): items the safety check paused, with Restore / Remove / It's fine.
- **Wall cover:** on your profile tap *Change cover*, or use Edit profile.
- **Achievements:** 75 of them with progress bars; tap the star to show up to three as banners on your profile.
- If the safety check pauses something you shared, the app tells you it is waiting for a moderator.

## 5. Known limits (honest list)

- **Live calls** (audio, optional video, mute, ringing) are built with `react-native-webrtc` and use the
  same call service as the website, so phones and browsers can share a call. They need a development
  or store build (not Expo Go), and they have **never been tried between two real devices**: the call
  engine is covered by unit tests with pretend connections and the server side by integration tests.
  There is no speaker/earpiece switch (that needs one more native library). Behind strict office or
  mobile networks a TURN relay is needed (`KAMINO_TURN_*` on the server).
- **AI features** depend on the server's free AI keys. Without them, stories are played and narrated by members and only the built-in safety rules run. The AI will sometimes flag harmless posts or miss bad ones, which is why people make the final decision.
- **Push notifications** are wired end-to-end, but were not tested on a physical phone in this
  build environment — do one test on a real device after your first EAS build.
- **Photos, videos and voice notes** are stored in the server's database unless the server has the
  `KAMINO_S3_*` settings (an S3-compatible bucket); nothing changes in the app either way.
- New messages arrive by asking the server every 4 seconds while a chat is open (simple and
  reliable). Real-time sockets would be a later upgrade.
- The screens were exercised in a phone-sized browser against the live server and the iOS and
  Android bundles compile, but the app has not yet been opened on a physical iPhone or Android
  device or simulator by the person who wrote it. Expect to find a few small layout details to
  polish on the first real-device test.
