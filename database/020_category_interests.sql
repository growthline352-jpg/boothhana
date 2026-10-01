-- Additive member preferences. Existing accounts retain the optional LEGACY prompt.
begin;
set local lock_timeout='5s';
alter table app_user add column if not exists onboarding_status varchar(12) not null default 'LEGACY'
 check(onboarding_status in ('LEGACY','PENDING','DONE','SKIPPED'));
create table if not exists member_interest_preferences (
 user_id bigint primary key references app_user(id), fields_json jsonb not null default '{}'::jsonb,
 revision bigint not null default 0, updated_at timestamptz not null default now(),
 check(jsonb_typeof(fields_json)='object')
);
do $$ declare r text; runtime_role text:=current_setting('boothhana.backend_role',true); begin
 if runtime_role is null or runtime_role='' then raise exception 'Set boothhana.backend_role before migration'; end if;
 alter table member_interest_preferences enable row level security;
 revoke all on member_interest_preferences from public;
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on member_interest_preferences from %I',r);
   execute format('drop policy if exists %I on member_interest_preferences','deny_'||r);
   execute format('create policy %I on member_interest_preferences as restrictive for all to %I using(false) with check(false)','deny_'||r,r);
  end if;
 end loop;
 execute format('grant select,insert,update,delete on member_interest_preferences to %I',runtime_role);
 drop policy if exists boothhana_server_v11 on member_interest_preferences;
 execute format('create policy boothhana_server_v11 on member_interest_preferences for all to %I using(true) with check(true)',runtime_role);
end $$;
commit;
