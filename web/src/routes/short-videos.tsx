import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { shortVideoFeed } from "@/lib/kamino/media-v10";
import { reactToPost, setPostPersonal, recordPostView } from "@/lib/kamino/content-v9";
export const Route=createFileRoute("/short-videos")({validateSearch:(s:Record<string,unknown>)=>({slug:typeof s.slug==="string"?s.slug:undefined}),component:Shorts});
type Clip=Awaited<ReturnType<typeof shortVideoFeed>>["items"][number];
function Shorts(){
  const {slug}=Route.useSearch(),q=useInfiniteQuery({queryKey:["shortVideos",slug],initialPageParam:undefined as number|undefined,queryFn:({pageParam})=>shortVideoFeed({data:{before:pageParam,slug}}),getNextPageParam:p=>p.nextCursor??undefined});
  return <AppShell back title="Short videos"><div className="mx-auto max-w-lg"><header className="p-4"><h1 className="text-xl font-extrabold">Short videos</h1><p className="text-sm text-muted">Swipe up for the next clip. Playback starts muted; use the player controls to turn sound on.</p><a className="inline-block min-h-11 py-3 font-bold text-accent" href="/content-studio">Create a short video →</a></header>{q.error?<p role="alert" className="p-4 text-danger">{q.error.message}</p>:null}{q.isPending?<p role="status" className="p-4">Loading clips…</p>:<div tabIndex={0} className="h-[calc(100dvh-150px)] min-h-[460px] snap-y snap-mandatory overflow-y-auto rounded-card bg-black focus-visible:outline-accent" aria-label="Swipe through short videos">{q.data?.pages.flatMap(p=>p.items).map(clip=><ClipCard key={clip.id} clip={clip}/>)}<div className="flex min-h-40 snap-start flex-col items-center justify-center gap-3 p-4 text-white">{q.hasNextPage?<Button disabled={q.isFetchingNextPage} onClick={()=>void q.fetchNextPage()}>{q.isFetchingNextPage?"Loading…":"More clips"}</Button>:<p>{q.data?.pages.some(p=>p.items.length)?"You’re caught up":"No clips to show yet"}</p>}<Button variant="secondary" onClick={()=>void q.refetch()}>Refresh</Button></div></div>}</div></AppShell>;
}
function ClipCard({clip}:{clip:Clip}){
  const ref=useRef<HTMLElement>(null),video=useRef<HTMLVideoElement>(null),[revealed,setRevealed]=useState(!clip.blur),[liked,setLiked]=useState(false),[busy,setBusy]=useState(false),[hidden,setHidden]=useState(false);
  useEffect(()=>{
    const element=ref.current,player=video.current;if(!element||!revealed||hidden)return;
    let active=false,recorded=false;
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const play=()=>{if(!document.hidden&&active&&!reduce)void player?.play().catch(()=>undefined);else player?.pause();};
    const observer=new IntersectionObserver(entries=>{active=!!entries[0]?.isIntersecting;play();if(active&&!recorded){recorded=true;void recordPostView({data:{postId:clip.id}}).catch(()=>undefined);}},{threshold:.65});
    observer.observe(element);document.addEventListener("visibilitychange",play);
    return ()=>{observer.disconnect();document.removeEventListener("visibilitychange",play);player?.pause();};
  },[clip.id,revealed,hidden]);
  async function action(fn:()=>Promise<unknown>){setBusy(true);try{await fn();}catch(e){toast.error(e instanceof Error?e.message:"Please try again.");}finally{setBusy(false);}}
  if(hidden)return <article className="flex h-full min-h-[460px] snap-start items-center justify-center p-5 text-white"><p>Clip hidden from your feeds.</p></article>;
  return <article ref={ref} className="relative flex h-full min-h-[460px] snap-start flex-col bg-black text-white" aria-label={clip.title}>
    <div className="relative min-h-0 flex-1">{revealed?<video ref={video} src={clip.media.url} playsInline controls loop muted preload="metadata" className="h-full w-full object-contain" aria-label={clip.media.altText||clip.title}>{clip.media.captions?<track kind="captions" src={`${clip.media.url}?captions`} srcLang="en" label="Captions" default/>:null}</video>:<div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center"><p>Content note: {clip.warning}</p><Button onClick={()=>setRevealed(true)}>Show clip</Button></div>}</div>
    <div className="space-y-2 bg-black/80 p-4 [overflow-wrap:anywhere]"><a href={`/u/${clip.handle}`} className="text-sm font-bold">@{clip.handle} · {clip.displayName}</a><h2 className="font-bold">{clip.title}</h2>{clip.body?<details className="text-sm"><summary>Description</summary><p className="whitespace-pre-wrap">{clip.body}</p></details>:null}<div className="flex flex-wrap gap-2"><Button variant="secondary" aria-pressed={liked} disabled={busy} onClick={()=>void action(async()=>{const r=await reactToPost({data:{postId:clip.id,emoji:"💜"}});setLiked(r.reacted);})}>{liked?"💜 Liked":"♡ Like"}</Button><a href={`/c/${clip.slug}/p/${clip.id}`} className="flex min-h-11 items-center rounded-full bg-white/15 px-4 font-bold">Comments & report</a><Button variant="secondary" disabled={busy} onClick={()=>void action(async()=>{await setPostPersonal({data:{postId:clip.id,hidden:true}});setHidden(true);})}>Hide</Button></div>{clip.media.captions?<details className="text-sm"><summary>Transcript</summary><p className="whitespace-pre-wrap">{clip.media.captions}</p></details>:null}</div>
  </article>;
}
