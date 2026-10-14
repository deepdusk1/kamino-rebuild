/**
 * Regenerates the app icons from the Kamino K mark. Run `npm run icons`.
 * Output goes to assets/. Needs the dev dependency `sharp`.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const gradient = `<defs><linearGradient id="k" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
<stop stop-color="#b49aff"/><stop offset=".6" stop-color="#8c70ef"/><stop offset="1" stop-color="#63d7cf"/></linearGradient></defs>`;
const mark = `<path d="M20 17v30M43 17 27 32l17 15" fill="none" stroke="#171226" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="49" cy="13" r="4" fill="#e9fff9"/>`;

// Full-bleed square icon (stores round the corners themselves).
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${gradient}<rect width="64" height="64" fill="url(#k)"/>${mark}</svg>`;
// Android adaptive foreground: the mark sits inside the central safe zone on a transparent canvas.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(9.6 9.6) scale(0.7)">${mark}</g></svg>`;
// Splash: the rounded logo alone; the splash background colour is set in app.config.ts.
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${gradient}<rect x="2" y="2" width="60" height="60" rx="20" fill="url(#k)"/>${mark}</svg>`;

mkdirSync("assets", { recursive: true });
const write = (svg, file, size) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(`assets/${file}`);
await Promise.all([
  write(icon, "icon.png", 1024),
  write(foreground, "adaptive-icon.png", 1024),
  write(splash, "splash-icon.png", 512),
  write(splash, "favicon.png", 96),
]);
console.log("Icons written to assets/");
