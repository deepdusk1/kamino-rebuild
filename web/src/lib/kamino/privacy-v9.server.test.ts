import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { eraseAccountAtomically, exportV9PersonalData, prepareV9AccountDeletion } from "./privacy-v9.server.ts";
import { processMediaDeletionQueue } from "./media-deletion.server.ts";

const pg = new PGlite();
await pg.waitReady;
const directory = new URL("../../../migrations/", import.meta.url);
for (const file of readdirSync(directory).filter(file => file.endsWith(".sql")).sort())
  await pg.exec(readFileSync(new URL(file, directory), "utf8"));
after(() => pg.close());
function adapter(run: Sql["query"]): Sql {
  const client = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
    return run(query, values);
  }) as Sql;
  client.query = run;
  return client;
}
const sql = adapter(async <T>(query: string, values: unknown[] = []) => (await pg.query<T>(query, values)).rows);
sql.transaction = work => pg.transaction(transaction => work(adapter(async <T>(query: string, values: unknown[] = []) => (await transaction.query<T>(query, values)).rows)));
let sequence = 0;
async function person(prefix: string) {
  const userId = `${prefix}-${++sequence}`;
  await sql`insert into "user"(id,name,email,"emailVerified") values(${userId},${userId},${`${userId}@example.test`},true)`;
  await sql`insert into profiles(user_id,handle,display_name) values(${userId},${userId},${userId})`;
  return userId;
}
async function space(owner: string) {
  const id = `privacy-space-${++sequence}`;
  await sql`insert into communities(id,name,category,created_by) values(${id},${id},'Art',${owner})`;
  return id;
}
async function post(owner: string, community: string, body: string) {
  return Number((await sql`insert into posts(community_id,author_user_id,type,title,body) values(${community},${owner},'blog','Privacy fixture',${body}) returning id`)[0].id);
}

test("v9 export resolves only own media and excludes auth, OAuth, webhook and provider secrets", async () => {
  const owner = await person("export-owner"), other = await person("export-other"), community = await space(owner);
  const ownPost = await post(owner, community, "OWN_ARTICLE"), otherPost = await post(other, community, "OTHER_PRIVATE_BODY");
  const ownReference = "s3:content/owned-export|video/mp4", otherReference = "s3:content/other-export|video/mp4";
  await sql`insert into content_media(post_id,kind,storage_ref,filename,mime,byte_size) values(${ownPost},'video',${ownReference},'own.mp4','video/mp4',5),(${otherPost},'video',${otherReference},'other.mp4','video/mp4',5)`;
  await sql`insert into profile_avatars(user_id,data_url) values(${owner},'data:image/png;base64,T1dO')`;
  await sql`insert into identity_relationships(user_id,target_user_id,kind) values(${owner},${other},'favorite'),(${other},${owner},'restrict')`;
  await sql`insert into support_tickets(user_id,subject,body) values(${owner},'My request','OWN_SUPPORT'),(${other},'Other request','OTHER_PRIVATE_SUPPORT')`;
  await sql`insert into session(id,"userId",token,"expiresAt","updatedAt") values(${`export-session-${sequence}`},${owner},'DO_NOT_EXPORT_AUTH_TOKEN',now()+interval '1 day',now())`;
  await sql`insert into "twoFactor"(id,"userId",secret,"backupCodes") values(${`factor-${sequence}`},${owner},'DO_NOT_EXPORT_TOTP','DO_NOT_EXPORT_BACKUPS')`;
  await sql`insert into identity_oauth_flows(id,verifier_hash,provider,session_id,callback_proof_hash) values(${`flow-${sequence}`},'DO_NOT_EXPORT_VERIFIER','google',${`export-session-${sequence}`},'DO_NOT_EXPORT_PROOF')`;
  await sql`insert into billing_webhook_events(event_id,event_type,payload_hash,status,claim_token) values(${`event-${sequence}`},'fixture','DO_NOT_EXPORT_PAYLOAD','processed','DO_NOT_EXPORT_CLAIM')`;
  await sql`insert into profile_stories(owner_id,caption,media_ref) values(${owner},'OWN_STORY',${ownReference}),(${other},'OTHER_PRIVATE_STORY',${otherReference})`;
  const references: string[] = [];
  const exported = await exportV9PersonalData(sql, owner, async reference => {
    references.push(reference);
    return reference === ownReference ? "data:video/mp4;base64,T1JJR0lOQUw=" : reference;
  });
  const json = JSON.stringify(exported);
  assert.equal(exported.version, 10);
  assert.equal(exported.storyMedia.length, 1);
  assert.equal(exported.storyMedia[0].data_url, "data:video/mp4;base64,T1JJR0lOQUw=");
  assert.equal(exported.contentMedia.length, 1);
  assert.equal(exported.contentMedia[0].data_url, "data:video/mp4;base64,T1JJR0lOQUw=");
  assert.equal(exported.contentMedia[0].unavailable, false);
  assert.ok(!references.includes(otherReference));
  assert.equal((exported.relationships as unknown[]).length, 1);
  assert.ok(json.includes("OWN_SUPPORT"));
  assert.ok(!json.includes("OTHER_PRIVATE_SUPPORT"));
  assert.ok(!json.includes("OTHER_PRIVATE_BODY"));
  assert.ok(!json.includes("DO_NOT_EXPORT"));
  assert.ok(!json.includes(ownReference));
});

test("an unavailable object is marked unavailable rather than exporting its internal storage reference", async () => {
  const owner = await person("missing-media"), community = await space(owner), postId = await post(owner, community, "Original body");
  await sql`insert into content_media(post_id,kind,storage_ref,mime,byte_size) values(${postId},'file','s3:content/missing|application/pdf','application/pdf',8)`;
  const exported = await exportV9PersonalData(sql, owner, async () => { throw new Error("Unavailable fixture"); });
  assert.equal(exported.contentMedia[0].data_url, "");
  assert.equal(exported.contentMedia[0].unavailable, true);
  assert.ok(!JSON.stringify(exported).includes("s3:content/missing"));
});

test("deletion preserves another recipient's paid gift and shared resources while closing own pending orders", async () => {
  const owner = await person("delete-owner"), other = await person("delete-other"), community = await space(owner);
  const ownPost = await post(owner, community, "OWN_DELETED_BODY"), otherPost = await post(other, community, "KEEP_OTHER_BODY");
  const roomId = Number((await sql`insert into chat_rooms(community_id,name,kind,created_by) values(${community},'Shared group','group',${owner}) returning id`)[0].id);
  await sql`insert into chat_members(room_id,user_id) values(${roomId},${owner}),(${roomId},${other})`;
  const ownMessage = Number((await sql`insert into messages(room_id,author_user_id,body) values(${roomId},${owner},'OWN_FILE_MESSAGE') returning id`)[0].id);
  const otherMessage = Number((await sql`insert into messages(room_id,author_user_id,body) values(${roomId},${other},'KEEP_OTHER_MESSAGE') returning id`)[0].id);
  const ownPostRef = "s3:content/deleted-post|video/mp4", ownMessageRef = "s3:content/deleted-message|application/pdf", otherRef = "s3:content/kept-other|application/pdf";
  await sql`insert into content_media(post_id,kind,storage_ref,mime,byte_size) values(${ownPost},'video',${ownPostRef},'video/mp4',5),(${otherPost},'video','s3:content/kept-post|video/mp4','video/mp4',5)`;
  await sql`insert into content_media(message_id,kind,storage_ref,mime,byte_size) values(${ownMessage},'file',${ownMessageRef},'application/pdf',5),(${otherMessage},'file',${otherRef},'application/pdf',5)`;
  const giftOffer = Number((await sql`insert into creator_offers(owner_id,kind,title,price_minor) values(${other},'gift','Gift',500) returning id`)[0].id);
  const sellerOffer = Number((await sql`insert into creator_offers(owner_id,kind,title,price_minor,published) values(${owner},'membership','Shared access',500,true) returning id`)[0].id);
  const unusedOffer = Number((await sql`insert into creator_offers(owner_id,kind,title,price_minor) values(${owner},'tip','Unused',500) returning id`)[0].id);
  const gift = `gift-${sequence}`, pending = `pending-${sequence}`, ownAccess = `own-access-${sequence}`, sold = `sold-${sequence}`;
  await sql`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode,status) values
    (${gift},${owner},${other},${giftOffer},${other},'gift','Gift',500,'usd','payment','paid'),
    (${pending},${owner},${other},${giftOffer},${other},'gift','Pending gift',500,'usd','payment','pending'),
    (${ownAccess},${other},${owner},${giftOffer},${other},'gift','Own benefit',500,'usd','payment','paid'),
    (${sold},${other},${other},${sellerOffer},${owner},'membership','Shared access',500,'usd','subscription','paid')`;
  await sql`insert into billing_entitlements(order_id,beneficiary_id,offer_id,state,expires_at) values
    (${gift},${other},${giftOffer},'active',now()+interval '7 days'),
    (${ownAccess},${owner},${giftOffer},'active',now()+interval '7 days'),
    (${sold},${other},${sellerOffer},'active',now()+interval '1 day')`;
  const expiry = (await sql`select expires_at from billing_entitlements where order_id=${gift}`)[0].expires_at;
  await sql`insert into billing_resource_requirements(resource_kind,resource_id,offer_id,owner_id,community_id) values('community',${community},${sellerOffer},${owner},${community})`;
  await sql`insert into identity_audit(actor_id,target_user_id,action,detail) values(${owner},${other},'fixture','OWN_AUDIT_PRIVATE'),(${other},${owner},'fixture','SUBJECT_PRIVATE')`;
  await sql`insert into appeals(community_id,user_id,kind,message) values(${community},${owner},'ban','OWN_APPEAL_PRIVATE')`;
  const sessionId = `delete-session-${sequence}`;
  await sql`insert into session(id,"userId",token,"expiresAt","updatedAt") values(${sessionId},${owner},${`token-${sequence}`},now()+interval '1 day',now())`;
  await sql`insert into identity_oauth_flows(id,verifier_hash,provider,session_id) values(${`delete-flow-${sequence}`},'proof','google',${sessionId})`;
  const storyRef = "s3:content/deleted-story|image/gif";
  await sql`insert into profile_stories(owner_id,caption,media_ref) values(${owner},'OWN_STORY',${storyRef}),(${other},'KEEP_STORY',${otherRef})`;
  const deletion = await sql.transaction!(transaction => prepareV9AccountDeletion(transaction, owner, { pseudonym: "deleted:privacy-fixture" }));
  const deletedFiles: string[] = [];
  assert.equal((await sql`select count(*)::int as total from media_deletion_queue`)[0].total, 3);
  await processMediaDeletionQueue(sql, { deleteObject: async reference => { deletedFiles.push(reference); } });
  assert.equal(deletion.mediaCount, 3);
  assert.equal((await sql`select * from profile_stories where owner_id=${owner}`).length, 0);
  assert.equal((await sql`select * from profile_stories where owner_id=${other}`).length, 1);
  assert.deepEqual(deletedFiles.sort(), [ownPostRef, ownMessageRef, storyRef].sort());
  assert.ok(!deletedFiles.includes(otherRef));
  assert.equal((await sql`select * from content_media where post_id=${ownPost} or message_id=${ownMessage}`).length, 0);
  assert.equal((await sql`select * from content_media where message_id=${otherMessage}`).length, 1);
  assert.equal((await sql`select * from communities where id=${community}`).length, 1);
  assert.equal((await sql`select * from chat_rooms where id=${roomId}`).length, 1);
  assert.equal((await sql`select created_by from chat_rooms where id=${roomId}`)[0].created_by, other);
  assert.equal((await sql`select * from creator_offers where id=${unusedOffer}`).length, 0);
  assert.equal((await sql`select published from creator_offers where id=${sellerOffer}`)[0].published, false);
  assert.equal((await sql`select owner_id from billing_resource_requirements where resource_id=${community}`)[0].owner_id, deletion.pseudonym);
  const keptGift = (await sql`select o.status,o.privacy_closed,o.buyer_id,e.state,e.beneficiary_id,e.expires_at from billing_orders o join billing_entitlements e on e.order_id=o.id where o.id=${gift}`)[0];
  assert.equal(keptGift.status, "paid"); assert.equal(keptGift.privacy_closed, true); assert.equal(keptGift.buyer_id, deletion.pseudonym);
  assert.equal(keptGift.state, "active"); assert.equal(keptGift.beneficiary_id, other); assert.equal(String(keptGift.expires_at), String(expiry));
  assert.equal((await sql`select status from billing_orders where id=${pending}`)[0].status, "cancelled");
  assert.equal((await sql`select state from billing_entitlements where order_id=${ownAccess}`)[0].state, "revoked");
  assert.equal((await sql`select privacy_closed from billing_orders where id=${sold}`)[0].privacy_closed, false);
  assert.equal((await sql`select state from billing_entitlements where order_id=${sold}`)[0].state, "active");
  assert.equal((await sql`select * from identity_oauth_flows where session_id=${sessionId}`).length, 0);
  assert.ok(!(await sql`select * from identity_audit where actor_id=${owner} or target_user_id=${owner}`).length);
  assert.equal((await sql`select message from appeals where user_id=${deletion.pseudonym}`)[0].message, "[Redacted after account deletion]");
});

test("a failed complete account deletion rolls back rows, ownership, billing and queued media without deleting bytes", async () => {
  const owner = await person("rollback-owner"), other = await person("rollback-other"), community = await space(owner);
  await sql`insert into memberships(community_id,user_id,status,role,nickname) values(${community},${owner},'active','leader',${owner})`;
  await sql`update communities set member_count=1 where id=${community}`;
  const postId = await post(owner, community, "KEEP_ON_FAILURE");
  const reference = "s3:content/rollback-original|video/mp4";
  await sql`insert into content_media(post_id,kind,storage_ref,mime,byte_size) values(${postId},'video',${reference},'video/mp4',5)`;
  const roomId = Number((await sql`insert into chat_rooms(name,kind,created_by) values('Rollback group','group',${owner}) returning id`)[0].id);
  await sql`insert into chat_members(room_id,user_id) values(${roomId},${owner}),(${roomId},${other})`;
  const offer = Number((await sql`insert into creator_offers(owner_id,kind,title,price_minor) values(${other},'gift','Rollback offer',500) returning id`)[0].id);
  const orderId = `rollback-order-${sequence}`;
  await sql`insert into billing_orders(id,buyer_id,beneficiary_id,offer_id,seller_id,kind,title,price_minor,currency,checkout_mode,status)
    values(${orderId},${owner},${other},${offer},${other},'gift','Rollback gift',500,'usd','payment','pending')`;
  const faulty = adapter(sql.query);
  faulty.transaction = work => pg.transaction(transaction => work(adapter(async <T>(query: string, values: unknown[] = []) => {
    if (/^delete from profiles where/i.test(query)) throw new Error("Injected final cleanup failure");
    return (await transaction.query<T>(query, values)).rows;
  })));
  await assert.rejects(eraseAccountAtomically(faulty, owner), /Injected final cleanup failure/);
  assert.equal((await sql`select id from "user" where id=${owner}`).length, 1);
  assert.equal((await sql`select user_id from profiles where user_id=${owner}`).length, 1);
  assert.equal((await sql`select storage_ref from content_media where post_id=${postId}`)[0].storage_ref, reference);
  assert.equal((await sql`select created_by from chat_rooms where id=${roomId}`)[0].created_by, owner);
  assert.equal((await sql`select member_count from communities where id=${community}`)[0].member_count, 1);
  assert.equal((await sql`select status,privacy_closed from billing_orders where id=${orderId}`)[0].status, "pending");
  assert.equal((await sql`select privacy_closed from billing_orders where id=${orderId}`)[0].privacy_closed, false);
  assert.equal((await sql`select * from media_deletion_queue where media_ref=${reference}`).length, 0);
});

test("complete deletion commits legacy/new media refs and transfers shared groups before any external cleanup", async () => {
  const owner = await person("atomic-owner"), other = await person("atomic-other"), community = await space(owner);
  const postId = await post(owner, community, "REMOVE_OWN_CONTENT");
  const contentRef = "s3:content/atomic-video|video/mp4", coverRef = "s3:post/atomic-cover|image/png", storyRef = "s3:content/atomic-story|image/gif";
  await sql`update posts set cover=${coverRef} where id=${postId}`;
  await sql`insert into content_media(post_id,kind,storage_ref,mime,byte_size) values(${postId},'video',${contentRef},'video/mp4',5)`;
  await sql`insert into profile_stories(owner_id,caption,media_ref) values(${owner},'Own standalone story',${storyRef})`;
  const roomId = Number((await sql`insert into chat_rooms(name,kind,created_by) values('Atomic group','group',${owner}) returning id`)[0].id);
  await sql`insert into chat_members(room_id,user_id) values(${roomId},${owner}),(${roomId},${other})`;
  const messageId = Number((await sql`insert into messages(room_id,author_user_id,body) values(${roomId},${other},'OTHER_MEMBER_CONTENT') returning id`)[0].id);
  await eraseAccountAtomically(sql, owner);
  assert.equal((await sql`select id from "user" where id=${owner}`).length, 0);
  assert.equal((await sql`select * from posts where id=${postId}`).length, 0);
  assert.equal((await sql`select created_by from chat_rooms where id=${roomId}`)[0].created_by, other);
  assert.equal((await sql`select body from messages where id=${messageId}`)[0].body, "OTHER_MEMBER_CONTENT");
  const queue = await sql`select media_ref from media_deletion_queue where media_ref=any(${[contentRef, coverRef, storyRef]})`;
  assert.deepEqual(queue.map(row => row.media_ref).sort(), [contentRef, coverRef, storyRef].sort());
  const removed: string[] = [];
  await processMediaDeletionQueue(sql, { deleteObject: async reference => { removed.push(reference); } });
  assert.deepEqual(removed.sort(), [contentRef, coverRef, storyRef].sort());
});

test("legacy FK retry savepoints recover the transaction before removing dependent personal rows", async () => {
  const owner = await person("savepoint-owner");
  await sql.query("create table deletion_test_parent(user_id text primary key)");
  await sql.query("create table deletion_test_child(user_id text primary key,parent_id text references deletion_test_parent(user_id))");
  await sql`insert into deletion_test_parent(user_id) values(${owner})`;
  await sql`insert into deletion_test_child(user_id,parent_id) values(${owner},${owner})`;
  let foreignKeyRetries = 0;
  const observed = adapter(sql.query);
  observed.transaction = work => pg.transaction(transaction => work(adapter(async <T>(query: string, values: unknown[] = []) => {
    try {
      const rows = (await transaction.query<T>(query, values)).rows;
      if (query.includes("information_schema.columns")) rows.sort((left, right) => {
        const l = left as { table_name: string }, r = right as { table_name: string };
        return l.table_name === "deletion_test_parent" ? -1 : r.table_name === "deletion_test_parent" ? 1 : 0;
      });
      return rows;
    } catch (error) {
      if ((error as { code?: string }).code === "23503") foreignKeyRetries++;
      throw error;
    }
  })));
  await eraseAccountAtomically(observed, owner);
  assert.ok(foreignKeyRetries > 0);
  assert.equal((await sql`select * from deletion_test_parent`).length, 0);
  assert.equal((await sql`select * from deletion_test_child`).length, 0);
  assert.equal((await sql`select id from "user" where id=${owner}`).length, 0);
});

test('v10 export includes owned library bytes and consent state while excluding private moderation notes and device tokens',async()=>{
 const owner=await person('v10-export'),other=await person('v10-export-other');
 const ref='s3:library/export-owner|image/gif';
 await sql`insert into media_library(owner_id,kind,title,storage_ref,mime,byte_size,filename)values(${owner},'gif','Own GIF',${ref},'image/gif',6,'own.gif'),(${other},'gif','OTHER_LIBRARY','s3:library/other|image/gif','image/gif',6,'other.gif')`;
 const caseId=Number((await sql`insert into moderation_cases(subject_id,opened_by,summary,public_reason)values(${owner},${other},'SECRET_INTERNAL_SUMMARY','MEMBER_REASON') returning id`)[0].id);
 await sql`insert into moderation_case_events(case_id,actor_id,kind,note,member_visible)values(${caseId},${other},'note','SECRET_STAFF_NOTE',false),(${caseId},${other},'update','MEMBER_UPDATE',true)`;
 await sql.query('insert into semantic_preferences(user_id,namespace,embedding)values($1,$2,$3::double precision[])',[owner,'fixture',[1,0]]);
 const result=await exportV9PersonalData(sql,owner,async reference=>{assert.equal(reference,ref);return 'data:image/gif;base64,R0lGODlh';});
 const json=JSON.stringify(result);assert.equal(result.mediaLibrary.length,1);assert.ok(json.includes('MEMBER_REASON'));assert.ok(json.includes('MEMBER_UPDATE'));
 assert.ok(!json.includes('SECRET_'));assert.ok(!json.includes('OTHER_LIBRARY'));assert.ok(!json.includes(ref));assert.equal((result.semanticPreferences as unknown[]).length,1);
});
test('v10 deletion queues library cleanup, removes vectors and friendships, redacts cases and chooses an active group owner',async()=>{
 const owner=await person('v10-erase'),removed=await person('v10-removed'),active=await person('v10-active');const ref='s3:library/deletion-owner|image/gif';
 await sql`insert into media_library(owner_id,kind,title,storage_ref,mime,byte_size,filename)values(${owner},'gif','Deleted GIF',${ref},'image/gif',6,'own.gif')`;
 const musicRef='s3:content/deletion-soundtrack|audio/wav';
 await sql`insert into profile_stories(owner_id,caption,music_ref,music_mime,music_filename,music_byte_size) values(${owner},'Deleted soundtrack',${musicRef},'audio/wav','soundtrack.wav',48)`;
 const exported=await exportV9PersonalData(sql,owner,async reference=>reference===musicRef?'data:audio/wav;base64,UklGRg==':'data:image/gif;base64,R0lGODlh');
 assert.equal(exported.storyMusic.length,1);assert.ok(!JSON.stringify(exported).includes(musicRef));
 await sql`insert into friend_requests(sender_id,recipient_id,state)values(${owner},${active},'accepted')`;
 await sql.query('insert into semantic_preferences(user_id,namespace,embedding)values($1,$2,$3::double precision[])',[owner,'fixture',[1,0]]);
 const room=Number((await sql`insert into chat_rooms(name,kind,created_by)values('v10 privacy group','group',${owner})returning id`)[0].id);
 await sql`insert into chat_members(room_id,user_id,room_removed,group_role)values(${room},${owner},false,'member'),(${room},${removed},true,'coadmin'),(${room},${active},false,'moderator')`;
 const caseId=Number((await sql`insert into moderation_cases(subject_id,opened_by,summary,public_reason)values(${owner},${active},'OWN_PRIVATE_CASE','OWN_REASON')returning id`)[0].id);
 await sql`insert into moderation_case_events(case_id,actor_id,kind,note)values(${caseId},${owner},'note','OWN_CASE_NOTE')`;
 await sql`insert into moderation_case_appeals(case_id,user_id,message)values(${caseId},${owner},'OWN_APPEAL')`;
 await eraseAccountAtomically(sql,owner,{pseudonym:'deleted:v10-fixture'});
 assert.equal((await sql`select 1 from media_library where owner_id=${owner}`).length,0);assert.equal((await sql`select 1 from semantic_preferences where user_id=${owner}`).length,0);
 assert.equal((await sql`select 1 from friend_requests where sender_id=${owner}`).length,0);
 assert.equal((await sql`select created_by from chat_rooms where id=${room}`)[0].created_by,active);
 assert.equal((await sql`select 1 from media_deletion_queue where media_ref=${ref}`).length,1);
 assert.equal((await sql`select 1 from media_deletion_queue where media_ref=${musicRef}`).length,1);
 const preserved=JSON.stringify(await sql`select * from moderation_cases where id=${caseId}`)+JSON.stringify(await sql`select * from moderation_case_events where case_id=${caseId}`)+JSON.stringify(await sql`select * from moderation_case_appeals where case_id=${caseId}`);
 assert.ok(preserved.includes('deleted:v10-fixture'));assert.ok(!preserved.includes(owner));assert.ok(!preserved.includes('OWN_'));
});
