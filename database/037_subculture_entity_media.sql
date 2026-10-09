-- Additive image completion. Existing subjects, reviews, creator/product IDs and catalog assets are untouched.
begin;
set local lock_timeout='5s';
create table if not exists subculture_entity_media (
 id uuid primary key, target_kind text not null check(target_kind in ('SUBJECT','CREATOR','PRODUCT')),
 target_id text not null, subject_id uuid references subculture_subject(id),
 creator_id bigint references subculture_exhibitor(id), product_id uuid references collection_product(id),
 extraction_id uuid not null unique, identity_key char(64) not null unique,
 target_hash char(64) not null, target_snapshot_json jsonb not null,
 result_hash char(64) not null, candidate_json jsonb not null, extraction_audit_json jsonb not null,
 image_url text not null, page_url text not null, expected_sha256 char(64) not null,
 caption text not null default '', credit text not null,
 identity_evidence text not null, usage_status text not null check(usage_status in ('PERMITTED','UNKNOWN','FORBIDDEN')),
 usage_evidence text not null, usage_source_url text not null,
 rights_state text not null default 'PENDING' check(rights_state in ('PENDING','APPROVED','REJECTED')),
 review_verdict text check(review_verdict in ('APPROVE','ENRICH','REJECT','STALE')),
 review_reason text, review_audit_json jsonb, review_hash char(64), reviewed_at timestamptz,
 storage_state text not null default 'PENDING' check(storage_state in ('PENDING','STORED','FAILED')),
 object_key text, sha256 char(64), content_type text, byte_size bigint,
 active boolean not null default true, reviewed_by bigint references app_user(id),
 revision bigint not null default 0, last_attempt_at timestamptz, error text not null default '',
 created_at timestamptz not null default now(), stored_at timestamptz,
 check((target_kind='SUBJECT' and subject_id is not null and target_id=subject_id::text and creator_id is null and product_id is null)
    or (target_kind='CREATOR' and creator_id is not null and target_id=creator_id::text and subject_id is null and product_id is null)
    or (target_kind='PRODUCT' and product_id is not null and target_id=product_id::text and subject_id is null and creator_id is null)),
 check(rights_state<>'APPROVED' or (usage_status='PERMITTED' and review_verdict='APPROVE' and review_audit_json is not null)),
 check(storage_state<>'STORED' or (object_key is not null and sha256=expected_sha256 and byte_size>0 and content_type is not null)),
 check(jsonb_typeof(candidate_json)='object' and jsonb_typeof(target_snapshot_json)='object')
);
create index if not exists idx_entity_media_target on subculture_entity_media(target_kind,target_id,created_at,id);
create index if not exists idx_entity_media_pending on subculture_entity_media(last_attempt_at,created_at)
 where active and rights_state='APPROVED' and storage_state<>'STORED';
do $$ declare r text; runtime_role text:=current_setting('boothhana.backend_role',true); begin
 if runtime_role is null or runtime_role='' or runtime_role in ('anon','authenticated','public') then raise exception 'Set boothhana.backend_role'; end if;
 alter table subculture_entity_media enable row level security;
 revoke all on subculture_entity_media from public;
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on subculture_entity_media from %I',r);
   execute format('drop policy if exists %I on subculture_entity_media','deny_'||r);
   execute format('create policy %I on subculture_entity_media as restrictive for all to %I using(false) with check(false)','deny_'||r,r);
  end if;
 end loop;
 execute format('grant select,insert,update,delete on subculture_entity_media to %I',runtime_role);
 drop policy if exists collection_server on subculture_entity_media;
 execute format('create policy collection_server on subculture_entity_media for all to %I using(true) with check(true)',runtime_role);
end $$;
commit;
