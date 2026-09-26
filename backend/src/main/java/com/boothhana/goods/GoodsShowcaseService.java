package com.boothhana.goods;

import com.boothhana.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.net.URI;
import java.time.Instant;
import java.util.*;

@Service
@Transactional(readOnly=true)
public class GoodsShowcaseService {
    private final JdbcTemplate db;
    private final String imageBase;
    public GoodsShowcaseService(JdbcTemplate db,@Value("${app.r2.public-url:}") String imageBase) {
        this.db=db; this.imageBase=imageBase.replaceAll("/+$", "");
    }
    public record Item(int rank,long productId,long eventProductId,String name,long price,String imageUrl,
        String boothName,String eventName,String eventState,boolean soldOut) {}
    public record Feed(String basis,int windowDays,String from,String to,String asOf,List<Item> items) {}
    public record SettingInput(String category,boolean enabled,Long revision) {}
    public Feed feed(String category) {
        try { category=GoodsRankingQuery.category(category); }
        catch(IllegalArgumentException e) { throw ApiException.badRequest(e.getMessage()); }
        Instant now=Instant.now(),start=GoodsRankingQuery.start(now);
        var rows=db.queryForList(GoodsRankingQuery.PUBLIC_SQL,java.sql.Timestamp.from(start),java.sql.Timestamp.from(now),category);
        List<Item> result=new ArrayList<>();
        for(var r:rows) result.add(new Item(result.size()+1,number(r,"product_id"),number(r,"event_product_id"),
            (String)r.get("name"),number(r,"price"),image((String)r.get("image_key")),
            (String)r.get("booth_name"),(String)r.get("event_name"),(String)r.get("event_status"),
            Boolean.TRUE.equals(r.get("is_sold_out")) || "FINITE".equals(r.get("stock_mode")) && number(r,"stock_quantity")<=0));
        // Counts, sale IDs, customer details and payment methods never leave this endpoint.
        return new Feed(GoodsRankingQuery.BASIS,30,start.toString(),now.toString(),now.toString(),List.copyOf(result));
    }
    public Map<String,Object> candidates(String q,int page,int size) {
        if(q==null||q.length()>100||page<0||page>10000||size<1||size>100) throw ApiException.badRequest("검색 조건을 확인하세요.");
        Instant now=Instant.now();
        var rows=db.queryForList(GoodsRankingQuery.ADMIN_SQL,java.sql.Timestamp.from(GoodsRankingQuery.start(now)),
            java.sql.Timestamp.from(now),q.trim(),size+1,page*size);
        return Map.of("items",rows.stream().limit(size).toList(),"page",page,"size",size,"hasNext",rows.size()>size);
    }
    @Transactional public Map<String,Object> setting(long productId,SettingInput input) {
        if(input==null||input.revision()==null||input.revision()<0) throw ApiException.badRequest("저장 버전이 필요합니다.");
        try { GoodsRankingQuery.category(input.category()); }
        catch(IllegalArgumentException e) { throw ApiException.badRequest(e.getMessage()); }
        if(db.queryForList("select id from product where id=? for update",productId).isEmpty()) throw ApiException.notFound("상품을 찾을 수 없습니다.");
        var previous=db.queryForList("select revision from goods_showcase where product_id=? for update",productId);
        long revision=previous.isEmpty()?0:number(previous.getFirst(),"revision");
        if(revision!=input.revision()) throw ApiException.conflict("노출 설정이 변경되었습니다. 다시 조회하세요.");
        db.update("""
            insert into goods_showcase(product_id,category,enabled,revision) values(?,?,?,1)
            on conflict(product_id) do update set category=excluded.category,enabled=excluded.enabled,
              revision=goods_showcase.revision+1,updated_at=now()
            """,productId,input.category(),input.enabled());
        return Map.of("productId",productId,"revision",revision+1,"enabled",input.enabled());
    }
    private static long number(Map<String,Object> r,String key) { return r.get(key) instanceof Number n?n.longValue():0; }
    String image(String key) {
        // Only first-party R2 keys. Do not hotlink unapproved external URLs for ranking cards.
        if(key==null||key.isBlank()||imageBase.isBlank()) return null;
        try {
            URI base=URI.create(imageBase);
            if(!"https".equals(base.getScheme())||base.getHost()==null||base.getUserInfo()!=null||base.getQuery()!=null||base.getFragment()!=null) return null;
            if(key.startsWith("https://")) return key.startsWith(imageBase+"/")?key:null;
            if(!key.matches("[A-Za-z0-9_/-]+\\.[A-Za-z0-9]+")||key.contains("..")||key.startsWith("/")) return null;
            return imageBase+"/"+key;
        }catch(IllegalArgumentException e){ return null; }
    }
}
