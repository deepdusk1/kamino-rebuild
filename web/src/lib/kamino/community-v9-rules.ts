export const COMMUNITY_PERMISSIONS = ['post','events','live','invite','manage_faq','manage_boards','trusted'] as const;
export type CommunityPermission = (typeof COMMUNITY_PERMISSIONS)[number];
export const EARNED_COSMETICS = ['aurora','sunrise','ocean','forest'] as const;
export function communityLevel(reputation: number) { return Math.max(1, Math.floor(Math.sqrt(Math.max(0, reputation) / 100)) + 1); }
export function validatedWebUrl(value: string | undefined, label = 'Link') {
  if (!value?.trim()) return '';
  const url = new URL(value.trim());
  if (url.protocol !== 'https:') throw new Error(`${label} must start with https://.`);
  if (url.username || url.password) throw new Error(`${label} must not contain a username or password.`);
  return url.toString().slice(0, 1200);
}
export function eventOccurrences(startsAt: string, endsAt: string | undefined, recurrence: 'none'|'daily'|'weekly'|'monthly', count = 1) {
  const start = new Date(startsAt), end = endsAt ? new Date(endsAt) : null;
  if (!Number.isFinite(start.getTime())) throw new Error('Choose a valid start time.');
  if (end && (!Number.isFinite(end.getTime()) || end <= start)) throw new Error('The end must be after the start.');
  const total = recurrence === 'none' ? 1 : Math.min(12, Math.max(1, Math.floor(count)));
  if (!Number.isFinite(total)) throw new Error('Choose between 1 and 12 occurrences.');
  return Array.from({length:total}, (_, n) => {
    const next = new Date(start);
    if (recurrence === 'daily') next.setUTCDate(start.getUTCDate() + n);
    if (recurrence === 'weekly') next.setUTCDate(start.getUTCDate() + n * 7);
    if (recurrence === 'monthly') {
      next.setUTCDate(1); next.setUTCMonth(start.getUTCMonth() + n);
      const lastDay = new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();
      next.setUTCDate(Math.min(start.getUTCDate(),lastDay));
    }
    return {startsAt:next.toISOString(),endsAt:end ? new Date(next.getTime() + end.getTime() - start.getTime()).toISOString() : null};
  });
}
function icsEscape(value:string) { return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
function icsDate(value:string) { return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''); }
export function calendarEvent(event:{id:number;title:string;body:string;startsAt:string;endsAt:string|null;location:string;onlineUrl:string;status:string}) {
  const fields = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kamino//Community Events//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:kamino-${event.id}@events.kamino`,`DTSTAMP:${icsDate(new Date().toISOString())}`,`DTSTART:${icsDate(event.startsAt)}`];
  if(event.endsAt) fields.push(`DTEND:${icsDate(event.endsAt)}`);
  fields.push(`SUMMARY:${icsEscape(event.title)}`,`DESCRIPTION:${icsEscape(event.body)}`,`LOCATION:${icsEscape(event.location || event.onlineUrl)}`,`STATUS:${event.status==='cancelled'?'CANCELLED':'CONFIRMED'}`,'END:VEVENT','END:VCALENDAR');
  return fields.map(line=>{const chunks=[];let current='';for(const char of line){if(new TextEncoder().encode(current+char).length>73){chunks.push(current);current=' '+char;}else current+=char;}chunks.push(current);return chunks.join('\r\n');}).join('\r\n')+'\r\n';
}
