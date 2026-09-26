-- v5: apply after 001..006. Back up DB first. No source/edit/product/image rows are deleted.
begin;
alter table subculture_participant add column if not exists identity_aliases jsonb not null default '[]';
alter table subculture_catalog_product add column if not exists identity_aliases jsonb not null default '[]';
alter table subculture_participant add column if not exists sales_last_attempt_at timestamptz;
alter table subculture_participant add column if not exists sales_last_success_at timestamptz;
alter table subculture_participant add column if not exists sales_attempt_status varchar(24);
alter table subculture_participant add column if not exists sales_retry_after timestamptz;
alter table subculture_participant add column if not exists sales_failure_count integer not null default 0;
-- Seed fairness from real historic attempts, including null/failed results. Rerunning migration is safe.
update subculture_participant p set sales_last_attempt_at=x.last_attempt, sales_attempt_status='LEGACY'
from (select participant_id,max(received_at) last_attempt from subculture_stage_run where stage='SALES' group by participant_id) x
where x.participant_id=p.id and p.sales_last_attempt_at is null;
update subculture_participant p set sales_last_success_at=s.collected_at
from subculture_sales s where s.participant_id=p.id and p.sales_last_success_at is null;
alter table subculture_catalog_product add column if not exists last_seen_stage_id uuid;
alter table subculture_sales add column if not exists latest_payload_json jsonb;
alter table subculture_sales add column if not exists latest_stage_id uuid;
alter table subculture_sales add column if not exists product_checks_json jsonb not null default '{}';
alter table subculture_sales add column if not exists reviewed_product_checks_json jsonb not null default '{}';
update subculture_sales set latest_payload_json=payload_json where latest_payload_json is null and latest_stage_id is null;
create table if not exists subculture_participant_progress (
  event_id bigint not null references subculture_event_candidate(id), source_key char(64) not null,
  root_url text, next_page_url text, pass_no bigint not null default 1, page_index integer not null default 0,
  revision bigint not null default 1, state varchar(16) not null default 'ACTIVE' check(state in ('ACTIVE','COMPLETE','BLOCKED')),
  visited_json jsonb not null default '[]', last_pipeline_id uuid references subculture_pipeline_run(id),
  updated_at timestamptz not null default now(), primary key(event_id,source_key)
);
create index if not exists idx_subculture_sales_attempt on subculture_participant(sales_last_attempt_at,id);
create index if not exists idx_subculture_progress_updated on subculture_participant_progress(event_id,updated_at);
alter table subculture_participant_progress enable row level security;
revoke all on subculture_participant_progress from public;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on subculture_participant_progress from %I',r); end if;
  end loop;
end $$;
-- Do not erase old overrides or merge old duplicate identities automatically: their intent is unknown.
-- Alias backfill is done transactionally on first ingestion, preserving existing record/image/review IDs.
commit;
