-- Enforce micro-community capacity on every membership path, including moderation approvals.
create or replace function kamino_check_member_capacity() returns trigger language plpgsql as $$
declare capacity integer; current_members integer;
begin
 if new.status <> 'active' then return new; end if;
 if tg_op = 'UPDATE' and old.status = 'active' and old.community_id = new.community_id then return new; end if;
 select member_limit into capacity from communities where id=new.community_id for update;
 if capacity is null then return new; end if;
 select count(*) into current_members from memberships where community_id=new.community_id and status='active';
 if current_members >= capacity then raise exception 'This micro-community has reached its member limit.'; end if;
 return new;
end $$;
drop trigger if exists kamino_member_capacity on memberships;
create trigger kamino_member_capacity before insert or update of status on memberships for each row execute function kamino_check_member_capacity();
