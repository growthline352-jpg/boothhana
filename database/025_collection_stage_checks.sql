-- Stage diagnostics and append-only attempt history. Existing jobs/IDs remain intact.
begin;
set local lock_timeout='5s';
alter table collection_job add column if not exists issues_json jsonb not null default '[]';
alter table collection_job add column if not exists coverage_json jsonb not null default '{}';
alter table collection_job add column if not exists checked_at timestamptz;
alter table collection_job add column if not exists consecutive_failures integer not null default 0;
alter table collection_extraction add column if not exists invalidated_at timestamptz;
alter table collection_extraction add column if not exists invalidated_reason text;
update collection_job set issues_json=jsonb_build_array(jsonb_build_object('code','IMPORTED_PENDING_RESEARCH','field','','message',left(last_error,2000)))
 where state='WAITING' and checked_at is null and issues_json='[]'::jsonb;
create table if not exists collection_stage_check (
 id uuid primary key, job_id uuid not null references collection_job(id),
 attempt integer not null, outcome text not null,
 reason text not null, issues_json jsonb not null, coverage_json jsonb not null,
 next_check_at timestamptz, created_at timestamptz not null default now(),
 unique(job_id,attempt)
);
create index if not exists idx_collection_stage_check_job on collection_stage_check(job_id,created_at desc);
create index if not exists idx_collection_job_target on collection_job(kind,target_id,created_at desc);
do $$ declare r text; runtime_role text:=current_setting('boothhana.backend_role',true); begin
 if runtime_role is null or runtime_role='' or runtime_role in ('anon','authenticated','public') then raise exception 'Set boothhana.backend_role'; end if;
 alter table collection_stage_check enable row level security;
 revoke all on collection_stage_check from public;
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on collection_stage_check from %I',r);
   execute format('drop policy if exists %I on collection_stage_check','deny_'||r);
   execute format('create policy %I on collection_stage_check as restrictive for all to %I using(false) with check(false)','deny_'||r,r);
  end if;
 end loop;
 execute format('grant select,insert,update,delete on collection_stage_check to %I',runtime_role);
 execute format('drop policy if exists collection_server on collection_stage_check');
 execute format('create policy collection_server on collection_stage_check for all to %I using(true) with check(true)',runtime_role);
end $$;
commit;
