import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  notificationTargetSql,
  legacyEventNotificationAccessSql,
} from "./notification-target-sql.ts";
import { paidResourceAccessSql } from "./billing-policy.ts";
import { paidRoomAccessSql } from "./paid-room-policy.ts";

test("legacy notification links cannot bypass mapped post, community or event-room access", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    await pg.exec(`create table creator_offers(id int primary key);insert into creator_offers values(1);
      create table memberships(community_id text,user_id text,status text,role text);
      create table events(id int primary key,chat_room_id int,live_room_id int,community_id text);
      insert into events values(7,5,null,'event-source');
      create table notifications(id int primary key,target_type text,target_id text,href text,kind text default 'comment');
      insert into notifications(id,target_type,target_id,href) values(1,'','','/c/source/p/3?comment=4'),(2,null,null,'/chats/5?call=1'),(3,'','','/c/source/events'),
        (4,'post','3','/c/free/p/999'),(5,'post','oops','/c/free/p/3'),(6,'','','/settings'),(7,'','','/c/free/p/9999999999999999999999999');
      insert into notifications values(8,'','','/c/event-source/events','event');`);
    await pg.exec(
      await readFile(new URL("../../../migrations/0032_billing.sql", import.meta.url), "utf8"),
    );
    await pg.exec(`insert into billing_resource_requirements(resource_kind,resource_id,offer_id,owner_id,community_id)
      values('post','3',1,'owner','source'),('community','source',1,'owner','source'),('event','7',1,'owner','source')`);
    const target = notificationTargetSql("n");
    const predicate = `case when (${target.type})='post' then ${target.numericId} is not null and ${paidResourceAccessSql("$1", "post", target.numericId)}
      when (${target.type})='room' then ${target.numericId} is not null and (${paidRoomAccessSql("$1", "r")})
      when (${target.type})='community' then ${paidResourceAccessSql("$1", "community", `(${target.id})`)} and (${legacyEventNotificationAccessSql("$1", "n", target.id)}) else true end`;
    const rows = async (userId: string) =>
      (
        await pg.query<{ id: number; allowed: boolean }>(
          `select n.id,(${predicate}) as allowed from notifications n left join (select 5 as id) r on r.id=${target.numericId} order by n.id`,
          [userId],
        )
      ).rows;
    assert.deepEqual(
      (await rows("outsider")).map((r) => r.allowed),
      [false, false, false, false, false, true, false, false],
    );
    assert.deepEqual(
      (await rows("owner")).map((r) => r.allowed),
      [true, true, true, true, false, true, false, true],
    );
    await pg.exec(`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode)
      values('fixture','buyer','buyer',1,'owner','membership','Fixture',500,'usd','subscription');
      insert into billing_entitlements(order_id,beneficiary_id,offer_id,state,expires_at) values('fixture','buyer',1,'active',now()+interval '1 day')`);
    assert.deepEqual(
      (await rows("buyer")).map((r) => r.allowed),
      [true, true, true, true, false, true, false, true],
    );
    await pg.exec(`update billing_entitlements set expires_at=now()-interval '1 second'`);
    assert.deepEqual(
      (await rows("buyer")).map((r) => r.allowed),
      [false, false, false, false, false, true, false, false],
    );
  } finally {
    await pg.close();
  }
});
