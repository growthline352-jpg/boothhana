-- v8. Back up first; apply 001..009 in order. Additive only; no commerce writes.
begin;
create table if not exists subculture_floorplan_watch (
 event_id bigint primary key references subculture_event_candidate(id),
 revision bigint not null default 1, disabled boolean not null default false,
 last_status varchar(24) not null default 'NOT_CHECKED', last_checked_at timestamptz,
 next_check_at timestamptz not null default now(), announced_on date,
 result_json jsonb not null default '{}', last_error text not null default '',
 lease_id uuid, lease_until timestamptz
);
create table if not exists subculture_floorplan_source (
 asset_id bigint primary key references subculture_catalog_asset(id),
 scope_json jsonb not null, can_transform boolean not null default false,
 transform_note text not null default '', revision bigint not null default 1,
 current_sha256 char(64), checked_at timestamptz, last_error text not null default ''
);
create table if not exists subculture_floorplan_version (
 id uuid primary key, event_id bigint not null references subculture_event_candidate(id),
 asset_id bigint not null references subculture_floorplan_source(asset_id),
 scope_key char(64) not null, scope_json jsonb not null, sha256 char(64) not null,
 image_width integer not null check(image_width>0), image_height integer not null check(image_height>0),
 content_type varchar(40) not null, byte_size bigint not null check(byte_size between 1 and 10485760),
 object_key text, state varchar(24) not null default 'AWAITING_IMAGE'
   check(state in ('AWAITING_IMAGE','AWAITING_ANALYSIS','DRAFT','APPROVED','WITHDRAWN')),
 geometry_json jsonb, mapping_json jsonb, manual_links_json jsonb not null default '{}',
 analysis_hash char(64), participant_hash char(64), review_note text not null default '',
 revision bigint not null default 1, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), analyzed_at timestamptz,
 unique(asset_id,scope_key,sha256)
);
-- Explicitly selected version. Image, geometry and mapping switch atomically, never independently.
create table if not exists subculture_floorplan_publication (
 event_id bigint not null references subculture_event_candidate(id), scope_key char(64) not null,
 version_id uuid not null references subculture_floorplan_version(id), snapshot_json jsonb not null,
 published_at timestamptz not null default now(), primary key(event_id,scope_key)
);
create table if not exists subculture_floorplan_receipt (
 request_id uuid primary key, event_id bigint not null references subculture_event_candidate(id),
 request_hash char(64) not null, response_json jsonb not null, created_at timestamptz not null default now()
);
create index if not exists idx_floorplan_watch_due on subculture_floorplan_watch(disabled,next_check_at,event_id);
create index if not exists idx_floorplan_versions_event on subculture_floorplan_version(event_id,created_at desc);
do $$ declare tbl text; rn text; begin
 foreach tbl in array array['subculture_floorplan_watch','subculture_floorplan_source','subculture_floorplan_version','subculture_floorplan_publication','subculture_floorplan_receipt'] loop
  execute format('alter table %I enable row level security',tbl);
  execute format('revoke all on %I from public',tbl);
  foreach rn in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=rn) then execute format('revoke all on %I from %I',tbl,rn); end if;
  end loop;
 end loop;
end $$;
commit;
