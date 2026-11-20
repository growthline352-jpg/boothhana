begin;
set local lock_timeout='5s';
alter table collection_job drop constraint if exists collection_job_kind_check;
alter table collection_job add constraint collection_job_kind_check check(kind in ('DISCOVERY','EVENT','PARTICIPANTS','SALES','CREATOR','CHARACTERS','RELATIONS'));
alter table event_series alter column created_by drop not null;
alter table event_series add column if not exists system_verdict_id uuid references collection_verdict(id);
alter table event_series add column if not exists source_identity text;
create unique index if not exists uq_series_source_identity on event_series(source_identity) where source_identity is not null;
alter table event_series_member alter column checked_by drop not null;
alter table event_series_member add column if not exists system_verdict_id uuid references collection_verdict(id);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='event_series_review_actor') then
  alter table event_series add constraint event_series_review_actor check(created_by is not null or system_verdict_id is not null);
  alter table event_series_member add constraint event_series_member_review_actor check(checked_by is not null or system_verdict_id is not null);
 end if;
end $$;
commit;
