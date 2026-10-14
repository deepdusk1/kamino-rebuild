# Put Kamino on the internet (step by step)

You do this once. It takes about 30 minutes and no coding. When you finish, Kamino has a public
web address, the website works for everyone, and the phone apps can be built to use it.

**What you will use**

| Thing | What it is for | Cost |
| --- | --- | --- |
| [GitHub](https://github.com) account | Stores your copy of the code so Render can read it | Free |
| [Render](https://render.com) account | Runs the Kamino server and its database | Free plan to test; about US$13/month and up for a real always-on setup (see step 5) |
| [Expo](https://expo.dev) account | Builds the iPhone and Android apps in the cloud | Free plan is enough to start |
| Apple Developer account | Needed only to publish on the App Store | US$99 per year |
| Google Play developer account | Needed only to publish on Google Play | US$25 once |

You can do steps 1 to 4 and 6 without paying anyone. The two store accounts are only for step 7.

> **Just want to try it on your own computer and phone first?** Skip this guide, double-click
> `Start-Kamino.cmd` (Windows) or run `./start.sh` (Mac/Linux). Come back here when you want other
> people to use it.

---

## Step 1: Put the Kamino folder on GitHub

1. Sign in to GitHub and click **New repository**. Name it `kamino`. Choose **Private**. Click **Create repository**.
2. Open a terminal **inside the Kamino folder** (the one that contains `render.yaml`, `web` and `mobile`).
3. Run these lines one at a time (replace `YOUR-NAME` with your GitHub user name):

```sh
git init
git add .
git commit -m "Kamino"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/kamino.git
git push -u origin main
```

If Git asks you to sign in, do it in the window that opens. The `.gitignore` files already keep
passwords, `node_modules` and local data out of GitHub.

## Step 2: Create the server on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) and create an account (sign in with GitHub to make it easy).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub account and pick the `kamino` repository. Click **Connect**.
4. Render reads `render.yaml`, shows a **web service** called `kamino` and a **database** called `kamino-db`. Click **Apply**.
5. Wait 5 to 10 minutes while it builds. When the `kamino` service says **Live**, click its address at the top (it looks like `https://kamino-xxxx.onrender.com`). **That is your Kamino server address. Write it down.**

Everything else (secret keys, database connection, https, database tables) is set up automatically.

## Step 3: Check that it works

Open these in your browser (replace with your own address):

- `https://kamino-xxxx.onrender.com/`: the Kamino website. Create an account and start a community.
- `https://kamino-xxxx.onrender.com/privacy` and `/terms`: your legal pages.

If the page shows an error, open Render → your `kamino` service → **Logs**. See "If something goes wrong" at the bottom.

## Step 4: Turn on emails (password reset)

Without this, "Forgot password" cannot send emails.

1. Create a free account at [resend.com](https://resend.com), add and verify your domain (or use their test sender while trying things out), and create an **API key**.
2. In Render → `kamino` service → **Environment** → **Add Environment Variable**:
   - `RESEND_API_KEY` = the key you just created
   - `MAIL_FROM` = `Kamino <hello@your-domain.example>` (must be an address on the domain you verified)
3. Click **Save**. Render restarts the server by itself.

## Step 4b: Switch on the free AI (safety check and storyteller)

Kamino's built-in safety rules always run. Two free keys add more. Both are optional and you can add them later.

1. **Safety check (text and pictures).** Sign up at [platform.openai.com](https://platform.openai.com), open **API keys**, and create a key. OpenAI does not charge for its moderation service. In Render → `kamino` → **Environment**, set `KAMINO_MODERATION_API_KEY` to that key.
2. **AI storyteller for role-play.** Sign up at [console.groq.com](https://console.groq.com) (no credit card), open **API Keys**, and create one. Set `KAMINO_AI_API_KEY` to it. Nothing free is unlimited: Groq gives each model about 200,000 tokens a day, which is roughly 150 story replies per model. Kamino uses two models one after the other (`KAMINO_AI_MODEL`, comma-separated), so about 300 replies a day, and stops at 300 by itself (change with `KAMINO_AI_DAILY_LIMIT`). When the day's free replies run out, members can keep playing and narrate by hand. To remove the limit you would run your own model and point `KAMINO_AI_BASE_URL` at it.
3. **You as site owner.** Set `KAMINO_ADMIN_EMAILS` to the email you sign in with. You then see serious safety cases from every community, direct messages and profile walls at `https://your-address/admin/safety`, and you get a notification when one comes in.

Check: open any community's **Stories** tab. If it says the storyteller narrates, the key works. Free tiers and their limits are set by OpenAI and Groq and can change; if one stops working, Kamino keeps running on the built-in rules.

**If something involving a child ever appears.** Do not download, copy or share it. Remove it in the safety queue, then report it: in Canada to [Cybertip.ca](https://www.cybertip.ca), in the US to the [NCMEC CyberTipline](https://report.cybertip.org). Running a service can come with legal duties to report and to keep records; ask a lawyer which apply to you. The AI checks text for this, but it cannot recognise such pictures reliably; hash-matching services (for example Microsoft PhotoDNA, free for eligible organisations) are the tool for that once you grow.

## Step 5: The free plan: what to expect (checked against Render's documentation)

- The free **web service goes to sleep after 15 minutes** with no visitors. The next visitor waits about a minute while it wakes up. Fine for testing, not for a real launch.
- The free **database is deleted 30 days after it is created.** Do not put anything you care about on it.
- **Before real people use Kamino**, in Render change the `kamino` web service and `kamino-db` database to a paid plan (at the time of writing: Starter web service US$7 per month, smallest paid database US$6 per month plus a little for storage; check [render.com/pricing](https://render.com/pricing) for today's prices). Your data and address stay the same.
- Turn on backups for the paid database (Render dashboard → `kamino-db` → **Backups**).
- Photos, videos, voice notes, covers and quiz pictures are stored inside the database by default. That is fine for a first community. When you grow, switch on file storage (S3, Cloudflare R2, Backblaze B2): create a **private** bucket, then in Render → **Environment** add `KAMINO_S3_ENDPOINT`, `KAMINO_S3_BUCKET`, `KAMINO_S3_ACCESS_KEY_ID`, `KAMINO_S3_SECRET_ACCESS_KEY` and `KAMINO_S3_REGION` (for R2 use `auto`). New files go to the bucket from then on; older ones keep working from the database. Remember that database backups do **not** include the bucket, so turn on the bucket's versioning or backup too.

## Step 6: Point the phone app at your server

In a terminal inside the `mobile` folder:

```sh
npm install
npm run set-server https://kamino-xxxx.onrender.com you@your-email.example
```

The second address is your support email; the app shows it in Settings → Contact support.
This one command updates `eas.json` (cloud builds) and `.env` (running on your computer).

Optional: rename the app. Open `mobile/app.config.ts` and change `IDENTIFIER` (default
`com.kelnovalabs.kamino`) to something like `com.yourname.kamino`. **Do this before your first
store upload. It cannot be changed later.**

## Step 7: Build the apps and publish

**Shortcut:** double-click `Publish-Kamino.cmd` (Windows) or run `node publish.mjs`. It does this whole step for you, one question at a time, and only stops for your sign-ins. The manual commands below are the same thing, if you prefer them.

Run all of this inside the `mobile` folder.

1. Log in and link the project to your Expo account:

   ```sh
   npx eas-cli login
   npx eas-cli init
   ```

   `init` prints a **project ID**. Paste it into `mobile/app.config.ts` on the line
   `const EAS_PROJECT_ID = "";` (this is what switches push notifications on).

2. **Test build for your own phone** (Android gives you an installable file, no store needed):

   ```sh
   npx eas-cli build --profile preview --platform android
   ```

   When it finishes, open the link on your phone to install. Sign up, post, send a chat photo. For
   iPhone, ask Expo for an internal build with `--profile preview --platform ios` (needs the Apple account).

3. **Store builds** (do this after the test build works):

   ```sh
   npx eas-cli build --profile production --platform all
   ```

   The first iPhone build asks you to sign in with your Apple Developer account; EAS creates the
   certificates for you. For Android, EAS creates the signing key and keeps it safe.

4. **Send them to the stores:**

   ```sh
   npx eas-cli submit --platform ios
   npx eas-cli submit --platform android
   ```

   Google Play needs the very first upload done by hand in the Play Console (Expo explains this
   when you run the command). Then fill in the store page using **`store/STORE-LISTING.md`**: every
   text, the privacy answers and the review notes are written for you, and the screenshots are in
   the `store` folder.

5. Make a **reviewer account** on your live server (see section 5 of `STORE-LISTING.md`) so the
   store's reviewer can sign in. Review usually takes from a few hours to a few days.

## Keeping it healthy (after launch)

- **Backups.** In a terminal inside `web`: `DATABASE_URL="(your database address from Render)" npm run backup` saves the whole database into one file. Do this before big updates and copy the file somewhere other than Render. `npm run restore -- <file>` brings it back (it checks the row counts). Also turn on Render's own database backups (step 5).
- **Calls on the phone.** Live calls in the phone app use a native library, so they work in builds made with EAS (step 7) or a development build, **not in Expo Go**. Nobody has tried them between two real devices yet: please test one call between two phones, and one between a phone and the website, before you announce the feature.
- **Calls on strict networks.** Voice and video work on ordinary Wi-Fi. For people behind office or some mobile networks, add a relay: in Render → **Environment**, set `KAMINO_TURN_URLS` and `KAMINO_TURN_SECRET` (your own coturn server), or `KAMINO_TURN_USERNAME` and `KAMINO_TURN_CREDENTIAL` (a TURN service such as Metered or Twilio). Skip this at first.
- **Spam limits** are already on. Someone going too fast sees "You're doing that too fast" and can try again a moment later.
- **Age check.** Sign-up asks for a birthday once, keeps only "13 or older" and erases accounts of anyone younger.

## Updating later

Change something, then `git add . && git commit -m "what changed" && git push`. Render rebuilds the
server automatically and applies database changes. New phone builds are only needed when you change
files inside `mobile/` (increase `version` in `app.config.ts` for a new store release).

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Render build fails | Open the build log. If it says a version of Node is wrong, check `NODE_VERSION` is `24` in the service's Environment. Then **Manual Deploy → Clear build cache & deploy**. |
| Website shows an error page | Render → `kamino` → **Logs**. If it says `Set DATABASE_URL`, the database link is missing: re-apply the Blueprint. |
| First page takes a minute | The free plan was asleep. Normal. Upgrade the plan to stop it. |
| App says "Can't reach Kamino" | The address in `eas.json` is wrong or has a typo. Run `npm run set-server` again, then rebuild. The address must start with `https://`. |
| No reset emails arrive | Step 4 not finished, or `MAIL_FROM` is not on a verified domain. Check Render logs for lines starting `[mail]`. |
| No push notifications on Android Expo Go | Expected: Expo Go on Android cannot receive push. Use a real build (step 7.2). |
| You changed the code and the app looks unchanged | Rebuild the app (step 7). Only website/server changes deploy automatically. |
# Release 9 prerequisites

Before deploying this build, read `web/IDENTITY_SECURITY.md`, `web/BILLING.md` and `FEATURE-STATUS.md`. Run all migrations, configure verified email delivery and administrator identities, and provide `KAMINO_JOB_SECRET` so background reminders/digests run.

**Back up before migrating.** Kamino is an adults-only (18+) platform: migration `0024` clears
stored age confirmations so everyone re-confirms at 18+, and the app erases accounts that
confirm as under 18. If you are migrating a database that predates that change, run
`npm run backup` in `web` first and store the file outside the host. Fresh deploys are
unaffected. Payments ship as a disabled-by-default Stripe sandbox; live billing with creator payouts is a separate, explicit switch (`web/BILLING.md`). Native store purchases are not built. Update the store privacy declarations for the optional native contacts flow and configured providers. Physical-device calls, permissions and notification delivery still require verification.

