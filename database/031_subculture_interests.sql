-- Apply after 001..018. Set boothhana.backend_role to the existing JDBC role.
-- Additive only: existing event/product/exhibitor/library IDs remain authoritative.
begin;
set local lock_timeout='5s';
create table if not exists subculture_subject (
 id uuid primary key, kind varchar(12) not null check(kind in ('WORK','CHARACTER')),
 name varchar(160) not null, work_id uuid references subculture_subject(id),
 medium varchar(24) not null default '', aliases jsonb not null default '[]',
 source_url varchar(2048) not null, active boolean not null default true,
 revision bigint not null default 0, reviewed_by bigint not null references app_user(id),
 reviewed_at timestamptz not null default now(),
 check((kind='WORK' and work_id is null) or (kind='CHARACTER' and work_id is not null)),
 check(jsonb_typeof(aliases)='array')
);
create index if not exists idx_subject_work on subculture_subject(work_id);
create table if not exists subculture_subject_link (
 id uuid primary key, subject_id uuid not null references subculture_subject(id),
 kind varchar(16) not null check(kind in ('EVENT','PRODUCT','CREATOR')),
 target_id bigint not null check(target_id>0), event_id bigint references subculture_event_candidate(id),
 participant_id bigint references subculture_participant(id),
 source_url varchar(2048) not null, evidence varchar(1000) not null,
 active boolean not null default true, revision bigint not null default 0,
 reviewed_by bigint not null references app_user(id), reviewed_at timestamptz not null default now(),
 check((kind='CREATOR' and event_id is null and participant_id is null) or
       (kind='EVENT' and event_id=target_id and participant_id is null) or
       (kind='PRODUCT' and event_id is not null and participant_id is not null)),
 unique(subject_id,kind,target_id)
);
create index if not exists idx_subject_link_event on subculture_subject_link(event_id) where active;
create table if not exists subculture_interest_settings (
 user_id bigint primary key references app_user(id) on delete cascade,
 revision bigint not null default 0, updated_at timestamptz not null default now()
);
create table if not exists subculture_interest (
 id uuid primary key, user_id bigint not null references app_user(id) on delete cascade,
 subject_id uuid references subculture_subject(id), exhibitor_id bigint references subculture_exhibitor(id),
 custom_work_id uuid references subculture_subject(id), custom_name varchar(160) not null default '', custom_work varchar(160) not null default '',
 medium varchar(24) not null default '', identity_key varchar(400) not null,
 created_at timestamptz not null default now(), unique(user_id,identity_key),
 check((subject_id is not null and exhibitor_id is null and custom_name='') or
       (exhibitor_id is not null and subject_id is null and custom_name='') or
       (subject_id is null and exhibitor_id is null and custom_name<>'' and custom_work<>''))
);
do $$ declare t text; r text; runtime_role text:=current_setting('boothhana.backend_role',true); begin
 if runtime_role is null or runtime_role='' or runtime_role in ('anon','authenticated','public') then raise exception 'Set boothhana.backend_role to the backend JDBC role'; end if;
 foreach t in array array['subculture_subject','subculture_subject_link','subculture_interest_settings','subculture_interest'] loop
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
 end loop;
end $$;
commit;
