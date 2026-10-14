import { paidResourceAccessSql } from './billing-policy.ts';

/** Event discussions inherit their ticket/subscription rule, including direct RTC entry. */
export function paidRoomAccessSql(viewerSql: string, roomAlias = 'r') {
  return `(${paidResourceAccessSql(viewerSql, 'chat', `${roomAlias}.id`)})
    and not exists(select 1 from events paid_event
      where (paid_event.chat_room_id=${roomAlias}.id or paid_event.live_room_id=${roomAlias}.id)
        and not ${paidResourceAccessSql(viewerSql, 'event', 'paid_event.id')})`;
}
