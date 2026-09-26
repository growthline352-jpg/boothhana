-- v18. Apply AFTER 001..015, before new backend/collector. Backup/staging first.
-- No reclassification, republishing, rights auto-approval or deletes of existing data.
begin;
alter table subculture_event_candidate drop constraint if exists subculture_event_candidate_subcategory_check;
alter table subculture_event_candidate add constraint subculture_event_candidate_subcategory_check
 check(subcategory in ('COMIC_DOUJIN','DOLL','ONLY_EVENT','BIRTHDAY_CAFE','STATIONERY_GOODS','WINE','WEDDING','LIFESTYLE','DESIGN','BUSINESS','WALK','LIGHT','MUSIC','FOOD','CULTURE'));
alter table subculture_catalog_asset add column if not exists offline_allowed boolean not null default false;
comment on column subculture_catalog_asset.offline_allowed is 'Explicit admin approval for temporary end-user offline download; APPROVED/STORED public visibility still required';
commit;
