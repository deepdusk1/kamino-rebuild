import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, AppState, FlatList, View, type ViewToken } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { authHeaders, assetUrl } from "@/api/client";
import { mediaV10, type ShortVideo } from "@/api/media-v10";
import { contentApi } from "@/lib/content-v9";
import { Button, Txt, Loading, Screen } from "@/components/ui";
import { showError } from "@/lib/errors";
import { CaptionOverlay } from "@/components/content/CaptionOverlay";

export default function Shorts(){
  const {slug}=useLocalSearchParams<{slug?:string}>(),[height,setHeight]=useState(600),[active,setActive]=useState(0),[focused,setFocused]=useState(true),[reduceMotion,setReduceMotion]=useState(true);
  useFocusEffect(useCallback(()=>{setFocused(true);return ()=>setFocused(false);},[]));
  useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(()=>setReduceMotion(true));const sub=AccessibilityInfo.addEventListener("reduceMotionChanged",setReduceMotion);return ()=>sub.remove();},[]);
  const q=useInfiniteQuery({queryKey:["shortVideos",slug],initialPageParam:undefined as number|undefined,queryFn:({pageParam})=>mediaV10.shorts(pageParam,slug),getNextPageParam:page=>page.nextCursor??undefined});
  const clips=useMemo(()=>q.data?.pages.flatMap(page=>page.items)??[],[q.data]);
  const visible=useCallback(({viewableItems}:{viewableItems:ViewToken<ShortVideo>[]})=>{const first=viewableItems.find(item=>item.isViewable);if(first)setActive(first.item.id);},[]);
  return <Screen scroll={false}><View style={{padding:16,gap:8}}><Txt variant="title">Short videos</Txt><Txt variant="small" tone="muted">Swipe up for the next clip. Videos start muted.</Txt><Button small variant="secondary" label="Create a short video" onPress={()=>router.push("/content-studio" as never)}/></View>{q.error?<Txt tone="danger">{q.error.message}</Txt>:null}{q.isPending?<Loading/>:<View style={{flex:1}} onLayout={event=>setHeight(Math.max(300,event.nativeEvent.layout.height))}><FlatList data={clips} keyExtractor={item=>String(item.id)} pagingEnabled snapToInterval={height} decelerationRate="fast" getItemLayout={(_,index)=>({length:height,offset:height*index,index})} onViewableItemsChanged={visible} viewabilityConfig={{itemVisiblePercentThreshold:65}} initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} renderItem={({item})=><ClipCard clip={item} height={height} active={item.id===(active||clips[0]?.id)&&focused} autoplay={!reduceMotion}/>} ListEmptyComponent={<View style={{padding:24}}><Txt tone="muted">No clips to show yet.</Txt></View>} ListFooterComponent={<View style={{height,padding:24,gap:16,justifyContent:"center"}}>{q.hasNextPage?<Button busy={q.isFetchingNextPage} label="More clips" onPress={()=>void q.fetchNextPage()}/>:<Txt>You’re caught up.</Txt>}<Button variant="secondary" label="Refresh" onPress={()=>void q.refetch()}/></View>}/></View>}</Screen>;
}
function ClipCard({clip,height,active,autoplay}:{clip:ShortVideo;height:number;active:boolean;autoplay:boolean}){
  const [revealed,setRevealed]=useState(!clip.blur),[liked,setLiked]=useState(false),[hidden,setHidden]=useState(false),[busy,setBusy]=useState(false);
  async function run(fn:()=>Promise<unknown>){setBusy(true);try{await fn();}catch(e){showError(e);}finally{setBusy(false);}}
  return <View style={{height,backgroundColor:"#000",padding:12,gap:8}}>{hidden?<View style={{flex:1,justifyContent:"center"}}><Txt style={{color:"#fff"}}>Clip hidden from your feeds.</Txt></View>:<><View style={{flex:1,minHeight:100}}>{revealed?<ClipPlayer clip={clip} active={active} autoplay={autoplay}/>:<View style={{flex:1,justifyContent:"center",gap:16}}><Txt style={{color:"#fff"}}>Content note: {clip.warning}</Txt><Button label="Show clip" onPress={()=>setRevealed(true)}/></View>}</View><Txt variant="heading" style={{color:"#fff"}}>{clip.title}</Txt><Button small variant="secondary" label={`@${clip.handle}`} onPress={()=>router.push(`/u/${clip.handle}`)}/><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}><Button small busy={busy} label={liked?"💜 Liked":"♡ Like"} onPress={()=>void run(async()=>{const response=await contentApi.react(clip.id,"💜") as {reacted:boolean};setLiked(response.reacted);})}/><Button small variant="secondary" label="Comments & report" onPress={()=>router.push(`/c/${clip.slug}/p/${clip.id}`)}/><Button small variant="secondary" disabled={busy} label="Hide" onPress={()=>void run(async()=>{await contentApi.personal(clip.id,{hidden:true});setHidden(true);})}/></View>{clip.media.captions?<Txt variant="small" numberOfLines={2} style={{color:"#fff"}}>Transcript: {clip.media.captions}</Txt>:null}</>}</View>;
}
function ClipPlayer({clip,active,autoplay}:{clip:ShortVideo;active:boolean;autoplay:boolean}){
  const player=useVideoPlayer({uri:assetUrl(clip.media.url),headers:authHeaders()},p=>{p.loop=true;p.muted=true;p.timeUpdateEventInterval=.25;}),[foreground,setForeground]=useState(AppState.currentState==="active");
  useEffect(()=>{const sub=AppState.addEventListener("change",state=>setForeground(state==="active"));return ()=>sub.remove();},[]);
  useEffect(()=>{if(active&&foreground&&autoplay)player.play();else player.pause();},[active,foreground,autoplay,player]);
  useEffect(()=>{if(active)void contentApi.view(clip.id).catch(()=>undefined);},[active,clip.id]);
  return <View style={{width:"100%",height:"100%"}}><VideoView player={player} nativeControls contentFit="contain" style={{width:"100%",height:"100%"}} accessibilityLabel={clip.media.altText||clip.title}/>{clip.media.captions?<CaptionOverlay player={player} text={clip.media.captions}/>:null}</View>;
}
