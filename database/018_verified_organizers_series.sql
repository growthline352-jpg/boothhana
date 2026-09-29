-- Additive ownership/edition model. Apply using the configured backend role.
begin;
set local lock_timeout='5s';
-- Owner edits attach to stable product rows, not a stale whole sales array.
alter table subculture_catalog_product add column if not exists owner_overrides_json jsonb not null default '{}'::jsonb;
create table if not exists organizer_identity (
 id bigserial primary key, name varchar(160) not null, official_url varchar(2048) not null,
 created_by bigint not null references app_user(id), created_at timestamptz not null default now()
);
create table if not exists event_manager (
 event_id bigint not null references subculture_event_candidate(id), user_id bigint not null references app_user(id),
 organizer_id bigint not null references organizer_identity(id), claim_ticket_id uuid not null references support_ticket(id),
 state varchar(12) not null check(state in ('ACTIVE','REVOKED')),
 granted_by bigint not null references app_user(id), granted_at timestamptz not null default now(),
 revoked_by bigint references app_user(id), revoked_at timestamptz, reason text not null,
 revision bigint not null default 0, primary key(event_id,user_id)
);
create table if not exists event_series (
 id bigserial primary key, name varchar(160) not null, official_url varchar(2048) not null,
 created_by bigint not null references app_user(id), created_at timestamptz not null default now()
);
create table if not exists event_series_member (
 event_id bigint primary key references subculture_event_candidate(id), series_id bigint references event_series(id),
 edition varchar(160) not null default '', revision bigint not null default 0,
 evidence_url varchar(2048) not null, checked_by bigint not null references app_user(id), checked_at timestamptz not null default now()
);
create index if not exists idx_series_members on event_series_member(series_id,event_id);
-- Replace only the old CLAIM/exhibitor relationship check, retaining all other checks.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='support_ticket'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%exhibitor_id%' and pg_get_constraintdef(oid) like '%kind%' loop
  execute format('alter table support_ticket drop constraint %I',c.conname);
 end loop;
end $$;
alter table support_ticket add constraint support_claim_subject check (
 (kind='CLAIM' and category='OWNERSHIP' and exhibitor_id is not null) or
 (kind='CLAIM' and category='ORGANIZER' and exhibitor_id is null and target_json is not null
  and coalesce(target_json->>'namespace','')='CATALOG' and coalesce(target_json->>'type','')='EVENT' and target_json->>'eventId' is not null) or
 (kind<>'CLAIM' and exhibitor_id is null)
);
create unique index if not exists uq_support_pending_organizer on support_ticket(requester_id,(target_json->>'eventId'))
 where kind='CLAIM' and category='ORGANIZER' and status in ('OPEN','IN_PROGRESS','WAITING_USER');
-- Existing booth grants remain correction-only until explicitly reverified by an administrator.
alter table exhibitor_manager drop constraint if exists exhibitor_manager_permission_check;
alter table exhibitor_manager add constraint exhibitor_manager_permission_check check(permission in ('CORRECTION_REQUEST','CATALOG_EDIT'));
do $$ declare t text; r text; seq text; runtime_role text:=current_setting('boothhana.backend_role',true); begin
 if runtime_role is null or runtime_role='' then raise exception 'Set boothhana.backend_role before migration'; end if;
 foreach t in array array['organizer_identity','event_manager','event_series','event_series_member'] loop
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
  execute format('drop policy if exists boothhana_server_v11 on %I',t);
  execute format('create policy boothhana_server_v11 on %I for all to %I using(true) with check(true)',t,runtime_role);
  if t in ('organizer_identity','event_series') then
   seq:=pg_get_serial_sequence(t,'id');execute format('revoke all on sequence %s from public',seq);
   execute format('grant usage,select on sequence %s to %I',seq,runtime_role);
   foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on sequence %s from %I',seq,r); end if;
   end loop;
  end if;
 end loop;
end $$;
commit;
