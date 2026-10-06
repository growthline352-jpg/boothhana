-- Private account plans. Share links remain separate, explicit snapshots.
begin;
set local lock_timeout='5s';
create table personal_itinerary (
 user_id bigint not null references app_user(id) on delete cascade,
 id uuid not null,
 -- The API limits normalized compact JSON to 60,000 bytes. jsonb::text adds
 -- whitespace/number formatting; retain bounded storage headroom for it.
 plan_json jsonb not null check(octet_length(plan_json::text)<=98304),
 revision bigint not null default 1 check(revision>0),
 deleted boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,id)
);
create table purchase_plan (
 user_id bigint not null references app_user(id) on delete cascade,
 event_id bigint not null check(event_id>0),
 plan_json jsonb not null check(octet_length(plan_json::text)<=98304),
 revision bigint not null default 1 check(revision>0),
 deleted boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,event_id)
);
do $$
declare runtime_role text:=coalesce(nullif(current_setting('boothhana.backend_role',true),''),current_user); table_name text; role_name text;
begin
 if lower(runtime_role) in ('public','anon','authenticated') then raise exception 'Trusted JDBC role required'; end if;
 foreach table_name in array array['personal_itinerary','purchase_plan'] loop
  execute format('alter table %I enable row level security',table_name);
  execute format('revoke all on %I from public',table_name);
  foreach role_name in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=role_name) then
    execute format('revoke all on %I from %I',table_name,role_name);
    execute format('create policy %I on %I as restrictive for all to %I using(false) with check(false)','deny_'||role_name,table_name,role_name);
   end if;
  end loop;
  execute format('grant select,insert,update,delete on %I to %I',table_name,runtime_role);
  execute format('create policy boothhana_server_v11 on %I for all to %I using(true) with check(true)',table_name,runtime_role);
 end loop;
end $$;
commit;
