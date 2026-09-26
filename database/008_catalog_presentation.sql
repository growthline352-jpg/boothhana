-- v7: explicit representative banner selection, separate from image-use rights.
-- Apply after 001..007. No existing data, review decisions or images are deleted.
begin;
create table if not exists subculture_catalog_presentation (
  event_id bigint primary key references subculture_event_candidate(id),
  banner_asset_id bigint references subculture_catalog_asset(id),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
-- Null/no row = legacy automatic first eligible banner. An explicit but no-longer eligible
-- selection displays NO banner; never silently switch to an older, possibly incorrect poster.
alter table subculture_catalog_presentation enable row level security;
revoke all on subculture_catalog_presentation from public;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke all on subculture_catalog_presentation from %I',r);
    end if;
  end loop;
end $$;
commit;
