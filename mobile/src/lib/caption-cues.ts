export type CaptionCue={start:number;end:number;text:string};
function seconds(value:string){
  const match=/^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
  if(!match||Number(match[2])>59||Number(match[3])>59)return null;
  return Number(match[1]??0)*3600+Number(match[2])*60+Number(match[3])+Number(match[4])/1000;
}
function plain(value:string){return value.replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").trim();}
/** Uploaded WebVTT cues use their actual timings. A plain transcript remains visible for ten minutes. */
export function captionCues(value:string):CaptionCue[]{
  const source=value.replace(/\r/g,"").slice(0,12000).trim();if(!source)return [];
  if(!source.startsWith("WEBVTT"))return [{start:0,end:600,text:source.replace(/-->/g,"→")}];
  const cues:CaptionCue[]=[];
  for(const block of source.split(/\n\s*\n/)){
    const lines=block.split("\n"),index=lines.findIndex(line=>line.includes("-->"));if(index<0||/^(NOTE|STYLE|REGION)\b/.test(lines[0]??""))continue;
    const match=/^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[index]!);if(!match)continue;
    const start=seconds(match[1]!),end=seconds(match[2]!),text=plain(lines.slice(index+1).join("\n"));
    if(start===null||end===null||end<=start||!text)continue;cues.push({start,end,text});
  }
  return cues.sort((a,b)=>a.start-b.start);
}
export function captionAt(cues:CaptionCue[],time:number){if(!Number.isFinite(time))return "";return cues.filter(cue=>time>=cue.start&&time<cue.end).map(cue=>cue.text).join("\n");}
