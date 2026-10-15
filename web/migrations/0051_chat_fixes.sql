-- Chat fixes (Oct 2026).
-- Offline-replay tags are unique per author, not across everyone: two people's phones can never collide, and one
-- person can't block another's message by guessing its tag.
drop index if exists messages_client_tag_idx;
create unique index if not exists messages_author_client_tag_idx
  on messages (author_user_id, client_tag) where client_tag is not null;
