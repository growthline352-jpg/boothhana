-- Apply after 001..020 and before the backend that accepts these types.
-- Preserve all existing events and publications. Reclassification requires review.
begin;
set local lock_timeout = '5s';
alter table subculture_event_candidate drop constraint subculture_event_candidate_subcategory_check;
alter table subculture_event_candidate add constraint subculture_event_candidate_subcategory_check
 check(subcategory in ('COMIC_DOUJIN','DOLL','ONLY_EVENT','BIRTHDAY_CAFE','STATIONERY_GOODS',
 'SUBCULTURE_MUSIC','ANIME_GAME_FESTIVAL','ART_BOOK','BOARD_GAME','CHARACTER_ART','ILLUSTRATION',
 'WINE','WEDDING','LIFESTYLE','DESIGN','BUSINESS','WALK','LIGHT','MUSIC','FOOD','CULTURE'));
commit;
