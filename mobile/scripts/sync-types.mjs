/**
 * Copies the shared data types from the web app so the phone app and the server
 * always agree on their shape. Run `npm run sync-types` after changing the server types.
 * Expects the standard layout:  Kamino/web  and  Kamino/mobile  side by side.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const source = "../web/src/lib/kamino/types.ts";
if (!existsSync(source)) {
  console.error(`Could not find ${source}. Keep the "web" and "mobile" folders next to each other.`);
  process.exit(1);
}
const header = "// Copied from the web app (web/src/lib/kamino/types.ts) by `npm run sync-types`. Do not edit here.\n";
writeFileSync("src/api/types.ts", header + readFileSync(source, "utf8"));
console.log("src/api/types.ts updated");
