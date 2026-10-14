-- Only derived vectors and revision hashes are retained; result text always comes from current source rows.
create table if not exists semantic_documents (
  namespace text not null,
  kind text not null check(kind in ('post','community','person')),
  target_id text not null,
  owner_id text references profiles(user_id) on delete cascade,
  community_id text references communities(id) on delete cascade,
  post_id int references posts(id) on delete cascade,
  revision text not null,
  chunk_index int not null,
  embedding double precision[] not null,
  indexed_at timestamptz not null default now(),
  primary key(namespace,kind,target_id,chunk_index)
);
create index if not exists semantic_documents_source on semantic_documents(kind,target_id);
create table if not exists semantic_usage (
  day date primary key,
  calls int not null default 0,
  bytes bigint not null default 0
);
create table if not exists semantic_index_leases (
  namespace text primary key,
  token text not null,
  until_at timestamptz not null
);
create table if not exists semantic_preferences (
  user_id text primary key references profiles(user_id) on delete cascade,
  namespace text not null,
  embedding double precision[] not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create or replace function kamino_cosine(a double precision[], b double precision[])
returns double precision language sql immutable strict as $$
  select coalesce(sum(a[i]*b[i]) / nullif(sqrt(sum(a[i]*a[i])*sum(b[i]*b[i])),0),0)
  from generate_subscripts(a,1) as g(i) where cardinality(a)=cardinality(b)
$$;
