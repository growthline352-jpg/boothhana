-- v11: Server-only access for BoothHana application tables, not auth/storage or unrelated tables.
-- REVIEW ON STAGING FIRST. This intentionally revokes direct anon/authenticated access.
-- Shared apps using these tables via Data API must migrate before applying this file.
-- Use the SQL session's real dedicated JDBC role; NEVER use anon/authenticated here.
-- Optional explicit setting in the SAME SQL session before this script:
--   select set_config('boothhana.backend_role','YOUR_ACTUAL_JDBC_ROLE',false);
-- If unset, current_user is used. Verify that this is also the server JDBC role.
begin;
set local search_path=public,pg_catalog;
set local lock_timeout='5s';
do $$
declare
  backend_role text:=coalesce(nullif(current_setting('boothhana.backend_role',true),''),current_user);
  tbl text; api_role text; col_list text; seq text; cols record;
  application_tables text[]:=array[
    'app_user',
    'event',
    'booth',
    'event_booth',
    'product',
    'event_product',
    'booth_notice',
    'reservation',
    'reservation_item',
    'pos_sale',
    'pos_sale_item',
    'image_upload',
    'subculture_collection_run',
    'subculture_event_candidate',
    'subculture_collection_observation',
    'subculture_pipeline_run',
    'subculture_exhibitor',
    'subculture_participant',
    'subculture_participant_member',
    'subculture_sales',
    'subculture_catalog_product',
    'subculture_stage_run',
    'subculture_catalog_asset',
    'subculture_catalog_review_history',
    'subculture_catalog_publication',
    'subculture_participant_progress',
    'subculture_catalog_presentation',
    'subculture_floorplan_watch',
    'subculture_floorplan_source',
    'subculture_floorplan_version',
    'subculture_floorplan_publication',
    'subculture_floorplan_receipt',
    'goods_showcase'];
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
-- Defaults, views, SECURITY DEFINER functions and other apps remain a separate DBA review.
