import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { readableLibraryMedia } from "./media-v10.server.ts";
const pg=new PGlite();await pg.waitReady;
const directory=new URL("../../../migrations/",import.meta.url);
for(const file of readdirSync(directory).filter(f=>f.endsWith(".sql")).sort())await pg.exec(readFileSync(new URL(file,directory),"utf8"));
after(()=>pg.close());
const sql=(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const q=strings.reduce((value,part,index)=>value+(index?`$${index}`:"")+part,"");return (await pg.query(q,values)).rows;
}) as Sql;
sql.query=async<T>(q:string,v:unknown[]=[])=> (await pg.query<T>(q,v)).rows;
await sql`insert into "user"(id,name,email,"emailVerified") values('library-owner','Owner','library-owner@example.test',true),('library-viewer','Viewer','library-viewer@example.test',true)`;
test("uploaded GIFs stay private while rights-attested music catalog entries are readable",async()=>{
  const gif=Number((await sql`insert into media_library(owner_id,kind,title,storage_ref,mime,byte_size,filename) values('library-owner','gif','Celebration','data:image/gif;base64,R0lGODlh','image/gif',6,'happy.gif') returning id`)[0]!.id);
  await readableLibraryMedia(sql,"library-owner",gif);
  await assert.rejects(readableLibraryMedia(sql,"library-viewer",gif),/unavailable/);
  const music=Number((await sql`insert into media_library(owner_id,kind,title,storage_ref,mime,byte_size,filename,licensed,license_url) values('library-owner','audio','Music','data:audio/wav;base64,UklGRg==','audio/wav',4,'music.wav',true,'https://example.test/license') returning id`)[0]!.id);
  await readableLibraryMedia(sql,"library-viewer",music);
  await sql`insert into blocks(blocker_id,blocked_id) values('library-viewer','library-owner')`;
  await assert.rejects(readableLibraryMedia(sql,"library-viewer",music),/unavailable/);
  await sql`delete from blocks where blocker_id='library-viewer'`;
  await sql`insert into identity_account_status(user_id,status,reason,actor_id) values('library-owner','suspended','Fixture','library-viewer')`;
  await assert.rejects(readableLibraryMedia(sql,"library-viewer",music),/unavailable/);
  await sql`delete from identity_account_status where user_id='library-owner'`;
  await assert.rejects(sql`insert into media_library(owner_id,kind,title,storage_ref,mime,byte_size,filename,licensed) values('library-owner','audio','Unlicensed','data:audio/wav;base64,UklGRg==','audio/wav',4,'music.wav',true)`,/check/);
  await assert.rejects(sql`update media_library set licensed=true,license_url='https://example.test/license' where id=${gif}`,/check/);
});
test("account removal cascades the library and retains story layers under their story lifecycle",async()=>{
  const story=Number((await sql`insert into profile_stories(owner_id,layers) values('library-owner','[{"id":"safe"}]') returning id`)[0]!.id);
  assert.equal(String((await sql`select layers from profile_stories where id=${story}`)[0]!.layers),'[{"id":"safe"}]');
  await assert.rejects(sql`update profile_stories set music_ref='data:audio/wav;base64,UklGRg==',music_mime='image/gif',music_byte_size=4 where id=${story}`,/check/);
  await sql`update profile_stories set music_ref='data:audio/wav;base64,UklGRg==',music_mime='audio/wav',music_byte_size=4 where id=${story}`;
  await sql`delete from "user" where id='library-owner'`;
  assert.equal((await sql`select 1 from media_library where owner_id='library-owner'`).length,0);
  assert.equal((await sql`select 1 from profile_stories where id=${story}`).length,0);
});
