-- Apply after 001..004. Run against a backed-up staging database first.
-- Private collection inbox only: this migration does NOT publish or modify event/booth/reservation.
begin;
create table if not exists subculture_collection_run (
  id uuid primary key,
  request_hash char(64) not null,
  execution_mode varchar(20) not null check (execution_mode in ('CLI','MANUAL_IMPORT')),
  web_search_observed boolean not null,
  scope_json jsonb not null,
  request_json jsonb not null,
  receipt_json jsonb not null,
  status varchar(20) not null check(status in ('SUCCESS','PARTIAL','NO_RESULTS','FAILED','REJECTED_ALL')),
  summary text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  received_at timestamptz not null default now()
);
create table if not exists subculture_event_candidate (
  id bigserial primary key,
  identity_key char(64) not null unique,
  match_key char(64) not null,
  name varchar(255) not null,
  subcategory varchar(30) not null check(subcategory in ('COMIC_DOUJIN','DOLL','ONLY_EVENT','BIRTHDAY_CAFE')),
  venue_name varchar(255),
  starts_on date not null,
  ends_on date not null,
  payload_json jsonb not null,
  payload_hash char(64) not null,
  warnings_json jsonb not null,
  review_state varchar(20) not null default 'PENDING' check(review_state in ('PENDING','REVIEWED','EXCLUDED')),
  reviewed_payload_json jsonb,
  review_note text not null default '',
  reviewed_at timestamptz,
  revision bigint not null default 1,
  possible_duplicate_of bigint references subculture_event_candidate(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check(starts_on<=ends_on)
);
create table if not exists subculture_collection_observation (
  run_id uuid not null references subculture_collection_run(id),
  candidate_id bigint not null references subculture_event_candidate(id),
  payload_json jsonb not null,
  warnings_json jsonb not null,
  observed_at timestamptz not null default now(),
  primary key(run_id,candidate_id)
);
create index if not exists idx_subculture_candidate_review on subculture_event_candidate(review_state,last_seen_at desc,id desc);
create index if not exists idx_subculture_candidate_match on subculture_event_candidate(match_key);
create index if not exists idx_subculture_run_received on subculture_collection_run(received_at desc,id);
alter table subculture_collection_run enable row level security;
alter table subculture_event_candidate enable row level security;
alter table subculture_collection_observation enable row level security;
revoke all on subculture_collection_run,subculture_event_candidate,subculture_collection_observation from public;
revoke all on sequence subculture_event_candidate_id_seq from public;
-- Supabase installations may auto-grant anon/authenticated. Revoke explicitly where those roles exist.
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on subculture_collection_run,subculture_event_candidate,subculture_collection_observation from anon;
    revoke all on sequence subculture_event_candidate_id_seq from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on subculture_collection_run,subculture_event_candidate,subculture_collection_observation from authenticated;
    revoke all on sequence subculture_event_candidate_id_seq from authenticated;
  end if;
end $$;
commit;
-- Backend JDBC role must own these tables, or receive a separate server-only policy/grant.
-- Do not expose a service-role key to browsers or to the search CLI.
