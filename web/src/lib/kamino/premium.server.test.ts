import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { premiumActiveSql } from "./premium.server.ts";
import { checkedContentMedia } from "./content-rules.ts";

test("premium benefits require paid, unexpired premium access for this beneficiary", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    await pg.exec(`create table billing_orders(id text,kind text,status text,test_mode bool);create table billing_entitlements(order_id text,beneficiary_id text,state text,expires_at timestamptz,test_mode bool);
   insert into billing_orders values('one','premium','paid',true);insert into billing_entitlements values('one','buyer','active',now()+interval '1 day',true);`);
    const active = async (user = "buyer") =>
      (await pg.query<{ active: boolean }>(`select ${premiumActiveSql("$1")} as active`, [user]))
        .rows[0]?.active;
    assert.equal(await active(), true);
    assert.equal(await active("other"), false);
    for (const statement of [
      "update billing_orders set kind='membership'",
      "update billing_orders set kind='premium',status='pending'",
      "update billing_orders set status='refunded'",
      "update billing_orders set status='paid';update billing_entitlements set state='revoked'",
      "update billing_entitlements set state='active',expires_at=now()-interval '1 second'",
      "update billing_entitlements set expires_at=null",
    ]) {
      await pg.exec(statement);
      assert.equal(await active(), false);
    }
  } finally {
    await pg.close();
  }
});
test("premium media raises bounded quotas without bypassing MIME or GIF validation", () => {
  const large = `data:text/plain;base64,${"YWFh".repeat(3_000_000)}`;
  assert.throws(() => checkedContentMedia("file", large), /under 8 MB/);
  assert.equal(checkedContentMedia("file", large, true).bytes, 9_000_000);
  assert.throws(
    () => checkedContentMedia("file", `data:text/plain;base64,${"YWFh".repeat(6_000_000)}`, true),
    /under 16 MB/,
  );
  assert.throws(
    () => checkedContentMedia("gif", "data:image/gif;base64,PHNjcmlwdD4=", true),
    /valid GIF/,
  );
  const original = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  assert.equal(checkedContentMedia("gif", original, true).mime, "image/gif");
});
