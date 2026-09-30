-- Member-chosen nickname and verified profile image; existing accounts keep their Kakao nickname.
begin;
set local lock_timeout='5s';
alter table app_user add column if not exists custom_display_name boolean not null default false;
alter table app_user add column if not exists profile_image_key varchar(512);
-- SQL004 restricted uploads to booth/product; extend that constraint for member avatars.
alter table image_upload drop constraint if exists image_upload_target_check;
alter table image_upload add constraint image_upload_target_check check (target in ('booth', 'product', 'profile'));
commit;
