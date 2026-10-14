#!/usr/bin/env node
/**
 * Kamino guided publisher: from "the code is on my computer" to "the apps are with the stores".
 *
 *   Windows: double-click Publish-Kamino.cmd      Mac/Linux: node publish.mjs
 *
 * It walks through the steps below and stops only when it needs YOU (your logins, your server
 * address). It never asks for or stores a password: sign-ins happen in Expo's own screens.
 * It is safe to run again: every step checks whether it is already done and skips itself.
 *
 *   1. Check this computer      4. Sign in to Expo (free account)
 *   2. Point the app at server  5. Create the Expo project (its ID switches on push notifications)
 *   3. Install the app's parts  6. Build the apps in Expo's cloud, then send them to the stores
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const mobile = join(root, "mobile");
const isWindows = process.platform === "win32";
const EAS = ["--yes", "eas-cli@latest"]; // always the newest Expo build tool, no install needed

const rl = createInterface({ input: process.stdin, output: process.stdout });
const say = (text = "") => console.log(text);
const step = (n, title) => say(`\n\x1b[1m[${n}/6] ${title}\x1b[0m`);
const ok = (text) => say(`  \x1b[32m✔\x1b[0m ${text}`);
const warn = (text) => say(`  \x1b[33m!\x1b[0m ${text}`);

/** Stops the script with a plain-English explanation. */
function stop(message) {
  say(`\n\x1b[31m✖ ${message}\x1b[0m`);
  say("Nothing is broken. Fix the point above and run this again; it continues where it stopped.");
  rl.close();
  process.exit(1);
}

/** Runs a command inside mobile/. `capture` returns its output instead of showing it live. */
function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: mobile,
    shell: isWindows, // lets Windows find npm.cmd / npx.cmd
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

const eas = (args, options) => run("npx", [...EAS, ...args], options);

async function ask(question, fallback = "") {
  const answer = (await rl.question(`  ${question}${fallback ? ` [${fallback}]` : ""} `)).trim();
  return answer || fallback;
}

async function confirm(question) {
  return /^y/i.test(await ask(`${question} (y/n)`, "y"));
}

// ---------------------------------------------------------------------------------------------
say("\n\x1b[1mKamino publisher\x1b[0m: takes about 10 minutes of your time, plus waiting for builds.");
say("You will need: an Expo account (free), and for the stores an Apple Developer account");
say("(US$99/year) and/or a Google Play developer account (US$25 once). See DEPLOY.md.\n");

// 1. Computer ----------------------------------------------------------------------------------
step(1, "Checking this computer");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) stop(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org and run this again.`);
ok(`Node.js ${process.versions.node}`);
if (!run("npm", ["--version"], { capture: true }).ok) stop("npm is missing. It comes with Node.js: reinstall from https://nodejs.org.");
ok("npm is installed");

// 2. Server address ----------------------------------------------------------------------------
step(2, "Pointing the app at your server");
const easPath = join(mobile, "eas.json");
const readServer = () => JSON.parse(readFileSync(easPath, "utf8")).build?.production?.env?.EXPO_PUBLIC_API_URL ?? "";
let server = readServer();
if (!server.startsWith("https://") || server.includes("YOUR-")) {
  say("  The phone app needs the address of your online Kamino server (see DEPLOY.md, Part 1).");
  say("  It looks like https://kamino.onrender.com and must start with https://");
  const address = await ask("Your server address:");
  const email = await ask("Support email shown in the app (optional, press Enter to skip):");
  if (!address) stop("No server address given.");
  const result = run("node", ["scripts/set-server.mjs", address, ...(email ? [email] : [])]);
  if (!result.ok) stop("That address was not accepted (see the message above).");
  server = readServer();
} else {
  ok(`Already set to ${server}`);
}
try {
  say("  Checking the server answers (a sleeping free server can take up to a minute)...");
  const reply = await fetch(server, { signal: AbortSignal.timeout(70_000) });
  if (reply.status >= 500) throw new Error(`the server said ${reply.status}`);
  ok("Your server is online");
} catch (error) {
  warn(`Could not reach ${server} (${error instanceof Error ? error.message : error}).`);
  if (!(await confirm("Continue anyway? The apps would not work until the server is up."))) stop("Stopped so you can check the server.");
}

// 3. Install -----------------------------------------------------------------------------------
step(3, "Installing the app's parts (first time only, a few minutes)");
if (existsSync(join(mobile, "node_modules"))) ok("Already installed");
else if (!run("npm", ["install"]).ok) stop("Installing failed (see the message above). Check your internet connection.");
else ok("Installed");

// 4. Expo sign-in ------------------------------------------------------------------------------
step(4, "Signing in to Expo");
let who = eas(["whoami"], { capture: true });
if (!who.ok) {
  say("  Sign in (or create a free account at https://expo.dev/signup first). Type your details in the prompts below;");
  say("  they go straight to Expo and this script never sees your password.\n");
  if (!eas(["login"]).ok) stop("Sign-in did not finish.");
  who = eas(["whoami"], { capture: true });
}
ok(`Signed in as ${who.output.trim().split(/\r?\n/).pop()}`);

// 5. Expo project ------------------------------------------------------------------------------
step(5, "Creating the Expo project");
const configPath = join(mobile, "app.config.ts");
const projectIdPattern = /const EAS_PROJECT_ID = "([^"]*)";/;
let config = readFileSync(configPath, "utf8");
if (projectIdPattern.exec(config)?.[1]) {
  ok("Already created");
} else {
  const created = eas(["init", "--non-interactive"], { capture: true });
  let id = created.output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? "";
  if (!id) {
    say(created.output.trim().split(/\r?\n/).slice(-6).join("\n"));
    say("\n  Could not read the project ID automatically. Open https://expo.dev, open the 'kamino' project,");
    say("  and copy its Project ID (looks like 1a2b3c4d-....).");
    id = await ask("Paste the Project ID:");
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) stop("That does not look like a project ID.");
  config = config.replace(projectIdPattern, `const EAS_PROJECT_ID = "${id}";`);
  writeFileSync(configPath, config);
  ok(`Project created and saved (${id})`);
}

// 6. Build and send ----------------------------------------------------------------------------
step(6, "Building the apps and sending them to the stores");
say("  1) Android + iPhone   2) Android only   3) iPhone only   4) A test Android file to try on my phone first\n");
const choice = await ask("Choose 1-4:", "4");
const plan = { 1: ["all"], 2: ["android"], 3: ["ios"], 4: ["preview"] }[choice];
if (!plan) stop("Please choose 1, 2, 3 or 4.");

if (plan[0] === "preview") {
  say("\n  Building an installable Android test file (about 15 minutes in Expo's cloud)...\n");
  if (!eas(["build", "--profile", "preview", "--platform", "android"]).ok) stop("The test build failed. The message above says why.");
  ok("Done. Open the link Expo printed on your Android phone to install and try Kamino.");
} else {
  const platform = plan[0];
  say("\n  Building the store versions. For iPhone, Expo asks you to sign in to your Apple Developer account once");
  say("  and then creates the certificates for you. This takes 15 to 30 minutes.\n");
  if (!eas(["build", "--profile", "production", "--platform", platform]).ok) stop("The build failed. The message above says why.");
  ok("Builds finished");

  if (platform !== "android") {
    say("\n  Sending the iPhone app to App Store Connect (TestFlight)...");
    if (!eas(["submit", "--platform", "ios", "--latest"]).ok) warn("iPhone upload did not finish. Fix the message above and run: npx eas-cli submit --platform ios --latest (in the mobile folder).");
    else ok("iPhone app uploaded. Finish the listing in App Store Connect using store/STORE-LISTING.md, then press 'Submit for Review'.");
  }
  if (platform !== "ios") {
    say("\n  Android: Google requires the FIRST version of a new app to be uploaded by hand.");
    say("  Download the .aab from the build page Expo printed above, then in Play Console create the app and upload it");
    say("  (see DEPLOY.md, Part 3). After that, `npx eas-cli submit --platform android --latest` works for updates.");
  }
}

say("\n\x1b[1mAll done for now.\x1b[0m Before pressing 'Submit for Review' in either store, give reviewers a demo account");
say("(store/STORE-LISTING.md explains how) and fill in the listing text and screenshots from the store/ folder.\n");
rl.close();
