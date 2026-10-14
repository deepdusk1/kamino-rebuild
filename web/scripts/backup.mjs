#!/usr/bin/env node
/**
 * Saves a copy of the whole Kamino database into one file.
 *
 *   DATABASE_URL="postgres://..." npm run backup
 *   DATABASE_URL="postgres://..." npm run backup -- ./my-backups
 *
 * The file is a compressed text file (`kamino-backup-YYYY-MM-DD-HHMM.ndjson.gz`) with one line per
 * table row (the table's name, a tab, then the row as JSON). It is taken from one consistent snapshot, so it is safe to run while people use the
 * app. Keep copies somewhere other than the server (your computer, cloud storage).
 * Bring a backup back with `npm run restore -- <file>`.
 *
 * Passwords are stored as hashes, exactly as in the database, so treat the file as private.
 */
import { createWriteStream, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createGzip } from "node:zlib";
import pg from "pg";
import { backupFileName, ident, orderTables } from "./backup-lib.mjs";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('Set DATABASE_URL first, for example:  DATABASE_URL="postgres://user:pass@host/db" npm run backup');
  process.exit(1);
}
const outDir = resolve(process.argv[2] ?? "backups");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, backupFileName());

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // One snapshot for the whole backup, so a table never disagrees with another one.
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

  const tables = (await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '_migrations'`,
  )).rows.map((r) => r.table_name);
  const foreignKeys = (await client.query(
    `select c.conrelid::regclass::text as tbl, c.confrelid::regclass::text as ref
     from pg_constraint c join pg_namespace n on n.oid = c.connamespace
     where c.contype = 'f' and n.nspname = 'public'`,
  )).rows.map((r) => ({ table: r.tbl.replace(/"/g, ""), references: r.ref.replace(/"/g, "") }));
  const migrations = (await client.query("select name from _migrations order by name")).rows.map((r) => r.name);

  const gzip = createGzip();
  const out = createWriteStream(file);
  gzip.pipe(out);
  const write = async (line) => {
    if (!gzip.write(line + "\n")) await once(gzip, "drain");
  };

  await write(JSON.stringify({ format: "kamino-backup", version: 1, createdAt: new Date().toISOString(), migrations }));
  const counts = {};
  for (const table of orderTables(tables, foreignKeys)) {
    // Primary-key order keeps parents (for example a comment being replied to) ahead of their children.
    const key = (await client.query(
      `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = $1::regclass and i.indisprimary order by array_position(i.indkey, a.attnum)`,
      [ident(table)],
    )).rows.map((r) => `t.${ident(r.attname)}`);
    const order = key.length ? ` order by ${key.join(", ")}` : "";
    // row_to_json keeps timestamps and big numbers exactly as the database holds them.
    const rows = (await client.query(`select row_to_json(t)::text as line from ${ident(table)} t${order}`)).rows;
    for (const { line } of rows) await write(`${table}\t${line}`);
    counts[table] = rows.length;
  }
  await write(JSON.stringify({ end: true, counts }));
  gzip.end();
  await once(out, "finish");
  await client.query("COMMIT");

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`✔ Backed up ${tables.length} tables (${total} rows) to ${file}`);
  console.log("  Keep a copy somewhere other than this server. Restore with:  npm run restore -- <file>");
} catch (error) {
  console.error("Backup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
