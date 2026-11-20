-- After 021. Preserve existing product UUIDs and links; learn old aliases on refresh.
begin;
set local lock_timeout='5s';
alter table collection_product add column if not exists identity_aliases jsonb not null default '[]'::jsonb
 check(jsonb_typeof(identity_aliases)='array');
create index if not exists idx_collection_product_creator on collection_product(exhibitor_id) where exhibitor_id is not null;
commit;
