-- Durable delivery references existing notifications instead of copying private content.
create table if not exists push_delivery_queue (
 id bigserial primary key, user_id text not null references "user"(id) on delete cascade,
 notification_id int not null references notifications(id) on delete cascade,
 token text not null references push_tokens(token) on delete cascade,
 status text not null default 'pending' check(status in ('pending','receipt','delivered','failed','cancelled')),
 attempts int not null default 0, receipt_checks int not null default 0, ticket_id text,
 next_attempt_at timestamptz not null default now(), lease_token text, lease_until timestamptz,
 last_error text not null default '', created_at timestamptz not null default now(), completed_at timestamptz,
 unique(notification_id,token)
);
create index if not exists push_delivery_due on push_delivery_queue(status,next_attempt_at,lease_until);
create table if not exists email_digest_queue (
 id bigserial primary key, user_id text not null references "user"(id) on delete cascade,
 week_start date not null, status text not null default 'pending' check(status in ('pending','sent','failed','cancelled')),
 attempts int not null default 0, next_attempt_at timestamptz not null default now(), lease_token text, lease_until timestamptz,
 post_count int not null default 0, reply_count int not null default 0,
 provider_id text, last_error text not null default '', created_at timestamptz not null default now(), completed_at timestamptz,
 unique(user_id,week_start)
);
alter table profiles add column if not exists email_digest boolean not null default false;
create table if not exists moderation_cases (
 id bigserial primary key, report_id int references reports(id) on delete set null,
 subject_id text not null, opened_by text not null, assigned_to text,
 summary text not null, priority text not null default 'normal' check(priority in ('normal','urgent')),
 status text not null default 'open' check(status in ('open','investigating','decided','closed')),
 decision text not null default '' check(decision in ('','no_action','warning','suspended','banned')),
 public_reason text not null default '', decided_by text, decided_at timestamptz,
 sanction_revision bigint, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists moderation_case_report on moderation_cases(report_id) where report_id is not null;
create table if not exists moderation_case_events (
 id bigserial primary key, case_id bigint not null references moderation_cases(id) on delete cascade,
 actor_id text not null, kind text not null, note text not null, member_visible boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists moderation_case_appeals (
 id bigserial primary key, case_id bigint not null unique references moderation_cases(id) on delete cascade,
 user_id text not null, message text not null, status text not null default 'open' check(status in ('open','upheld','overturned')),
 decided_by text, decision_note text not null default '', created_at timestamptz not null default now(), decided_at timestamptz
);
alter table identity_account_status add column if not exists revision bigint not null default 0;
create or replace function bump_identity_revision() returns trigger language plpgsql as $$
begin NEW.revision=OLD.revision+1; return NEW; end $$;
drop trigger if exists identity_revision_changed on identity_account_status;
create trigger identity_revision_changed before update on identity_account_status for each row execute function bump_identity_revision();
create table if not exists platform_experiments (
 id bigserial primary key, key text not null unique, feature_key text not null check(feature_key in ('related_discovery','discovery_assistant')),
 title text not null, status text not null default 'draft' check(status in ('draft','running','ended')),
 treatment_percent int not null default 50 check(treatment_percent between 1 and 99),
 created_by text not null, created_at timestamptz not null default now(), started_at timestamptz, ended_at timestamptz
);
create unique index if not exists experiment_running_feature on platform_experiments(feature_key) where status='running';
create table if not exists experiment_assignments (
 experiment_id bigint not null references platform_experiments(id) on delete cascade,
 user_id text not null references "user"(id) on delete cascade, variant text not null check(variant in ('control','treatment')),
 exposed_at timestamptz not null default now(), converted_at timestamptz,
 primary key(experiment_id,user_id)
);
create table if not exists progression_seasons (
 id bigserial primary key, title text not null, starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','active','ended')),
 created_by text not null, check(ends_at>starts_at)
);
create table if not exists collectible_sets (
 id bigserial primary key, season_id bigint not null references progression_seasons(id) on delete cascade,
 title text not null, description text not null default '', cosmetic text not null check(cosmetic in ('aurora','sunrise','ocean','forest')),
 required_points int not null check(required_points between 1 and 100000), supply int not null check(supply between 1 and 100000),
 awarded int not null default 0 check(awarded>=0 and awarded<=supply), unique(season_id,cosmetic)
);
create table if not exists collectible_awards (
 set_id bigint not null references collectible_sets(id) on delete cascade,
 user_id text not null references "user"(id) on delete cascade, awarded_at timestamptz not null default now(),
 primary key(set_id,user_id)
);
