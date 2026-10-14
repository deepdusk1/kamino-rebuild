-- Release 8: the redesign. Richer profiles, onboarding interests, private accounts and follow requests,
-- scheduled and members-only posts, message requests, read receipts, typing, recent searches, and
-- notifications that remember who did what (so the list can show avatars, thumbnails and Follow Back).
--
-- Like the earlier migrations, lists are stored as JSON text (for example '["anime","music"]'), which
-- works the same on the built-in database and on Postgres. Every statement is safe to run twice.

-- ── Profiles ────────────────────────────────────────────────────────────────
alter table profiles add column if not exists pronouns text not null default '';
alter table profiles add column if not exists location text not null default '';
alter table profiles add column if not exists website text not null default '';
-- A short line under the name, for example "Digital Artist".
alter table profiles add column if not exists headline text not null default '';
-- Set by the site owner only (see adminSetVerified).
alter table profiles add column if not exists verified boolean not null default false;
-- Set by the site owner, or shown automatically once someone has 1,000 followers.
alter table profiles add column if not exists creator boolean not null default false;
-- Interest keys picked during onboarding (see INTEREST_OPTIONS in src/lib/kamino/types.ts).
alter table profiles add column if not exists interests text not null default '[]';
-- Up to six profile category tiles (see PROFILE_CATEGORY_OPTIONS).
alter table profiles add column if not exists profile_categories text not null default '[]';
alter table profiles add column if not exists onboarded_at timestamptz;
-- Private accounts: following needs approval and only followers see more than the header.
alter table profiles add column if not exists private_account boolean not null default false;
alter table profiles add column if not exists show_read_receipts boolean not null default true;
-- Quiet hours (0-23, in the person's own time zone); null means off. Only phone pushes are held back.
alter table profiles add column if not exists quiet_start smallint;
alter table profiles add column if not exists quiet_end smallint;
-- Which kinds of phone pushes to send: {"social","community","events","messages","digest"} true/false.
alter table profiles add column if not exists notify_prefs text not null default '{}';
-- The phone's time zone name (for example "America/Vancouver"), used for quiet hours. '' means UTC.
alter table profiles add column if not exists timezone text not null default '';
-- Longest daily check-in streak ever (the profile's streak card shows current and best).
alter table profiles add column if not exists best_streak int not null default 0;
update profiles set best_streak = streak where best_streak < streak;

-- ── Communities ─────────────────────────────────────────────────────────────
-- Up to 8 short topic labels shown as chips on the community page.
alter table communities add column if not exists topics text not null default '[]';
alter table communities add column if not exists language text not null default 'en';
alter table communities add column if not exists verified boolean not null default false;

-- ── Posts ───────────────────────────────────────────────────────────────────
alter table posts add column if not exists location text not null default '';
-- 'public' (anyone who can read the community) or 'members' (active members only).
alter table posts add column if not exists visibility text not null default 'public';
-- Scheduled posts stay hidden from everyone but their author until this time. Null means "now".
alter table posts add column if not exists publish_at timestamptz;
create index if not exists posts_created_idx on posts (created_at desc);
create index if not exists posts_author_idx on posts (author_user_id, created_at desc);

-- ── Chat ────────────────────────────────────────────────────────────────────
-- A category label for live rooms, for example "Music".
alter table chat_rooms add column if not exists topic text not null default '';
-- Read receipts reuse the existing unread tracking (chat_members.last_read_at) plus the last message id seen.
alter table chat_members add column if not exists last_read_id int not null default 0;

-- Who is typing right now (rows older than a few seconds are simply ignored).
create table if not exists typing (
  room_id int not null,
  user_id text not null,
  at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- A direct message from someone the recipient does not follow (and who shares no community with them)
-- waits in "Requests" until the recipient accepts it. One row per room, for the recipient.
create table if not exists message_requests (
  room_id int not null,
  user_id text not null,
  sender_id text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (room_id, user_id)
);
create index if not exists message_requests_user_idx on message_requests (user_id, status);

-- ── Follow requests (private accounts) ──────────────────────────────────────
create table if not exists follow_requests (
  follower_id text not null,
  followee_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
create index if not exists follow_requests_followee_idx on follow_requests (followee_id, created_at desc);

-- ── Search ──────────────────────────────────────────────────────────────────
create table if not exists recent_searches (
  id serial primary key,
  user_id text not null,
  query text not null,
  at timestamptz not null default now()
);
create index if not exists recent_searches_user_idx on recent_searches (user_id, at desc);

-- ── Notifications ───────────────────────────────────────────────────────────
-- Who caused it and what it is about, so the list can show an avatar, a thumbnail and buttons.
-- Older rows keep these empty and still display (from their title and body).
alter table notifications add column if not exists actor_id text;
alter table notifications add column if not exists target_type text not null default '';
alter table notifications add column if not exists target_id text not null default '';
alter table notifications add column if not exists thumb text not null default '';
create index if not exists notifications_unread_idx on notifications (user_id, read);

-- ── Presence ────────────────────────────────────────────────────────────────
create index if not exists profiles_last_seen_idx on profiles (last_seen_at);
create index if not exists profile_follows_followee_idx on profile_follows (followee_id);
