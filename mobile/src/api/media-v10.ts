import { rpc } from "./client";
import type { LibraryFile, LibraryItem, ShortVideoPage } from "./media-v10-types";
export type { StoryLayer, LibraryFile, LibraryItem, ShortVideo, ShortVideoPage } from "./media-v10-types";
export const mediaV10={
  search:(kind:"gif"|"audio",query="")=>rpc<{items:LibraryItem[]}>("searchMediaLibrary",{kind,query}),
  file:(libraryId:number)=>rpc<LibraryFile>("getMediaLibraryFile",{libraryId}),
  save:(data:{kind:"gif"|"audio";title:string;artist?:string;tags?:string;dataUrl:string;filename:string;altText?:string;rightsConfirmed:true;licensed?:boolean;licenseUrl?:string})=>rpc<{id:number}>("saveMediaLibraryItem",data),
  remove:(libraryId:number)=>rpc<{ok:boolean}>("deleteMediaLibraryItem",{libraryId}),
  shorts:(before?:number,slug?:string)=>rpc<ShortVideoPage>("shortVideoFeed",{before,slug}),
};
