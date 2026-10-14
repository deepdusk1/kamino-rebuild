import { useEvent } from "expo";
import type { VideoPlayer } from "expo-video";
import { useMemo } from "react";
import { View } from "react-native";
import { Txt } from "@/components/ui";
import { captionAt, captionCues } from "@/lib/caption-cues";
export function CaptionOverlay({player,text}:{player:VideoPlayer;text:string}){
  const progress=useEvent(player,"timeUpdate",{currentTime:0,currentLiveTimestamp:null,currentOffsetFromLive:null,bufferedPosition:0});
  const cues=useMemo(()=>captionCues(text),[text]),caption=captionAt(cues,progress.currentTime);
  if(!caption)return null;
  return <View pointerEvents="none" style={{position:"absolute",bottom:65,left:12,right:12,alignItems:"center"}}><Txt accessibilityLiveRegion="polite" style={{color:"#fff",textAlign:"center",fontSize:16,backgroundColor:"rgba(0,0,0,.8)",padding:8,borderRadius:8}}>{caption}</Txt></View>;
}
