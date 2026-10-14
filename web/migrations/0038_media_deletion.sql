-- References survive account/content deletion until the private storage object is confirmed removed.
-- Deliberately contains no account identifier or foreign key to records being erased.
create table if not exists media_deletion_queue (
 id bigserial primary key,
 media_ref text not null unique check (length(media_ref)<=2048 and media_ref ~ '^s3:[A-Za-z0-9/_-]+\|[a-z]+/[a-z0-9.+-]+$'),
 attempts integer not null default 0 check (attempts>=0),
 created_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 last_error text not null default '' check (length(last_error)<=300),
 check ((lease_token is null) = (lease_until is null))
);
create index if not exists media_deletion_due_idx on media_deletion_queue(next_attempt_at,id);
