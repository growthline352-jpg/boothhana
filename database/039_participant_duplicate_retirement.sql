-- Retain duplicate rows and historical links while using only the reviewed canonical identity.
begin;
set local lock_timeout='5s';
alter table subculture_participant add column if not exists duplicate_of_id bigint references subculture_participant(id);
alter table subculture_participant drop constraint if exists participant_duplicate_hidden;
alter table subculture_participant add constraint participant_duplicate_hidden
 check(duplicate_of_id is null or (duplicate_of_id<>id and review_state='EXCLUDED'));
commit;
