export type SearchKindV10='post'|'community'|'person';
export type SearchResultV10={kind:SearchKindV10;id:string;title:string;excerpt:string;href:string;score:number};
export type SemanticStatusV10={configured:boolean;indexedDocuments:number;pendingDocuments:number;privateIndexing:boolean};
