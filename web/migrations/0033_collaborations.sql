create table collaboration_briefs (
  id bigserial primary key,
  owner_id text not null references profiles(user_id) on delete cascade,
  title text not null,
  brief text not null,
  budget_note text not null default '',
  open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table collaboration_proposals (
  id bigserial primary key,
  brief_id bigint not null references collaboration_briefs(id) on delete cascade,
  applicant_id text not null references profiles(user_id) on delete cascade,
  introduction text not null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brief_id,applicant_id)
);
create index collaboration_briefs_open on collaboration_briefs(open,created_at desc);
