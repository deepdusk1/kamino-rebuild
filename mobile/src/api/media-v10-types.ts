import type { ContentMediaItem } from "./content-types";
export type StoryLayer={id:string;kind:"text"|"sticker"|"mention";text:string;x:number;y:number;scale:number;rotation:number;color:string;backdrop:boolean};
export type LibraryItem={id:number;kind:string;title:string;artist:string;tags:string;filename:string;altText:string;licensed:boolean;mine:boolean;licenseUrl:string;url:string};
export type LibraryFile={dataUrl:string;mime:string;kind:string;filename:string;altText:string;title:string};
export type ShortVideo={id:number;title:string;body:string;slug:string;handle:string;displayName:string;warning:string;blur:boolean;media:ContentMediaItem};
export type ShortVideoPage={items:ShortVideo[];nextCursor:number|null};
