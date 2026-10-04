-- Additive allowlist expansion. Existing IDs, snapshots, saves and booth owners stay intact.
begin;
set local lock_timeout = '5s';
alter table subculture_event_candidate drop constraint subculture_event_candidate_subcategory_check;
alter table subculture_event_candidate add constraint subculture_event_candidate_subcategory_check
 check(subcategory in ('COMIC_DOUJIN','DOLL','ONLY_EVENT','BIRTHDAY_CAFE','STATIONERY_GOODS',
 'SUBCULTURE_MUSIC','ANIME_GAME_FESTIVAL','ART_BOOK','BOARD_GAME','CHARACTER_ART','ILLUSTRATION',
 'FAN_CAFE','POPUP_STORE','CARD_COLLECTIBLES','FAN_CONVENTION','WINE','WEDDING','LIFESTYLE','DESIGN','BUSINESS',
 'WALK','LIGHT','MUSIC','FOOD','CULTURE','CONCERT','MUSIC_FESTIVAL',
 'POPUP_RETAIL','POPUP_EXPERIENCE','POPUP_EXHIBITION','POPUP_MIXED'));
alter table goods_showcase drop constraint goods_showcase_category_check;
alter table goods_showcase add constraint goods_showcase_category_check
 check(category in ('SUBCULTURE','EXHIBITION','FESTIVAL','POPUP'));
commit;
