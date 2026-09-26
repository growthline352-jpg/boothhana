-- v4: weekly three-stage collection. Back up DB; apply after 001..005.
-- No event/booth/product/reservation/POS business rows are created by collection.
begin;
alter table subculture_event_candidate drop constraint if exists subculture_event_candidate_subcategory_check;
alter table subculture_event_candidate add constraint subculture_event_candidate_subcategory_check
  check(subcategory in ('COMIC_DOUJIN','DOLL','ONLY_EVENT','BIRTHDAY_CAFE','STATIONERY_GOODS'));
alter table subculture_event_candidate add column if not exists overrides_json jsonb not null default '{}';
create table if not exists subculture_pipeline_run (
  id uuid primary key, week_key date not null, scope_json jsonb not null,
  state varchar(16) not null check(state in ('RUNNING','SUCCESS','PARTIAL','FAILED')),
  summary_json jsonb not null default '{}', started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(), finished_at timestamptz
);
-- One runner across backend instances. Dead runs can be resumed by id; expire after two hours without heartbeat.
create unique index if not exists uq_subculture_active_pipeline on subculture_pipeline_run(state) where state='RUNNING';
create table if not exists subculture_exhibitor (
  id bigserial primary key, identity_key char(64) not null unique, name varchar(255) not null,
  profile_json jsonb not null, updated_at timestamptz not null default now()
);
create table if not exists subculture_participant (
  id bigserial primary key, event_id bigint not null references subculture_event_candidate(id),
  identity_key char(64) not null, registration_name varchar(255) not null,
  payload_json jsonb not null, payload_hash char(64) not null, overrides_json jsonb not null default '{}',
  review_state varchar(20) not null default 'PENDING' check(review_state in ('PENDING','REVIEWED','EXCLUDED')),
  review_note text not null default '', reviewed_payload_json jsonb,
  revision bigint not null default 1, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  unique(event_id,identity_key)
);
create table if not exists subculture_participant_member (
  participant_id bigint not null references subculture_participant(id),
  exhibitor_id bigint not null references subculture_exhibitor(id), primary key(participant_id,exhibitor_id)
);
create table if not exists subculture_sales (
  participant_id bigint primary key references subculture_participant(id), payload_json jsonb not null, payload_hash char(64) not null,
  overrides_json jsonb not null default '{}', review_state varchar(20) not null default 'PENDING' check(review_state in ('PENDING','REVIEWED','EXCLUDED')),
  review_note text not null default '', reviewed_payload_json jsonb, revision bigint not null default 1,
  collected_at timestamptz not null default now()
);
create table if not exists subculture_catalog_product (
  id bigserial primary key, participant_id bigint not null references subculture_participant(id),
  identity_key char(64) not null, name varchar(255) not null, payload_json jsonb not null,
  last_seen_at timestamptz not null default now(), unique(participant_id,identity_key)
);
create table if not exists subculture_stage_run (
  id uuid primary key, pipeline_id uuid not null references subculture_pipeline_run(id),
  event_id bigint not null references subculture_event_candidate(id), participant_id bigint references subculture_participant(id),
  stage varchar(20) not null check(stage in ('PARTICIPANTS','SALES')), request_hash char(64) not null,
  request_json jsonb not null, coverage_json jsonb not null, receipt_json jsonb not null,
  status varchar(20) not null, started_at timestamptz not null, finished_at timestamptz not null,
  received_at timestamptz not null default now()
);
create table if not exists subculture_catalog_asset (
  id bigserial primary key, event_id bigint not null references subculture_event_candidate(id),
  participant_id bigint references subculture_participant(id), product_id bigint references subculture_catalog_product(id),
  identity_key char(64) not null unique, type varchar(20) not null,
  image_url text not null, page_url text not null, caption text, reported_rights text,
  rights_state varchar(20) not null default 'PENDING' check(rights_state in ('PENDING','APPROVED','REJECTED')),
  rights_note text not null default '', credit text not null default '', last_attempt_at timestamptz, storage_state varchar(20) not null default 'CANDIDATE' check(storage_state in ('CANDIDATE','STORED','FAILED')),
  object_key text, sha256 char(64), byte_size bigint, content_type varchar(40), error text not null default '',
  revision bigint not null default 1, created_at timestamptz not null default now(), stored_at timestamptz
);
create table if not exists subculture_catalog_review_history (
  id bigserial primary key, target_type varchar(20) not null, target_id bigint not null,
  before_json jsonb not null, after_json jsonb not null, created_at timestamptz not null default now()
);
create table if not exists subculture_catalog_publication (
  event_id bigint primary key references subculture_event_candidate(id), snapshot_json jsonb not null,
  event_revision bigint not null, published_at timestamptz not null default now()
);
create index if not exists idx_subculture_participant_event on subculture_participant(event_id,last_seen_at desc,id);
create index if not exists idx_subculture_sales_collected on subculture_sales(collected_at);
create index if not exists idx_subculture_stage_target on subculture_stage_run(event_id,stage,received_at desc);
create index if not exists idx_subculture_asset_pending on subculture_catalog_asset(rights_state,storage_state,id);
create index if not exists idx_subculture_asset_event on subculture_catalog_asset(event_id,participant_id,product_id);
-- RLS and grants: server-owned JDBC tables only; no browser or anonymous Supabase access.
do $$ declare tbl text; seq text; role_name text; begin
  foreach tbl in array array['subculture_pipeline_run','subculture_exhibitor','subculture_participant','subculture_participant_member',
    'subculture_sales','subculture_catalog_product','subculture_stage_run','subculture_catalog_asset',
    'subculture_catalog_review_history','subculture_catalog_publication'] loop
    execute format('alter table %I enable row level security',tbl);
    execute format('revoke all on %I from public',tbl);
    foreach role_name in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=role_name) then execute format('revoke all on %I from %I',tbl,role_name); end if;
    end loop;
    seq := null;
    if exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name=tbl and column_name='id') then
      seq := pg_get_serial_sequence(tbl,'id');
    end if;
    if seq is not null then
      execute format('revoke all on sequence %s from public',seq);
      foreach role_name in array array['anon','authenticated'] loop
        if exists(select 1 from pg_roles where rolname=role_name) then execute format('revoke all on sequence %s from %I',seq,role_name); end if;
      end loop;
    end if;
  end loop;
end $$;
commit;
