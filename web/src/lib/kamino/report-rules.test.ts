import assert from "node:assert/strict";
import { test } from "node:test";
import { fileReportSchema } from "./report-rules.ts";

test("reports accept legacy comment references and bound all reporter-supplied input", () => {
  const base = { targetType: "comment", targetId: "12/8", reason: "Harassment" };
  assert.equal(fileReportSchema.parse(base).targetId, "12/8");
  assert.equal(fileReportSchema.parse({ ...base, targetId: "8" }).targetId, "8");
  assert.equal(fileReportSchema.parse({ targetType: "user", targetId: "seed:artist", reason: "Spam" }).targetType, "user");
  for (const change of [
    { targetType: "sql" }, { targetId: "12/-8" }, { targetId: "12/8/2" }, { targetId: "2147483648" },
    { targetId: "0" }, { targetId: "NaN" }, { reason: " " }, { reason: "x".repeat(301) },
    { details: "x".repeat(5001) }, { communityId: "../private" },
  ]) assert.equal(fileReportSchema.safeParse({ ...base, ...change }).success, false);
});
