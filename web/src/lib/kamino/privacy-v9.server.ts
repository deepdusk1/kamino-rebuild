import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { loadMedia } from "./media-store.server.ts";
import { stageMediaDeletion } from "./media-deletion.server.ts";

type Row = Record<string, unknown>;
type ReadMedia = (reference: string) => Promise<string>;

/** Only caller-owned personal data. Authentication credentials and webhook/OAuth machinery are excluded. */
export async function exportV9PersonalData(sql: Sql, userId: string, readMedia: ReadMedia = loadMedia) {
  const ownPost = "in (select id from posts where author_user_id=$1)";
  const queries: Record<string, string> = {
    account: 'select name,email,"emailVerified","phoneNumber","phoneNumberVerified","twoFactorEnabled","createdAt" from "user" where id=$1',
    relationships: "select * from identity_relationships where user_id=$1",
    mutedPeople: "select * from muted_people where user_id=$1",
    blockedPeople: "select * from blocks where blocker_id=$1",
    follows: "select * from profile_follows where follower_id=$1 or followee_id=$1",
    followRequests: "select * from follow_requests where follower_id=$1 or followee_id=$1",
    accountStatus: "select status,reason,until,updated_at from identity_account_status where user_id=$1",
    identityAudit: "select action,detail,created_at from identity_audit where target_user_id=$1",
    communityRoles: "select community_id,role_id,created_at from community_role_assignments where user_id=$1",
    ownFaqs: "select * from community_faqs where updated_by=$1",
    ownBoards: "select * from community_boards where created_by=$1",
    ownQuests: "select * from community_quests where created_by=$1",
    questClaims: "select * from community_quest_claims where user_id=$1",
    communityBadges: "select * from community_badge_grants where user_id=$1",
    earnedCosmetics: "select * from earned_cosmetics where user_id=$1",
    checkinDays: "select * from community_checkin_days where user_id=$1",
    eventRsvps: "select * from event_rsvps where user_id=$1",
    ownEvents: "select * from events where created_by=$1",
    ownRooms: "select * from chat_rooms where created_by=$1",
    roomMemberships: "select * from chat_members where user_id=$1",
    liveReactions: "select * from live_room_reactions where user_id=$1",
    postReactions: "select * from post_emoji_reactions where user_id=$1",
    postPreferences: "select * from post_personal_settings where user_id=$1",
    postViews: "select * from post_views where user_id=$1",
    postRules: `select * from post_content_settings where post_id ${ownPost}`,
    postHistory: `select * from post_edit_history where post_id ${ownPost}`,
    bestAnswersChosen: "select * from post_best_answers where chosen_by=$1",
    storyDetails: `select * from story_details where post_id ${ownPost}`,
    storyResponses: "select * from story_responses where user_id=$1",
    highlights: "select * from profile_highlights where user_id=$1",
    highlightPosts: "select p.* from profile_highlight_posts p join profile_highlights h on h.id=p.highlight_id where h.user_id=$1",
    portfolio: "select * from profile_portfolio where user_id=$1",
    messagePins: "select * from chat_message_pins where pinned_by=$1",
    ownChatCards: "select c.* from chat_share_cards c join messages m on m.id=c.message_id where m.author_user_id=$1",
    discoveryFeedback: "select * from discovery_feedback where user_id=$1",
    communityVisits: "select * from community_visits where user_id=$1",
    recentSearches: "select * from recent_searches where user_id=$1",
    notifications: "select * from notifications where user_id=$1",
    notificationPreferences: "select notify_prefs from profiles where user_id=$1",
    notificationDeliveries: "select delivery_key,status,claimed_at,delivered_at from notification_deliveries where user_id=$1",
    supportTickets: "select * from support_tickets where user_id=$1",
    offers: "select * from creator_offers where owner_id=$1",
    orders: "select id,buyer_id,beneficiary_id,seller_id,offer_id,kind,title,price_minor,currency,checkout_mode,status,test_mode,privacy_closed,created_at,updated_at from billing_orders where buyer_id=$1 or beneficiary_id=$1 or seller_id=$1",
    entitlements: "select order_id,offer_id,state,expires_at,test_mode,updated_at from billing_entitlements where beneficiary_id=$1",
    paidRequirements: "select * from billing_resource_requirements where owner_id=$1",
    collaborationBriefs: "select * from collaboration_briefs where owner_id=$1",
    collaborationProposals: "select * from collaboration_proposals where applicant_id=$1 or brief_id in (select id from collaboration_briefs where owner_id=$1)",
    verificationRequests: "select * from verification_requests where requested_by=$1",
    strikes: "select * from strikes where user_id=$1",
    mutes: "select * from member_mutes where user_id=$1",
    appeals: "select * from appeals where user_id=$1",
    activityDays: "select active_on from daily_member_activity where user_id=$1 order by active_on",
    profileStories: "select id,caption,background,audience,minimum_age,content_warning,highlighted,hidden,kind,filename,mime,byte_size,alt_text,captions,question,poll_options,layers,music_mime,music_filename,music_byte_size,music_alt_text,music_captions,created_at,expires_at from profile_stories where owner_id=$1",
    profileStoryResponses: "select * from profile_story_responses where user_id=$1",
    friendships: "select * from friend_requests where sender_id=$1 or recipient_id=$1",
    groupInvitations: "select * from group_invitations where user_id=$1 or invited_by=$1",
    eventUpdates: "select * from event_timeline where author_id=$1",
    attendancePasses: "select * from event_passes where user_id=$1",
    emailDigestPreference: "select email_digest from profiles where user_id=$1",
    pushDeliveryHistory: "select notification_id,status,attempts,receipt_checks,created_at,completed_at from push_delivery_queue where user_id=$1",
    emailDigestHistory: "select week_start,status,attempts,post_count,reply_count,created_at,completed_at from email_digest_queue where user_id=$1",
    moderationCases: "select id,priority,status,decision,public_reason,created_at,decided_at from moderation_cases where subject_id=$1",
    moderationCaseUpdates: "select e.case_id,e.kind,e.note,e.created_at from moderation_case_events e join moderation_cases c on c.id=e.case_id where c.subject_id=$1 and e.member_visible=true",
    moderationCaseAppeals: "select case_id,message,status,decision_note,created_at,decided_at from moderation_case_appeals where user_id=$1",
    experimentAssignments: "select experiment_id,variant,exposed_at,converted_at from experiment_assignments where user_id=$1",
    collectibles: "select a.set_id,a.awarded_at,s.title,s.description,s.cosmetic from collectible_awards a join collectible_sets s on s.id=a.set_id where a.user_id=$1",
    semanticPreferences: "select namespace,embedding,enabled,updated_at from semantic_preferences where user_id=$1",
    semanticIndex: "select kind,target_id,revision,chunk_index,embedding,indexed_at from semantic_documents where owner_id=$1",
    watchQueue: "select q.id,q.url,q.title,q.kind,q.created_at,r.name as room_name from watch_queue q join chat_rooms r on r.id=q.room_id where q.added_by=$1",
    watchVotes: "select q.title,v.created_at,r.name as room_name from watch_queue_votes v join watch_queue q on q.id=v.item_id join chat_rooms r on r.id=q.room_id where v.user_id=$1",
    watchReadyHistory: "select w.round,w.ready,w.updated_at,r.name as room_name from watch_ready w join chat_rooms r on r.id=w.room_id where w.user_id=$1",
  };
  const entries = await Promise.all(Object.entries(queries).map(async ([key, query]) => [key, await sql.query<Row>(query, [userId])] as const));
  const contentRows = await sql.query<Row>(`select cm.* from content_media cm
    left join posts p on p.id=cm.post_id left join messages m on m.id=cm.message_id
    where p.author_user_id=$1 or m.author_user_id=$1 order by cm.id`, [userId]);
  const contentMedia = await Promise.all(contentRows.map(async row => {
    const { storage_ref: reference, ...metadata } = row;
    try { return { ...metadata, data_url: await readMedia(String(reference)), unavailable: false }; }
    catch { return { ...metadata, data_url: "", unavailable: true }; }
  }));
  const pictures: Record<string, Row[]> = {};
  const mediaLibrary = await Promise.all((await sql.query<Row>('select * from media_library where owner_id=$1', [userId])).map(async row => {
    const {storage_ref: reference,...metadata}=row;
    try{return {...metadata,data_url:await readMedia(String(reference)),unavailable:false};}
    catch{return {...metadata,data_url:'',unavailable:true};}
  }));
  const storyMedia = await Promise.all((await sql.query<Row>('select id,media_ref from profile_stories where owner_id=$1 and media_ref is not null', [userId])).map(async row => {
    try { return { storyId:Number(row.id),data_url:await readMedia(String(row.media_ref)),unavailable:false }; }
    catch { return { storyId:Number(row.id),data_url:'',unavailable:true }; }
  }));
  const storyMusic=await Promise.all((await sql.query<Row>('select id,music_ref from profile_stories where owner_id=$1 and music_ref is not null',[userId])).map(async row=>{
    try{return {storyId:Number(row.id),data_url:await readMedia(String(row.music_ref)),unavailable:false};}
    catch{return {storyId:Number(row.id),data_url:'',unavailable:true};}
  }));
  for (const table of ["profile_avatars", "profile_covers"] as const) {
    pictures[table] = await Promise.all((await sql.query<Row>(`select * from ${table} where user_id=$1`, [userId])).map(async row => {
      try { return { ...row, data_url: await readMedia(String(row.data_url)) }; }
      catch { return { ...row, data_url: "", unavailable: true }; }
    }));
  }
  const result = { version: 10, ...Object.fromEntries(entries), contentMedia, storyMedia, storyMusic, mediaLibrary, profilePictures: pictures };
  return result as typeof result & Record<string, unknown>;
}

/** Database-only preparation inside the account deletion transaction. External bytes are queued, never removed here. */
export async function prepareV9AccountDeletion(sql: Sql, userId: string, options: {
  pseudonym?: string;
} = {}) {
  const pseudonym = options.pseudonym ?? `deleted:${randomUUID()}`;
  const media = await sql.query<{ storage_ref: string }>(`select cm.storage_ref from content_media cm
    left join posts p on p.id=cm.post_id left join messages m on m.id=cm.message_id
    where p.author_user_id=$1 or m.author_user_id=$1
    union all select media_ref as storage_ref from profile_stories where owner_id=$1 and media_ref is not null
    union all select music_ref as storage_ref from profile_stories where owner_id=$1 and music_ref is not null
    union all select storage_ref from media_library where owner_id=$1`, [userId]);
  await stageMediaDeletion(sql, media.map(row => row.storage_ref));
  await sql.query(`delete from content_media where post_id in(select id from posts where author_user_id=$1)
    or message_id in(select id from messages where author_user_id=$1)`, [userId]);
  await sql.query(`delete from post_view_events where viewer_key=$1 or post_id in(select id from posts where author_user_id=$1)`, [userId]);
  await sql`delete from profile_stories where owner_id=${userId}`;
  await sql`delete from media_library where owner_id=${userId}`;
  await sql`delete from semantic_documents where owner_id=${userId}`;
  await sql`delete from semantic_preferences where user_id=${userId}`;
  // Case records survive for accountable decisions, with personal text and identity removed.
  await sql`update moderation_case_events set actor_id=case when actor_id=${userId} then ${pseudonym} else actor_id end,
    note='[Redacted after account deletion]' where actor_id=${userId} or case_id in(select id from moderation_cases where subject_id=${userId})`;
  await sql`update moderation_case_appeals set user_id=case when user_id=${userId} then ${pseudonym} else user_id end,
    decided_by=case when decided_by=${userId} then ${pseudonym} else decided_by end,
    message=case when user_id=${userId} then '[Redacted after account deletion]' else message end,
    decision_note=case when user_id=${userId} then '[Redacted after account deletion]' else decision_note end
    where user_id=${userId} or decided_by=${userId}`;
  await sql`update moderation_cases set subject_id=case when subject_id=${userId} then ${pseudonym} else subject_id end,
    opened_by=case when opened_by=${userId} then ${pseudonym} else opened_by end,
    assigned_to=case when assigned_to=${userId} then null else assigned_to end,
    decided_by=case when decided_by=${userId} then ${pseudonym} else decided_by end,
    summary=case when subject_id=${userId} then '[Redacted after account deletion]' else summary end,
    public_reason=case when subject_id=${userId} then '[Redacted after account deletion]' else public_reason end
    where subject_id=${userId} or opened_by=${userId} or assigned_to=${userId} or decided_by=${userId}`;
  await sql`update platform_experiments set created_by=${pseudonym} where created_by=${userId}`;
  await sql`update progression_seasons set created_by=${pseudonym} where created_by=${userId}`;

  // Close pending slots before replacing identities, avoiding uniqueness collisions and late fulfillment.
  await sql`update billing_orders set status='cancelled',privacy_closed=true,billing_revision=billing_revision+1,updated_at=now()
    where (buyer_id=${userId} or beneficiary_id=${userId}) and status='pending'`;
  await sql`update billing_entitlements set state='revoked',updated_at=now() where beneficiary_id=${userId}`;
  // Other recipients keep their already-paid gifts and exact expiry; their rows are never erased here.
  await sql`update billing_orders set privacy_closed=true,billing_revision=billing_revision+1,updated_at=now(),
    buyer_id=case when buyer_id=${userId} then ${pseudonym} else buyer_id end,
    beneficiary_id=case when beneficiary_id=${userId} then ${pseudonym} else beneficiary_id end,
    seller_id=case when seller_id=${userId} then ${pseudonym} else seller_id end
    where buyer_id=${userId} or beneficiary_id=${userId}`;
  await sql`update billing_entitlements set beneficiary_id=${pseudonym} where beneficiary_id=${userId}`;
  await sql`update billing_orders set seller_id=${pseudonym},updated_at=now() where seller_id=${userId}`;
  await sql`update creator_offers set owner_id=${pseudonym},published=false where owner_id=${userId}`;
  await sql.query(`delete from billing_resource_requirements where owner_id=$1 and resource_kind='post'
    and resource_id in(select cast(id as text) from posts where author_user_id=$1)`, [userId]);
  await sql`update billing_resource_requirements set owner_id=${pseudonym} where owner_id=${userId}`;
  await sql`delete from creator_offers where owner_id=${pseudonym}
    and not exists(select 1 from billing_orders o where o.offer_id=creator_offers.id)
    and not exists(select 1 from billing_entitlements e where e.offer_id=creator_offers.id)
    and not exists(select 1 from billing_resource_requirements r where r.offer_id=creator_offers.id)`;

  // OAuth callback proofs are transient, but not all flow columns have an account FK.
  await sql`delete from identity_oauth_flows where session_id in(select id from session where "userId"=${userId})`;
  await sql`delete from chat_share_cards where kind='profile' and target_id=${userId}`;
  await sql`update chat_message_pins set pinned_by=${pseudonym} where pinned_by=${userId}`;
  await sql`update post_best_answers set chosen_by=${pseudonym} where chosen_by=${userId}`;
  await sql`update community_role_assignments set granted_by=${pseudonym} where granted_by=${userId}`;
  await sql`update community_badge_grants set granted_by=${pseudonym} where granted_by=${userId}`;
  await sql`update identity_admin_grants set granted_by=${pseudonym} where granted_by=${userId}`;
  await sql`update identity_account_status set actor_id=${pseudonym} where actor_id=${userId}`;
  await sql`update notification_campaigns set actor_id=${pseudonym} where actor_id=${userId}`;
  // A surviving group needs a real owner for member management and message pinning.
  await sql.query(`update chat_rooms room set created_by=(
    select member.user_id from chat_members member join profiles p on p.user_id=member.user_id
    where member.room_id=room.id and member.user_id<>$1 and member.room_removed=false
    order by case member.group_role when 'coadmin' then 0 when 'moderator' then 1 else 2 end,member.user_id limit 1)
    where room.kind='group' and room.created_by=$1
      and exists(select 1 from chat_members member join profiles p on p.user_id=member.user_id
        where member.room_id=room.id and member.user_id<>$1 and member.room_removed=false)`, [userId]);
  for (const [table, column] of [["community_faqs", "updated_by"], ["community_boards", "created_by"], ["community_quests", "created_by"], ["events", "created_by"], ["chat_rooms", "created_by"], ["communities", "created_by"]] as const)
    await sql.query(`update ${table} set ${column}=$2 where ${column}=$1`, [userId, pseudonym]);
  for (const table of ["audit_log", "platform_audit"] as const)
    await sql.query(`update ${table} set actor_id=$2,detail='[Redacted after account deletion]' where actor_id=$1`, [userId, pseudonym]);
  await sql`update identity_audit set actor_id=case when actor_id=${userId} then ${pseudonym} else actor_id end,
    target_user_id=case when target_user_id=${userId} then ${pseudonym} else target_user_id end,detail='[Redacted after account deletion]'
    where actor_id=${userId} or target_user_id=${userId}`;
  await sql`update verification_requests set requested_by=case when requested_by=${userId} then ${pseudonym} else requested_by end,
    decided_by=case when decided_by=${userId} then ${pseudonym} else decided_by end,
    reason=case when requested_by=${userId} then '[Redacted after account deletion]' else reason end
    where requested_by=${userId} or decided_by=${userId}`;
  await sql`update appeals set user_id=case when user_id=${userId} then ${pseudonym} else user_id end,
    decided_by=case when decided_by=${userId} then ${pseudonym} else decided_by end,
    message=case when user_id=${userId} then '[Redacted after account deletion]' else message end,
    decision_note=case when user_id=${userId} then '[Redacted after account deletion]' else decision_note end
    where user_id=${userId} or decided_by=${userId}`;
  for (const table of ["strikes", "member_mutes"] as const)
    await sql.query(`update ${table} set user_id=case when user_id=$1 then $2 else user_id end,
      issued_by=case when issued_by=$1 then $2 else issued_by end,
      reason=case when user_id=$1 then '[Redacted after account deletion]' else reason end
      where user_id=$1 or issued_by=$1`, [userId, pseudonym]);
  await sql`update safety_flags set author_user_id=case when author_user_id=${userId} then ${pseudonym} else author_user_id end,
    reviewed_by=case when reviewed_by=${userId} then ${pseudonym} else reviewed_by end,
    excerpt=case when author_user_id=${userId} then '[Redacted after account deletion]' else excerpt end
    where author_user_id=${userId} or reviewed_by=${userId}`;
  await sql`update reports set reporter_id=${pseudonym},reason='[Redacted after account deletion]',details='[Redacted after account deletion]' where reporter_id=${userId}`;
  await sql`update reports set target_id=${pseudonym},details='[Redacted after account deletion]' where target_type='user' and target_id=${userId}`;
  return { pseudonym, mediaCount: media.length };
}

/** Columns from the legacy schema whose rows belong to the deleted member. */
const OWNED_COLUMNS = [
  "user_id", "author_user_id", "follower_id", "followee_id", "blocker_id", "blocked_id", "muted_user_id",
  "reporter_id", "editor_user_id", "profile_user_id", "proposer_user_id", "to_user_id", "target_user_id",
];
const KEEP_TABLES = new Set(["audit_log", "communities", "title_defs", "appeals", "strikes", "member_mutes", "safety_flags"]);
const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/** All personal row deletion/anonymization and external cleanup references commit or roll back together. */
export async function eraseAccountAtomically(sql: Sql, userId: string, options: { pseudonym?: string } = {}) {
  if (!sql.transaction) throw new Error("Account deletion requires a database transaction.");
  return sql.transaction(async transaction => {
    // Story publication/highlight/delete uses the same lock before collecting or changing media.
    const account = await transaction`select id from "user" where id=${userId} for update`;
    if (!account.length) throw new Error("Account unavailable.");
    const prepared = await prepareV9AccountDeletion(transaction, userId, options);
    await transaction`update communities set member_count=greatest(member_count-1,0)
      where id in(select community_id from memberships where user_id=${userId} and status='active')`;
    const legacyMedia = await transaction.query<{ reference: string }>(`
      select pi.data_url as reference from post_images pi join posts p on p.id=pi.post_id where p.author_user_id=$1
      union all select cover from posts where author_user_id=$1
      union all select mm.data_url from message_media mm join messages m on m.id=mm.message_id where m.author_user_id=$1
      union all select data_url from profile_avatars where user_id=$1
      union all select data_url from profile_covers where user_id=$1`, [userId]);
    const legacyQueued = await stageMediaDeletion(transaction, legacyMedia.map(row => row.reference));
    await transaction`delete from post_images where post_id in(select id from posts where author_user_id=${userId})`;
    await transaction`update coin_ledger set from_user_id=null where from_user_id=${userId}`;
    const columns = await transaction<{ table_name: string; column_name: string }>`
      select table_name,column_name from information_schema.columns
      where table_schema='public' and column_name=any(${OWNED_COLUMNS})`;
    const targets = columns.filter(column => !KEEP_TABLES.has(column.table_name) && column.table_name !== "profiles");
    // A foreign-key failure aborts a PostgreSQL transaction unless rolled back to a savepoint.
    // Retry after dependent rows, then let the final account/profile cascade remove remaining FK children.
    for (let pass = 0; pass < 2; pass++) {
      for (const { table_name, column_name } of targets) {
        await transaction.query("SAVEPOINT account_owned_rows");
        try {
          await transaction.query(`delete from ${quoted(table_name)} where ${quoted(column_name)}=$1`, [userId]);
          await transaction.query("RELEASE SAVEPOINT account_owned_rows");
        } catch (error) {
          await transaction.query("ROLLBACK TO SAVEPOINT account_owned_rows");
          await transaction.query("RELEASE SAVEPOINT account_owned_rows");
          if ((error as { code?: string }).code !== "23503") throw error;
        }
      }
    }
    await transaction`delete from profiles where user_id=${userId}`;
    await transaction`delete from "user" where id=${userId}`;
    // A successful cascade must not conceal leftover personal rows in tables without an account FK.
    for (const { table_name, column_name } of targets) {
      const remains = await transaction.query(`select 1 from ${quoted(table_name)} where ${quoted(column_name)}=$1 limit 1`, [userId]);
      if (remains.length) throw new Error(`Account cleanup did not finish for ${table_name}.`);
    }
    return { ...prepared, legacyQueued };
  });
}
