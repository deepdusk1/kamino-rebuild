import {rpc} from './client';
export type SearchKind='post'|'community'|'person';
export type SearchResult={kind:SearchKind;id:string;title:string;excerpt:string;href:string;score:number};
export const smartSearch={
 status:()=>rpc<{configured:boolean;indexedDocuments:number;pendingDocuments:number;privateIndexing:boolean;personalized:boolean}>('getSemanticStatusV10'),
 search:(query:string,kind:SearchKind|'all',consent:boolean)=>rpc<{results:SearchResult[];indexed:boolean}>('semanticSearchV10',{query,kind,consent}),
 personalize:(enabled:boolean,consent:boolean)=>rpc<{enabled:boolean}>('setSemanticPersonalizationV10',{enabled,consent}),
 recommendations:()=>rpc<{enabled:boolean;results:SearchResult[]}>('semanticRecommendationsV10'),
 duplicates:(communityId:string,text:string,consent:boolean)=>rpc<{matches:SearchResult[];threshold:number}>('detectDuplicatePostsV10',{communityId,text,consent}),
 index:(consent:boolean)=>rpc<{indexed:number;busy:boolean;configured:boolean}>('indexSemanticContentV10',{consent}),
};
