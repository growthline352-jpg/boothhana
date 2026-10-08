-- Apply after 020. Retain all legacy IDs; identity decisions are reversible associations.
begin;
set local lock_timeout='5s';
create table if not exists collection_image_part (
 parent_id uuid not null references collection_job(id), product_revision bigint not null,
 image_offset integer not null check(image_offset>=0 and image_offset%4=0),
 result_json jsonb not null, verdict_id uuid not null references collection_verdict(id),
 complete boolean not null, primary key(parent_id,product_revision,image_offset)
);
create table if not exists collection_subject_identity (
 identity_key text primary key, subject_id uuid not null references subculture_subject(id),
 source_url text not null, name text not null,
 evidence_json jsonb not null, verdict_id uuid not null references collection_verdict(id)
);
create table if not exists collection_creator_identity (
 alias_id bigint primary key references subculture_exhibitor(id),
 canonical_id bigint not null references subculture_exhibitor(id),
 active boolean not null default true, revision bigint not null default 1,
 evidence_json jsonb not null, verdict_id uuid not null references collection_verdict(id),
 check(alias_id<>canonical_id)
);
create index if not exists idx_creator_identity_canonical on collection_creator_identity(canonical_id) where active;
create table if not exists collection_identity_history (
 id uuid primary key, kind text not null check(kind in ('SUBJECT','CREATOR')),
 target_id text not null, decision_json jsonb not null,
 verdict_id uuid not null references collection_verdict(id), created_at timestamptz not null default now()
);
do $$ declare t text; r text; runtime_role text:=current_setting('boothhana.backend_role',true); begin
 if runtime_role is null or runtime_role='' or runtime_role in ('anon','authenticated','public') then raise exception 'Set boothhana.backend_role'; end if;
 foreach t in array array['collection_image_part','collection_subject_identity','collection_creator_identity','collection_identity_history'] loop
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
