import { Image } from "expo-image";
import { CaptionOverlay } from "./CaptionOverlay";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { View } from "react-native";
import { authHeaders, assetUrl } from "@/api/client";
import { Button, Txt } from "@/components/ui";
import type { ContentMediaItem } from "@/lib/content-v9";
import { showError } from "@/lib/errors";
import { useTheme } from "@/theme";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export function ContentMedia({media,muted=false}:{media:ContentMediaItem;muted?:boolean}){
  if(media.kind==="video"||media.kind==="short")return <Clip media={media} muted={muted}/>;
  if(media.kind==="audio")return <Sound media={media}/>;
  if(media.kind==="file")return <Button variant="secondary" label={`📎 Save ${media.filename}`} onPress={()=>void save(media).catch(showError)}/>;
  return <Image source={{uri:assetUrl(media.url),headers:authHeaders()}} cachePolicy="none" accessible style={{width:"100%",height:280,borderRadius:16}} contentFit="contain" accessibilityLabel={media.altText||media.filename}/>;
}
function Clip({media,muted}:{media:ContentMediaItem;muted:boolean}){const player=useVideoPlayer({uri:assetUrl(media.url),headers:authHeaders()},p=>{p.timeUpdateEventInterval=.25;p.muted=muted;});return <View style={{gap:8}}><View style={{position:"relative"}}><VideoView player={player} nativeControls contentFit="contain" style={{width:"100%",height:media.kind==="short"?440:240,borderRadius:16,backgroundColor:"#000"}} accessibilityLabel={media.altText||media.filename}/>{media.captions?<CaptionOverlay player={player} text={media.captions}/>:null}</View>{media.captions?<Txt variant="small">Captions: {media.captions}</Txt>:null}</View>;}
function Sound({media}:{media:ContentMediaItem}){const theme=useTheme(),player=useAudioPlayer({uri:assetUrl(media.url),headers:authHeaders()}),status=useAudioPlayerStatus(player);return <View style={{padding:16,gap:10,borderRadius:16,backgroundColor:theme.surfaceAlt}}><Txt variant="heading">🎧 {media.filename}</Txt><Button label={status.playing?"Pause":"Play audio"} onPress={()=>{if(status.playing)player.pause();else{if(status.didJustFinish)void player.seekTo(0);player.play();}}}/>{media.captions?<Txt variant="small">{media.captions}</Txt>:null}</View>;}
async function save(media:ContentMediaItem){if(!cacheDirectory)throw new Error("File storage is unavailable on this device.");const file=await downloadAsync(assetUrl(media.url),`${cacheDirectory}${media.id}-${media.filename.replace(/[^a-zA-Z0-9._-]/g,"_")}`,{headers:authHeaders()});if(file.status!==200)throw new Error("Attachment unavailable.");if(await Sharing.isAvailableAsync())await Sharing.shareAsync(file.uri);else throw new Error("Saving files is unavailable on this device.");}
