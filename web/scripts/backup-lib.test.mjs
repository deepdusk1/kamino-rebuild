import assert from "node:assert/strict";
import { test } from "node:test";
import { backupFileName, ident, orderTables } from "./backup-lib.mjs";

test("parents come before children", () => {
  const order = orderTables(["comments", "posts", "user", "profiles"], [
    { table: "comments", references: "posts" },
    { table: "posts", references: "user" },
    { table: "profiles", references: "user" },
  ]);
  assert.ok(order.indexOf("user") < order.indexOf("posts"));
  assert.ok(order.indexOf("posts") < order.indexOf("comments"));
  assert.ok(order.indexOf("user") < order.indexOf("profiles"));
});

test("self references and cycles do not lose or duplicate tables", () => {
  const order = orderTables(["a", "b", "c"], [
    { table: "a", references: "a" },
    { table: "b", references: "c" },
    { table: "c", references: "b" },
  ]);
  assert.deepEqual([...order].sort(), ["a", "b", "c"]);
  assert.equal(order.length, 3);
});

test("references to tables that are not being backed up are ignored", () => {
  assert.deepEqual(orderTables(["x"], [{ table: "x", references: "ghost" }]), ["x"]);
});

test("identifiers are quoted safely and file names sort by time", () => {
  assert.equal(ident('we"ird'), '"we""ird"');
  assert.equal(backupFileName(new Date(Date.UTC(2026, 8, 9, 7, 5))), "kamino-backup-2026-09-09-0705.ndjson.gz");
});
