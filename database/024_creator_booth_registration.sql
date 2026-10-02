-- A member-created catalogue booth is owned directly, not an approved ownership claim.
begin;
set local lock_timeout='5s';
create table catalog_creator_booth (
 participant_id bigint primary key references subculture_participant(id),
 event_id bigint not null references subculture_event_candidate(id),
 user_id bigint not null references app_user(id),
 base_booth_id bigint not null references booth(id),
 created_at timestamptz not null default now(),
 unique(event_id,user_id)
);
create index catalog_creator_booth_user_idx on catalog_creator_booth(user_id,created_at desc);
create index catalog_creator_booth_base_idx on catalog_creator_booth(base_booth_id);
alter table catalog_creator_booth enable row level security;
revoke all on catalog_creator_booth from public;
do $$
declare runtime_role text:=coalesce(nullif(current_setting('boothhana.backend_role',true),''),current_user); role_name text;
begin
 if lower(runtime_role) in ('public','anon','authenticated') then raise exception 'Trusted JDBC role required'; end if;
 foreach role_name in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=role_name) then
   execute format('revoke all on catalog_creator_booth from %I',role_name);
  end if;
 end loop;
 execute format('grant select,insert,update,delete on catalog_creator_booth to %I',runtime_role);
 execute format('create policy boothhana_server_v11 on catalog_creator_booth for all to %I using (true) with check (true)',runtime_role);
end $$;
commit;
