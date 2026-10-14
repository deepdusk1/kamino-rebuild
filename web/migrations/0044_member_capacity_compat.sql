-- Earlier development copies recorded 0027 before member_limit was added to it.
-- The append-only migration ledger must repair those copies with a new filename.
-- Existing configured limits and memberships remain unchanged.
alter table communities add column if not exists member_limit int
  check(member_limit is null or member_limit between 10 and 50);
