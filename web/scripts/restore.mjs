#!/usr/bin/env node
/**
 * Puts a backup made by `npm run backup` into a database.
 *
 *   DATABASE_URL="postgres://..." npm run restore -- backups/kamino-backup-2026-09-29-1530.ndjson.gz
 *
 * It refuses to touch a database that already has people in it. To replace what is there
 * (for example after a disaster, when you want the backup to win), add --replace:
 *
 *   DATABASE_URL="postgres://..." npm run restore -- <file> --replace
 *
 * Steps: create the tables (the normal migrations), load every row, fix the id counters, then check
 * that each table has exactly as many rows as the backup said. Everything happens in one transaction,
 * so a failure leaves the database as it was.
 */
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pg from "pg";
import { ident } from "./backup-lib.mjs";

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const file = args.find((a) => !a.startsWith("--"));
const url = process.env.DATABASE_URL?.trim();
if (!file || !url) {
  console.error('Usage:  DATABASE_URL="postgres://..." npm run restore -- <backup file> [--replace]');
  process.exit(1);
}

// 1. Make sure the tables exist (the normal deploy-time migrations; safe to run again).
const migrate = spawnSync(process.execPath, [fileURLToPath(new URL("./migrate.mjs", import.meta.url))], { stdio: "inherit", env: process.env });
if (migrate.status !== 0) {
  console.error("Could not prepare the database tables.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const BATCH = 400;

try {
  // Read the backup's header first (first line) so we can stop early on a mismatch.
  const lines = createInterface({ input: createReadStream(resolve(file)).pipe(createGunzip()), crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  const header = JSON.parse((await iterator.next()).value ?? "{}");
  if (header.format !== "kamino-backup") throw new Error("That file is not a Kamino backup.");

  const applied = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name));
  const missing = header.migrations.filter((name) => !applied.has(name));
  if (missing.length) throw new Error(`The backup is from a newer Kamino (it has ${missing.join(", ")}). Update the app, then restore.`);

  const people = Number((await client.query(`select count(*)::int as n from "user"`)).rows[0].n);
  if (people > 0 && !replace) {
    throw new Error(`This database already has ${people} account(s). Nothing was changed. Add --replace if you really want the backup to overwrite it.`);
  }

  // If the database login is allowed to, skip reference checks while loading (order then cannot matter).
  await client.query("set session_replication_role = replica").catch(() => undefined);
  await client.query("BEGIN");
  const tables = (await client.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '_migrations'`,
  )).rows.map((r) => r.table_name);
  if (replace) await client.query(`truncate ${tables.map(ident).join(", ")} restart identity cascade`);

  const known = new Set(tables);
  const skipped = new Set();
  const loaded = {};
  let batchTable = null;
  let batch = []; // rows as raw JSON text, so numbers and timestamps are never rounded on the way through
  const flush = async () => {
    if (batchTable && batch.length) {
      await client.query(
        `insert into ${ident(batchTable)} select * from json_populate_recordset(null::${ident(batchTable)}, $1::json)`,
        [`[${batch.join(",")}]`],
      );
      loaded[batchTable] = (loaded[batchTable] ?? 0) + batch.length;
    }
    batch = [];
  };

  let counts = null;
  for await (const line of { [Symbol.asyncIterator]: () => iterator }) {
    if (!line) continue;
    if (line.startsWith("{")) {
      const marker = JSON.parse(line);
      if (marker.end) {
        counts = marker.counts;
        break;
      }
      continue;
    }
    const tab = line.indexOf("\t");
    const table = line.slice(0, tab);
    if (!known.has(table)) {
      skipped.add(table);
      continue;
    }
    if (table !== batchTable || batch.length >= BATCH) {
      await flush();
      batchTable = table;
    }
    batch.push(line.slice(tab + 1));
  }
  await flush();
  if (!counts) throw new Error("The backup file is cut short (no end marker). It was probably not fully saved.");

  // 3. Id counters (serial columns) continue after the highest restored id.
  const serials = (await client.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and column_default like 'nextval(%'`,
  )).rows;
  for (const { table_name, column_name } of serials) {
    await client.query(
      `select setval(pg_get_serial_sequence($1, $2), greatest(coalesce((select max(${ident(column_name)}) from ${ident(table_name)}), 0), 1), (select count(*) > 0 from ${ident(table_name)}))`,
      [ident(table_name), column_name],
    );
  }

  // 4. Every table must hold exactly what the backup said it held.
  const problems = [];
  for (const [table, expected] of Object.entries(counts)) {
    if (!known.has(table)) continue;
    const actual = Number((await client.query(`select count(*)::int as n from ${ident(table)}`)).rows[0].n);
    if (actual !== expected) problems.push(`${table}: backup has ${expected}, database has ${actual}`);
  }
  if (problems.length) throw new Error(`Row counts do not match:\n  ${problems.join("\n  ")}`);

  await client.query("COMMIT");
  const total = Object.values(loaded).reduce((a, b) => a + b, 0);
  console.log(`✔ Restored ${total} rows into ${Object.keys(loaded).length} tables from ${file}`);
  if (skipped.size) console.log(`  Skipped tables that no longer exist: ${[...skipped].join(", ")}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Restore failed (the database was left as it was):", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
