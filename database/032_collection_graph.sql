-- Additive upgrade after 019. No existing IDs, reviews, saved items or publications are rewritten.
begin;
set local lock_timeout='5s';
create table if not exists collection_job (
 id uuid primary key, kind text not null check(kind in ('DISCOVERY','EVENT','PARTICIPANTS','SALES','CREATOR','CHARACTERS')),
 target_id text not null, input_json jsonb not null, dedupe_key text not null unique,
 baseline boolean not null default false,
 state text not null default 'PENDING' check(state in ('PENDING','RUNNING','VERIFYING','COMPLETE','WAITING','REJECTED','STALE')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, last_error text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((lease_token is null)=(lease_until is null))
);
create index if not exists idx_collection_job_claim on collection_job(available_at,created_at) where state in ('PENDING','RUNNING','VERIFYING','WAITING');
alter table collection_job add column if not exists active_key text;
create unique index if not exists uq_collection_job_active on collection_job(active_key)
 where active_key is not null and state in ('PENDING','RUNNING','VERIFYING','WAITING');
create table if not exists collection_extraction (
 id uuid primary key, job_id uuid not null references collection_job(id),
 context_hash char(64) not null, result_hash char(64) not null, result_json jsonb not null,
 context_json jsonb not null, audit_json jsonb not null, created_at timestamptz not null default now()
);
create index if not exists idx_collection_extraction_job on collection_extraction(job_id,created_at desc);
create table if not exists collection_verdict (
 id uuid primary key, extraction_id uuid not null unique references collection_extraction(id),
 verdict text not null check(verdict in ('APPROVE','REJECT','ENRICH','STALE')),
 reason text not null, audit_json jsonb not null, receipt_json jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table if not exists collection_creator_publication (
 exhibitor_id bigint primary key references subculture_exhibitor(id),
 data_json jsonb not null, verdict_id uuid not null references collection_verdict(id),
 active boolean not null default true, revision bigint not null default 1, updated_at timestamptz not null default now()
);
create table if not exists collection_product (
 id uuid primary key, legacy_product_id bigint unique references subculture_catalog_product(id),
 exhibitor_id bigint references subculture_exhibitor(id),
 identity_key text not null unique, data_json jsonb not null,
 verdict_id uuid references collection_verdict(id), active boolean not null default true,
 revision bigint not null default 1, created_at timestamptz not null default now()
);
create table if not exists collection_product_subject (
 product_id uuid not null references collection_product(id), subject_id uuid not null references subculture_subject(id),
 verdict_id uuid not null references collection_verdict(id), evidence_url text not null, evidence text not null,
 active boolean not null default true, primary key(product_id,subject_id)
);
create table if not exists collection_migration (
 run_id uuid not null, source_kind text not null, source_id bigint not null, source_revision bigint not null,
 job_id uuid not null references collection_job(id), created_at timestamptz not null default now(),
 primary key(run_id,source_kind,source_id,source_revision)
);
alter table subculture_subject alter column reviewed_by drop not null;
alter table subculture_subject add column if not exists system_verdict_id uuid references collection_verdict(id);
alter table subculture_subject add column if not exists source_identity text;
create unique index if not exists uq_subject_source_identity on subculture_subject(source_identity) where source_identity is not null;
alter table subculture_subject_link alter column reviewed_by drop not null;
alter table subculture_subject_link add column if not exists system_verdict_id uuid references collection_verdict(id);
-- Automated attributions apply only to the exact goods data reviewed by the model.
alter table subculture_subject_link add column if not exists target_snapshot_json jsonb;
-- Typed generated references retain the legacy wire contract while enforcing target existence.
alter table subculture_subject_link add column if not exists product_id bigint generated always as (case when kind='PRODUCT' then target_id end) stored references subculture_catalog_product(id);
alter table subculture_subject_link add column if not exists exhibitor_id bigint generated always as (case when kind='CREATOR' then target_id end) stored references subculture_exhibitor(id);
create unique index if not exists uq_graph_product_parent on subculture_catalog_product(id,participant_id);
create unique index if not exists uq_graph_participant_parent on subculture_participant(id,event_id);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='subject_review_actor') then
  alter table subculture_subject add constraint subject_review_actor check(reviewed_by is not null or system_verdict_id is not null);
  alter table subculture_subject_link add constraint subject_link_review_actor check(reviewed_by is not null or system_verdict_id is not null);
 end if;
 if not exists(select 1 from pg_constraint where conname='graph_link_product_parent') then
  alter table subculture_subject_link add constraint graph_link_product_parent foreign key(product_id,participant_id) references subculture_catalog_product(id,participant_id);
  alter table subculture_subject_link add constraint graph_link_participant_parent foreign key(participant_id,event_id) references subculture_participant(id,event_id);
  alter table subculture_subject_link add constraint graph_link_event_required check(kind<>'EVENT' or event_id is not null);
 end if;
end $$;
do $$ declare t text; r text; runtime_role text:=current_setting('boothhana.backend_role',true); begin
 if runtime_role is null or runtime_role='' or runtime_role in ('anon','authenticated','public') then raise exception 'Set boothhana.backend_role'; end if;
 foreach t in array array['collection_job','collection_extraction','collection_verdict','collection_creator_publication','collection_product','collection_product_subject','collection_migration'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public',t);
  foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then
    execute format('revoke all on %I from %I',t,r);
    execute format('drop policy if exists %I on %I','deny_'||r,t);
    execute format('create policy %I on %I as restrictive for all to %I using(false) with check(false)','deny_'||r,t,r);
   end if;
  end loop;
  execute format('grant select,insert,update,delete on %I to %I',t,runtime_role);
  execute format('drop policy if exists collection_server on %I',t);
  execute format('create policy collection_server on %I for all to %I using(true) with check(true)',t,runtime_role);
 end loop;
end $$;
commit;
