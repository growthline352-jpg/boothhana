-- Presentation groups for one edition's separate day/venue records.
-- Original IDs, ownership grants, comments, saves and publications remain intact.
begin;
set local lock_timeout='5s';
create table if not exists catalog_operating_group (
 root_event_id bigint primary key references subculture_event_candidate(id),
 name varchar(255) not null, source_url varchar(2048) not null,
 checked_on date not null, revision bigint not null default 0,
 fixed_members boolean not null default false,
 updated_by bigint references app_user(id), updated_at timestamptz not null default now()
);
create table if not exists catalog_operating_group_member (
 event_id bigint primary key references subculture_event_candidate(id),
 root_event_id bigint not null references catalog_operating_group(root_event_id),
 position integer not null check(position between 0 and 13),
 unique(root_event_id,position)
);
create index if not exists idx_operating_group_members on catalog_operating_group_member(root_event_id,event_id);
-- Preserve the existing day grouping only when the exact original publications exist.
insert into catalog_operating_group(root_event_id,name,source_url,checked_on,fixed_members)
select 1,'제35회 디. 페스타',s.snapshot_json->'event'->'sources'->0->>'url',current_date,true
from subculture_catalog_publication s join subculture_catalog_publication u on u.event_id=7
where s.event_id=1 and s.snapshot_json->'event'->>'name'='제35회 디. 페스타 (토요일)'
 and u.snapshot_json->'event'->>'name'='제35회 디. 페스타 (일요일)'
 and s.snapshot_json->'event'->'sources'->0->>'url' is not null
on conflict(root_event_id) do nothing;
insert into catalog_operating_group_member(event_id,root_event_id,position)
select day.id,1,day.pos from (values(1,0),(7,1)) day(id,pos)
where exists(select 1 from catalog_operating_group where root_event_id=1 and fixed_members)
on conflict(event_id) do nothing;
-- Freeze legacy sales-summary provenance once. A later pending edit must not
-- change how the already-published summary is presented. Uncertain legacy
-- values remain COLLECTED; no draft text is copied into a public snapshot.
with backfilled as (
 select p.event_id,jsonb_agg(
  case when jsonb_exists(booth.value,'salesSummaryOrigin') or booth.value->'sales' is null or booth.value->'sales'='null'::jsonb then booth.value
  else jsonb_set(booth.value,'{salesSummaryOrigin}',to_jsonb(
   case when (s.overrides_json->>'summary' is not null and s.overrides_json->>'summary'=booth.value->'sales'->>'summary')
     or (last_summary.summary is not null and last_summary.summary=booth.value->'sales'->>'summary')
    then 'EDITORIAL'::text else 'COLLECTED'::text end)) end order by booth.ordinality) participants
 from subculture_catalog_publication p
 cross join lateral jsonb_array_elements(p.snapshot_json->'participants') with ordinality booth(value,ordinality)
 left join subculture_sales s on s.participant_id=(booth.value->>'id')::bigint
 left join lateral (
  select h.after_json->'overrides'->>'summary' summary
  from subculture_catalog_review_history h
  where h.target_type='sales' and h.target_id=(booth.value->>'id')::bigint and h.created_at<=p.published_at
   and (jsonb_exists(h.after_json->'overrides','summary') or jsonb_exists(coalesce(h.after_json->'clearOverrides','[]'::jsonb),'summary'))
  order by h.created_at desc,h.id desc limit 1
 ) last_summary on true
 where exists(select 1 from jsonb_array_elements(p.snapshot_json->'participants') old
  where not jsonb_exists(old,'salesSummaryOrigin') and old->'sales' is not null and old->'sales'<>'null'::jsonb)
 group by p.event_id
)
update subculture_catalog_publication p set snapshot_json=jsonb_set(p.snapshot_json,'{participants}',b.participants)
from backfilled b where b.event_id=p.event_id;
do $$ declare t text;r text;runtime_role text:=current_setting('boothhana.backend_role',true);begin
 if runtime_role is null or runtime_role='' then raise exception 'Set boothhana.backend_role before migration';end if;
 foreach t in array array['catalog_operating_group','catalog_operating_group_member'] loop
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
