-- 0024: Enforce 18+ on existing data (the 18+ alignment changed code but not stored rows).
-- Communities created before the change may still carry 13/16 gates; lift them to 18.
update communities set age_gate = 18 where age_gate < 18;
alter table communities alter column age_gate set default 18;

-- Profiles confirmed under the old 13+ rule must re-confirm at 18+. Clearing the
-- timestamp forces the next app open through confirmMinimumAge again (it early-returns
-- only when min_age_confirmed_at is set). Anyone under 18 gets their account erased
-- by that same check, as the policy requires.
update profiles set min_age_confirmed_at = null where min_age_confirmed_at is not null;

-- Gate 13: remove the disposable storyteller test communities from the Sep 29
-- production test run (their scenes were already deleted). Only these exact ids.
-- (communities uses id as its text primary key; there is no slug column.)
delete from communities where id in ('story-test-lab', 'story-test-lab-1', 'story-test-lab-2');
