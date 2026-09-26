-- v15 PREPARED ONLY: private memories; requires actual SQL001..014 first.
-- Resolve the true JDBC role and review grants/RLS in staging; no production execution performed.
begin;
set local search_path=public,pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table if not exists memory_item (
 id uuid primary key,
 user_id bigint not null references app_user(id) on delete cascade,
 event_id bigint not null check(event_id>0),
 target_type varchar(16) not null check(target_type in ('EVENT','PARTICIPANT','PRODUCT')),
 target_id bigint not null check(target_id>0),
 participant_id bigint check(participant_id>0),
 saved_json jsonb not null check(jsonb_typeof(saved_json)='object'),
 note varchar(1000) not null default '',
 planned_day date,
 hall varchar(150) not null default '',
 revision bigint not null default 0 check(revision>=0),
 saved_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_opened_at timestamptz,
 open_count integer not null default 0 check(open_count between 0 and 1000000),
 outbound_count integer not null default 0 check(outbound_count between 0 and 1000000),
 unique(user_id,event_id,target_type,target_id),
 constraint ck_memory_context check(
   (target_type='EVENT' and target_id=event_id and participant_id is null) or
   (target_type='PARTICIPANT' and participant_id is not null and target_id=participant_id) or
   (target_type='PRODUCT' and participant_id is not null))
);
-- No FK to the public catalog: withdrawal must NOT erase the user's own note.
-- Read API hides remembered public fields when current publication is unavailable.
create index if not exists idx_memory_user_saved on memory_item(user_id,saved_at desc,id);
create index if not exists idx_memory_user_event on memory_item(user_id,event_id,participant_id);
create table if not exists memory_visit (
 user_id bigint not null references app_user(id) on delete cascade,
 event_id bigint not null check(event_id>0),
 participant_id bigint not null check(participant_id>=0),
 visited_day date not null,
 created_at timestamptz not null default now(),
 primary key(user_id,event_id,participant_id,visited_day)
);
-- participant_id=0 is an explicitly marked EVENT visit, never an inferred scan/pageview.
do $$
declare
  backend_role text:=coalesce(nullif(current_setting('boothhana.backend_role',true),''),current_user);
  tbl text; api_role text; col_list text; seq text; cols record;
  application_tables text[]:=array['memory_item','memory_visit'];
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
