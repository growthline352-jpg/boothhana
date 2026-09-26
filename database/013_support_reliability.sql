-- v13 rebuild: PREPARED migration, not executed on any user database.
-- Apply after 001..012, before deploying the v13 backend.
-- No ticket snapshots/fingerprints, attachments, statuses or old messages are rewritten.
begin;
set local search_path=public,pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.support_message
  add column if not exists message_kind varchar(12) not null default 'DIALOGUE';
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.support_message'::regclass and conname='ck_support_message_kind') then
  alter table public.support_message add constraint ck_support_message_kind
    check(message_kind in ('DIALOGUE','SYSTEM') and
          (message_kind<>'SYSTEM' or (actor_kind='ADMIN' and actor_id is not null and visibility='PUBLIC')));
 end if;
end $$;
create index if not exists idx_support_dialogue_count
  on public.support_message(ticket_id) where message_kind='DIALOGUE';
-- Existing table RLS and trusted-server policies from 012 continue to apply.
-- Do not grant Data API roles access to this new column.
commit;
