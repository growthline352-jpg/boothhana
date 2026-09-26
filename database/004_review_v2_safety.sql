-- BoothHana2 revision 2. Apply AFTER 001, 002, 003, before deploying the paired frontend/backend.
-- No existing business rows are deleted or reinterpreted.
begin;
alter table product add column if not exists version bigint not null default 0;
create table if not exists image_upload (
  id uuid primary key,
  owner_id bigint not null references app_user(id),
  target varchar(16) not null check (target in ('booth', 'product')),
  content_type varchar(64) not null check (content_type in ('image/jpeg','image/png','image/webp','image/gif')),
  file_size bigint not null check (file_size between 1 and 10485760),
  sha256 varchar(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  object_key varchar(512) not null unique,
  state varchar(16) not null check (state in ('REGISTERED','STORED','COMPLETE')),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  check ((state = 'COMPLETE') = (completed_at is not null))
);
create index if not exists idx_image_upload_owner_created on image_upload(owner_id, created_at);
-- This table is server-side only. Supabase anonymous/authenticated REST clients get no access.
alter table image_upload enable row level security;
revoke all on image_upload from public;
commit;
