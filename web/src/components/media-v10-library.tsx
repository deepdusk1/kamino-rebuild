import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/community/sheet";
import { searchMediaLibrary, getMediaLibraryFile, saveMediaLibraryItem, deleteMediaLibraryItem } from "@/lib/kamino/media-v10";
type Selected={kind:"gif"|"audio";dataUrl:string;filename:string;altText:string;captions:string};

export function MediaLibraryPicker({kind,onSelect,manage=false}:{kind:"gif"|"audio";onSelect?:(media:Selected)=>void;manage?:boolean}){
  const client=useQueryClient(),[query,setQuery]=useState(""),[search,setSearch]=useState(""),[busy,setBusy]=useState(false),[title,setTitle]=useState(""),[artist,setArtist]=useState(""),[tags,setTags]=useState(""),[rights,setRights]=useState(false),[file,setFile]=useState<File|null>(null),[license,setLicense]=useState("");
  const q=useQuery({queryKey:["mediaLibrary",kind,search],queryFn:()=>searchMediaLibrary({data:{kind,query:search}})});
  async function run(fn:()=>Promise<unknown>){setBusy(true);try{await fn();}catch(e){toast.error(e instanceof Error?e.message:"Please try again.");}finally{setBusy(false);}}
  async function upload(){if(!file)return;await run(async()=>{
    const limit=kind==="gif"?4_000_000:8_000_000;if(file.size>limit)throw new Error(`Choose a file under ${limit/1_000_000} MB.`);
    const dataUrl=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error("Could not read file."));r.readAsDataURL(file);});
    await saveMediaLibraryItem({data:{kind,title,artist,tags,dataUrl,filename:file.name,altText:title,rightsConfirmed:true,licensed:!!license,licenseUrl:license}});
    setFile(null);setTitle("");setRights(false);await client.invalidateQueries({queryKey:["mediaLibrary"]});toast.success("Saved to your library");
  });}
  return <section className="space-y-3 rounded-xl border border-border p-4" aria-label={kind==="gif"?"GIF picker":"Music library"}>
    <h3 className="font-bold">{kind==="gif"?"Find a GIF":"Choose music"}</h3>
    <p className="text-xs text-muted">{kind==="gif"?"Search your saved animated GIFs. Upload a GIF once to reuse it in posts, stories and chats.":"Use your own audio or music whose license the site team has provided. A track is copied into your story so removing it from the library does not break an existing post."}</p>
    <form className="flex min-w-0 gap-2" onSubmit={e=>{e.preventDefault();setSearch(query);}}><input className={`${fieldClass} min-w-0`} aria-label={`Search ${kind==="gif"?"GIFs":"music"}`} value={query} maxLength={60} onChange={e=>setQuery(e.target.value)} placeholder="Search titles and tags"/><Button type="submit">Search</Button></form>
    {q.isPending?<p role="status">Loading library…</p>:q.error?<p role="alert" className="text-danger">{q.error.message}</p>:!q.data?.items.length?<p className="text-sm text-muted">No matching files. Add one below.</p>:<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{q.data.items.map(item=><article key={item.id} className="min-w-0 space-y-2 rounded-xl bg-bg p-3 [overflow-wrap:anywhere]">
      {kind==="gif"?<img src={item.url} alt={item.altText||item.title} loading="lazy" className="h-28 w-full rounded-lg object-contain"/>:<audio controls preload="none" src={item.url} className="w-full" aria-label={item.title}/>}
      <p className="text-sm font-bold">{item.title}</p>{item.artist?<p className="text-xs text-muted">{item.artist}</p>:null}
      {item.licensed?<a href={item.licenseUrl} className="text-xs text-accent" target="_blank" rel="noreferrer">Music license ↗</a>:null}
      {onSelect?<Button disabled={busy} className="w-full" variant="secondary" onClick={()=>void run(async()=>{const selected=await getMediaLibraryFile({data:{libraryId:item.id}});onSelect({kind,filename:selected.filename,dataUrl:selected.dataUrl,altText:selected.altText,captions:""});})}>Use {kind==="gif"?"GIF":"track"}</Button>:null}
      {manage&&item.mine?<Button disabled={busy} variant="danger" onClick={()=>{if(window.confirm("Remove this file from your library? Existing posts keep their copy."))void run(async()=>{await deleteMediaLibraryItem({data:{libraryId:item.id}});await client.invalidateQueries({queryKey:["mediaLibrary"]});});}}>Remove</Button>:null}
    </article>)}</div>}
    <details><summary className="min-h-11 cursor-pointer font-semibold">Add {kind==="gif"?"an animated GIF":"audio you can share"}</summary><div className="space-y-3 pt-2">
      <label className="block text-sm">Title<input className={fieldClass} value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
      {kind==="audio"?<label className="block text-sm">Artist<input className={fieldClass} value={artist} maxLength={120} onChange={e=>setArtist(e.target.value)}/></label>:null}
      <label className="block text-sm">Search tags<input className={fieldClass} value={tags} maxLength={200} onChange={e=>setTags(e.target.value)} placeholder="happy, applause, celebration"/></label>
      <input aria-label="Library file" type="file" accept={kind==="gif"?"image/gif":"audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/webm"} onChange={e=>setFile(e.target.files?.[0]??null)}/>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>I have permission to share and reuse this file.</label>
      {manage&&kind==="audio"?<label className="block text-sm">Publish a licensed catalog track (site team only)<input className={fieldClass} value={license} onChange={e=>setLicense(e.target.value)} placeholder="HTTPS link to the applicable license"/><span className="text-xs text-muted">Leave blank to keep audio in your private library. The license must permit every use offered by this app.</span></label>:null}
      <Button disabled={busy||!file||!rights||!title.trim()} onClick={()=>void upload()}>{busy?"Saving…":"Save to library"}</Button>
    </div></details>
  </section>;
}
