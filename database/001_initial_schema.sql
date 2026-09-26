create table if not exists app_user (
  id bigserial primary key,
  kakao_subject varchar(255) not null unique,
  display_name varchar(255) not null,
  created_at timestamptz not null default now()
);

create table if not exists event (
  id bigserial primary key,
  name varchar(255) not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  venue varchar(255) not null,
  description text not null default '',
  image_key varchar(512),
  reservation_start_at timestamptz,
  reservation_end_at timestamptz,
  status varchar(32) not null default 'DRAFT'
);

create table if not exists booth (
  id bigserial primary key,
  owner_user_id bigint not null references app_user(id),
  name varchar(255) not null,
  description text not null default '',
  image_key varchar(512),
  sns_url varchar(512)
);

create table if not exists event_booth (
  id bigserial primary key,
  event_id bigint not null references event(id),
  booth_id bigint not null references booth(id),
  booth_number varchar(64),
  intro text not null default '',
  status varchar(32) not null default 'PENDING',
  is_public boolean not null default false,
  rejection_reason varchar(512),
  unique (event_id, booth_id)
);

create table if not exists product (
  id bigserial primary key,
  booth_id bigint not null references booth(id),
  name varchar(255) not null,
  description text not null default '',
  image_key varchar(512)
);

create table if not exists event_product (
  id bigserial primary key,
  event_booth_id bigint not null references event_booth(id),
  product_id bigint not null references product(id),
  price bigint not null,
  stock_mode varchar(32) not null default 'FINITE',
  stock_quantity integer,
  is_sold_out boolean not null default false,
  is_public boolean not null default true,
  reservation_enabled boolean not null default true
);

create table if not exists booth_notice (
  id bigserial primary key,
  event_booth_id bigint not null references event_booth(id),
  title varchar(255) not null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists reservation (
  id bigserial primary key,
  reservation_no varchar(64) not null unique,
  user_id bigint not null references app_user(id),
  event_booth_id bigint not null references event_booth(id),
  status varchar(32) not null default 'RESERVED',
  qr_token varchar(255) not null,
  created_at timestamptz not null default now(),
  picked_up_at timestamptz,
  canceled_at timestamptz
);

create table if not exists reservation_item (
  id bigserial primary key,
  reservation_id bigint not null references reservation(id),
  event_product_id bigint not null references event_product(id),
  quantity integer not null,
  unit_price bigint not null
);

create table if not exists pos_sale (
  id bigserial primary key,
  sale_no varchar(64) not null unique,
  event_booth_id bigint not null references event_booth(id),
  payment_method varchar(32) not null,
  status varchar(32) not null default 'SOLD',
  sold_at timestamptz not null default now()
);

create table if not exists pos_sale_item (
  id bigserial primary key,
  pos_sale_id bigint not null references pos_sale(id),
  event_product_id bigint not null references event_product(id),
  quantity integer not null,
  unit_price bigint not null
);

create index if not exists idx_event_booth_event on event_booth(event_id);
create index if not exists idx_event_booth_booth on event_booth(booth_id);
create index if not exists idx_event_product_booth on event_product(event_booth_id);
create index if not exists idx_reservation_user on reservation(user_id);
create index if not exists idx_reservation_booth on reservation(event_booth_id);
