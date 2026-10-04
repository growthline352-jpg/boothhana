-- Link-only snapshots. Browser drafts are never uploaded automatically.
begin;
set local lock_timeout='5s';
create table itinerary_share (
 id uuid primary key,
 view_token varchar(22) not null unique check(view_token ~ '^[A-Za-z0-9_-]{22}$'),
 management_hash char(64) not null,
 snapshot_hash char(64) not null,
 snapshot_json jsonb not null check(octet_length(snapshot_json::text)<=65536),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create index itinerary_share_expiry on itinerary_share(expires_at);
alter table itinerary_share enable row level security;
revoke all on itinerary_share from public;
do $$
declare runtime_role text:=coalesce(nullif(current_setting('boothhana.backend_role',true),''),current_user); role_name text;
begin
 if lower(runtime_role) in ('public','anon','authenticated') then raise exception 'Trusted JDBC role required'; end if;
 foreach role_name in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=role_name) then
   execute format('revoke all on itinerary_share from %I',role_name);
   execute format('create policy %I on itinerary_share as restrictive for all to %I using(false) with check(false)','deny_'||role_name,role_name);
  end if;
 end loop;
 execute format('grant select,insert,update,delete on itinerary_share to %I',runtime_role);
 execute format('create policy boothhana_server_v11 on itinerary_share for all to %I using(true) with check(true)',runtime_role);
end $$;
commit;
