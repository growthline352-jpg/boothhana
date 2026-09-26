-- v11. No synthetic sales and no external popularity proxy. Back up first.
begin;
create table if not exists public.goods_showcase (
  product_id bigint primary key references public.product(id) on delete cascade,
  category varchar(32) not null check (category in ('SUBCULTURE','EXHIBITION','FESTIVAL')),
  enabled boolean not null default false,
  revision bigint not null default 1 check (revision>=1),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pos_sale_rank_window on public.pos_sale(sold_at,event_booth_id) where status='SOLD';
create index if not exists idx_pos_sale_item_rank on public.pos_sale_item(pos_sale_id,event_product_id);
create index if not exists idx_event_product_base_product on public.event_product(product_id);
alter table public.goods_showcase enable row level security;
revoke all on public.goods_showcase from public;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke all on public.goods_showcase from %I',r);
    end if;
  end loop;
end $$;
-- Entries are created through ADMIN-only UI; default is not exposed.
commit;
