import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";
import { guard } from "./guard";
import { checkContent, isSiteAdmin } from "./safety.server";
import { checkedContentMedia, safeFilename } from "./content-rules";
import { storeMedia, loadMedia, deleteMedia } from "./media-store.server";
import { stageMediaDeletion, processMediaDeletionQueue } from "./media-deletion.server";
import { withStoryOwnerLock } from "./profile-stories.server";
import { readableLibraryMedia } from "./media-v10.server";
import { asBool } from "./map";

const id = z.number().int().positive();
const libraryInput = z.object({libraryId:id});

export const searchMediaLibrary = createServerFn({method:"GET"})
  .middleware([authMiddleware])
  .validator((d:unknown)=>z.object({kind:z.enum(["gif","audio"]),query:z.string().trim().max(60).default("")}).parse(d))
  .handler(async({context,data})=>{
    const sql=await internals.db();
    await internals.requireMinAge(sql,context.userId);
    const query=`%${data.query.replace(/[\\%_]/g,"\\$&")}%`;
    const rows=await sql`select id,kind,title,artist,tags,filename,alt_text,licensed,license_url,owner_id from media_library
      where kind=${data.kind} and (owner_id=${context.userId} or licensed=true)
      and not exists(select 1 from identity_account_status a where a.user_id=media_library.owner_id and a.status<>'active' and (a.until is null or a.until>now()))
      and not exists(select 1 from blocks b where (b.blocker_id=${context.userId} and b.blocked_id=media_library.owner_id) or (b.blocked_id=${context.userId} and b.blocker_id=media_library.owner_id))
      and (title ilike ${query} or tags ilike ${query} or artist ilike ${query}) order by id desc limit 60`;
    return {items:rows.map(r=>({id:Number(r.id),kind:String(r.kind),title:String(r.title),artist:String(r.artist),tags:String(r.tags),filename:String(r.filename),altText:String(r.alt_text),licensed:asBool(r.licensed),mine:r.owner_id===context.userId,licenseUrl:String(r.license_url),url:`/api/v1/library-media/${r.id}`}))};
  });

export const saveMediaLibraryItem = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator((d:unknown)=>z.object({kind:z.enum(["gif","audio"]),title:z.string().trim().min(1).max(120),artist:z.string().trim().max(120).default(""),tags:z.string().trim().max(200).default(""),dataUrl:z.string().max(12_000_100),filename:z.string().max(120),altText:z.string().trim().max(600).default(""),rightsConfirmed:z.literal(true),licensed:z.boolean().default(false),licenseUrl:z.string().trim().max(500).default("")}).parse(d))
  .handler(async({context,data})=>{
    const sql=await internals.db(),userId=context.userId;
    await internals.requireMinAge(sql,userId);
    await guard(userId,"upload");
    const checked=checkedContentMedia(data.kind,data.dataUrl);
    if(data.licensed){
      if(data.kind!=="audio"||!await isSiteAdmin(sql,userId))throw new Error("Only the site team can publish licensed music.");
      const license=new URL(data.licenseUrl);
      if(license.protocol!=="https:")throw new Error("Provide an HTTPS license document.");
    }
    const verdict=await checkContent({text:`${data.title}\n${data.artist}\n${data.tags}\n${data.altText}`,images:data.kind==="gif"?[data.dataUrl]:[],ageGate:13});
    if(verdict.action)throw new Error("Edit this library item before saving it; it did not pass the safety checks.");
    let ref:string|null=null;
    try{return await withStoryOwnerLock(sql,userId,async tx=>{
      await internals.requireMinAge(tx,userId);
      if(data.licensed&&!await isSiteAdmin(tx,userId))throw new Error("Only the site team can publish licensed music.");
      const total=Number((await tx`select count(*)::int as total from media_library where owner_id=${userId}`)[0]!.total);
      if(total>=100)throw new Error("Your library holds up to 100 files. Remove an old file first.");
      ref=await storeMedia("content",data.dataUrl);
        const row=(await tx`insert into media_library(owner_id,kind,title,artist,tags,storage_ref,mime,byte_size,filename,alt_text,licensed,license_url)
          values(${userId},${data.kind},${data.title},${data.artist},${data.tags},${ref},${checked.mime},${checked.bytes},${safeFilename(data.filename)},${data.altText},${data.licensed},${data.licensed?data.licenseUrl:""}) returning id`)[0]!;
        return {id:Number(row.id)};
    });}catch(error){if(ref)await deleteMedia([ref]);throw error;}
  });

export const getMediaLibraryFile = createServerFn({method:"GET"})
  .middleware([authMiddleware]).validator((d:unknown)=>libraryInput.parse(d))
  .handler(async({context,data})=>{
    const sql=await internals.db();
    await internals.requireMinAge(sql,context.userId);
    const row=await readableLibraryMedia(sql,context.userId,data.libraryId);
    await internals.assertAccountAllowed(sql,String(row.owner_id));
    return {dataUrl:await loadMedia(String(row.storage_ref)),mime:String(row.mime),kind:String(row.kind),filename:String(row.filename),altText:String(row.alt_text),title:String(row.title)};
  });

export const deleteMediaLibraryItem = createServerFn({method:"POST"})
  .middleware([authMiddleware]).validator((d:unknown)=>libraryInput.parse(d))
  .handler(async({context,data})=>{
    const sql=await internals.db();
    await internals.requireMinAge(sql,context.userId);
    await withStoryOwnerLock(sql,context.userId,async tx=>{
      const rows=await tx`delete from media_library where id=${data.libraryId} and owner_id=${context.userId} returning storage_ref`;
      if(!rows.length)throw new Error("Library file unavailable.");
      await stageMediaDeletion(tx,rows.map(r=>String(r.storage_ref)));
    });
    void processMediaDeletionQueue(sql,{limit:4}).catch(error=>console.warn("[library-deletion] cleanup remains queued",error));
    return {ok:true};
  });

export const shortVideoFeed = createServerFn({method:"GET"})
  .middleware([authMiddleware])
  .validator((d:unknown)=>z.object({before:id.optional(),slug:z.string().max(100).optional()}).parse(d??{}))
  .handler(async({context,data})=>{
    const sql=await internals.db(),viewer=context.userId;
    await internals.requireMinAge(sql,viewer);
    const candidates=await sql.query(`select p.id,p.title,p.body,p.community_id,p.author_user_id,p.content_warning,
      m.id as media_id,m.filename,m.alt_text,m.captions,pr.handle,pr.display_name
      from posts p join content_media m on m.post_id=p.id and m.kind='short'
      join profiles pr on pr.user_id=p.author_user_id
      where p.id<$2 and ($3::text is null or p.community_id=$3) and p.hidden=false
      and (p.expires_at is null or p.expires_at>now()) and (${internals.visiblePosts("$1","p")})
      order by p.id desc limit 100`,[viewer,data.before??2147483647,data.slug??null]);
    const settings=(await sql`select sensitive_content from profiles where user_id=${viewer}`)[0];
    const items:{id:number;title:string;body:string;slug:string;handle:string;displayName:string;warning:string;blur:boolean;media:{id:number;kind:string;filename:string;altText:string;captions:string;url:string}}[]=[];
    let scanned=0;
    for(const row of candidates){
      scanned++;
      try{await internals.requirePostAccess(sql,viewer,Number(row.id));await internals.assertAccountAllowed(sql,String(row.author_user_id));}
      catch{continue;}
      items.push({id:Number(row.id),title:String(row.title),body:String(row.body),slug:String(row.community_id),handle:String(row.handle),displayName:String(row.display_name),warning:String(row.content_warning),blur:!!row.content_warning&&settings?.sensitive_content!=="show",media:{id:Number(row.media_id),kind:"short",filename:String(row.filename),altText:String(row.alt_text),captions:String(row.captions),url:`/api/v1/content-media/${row.media_id}`}});
      if(items.length===12)break;
    }
    return {items,nextCursor:scanned>0&&(scanned<candidates.length||candidates.length===100)?Number(candidates[scanned-1]!.id):null};
  });
