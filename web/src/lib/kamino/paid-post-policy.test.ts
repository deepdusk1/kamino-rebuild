import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { paidPostAccessSql } from './paid-post-policy.ts';

let pg: PGlite;
before(async () => {
  pg = new PGlite(); await pg.waitReady;
  await pg.exec(`create table creator_offers(id int primary key);
    insert into creator_offers values(1);
    create table memberships(community_id text,user_id text,status text,role text);
    create table posts(id int primary key,community_id text,original_post_id int);
    insert into posts values(1,'source',null),(2,'repost',1),(3,'repost',2);`);
  await pg.exec(await readFile(new URL('../../../migrations/0032_billing.sql', import.meta.url), 'utf8'));
});
after(async () => { await pg?.close(); });
async function allowed(userId: string, postId: number, sourceRule = 'true') {
  const result = await pg.query<{allowed:boolean}>(`select ${paidPostAccessSql('$1','$2',sourceRule)} as allowed`, [userId,postId]);
  return result.rows[0]!.allowed;
}
test('exclusive sources protect multi-level repost previews; owner and valid entitlement can read', async () => {
  assert.equal(await allowed('',3),true,'Unmapped posts stay free');
  await pg.exec(`insert into billing_resource_requirements(resource_kind,resource_id,offer_id,owner_id,community_id) values('post','1',1,'owner','source')`);
  assert.equal(await allowed('',3),false); assert.equal(await allowed('buyer',3),false); assert.equal(await allowed('owner',3),true);
  await pg.exec(`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode)
    values('fixture','buyer','buyer',1,'owner','membership','Fixture',500,'usd','subscription');
    insert into billing_entitlements(order_id,beneficiary_id,offer_id,state,expires_at) values('fixture','buyer',1,'active',now()+interval '1 day')`);
  assert.equal(await allowed('buyer',3),true);
  await pg.exec(`update billing_entitlements set expires_at=now()-interval '1 second' where order_id='fixture'`);
  assert.equal(await allowed('buyer',3),false,'An expired entitlement cannot read a copied preview');
  await pg.exec(`delete from billing_resource_requirements`);
});
test('source communities and deleted source posts remain protected', async () => {
  assert.equal(await allowed('buyer',3,`paid_source.community_id<>'source'`),false,'Original community age/privacy constraints apply through every repost');
  await pg.exec(`delete from posts where id=1`);
  assert.equal(await allowed('',3),false,'Deleting the original must not reveal its retained previews');
});
test('cyclic or excessively deep source chains fail closed', async () => {
  await pg.exec(`insert into posts values(10,'cycle',11),(11,'cycle',10)`);
  assert.equal(await allowed('owner',10),false);
  for(let id=100;id<=121;id++) await pg.query(`insert into posts values($1,'deep',$2)`,[id,id===100?null:id-1]);
  assert.equal(await allowed('owner',121),false);
});
