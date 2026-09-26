package com.boothhana.goods;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Set;

/** One unit metric, one rolling window, one first-party source. */
public final class GoodsRankingQuery {
    public static final int WINDOW_DAYS=30;
    public static final int MAX_ITEMS=12;
    public static final String BASIS="POS_LOGGED_UNITS";
    private GoodsRankingQuery() {}
    public static String category(String value) {
        if (value == null || !Set.of("SUBCULTURE", "EXHIBITION", "FESTIVAL").contains(value))
            throw new IllegalArgumentException("지원하지 않는 굿즈 분류입니다.");
        return value;
    }
    public static Instant start(Instant now) { return now.minus(WINDOW_DAYS, ChronoUnit.DAYS); }
    // Historical units stay associated with the same base product across its event listings.
    // Only currently public event listings contribute units; withdrawn data cannot affect ranking.
    public static final String SALES_CTE="""
        with totals as (
          select ep.product_id, sum(i.quantity)::bigint units, max(s.sold_at) last_sold_at
          from pos_sale s join pos_sale_item i on i.pos_sale_id=s.id
          join event_product ep on ep.id=i.event_product_id and ep.event_booth_id=s.event_booth_id
          join event_booth eb on eb.id=ep.event_booth_id
          join event e on e.id=eb.event_id
          join booth b on b.id=eb.booth_id
          join product p on p.id=ep.product_id and p.booth_id=b.id
          where s.status='SOLD' and s.sold_at>=? and s.sold_at<? and i.quantity>0
            and ep.is_public and eb.is_public and eb.status='APPROVED'
            and e.status in ('PUBLISHED','ENDED')
            and s.sale_no not like 'MOCK-%'
            and position('[MOCK]' in e.name)=0 and position('[MOCK]' in b.name)=0
            and position('[MOCK]' in p.name)=0
          group by ep.product_id
        ), display as (
          select distinct on (p.id) p.id product_id,p.name,p.image_key,p.description,
            ep.id event_product_id,ep.price,ep.is_sold_out,ep.stock_mode,ep.stock_quantity,
            e.id event_id,e.name event_name,e.status event_status,b.name booth_name
          from product p join event_product ep on ep.product_id=p.id
          join event_booth eb on eb.id=ep.event_booth_id and eb.booth_id=p.booth_id
          join event e on e.id=eb.event_id join booth b on b.id=p.booth_id
          where ep.is_public and eb.is_public and eb.status='APPROVED'
            and e.status in ('PUBLISHED','ENDED') and position('[MOCK]' in p.name)=0
            and position('[MOCK]' in e.name)=0 and position('[MOCK]' in b.name)=0
          order by p.id,case when e.status='PUBLISHED' then 0 else 1 end,e.start_at desc,ep.id desc
        )
        """;
    public static final String PUBLIC_SQL=SALES_CTE+"""
        select d.*,t.units,t.last_sold_at
        from totals t join display d on d.product_id=t.product_id
        join goods_showcase g on g.product_id=d.product_id
        where g.enabled and g.category=? and t.units>0
        order by t.units desc,t.last_sold_at desc,d.product_id asc limit 12
        """;
    public static final String ADMIN_SQL=SALES_CTE+"""
        select d.*,coalesce(t.units,0) units,g.category,coalesce(g.enabled,false) enabled,
          coalesce(g.revision,0) revision
        from display d left join totals t on t.product_id=d.product_id
        left join goods_showcase g on g.product_id=d.product_id
        where strpos(lower(d.name || ' ' || d.booth_name),lower(?))>0
        order by coalesce(g.enabled,false) desc,coalesce(t.units,0) desc,d.product_id asc
        limit ? offset ?
        """;
}
