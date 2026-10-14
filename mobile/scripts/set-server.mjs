#!/usr/bin/env node
/**
 * Points the phone app at your server, in every place that needs to know.
 *
 *   npm run set-server https://kamino.onrender.com
 *   npm run set-server https://kamino.onrender.com support@yourdomain.com
 *
 * It updates eas.json (used by cloud builds) and .env (used when running locally).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [rawUrl, email] = process.argv.slice(2);
if (!rawUrl) {
  console.error("Usage: npm run set-server https://your-server.example [support@your-email.example]");
  process.exit(1);
}
let url;
try {
  url = new URL(rawUrl);
} catch {
  console.error(`"${rawUrl}" is not a web address. Example: https://kamino.onrender.com`);
  process.exit(1);
}
if (url.protocol !== "https:") {
  console.error("Use the secure https:// address. iPhones refuse plain http:// servers in store builds.");
  process.exit(1);
}
const server = url.origin;

// eas.json
const easPath = new URL("../eas.json", import.meta.url);
const eas = JSON.parse(readFileSync(easPath, "utf8"));
for (const profile of ["preview", "production"]) {
  eas.build[profile].env = { ...eas.build[profile].env, EXPO_PUBLIC_API_URL: server, ...(email ? { EXPO_PUBLIC_SUPPORT_EMAIL: email } : {}) };
}
writeFileSync(easPath, JSON.stringify(eas, null, 2) + "\n");

// .env
const envPath = new URL("../.env", import.meta.url);
const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/).filter(Boolean) : [];
const setLine = (key, value) => {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
};
setLine("EXPO_PUBLIC_API_URL", server);
if (email) setLine("EXPO_PUBLIC_SUPPORT_EMAIL", email);
writeFileSync(envPath, lines.join("\n") + "\n");

console.log(`✔ The app now talks to ${server}${email ? ` and lists ${email} as the support contact` : ""}.`);
console.log("  Next: npx eas-cli build --profile preview --platform android");
