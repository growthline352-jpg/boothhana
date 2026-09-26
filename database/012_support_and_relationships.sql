-- v12 PREPARED ONLY. Run by an authorized operator after 001..011 and a DB backup.
-- Review JDBC role, RLS, retention and PRIVATE attachment bucket BEFORE deployment.
begin;
set local search_path=public,pg_catalog;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create table if not exists support_ticket (
 id uuid primary key, requester_id bigint references app_user(id), subject_key varchar(100) not null,
 request_hash char(64) not null, guest_secret_hash char(64), guest_expires_at timestamptz,
 kind varchar(16) not null check(kind in ('REPORT','INQUIRY','CLAIM')),
 category varchar(32) not null, title varchar(160) not null,
 target_json jsonb, received_snapshot_json jsonb, received_fingerprint char(64), client_context_json jsonb not null default '{}',
 status varchar(24) not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','WAITING_USER','ANSWERED','RESOLVED','CLOSED')),
 assigned_to bigint references app_user(id), resolution varchar(24), verified_result_json jsonb,
 exhibitor_id bigint references subculture_exhibitor(id), revision bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz,
 check ((requester_id is not null and guest_secret_hash is null and guest_expires_at is null)
     or (requester_id is null and kind='INQUIRY' and guest_secret_hash is not null and guest_expires_at is not null)),
 check ((kind='CLAIM' and exhibitor_id is not null) or (kind<>'CLAIM' and exhibitor_id is null))
);
create index if not exists idx_support_owner on support_ticket(requester_id,kind,updated_at desc,id);
create index if not exists idx_support_queue on support_ticket(kind,status,updated_at desc,id);
create unique index if not exists uq_support_pending_claim on support_ticket(requester_id,exhibitor_id)
 where kind='CLAIM' and status in ('OPEN','IN_PROGRESS','WAITING_USER');
create table if not exists support_message (
 id uuid primary key, ticket_id uuid not null references support_ticket(id), actor_id bigint references app_user(id),
 actor_kind varchar(12) not null check(actor_kind in ('USER','ADMIN','GUEST')),
 visibility varchar(12) not null check(visibility in ('PUBLIC','INTERNAL')),
 body text not null check(length(body) between 1 and 10000), evidence_json jsonb not null default '[]',
 request_hash char(64) not null, created_at timestamptz not null default now(),
 check(visibility<>'INTERNAL' or actor_kind='ADMIN')
);
create index if not exists idx_support_messages on support_message(ticket_id,created_at,id);
create table if not exists support_action (
 id bigserial primary key, ticket_id uuid references support_ticket(id), actor_id bigint references app_user(id),
 action varchar(40) not null, details_json jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists idx_support_actions on support_action(ticket_id,created_at,id);
create table if not exists support_attachment (
 id uuid primary key, ticket_id uuid not null references support_ticket(id), owner_id bigint not null references app_user(id),
 content_type varchar(30) not null check(content_type in ('image/png','image/jpeg','image/webp')),
 byte_size bigint not null check(byte_size between 1 and 5242880), sha256 char(64) not null,
 object_key varchar(255) not null unique, state varchar(16) not null check(state in ('PENDING','STORED')),
 created_at timestamptz not null default now()
);
create index if not exists idx_support_attachment_ticket on support_attachment(ticket_id,created_at);
create table if not exists exhibitor_manager (
 exhibitor_id bigint not null references subculture_exhibitor(id), user_id bigint not null references app_user(id),
 claim_ticket_id uuid not null references support_ticket(id), state varchar(12) not null check(state in ('ACTIVE','REVOKED')),
 permission varchar(32) not null default 'CORRECTION_REQUEST' check(permission='CORRECTION_REQUEST'),
 granted_by bigint not null references app_user(id), granted_at timestamptz not null default now(),
 revoked_by bigint references app_user(id), revoked_at timestamptz, reason text not null,
 revision bigint not null default 0, primary key(exhibitor_id,user_id)
);
create table if not exists support_rate_limit (
 rate_key char(64) not null, window_start timestamptz not null, hits integer not null check(hits>0),
 primary key(rate_key,window_start)
);
-- History stores decision versions; account roles still come from Kakao permissions.
alter table event_booth add column if not exists version bigint not null default 0;
create table if not exists application_action (
 id bigserial primary key, application_id bigint references event_booth(id) on delete set null, application_ref bigint not null,
 actor_id bigint references app_user(id), action varchar(24) not null,
 before_state varchar(32) not null, after_state varchar(32) not null,
 reason text not null default '', revision bigint not null, created_at timestamptz not null default now()
);
create index if not exists idx_application_action on application_action(application_id,id);
alter table subculture_catalog_review_history add column if not exists actor_id bigint references app_user(id);
-- No existing ownership or tickets are fabricated/backfilled.
do $$ declare t text; s text; r text; begin
 foreach t in array array['support_ticket','support_message','support_action','support_attachment',
                          'exhibitor_manager','support_rate_limit','application_action'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on table %I from public',t);
  foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on table %I from %I',t,r); end if;
  end loop;
  s:=case when t in ('support_action','application_action') then pg_get_serial_sequence(t,'id') else null end;
  if s is not null then
   execute format('revoke all on sequence %s from public',s);
   foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on sequence %s from %I',s,r); end if;
   end loop;
  end if;
 end loop;
end $$;
do $$
declare
  backend_role text:=coalesce(nullif(current_setting('boothhana.backend_role',true),''),current_user);
  tbl text; api_role text; col_list text; seq text; cols record;
  application_tables text[]:=array['support_ticket','support_message','support_action','support_attachment','exhibitor_manager','support_rate_limit','application_action'];
begin
  if lower(backend_role) in ('public','anon','authenticated') or not exists(select 1 from pg_roles where rolname=backend_role) then
    raise exception 'Choose an existing trusted JDBC role, not a Data API role';
  end if;
  foreach api_role in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=api_role) then
      if pg_has_role(api_role,backend_role,'MEMBER') or (not exists(select 1 from pg_roles where rolname=backend_role and (rolsuper or rolbypassrls)) and pg_has_role(backend_role,api_role,'MEMBER')) then
        raise exception 'JDBC and Data API role memberships must be separated';
      end if;
    end if;
  end loop;
  execute format('grant usage on schema public to %I',backend_role);
  foreach tbl in array application_tables loop
    if to_regclass(format('public.%I',tbl)) is null then raise exception 'Missing required table: %',tbl; end if;
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all privileges on table public.%I from public',tbl);
    select string_agg(format('%I',a.attname),',') into col_list
      from pg_attribute a where a.attrelid=to_regclass(format('public.%I',tbl)) and a.attnum>0 and not a.attisdropped;
    -- Table-level REVOKE does not remove old column-level grants.
    execute format('revoke select (%s),insert (%s),update (%s),references (%s) on table public.%I from public',col_list,col_list,col_list,col_list,tbl);
    foreach api_role in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=api_role) then
        execute format('revoke all privileges on table public.%I from %I',tbl,api_role);
        execute format('revoke select (%s),insert (%s),update (%s),references (%s) on table public.%I from %I',col_list,col_list,col_list,col_list,tbl,api_role);
        -- Even a separately inherited grant cannot bypass these restrictive policies.
        execute format('drop policy if exists %I on public.%I','boothhana_deny_'||api_role,tbl);
        execute format('create policy %I on public.%I as restrictive for all to %I using(false) with check(false)','boothhana_deny_'||api_role,tbl,api_role);
      end if;
    end loop;
    execute format('grant select,insert,update,delete on table public.%I to %I',tbl,backend_role);
    execute format('drop policy if exists boothhana_server_v11 on public.%I',tbl);
    execute format('create policy boothhana_server_v11 on public.%I for all to %I using(true) with check(true)',tbl,backend_role);
    -- Only sequences actually owned by application columns, not all sequences in public.
    for cols in select attname from pg_attribute where attrelid=to_regclass(format('public.%I',tbl)) and attnum>0 and not attisdropped loop
      seq:=pg_get_serial_sequence(format('public.%I',tbl),cols.attname);
      if seq is not null then
        execute format('revoke all on sequence %s from public',seq);
        foreach api_role in array array['anon','authenticated'] loop
          if exists(select 1 from pg_roles where rolname=api_role) then execute format('revoke all on sequence %s from %I',seq,api_role); end if;
        end loop;
        execute format('grant usage,select on sequence %s to %I',seq,backend_role);
      end if;
    end loop;
  end loop;
end $$;
commit;
