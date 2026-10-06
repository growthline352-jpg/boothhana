-- Preserve explicit administrative unpublishing across automatic intake/repair.
-- Apply after SQL029 before starting the new backend or collector.
begin;
set local lock_timeout='5s';
alter table subculture_event_candidate add column publication_withdrawn boolean not null default false;
-- No historical inference: an absent snapshot previously represented both an
-- unpublished reviewed candidate and a withdrawn event. Existing known withdrawals
-- must be registered explicitly before restarting automatic collection.
-- Existing server-only table grants/RLS continue to cover this additive column.
commit;
