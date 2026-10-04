-- Additive private source checks and reviewed neighborhood locations. Never publish observations.
begin;
set local lock_timeout='5s';
create table catalog_source_check (
 event_id bigint primary key references subculture_event_candidate(id) on delete cascade,
 checked_at timestamptz not null, next_check_at timestamptz not null,
 status varchar(24) not null check(status in ('CONFIRMED','SOURCE_UNPUBLISHED','ACCESS_FAILED','EXTRACTION_FAILED','CONFLICT_REVIEW')),
 digest char(64) not null, details_json jsonb not null default '{}'::jsonb,
 failures integer not null default 0
);
create index catalog_source_check_due on catalog_source_check(next_check_at);
create table catalog_event_observation (
 id uuid primary key, event_id bigint not null references subculture_event_candidate(id) on delete cascade,
 event_revision bigint not null, fingerprint char(64) not null,
 observed_at timestamptz not null, source_urls_json jsonb not null, changes_json jsonb not null,
 state varchar(16) not null default 'PENDING' check(state in ('PENDING','APPLIED','REJECTED')),
 review_note varchar(2000) not null default '', reviewed_at timestamptz, review_seconds integer,
 unique(event_id,event_revision,fingerprint)
);
create index catalog_observation_queue on catalog_event_observation(state,observed_at);
create table catalog_event_place (
 event_id bigint primary key references subculture_event_candidate(id) on delete cascade,
 neighborhood varchar(24) not null check(neighborhood in ('SEONGSU','YEONNAM')),
 address text not null, latitude double precision, longitude double precision,
 source_url text not null, checked_on date not null,
 check((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between 37.0 and 38.0 and longitude between 126.0 and 128.0))
);
alter table catalog_source_check enable row level security;
alter table catalog_event_observation enable row level security;
alter table catalog_event_place enable row level security;
revoke all on catalog_source_check,catalog_event_observation,catalog_event_place from public;
do $$
declare runtime_role text:=coalesce(nullif(current_setting('boothhana.backend_role',true),''),current_user); role_name text; table_name text;
begin
 if lower(runtime_role) in ('public','anon','authenticated') then raise exception 'Trusted JDBC role required'; end if;
 foreach table_name in array array['catalog_source_check','catalog_event_observation','catalog_event_place'] loop
  foreach role_name in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=role_name) then
    execute format('revoke all on %I from %I',table_name,role_name);
    execute format('create policy %I on %I as restrictive for all to %I using(false) with check(false)','deny_'||role_name,table_name,role_name);
   end if;
  end loop;
  execute format('grant select,insert,update,delete on %I to %I',table_name,runtime_role);
  execute format('create policy boothhana_server_v11 on %I for all to %I using (true) with check (true)',table_name,runtime_role);
 end loop;
end $$;
commit;
