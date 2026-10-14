#!/usr/bin/env node
/**
 * Kamino one-click launcher.
 *
 *   node start.mjs            install (first run only), start the server AND the phone app, show the QR code
 *   node start.mjs --server   only the server / website
 *   node start.mjs --help
 *
 * On Windows just double-click Start-Kamino.cmd. On Mac/Linux run ./start.sh
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const web = join(root, "web");
const mobile = join(root, "mobile");
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const npx = isWindows ? "npx.cmd" : "npx";
const args = new Set(process.argv.slice(2));
const PORT = 8080;

if (args.has("--help") || args.has("-h")) {
  console.log("Usage: node start.mjs [--server]\n  --server   start only the server and website (no phone app)");
  process.exit(0);
}

const say = (text) => console.log(`\n\x1b[1m\x1b[35m▸ ${text}\x1b[0m`);
const fail = (text) => {
  console.error(`\n\x1b[31m✖ ${text}\x1b[0m\n`);
  process.exit(1);
};

// ── 1. Node version ─────────────────────────────────────────────────────────
const major = Number(process.versions.node.split(".")[0]);
const minor = Number(process.versions.node.split(".")[1]);
if (major < 22 || (major === 22 && minor < 13)) fail(`Kamino needs Node.js 22.13 or newer (you have ${process.versions.node}). Install the current version from https://nodejs.org and run this again.`);

// ── 2. Install dependencies the first time ──────────────────────────────────
function install(folder, name) {
  if (existsSync(join(folder, "node_modules"))) return;
  say(`First run: installing ${name} (this takes a few minutes, once)…`);
  const options = { cwd: folder, stdio: "inherit", shell: isWindows };
  let result = spawnSync(npm, ["ci", "--no-audit", "--no-fund"], options);
  if (result.status !== 0) {
    console.log("npm ci did not work; trying npm install instead…");
    result = spawnSync(npm, ["install", "--no-audit", "--no-fund"], options);
  }
  if (result.status !== 0) fail(`Could not install ${name}. Check your internet connection and run this again.`);
}
install(web, "the server");
if (!args.has("--server")) install(mobile, "the phone app");

// ── 3. Work out this computer's address on your Wi-Fi ───────────────────────
function lanAddress() {
  const candidates = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== "IPv4" || item.internal) continue;
      // Skip virtual adapters (Docker, WSL, VPN…): phones cannot reach them.
      if (/vEthernet|WSL|docker|virtual|vmware|vbox|tailscale|zerotier|hyper-v|loopback/i.test(name)) continue;
      const home = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address);
      candidates.push({ address: item.address, score: (home ? 2 : 0) + (/wi-?fi|wlan|wireless|en0/i.test(name) ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}
const lan = lanAddress();

// ── 4. Start processes, and stop them all together on Ctrl+C ────────────────
const children = [];
function run(name, command, commandArgs, cwd, env = {}) {
  const child = spawn(command, commandArgs, { cwd, stdio: "inherit", shell: isWindows, detached: !isWindows, env: { ...process.env, ...env } });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`\n${name} stopped unexpectedly (code ${code}). Scroll up to see why.`);
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

say("Starting the Kamino server…");
run("The server", npm, ["run", "dev"], web);

// Wait until the server accepts connections (the first start can take a little while).
function portOpen() {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: PORT });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}
async function waitForServer() {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && !shuttingDown) {
    if (await portOpen()) {
      // Load the home page once so the first person to open it does not wait for the first-time build.
      await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(180_000) }).catch(() => undefined);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}
if (!(await waitForServer())) fail("The server did not start within 4 minutes. Scroll up for the error message.");

console.log(`\n\x1b[32m✔ Kamino is running.\x1b[0m`);
console.log(`   Website on this computer : http://localhost:${PORT}`);
if (lan) console.log(`   Website on your Wi-Fi    : http://${lan}:${PORT}`);

if (args.has("--server")) {
  console.log("\nKeep this window open. Press Ctrl+C to stop.");
} else {
  say("Starting the phone app…");
  console.log("Install the free “Expo Go” app on your phone, join the SAME Wi-Fi as this computer,");
  console.log("then scan the QR code below (iPhone: Camera app · Android: inside Expo Go).\n");
  const env = { EXPO_NO_TELEMETRY: "1" };
  if (lan) {
    env.EXPO_PUBLIC_API_URL = `http://${lan}:${PORT}`; // the phone talks to this computer
    env.REACT_NATIVE_PACKAGER_HOSTNAME = lan;
  }
  run("The phone app", npx, ["expo", "start", "--dev-client", "--lan"], mobile, env);
  if (!lan) console.log("(Could not find your Wi-Fi address automatically. If the phone can't connect, see mobile/README.md.)");
}
