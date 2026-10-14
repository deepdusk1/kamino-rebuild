/**
 * Folder helpers for the shared files screen. Mirrors normalizeFolder / folderCounts in
 * web/src/lib/kamino/albums.ts, which is what the server uses.
 */

const MAX_FOLDER_DEPTH = 4;
const MAX_SEGMENT = 30;

/** Turns what someone typed ("  Guides // Maps ") into a clean folder path ("Guides/Maps"), or "" for the top level. */
export function normalizeFolder(input: string): string {
  const parts = input
    .split(/[/\\]/)
    .map((part) => part.replace(/\s+/g, " ").trim().slice(0, MAX_SEGMENT))
    .filter((part) => part && part !== "." && part !== "..");
  return parts.slice(0, MAX_FOLDER_DEPTH).join("/");
}

/** The folders directly inside `here` ("" is the top level), with how many items each holds (including sub-folders). */
export function childFolders(folders: string[], here: string): { folder: string; name: string; count: number }[] {
  const prefix = here ? `${here}/` : "";
  const counts = new Map<string, number>();
  for (const folder of folders) {
    if (!folder.startsWith(prefix) || folder === here) continue;
    const child = prefix + folder.slice(prefix.length).split("/")[0];
    counts.set(child, (counts.get(child) ?? 0) + 1);
  }
  return [...counts]
    .map(([folder, count]) => ({ folder, name: folder.slice(prefix.length), count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
