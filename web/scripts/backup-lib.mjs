/** Small pure helpers shared by backup.mjs and restore.mjs. */

/**
 * Puts tables in an order where every table comes after the tables it points to
 * (its "foreign keys"), so rows can be loaded without a reference to a row that does not exist yet.
 * Tables that point at each other are kept in name order at the end: rows inside them are then
 * loaded in primary-key order, which puts parents before children in practice.
 *
 * @param {string[]} tables
 * @param {{ table: string, references: string }[]} foreignKeys
 * @returns {string[]}
 */
export function orderTables(tables, foreignKeys) {
  const known = new Set(tables);
  /** @type {Map<string, Set<string>>} */
  const needs = new Map(tables.map((t) => [t, new Set()]));
  for (const { table, references } of foreignKeys) {
    if (table !== references && known.has(table) && known.has(references)) needs.get(table)?.add(references);
  }
  const done = new Set();
  const ordered = [];
  let progressed = true;
  while (ordered.length < tables.length && progressed) {
    progressed = false;
    for (const table of [...tables].sort()) {
      if (done.has(table)) continue;
      if ([...(needs.get(table) ?? [])].every((dep) => done.has(dep))) {
        done.add(table);
        ordered.push(table);
        progressed = true;
      }
    }
  }
  // Anything left is part of a cycle.
  for (const table of [...tables].sort()) if (!done.has(table)) ordered.push(table);
  return ordered;
}

/** Quotes a SQL identifier (table or column name). */
export function ident(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** `kamino-backup-2026-09-29-1530.ndjson.gz` */
export function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `kamino-backup-${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}.ndjson.gz`;
}
