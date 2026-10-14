import assert from "node:assert/strict";
import { test } from "node:test";
import { childFolders, normalizeFolder } from "./folders.ts";

test("folder names are tidied up and can not climb out", () => {
  assert.equal(normalizeFolder("  Guides //  Maps "), "Guides/Maps");
  assert.equal(normalizeFolder("../../etc"), "etc");
  assert.equal(normalizeFolder("a\\b"), "a/b");
  assert.equal(normalizeFolder(""), "");
  assert.equal(normalizeFolder("a/b/c/d/e"), "a/b/c/d");
});

test("child folders list only the next level, counting everything below", () => {
  const all = ["Guides", "Guides/Maps", "Guides/Maps/Old", "Art", "", "Guides"];
  assert.deepEqual(childFolders(all, ""), [
    { folder: "Art", name: "Art", count: 1 },
    { folder: "Guides", name: "Guides", count: 4 },
  ]);
  assert.deepEqual(childFolders(all, "Guides"), [{ folder: "Guides/Maps", name: "Maps", count: 2 }]);
});
