export type Disambiguation = 'reject'|'earlier'|'later';
export type Recurrence = 'none'|'daily'|'weekly'|'monthly';
type Parts={year:number;month:number;day:number;hour:number;minute:number;second:number};
export function validTimeZone(zone:string) {
  try {new Intl.DateTimeFormat('en-US',{timeZone:zone}).format();} catch {throw new Error('Choose a valid IANA time zone, such as America/Vancouver.');}
  return zone;
}
function partsAt(date:Date,zone:string):Parts {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:validTimeZone(zone),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])) as Parts;
}
function stamp(p:Parts){return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
export function zonedLocalInput(value:string,zone:string) {
  const p=partsAt(new Date(value),zone),pad=(n:number)=>String(n).padStart(2,'0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
export function localToInstant(local:string,zone:string,choice:Disambiguation='reject') {
  validTimeZone(zone);
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if(!match)throw new Error('Choose a valid local date and time.');
  const p:Parts={year:Number(match[1]),month:Number(match[2]),day:Number(match[3]),hour:Number(match[4]),minute:Number(match[5]),second:Number(match[6]??0)};
  const wanted=stamp(p),calendar=new Date(wanted);
  if(p.hour>23||p.minute>59||p.second>59||calendar.getUTCFullYear()!==p.year||calendar.getUTCMonth()+1!==p.month||calendar.getUTCDate()!==p.day)throw new Error('Choose a valid local date and time.');
  // Probe both sides of a transition. Each distinct offset yields a candidate;
  // round-tripping filters nonexistent wall times and detects repeated times.
  const offsets=new Set<number>();
  for(let hour=-36;hour<=36;hour+=6){const instant=wanted+hour*3600000;offsets.add(stamp(partsAt(new Date(instant),zone))-instant);}
  const candidates=[...offsets].map(offset=>wanted-offset).filter(value=>stamp(partsAt(new Date(value),zone))===wanted).sort((a,b)=>a-b);
  if(!candidates.length)throw new Error(`The time ${local} does not exist in ${zone} because clocks move forward. Choose another time.`);
  if(candidates.length>1&&choice==='reject')throw new Error(`The time ${local} occurs twice in ${zone}. Choose the earlier or later occurrence.`);
  return new Date((choice==='later'?candidates[candidates.length-1]:candidates[0])!).toISOString();
}
export function zonedOccurrences(startsAt:string,endsAt:string|undefined,recurrence:Recurrence,count=1,zone='UTC',choice:Disambiguation='reject') {
  const start=new Date(startsAt),end=endsAt?new Date(endsAt):null;
  if(!Number.isFinite(start.getTime())||end&&(!Number.isFinite(end.getTime())||end<=start))throw new Error('Choose a valid start and a later end.');
  if(!Number.isInteger(count)||count<1||count>12)throw new Error('Choose between 1 and 12 occurrences.');
  const first=partsAt(start,zone),total=recurrence==='none'?1:count;
  return Array.from({length:total},(_,index)=>{
    const next=new Date(stamp(first));
    if(recurrence==='daily'||recurrence==='weekly')next.setUTCDate(first.day+index*(recurrence==='weekly'?7:1));
    if(recurrence==='monthly'){next.setUTCDate(1);next.setUTCMonth(first.month-1+index);const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();next.setUTCDate(Math.min(first.day,last));}
    const local=next.toISOString().slice(0,19),instant=localToInstant(local,zone,choice);
    return {startsAt:instant,endsAt:end?new Date(new Date(instant).getTime()+end.getTime()-start.getTime()).toISOString():null};
  });
}
export function shiftedSeriesTime(original:string,selected:string,replacement:string,zone:string,choice:Disambiguation) {
  const source=partsAt(new Date(original),zone),anchor=partsAt(new Date(selected),zone),desired=partsAt(new Date(replacement),zone);
  const days=(Date.UTC(desired.year,desired.month-1,desired.day)-Date.UTC(anchor.year,anchor.month-1,anchor.day))/86400000;
  const shifted=new Date(Date.UTC(source.year,source.month-1,source.day+days,desired.hour,desired.minute,desired.second));
  return localToInstant(shifted.toISOString().slice(0,19),zone,choice);
}
