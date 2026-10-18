package com.boothhana.collection;

import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.text.Normalizer;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;

/** Small public projections. Never deserialize the full event/product snapshot for a page. */
@Service @Transactional(readOnly=true)
public class CatalogEventPages {
    private final JdbcTemplate db; private final JsonMapper json; private final CatalogMediaService media;
    private final CatalogOperatingGroups groups;
    private com.boothhana.collection.graph.EntityMediaService entityMedia;
    @org.springframework.beans.factory.annotation.Autowired(required=false) public void setEntityMedia(com.boothhana.collection.graph.EntityMediaService value){entityMedia=value;}
    public CatalogEventPages(JdbcTemplate db,JsonMapper json,CatalogMediaService media) {
        this.db=db;this.json=json;this.media=media;this.groups=new CatalogOperatingGroups(db,json);
    }
    private static final String VISIBLE="""
        from subculture_catalog_publication pub join subculture_event_candidate e on e.id=pub.event_id
        cross join lateral jsonb_array_elements(pub.snapshot_json->'participants') x
        join subculture_participant p on p.id=(x->>'id')::bigint and p.event_id=pub.event_id
        left join subculture_sales s on s.participant_id=p.id
        where pub.event_id=? and e.review_state<>'EXCLUDED' and p.review_state<>'EXCLUDED'
        """;
    private static final String SALES="case when s.review_state='EXCLUDED' then null else x->'sales' end";
    private static final String PRODUCTS="coalesce(("+SALES+")->'products','[]'::jsonb)";
    private static final String SEARCH="""
        concat_ws(' ',x->'participant'->>'registrationName',x->'participant'->'subjects',
        (select string_agg(concat_ws(' ',m->>'name',m->'aliases'),' ') from jsonb_array_elements(coalesce(x->'participant'->'members','[]')) m),
        (select string_agg(concat_ws(' ',l->>'code',l->>'hall',l->>'zone'),' ') from jsonb_array_elements(coalesce(x->'participant'->'locations','[]')) l),
        (%s)->>'summary',(%s)->'subjects',(%s)->'categories',
        (select string_agg(concat_ws(' ',g->>'name',g->>'summary',g->>'memberName',g->'subjects',g->'categories'),' ') from jsonb_array_elements(%s) g))
        """.formatted(SALES,SALES,SALES,PRODUCTS);

    @SuppressWarnings("unchecked") private Map<String,Object> decode(Object value){return json.readValue(value.toString(),Map.class);}
    private long count(long id,String tail,List<Object> filters){var args=new ArrayList<Object>();args.add(id);args.addAll(filters);return Objects.requireNonNull(db.queryForObject("select count(*) "+VISIBLE+tail,Long.class,args.toArray()));}
    private Map<String,Object> asset(AssetView a){var m=new LinkedHashMap<String,Object>();m.put("id",a.id());m.put("participantId",a.participantId());m.put("productId",a.productId());m.put("type",a.type());m.put("url",a.storedUrl());m.put("caption",a.caption());m.put("attribution",a.pageUrl());m.put("credit",a.credit());m.put("offlineAllowed",a.offlineAllowed());return m;}

    public Map<String,Object> overview(long id) {
        var rows=db.queryForList("""
            select pub.snapshot_json->'event' event_json,pub.published_at
            from subculture_catalog_publication pub join subculture_event_candidate e on e.id=pub.event_id
            where pub.event_id=? and e.review_state<>'EXCLUDED'
            """,id);
        if(rows.isEmpty())throw ApiException.notFound("공개된 안내를 찾을 수 없습니다.");
        var row=rows.getFirst();var event=decode(row.get("event_json"));
        var view=new LinkedHashMap<String,Object>();view.put("id",id);view.put("mode","INFO_ONLY");view.put("event",event);
        view.put("publishedAt",row.get("published_at") instanceof java.sql.Timestamp t?t.toInstant().toString():row.get("published_at").toString());
        long booths=count(id,"",List.of());
        boolean maps=Boolean.TRUE.equals(db.queryForObject("""
            select exists(select 1 from subculture_floorplan_publication f join subculture_floorplan_version v on v.id=f.version_id
              join subculture_catalog_asset a on a.id=v.asset_id where f.event_id=? and a.rights_state='APPROVED')
              or exists(select 1 from subculture_catalog_asset a where a.event_id=? and a.type='FLOOR_PLAN' and a.participant_id is null and a.rights_state='APPROVED' and a.storage_state='STORED')
            """,Boolean.class,id,id));
        maps=maps||count(id," and exists(select 1 from jsonb_array_elements(coalesce(x->'participant'->'locations','[]')) l where nullif(btrim(l->>'code'),'') is not null)",List.of())>0;
        long reviews=Objects.requireNonNull(db.queryForObject("select count(*) from event_comment where event_id=? and deleted=false",Long.class,id));
        var sections=new LinkedHashMap<String,Object>();sections.put("booths",booths>0);sections.put("map",maps);sections.put("reviews",reviews>0);
        view.put("productCount",Objects.requireNonNull(db.queryForObject("select coalesce(sum(jsonb_array_length("+PRODUCTS+")),0) "+VISIBLE,Long.class,id)));
        view.put("participantCount",booths);view.put("sections",sections);view.put("reviewCount",reviews);
        var banner=media.publicBanners(List.of(id)).get(id);view.put("banner",banner==null?null:asset(banner));
        view.put("assets",banner==null?List.of():List.of(asset(banner)));view.put("participants",List.of());
        var group=groups.publicGroups(List.of(id)).get(id);
        List<Long> reviewIds=group==null?List.of(id):group.members().stream().map(CatalogOperatingGroups.Member::eventId).toList();
        if(group!=null)view.put("operatingGroup",group);
        else if(id==1){var names=db.queryForList("select pub.snapshot_json->'event'->>'name' from subculture_catalog_publication pub join subculture_event_candidate e on e.id=pub.event_id where pub.event_id in (1,7) and e.review_state<>'EXCLUDED'",String.class);if(names.size()==2&&names.stream().allMatch(name->name!=null&&name.matches("^제35회 디\\.\\s*페스타.*")))reviewIds=List.of(1L,7L);}
        if(reviewIds.size()>1){reviews=Objects.requireNonNull(db.queryForObject("select count(*) from event_comment where event_id in ("+String.join(",",Collections.nCopies(reviewIds.size(),"?"))+") and deleted=false",Long.class,reviewIds.toArray()));view.put("reviewCount",reviews);sections.put("reviews",reviews>0);}
        return view;
    }
    public Map<Long,Map<String,Boolean>> navigationSignals(List<Long> ids){
        if(ids.isEmpty())return Map.of();if(ids.size()>100)throw ApiException.badRequest("행사 메뉴 조회 한도 오류");
        var rows=db.queryForList("""
            select e.id,
            (exists(select 1 from subculture_floorplan_publication f join subculture_floorplan_version v on v.id=f.version_id join subculture_catalog_asset a on a.id=v.asset_id where f.event_id=e.id and a.rights_state='APPROVED')
              or exists(select 1 from subculture_catalog_asset a where a.event_id=e.id and a.type='FLOOR_PLAN' and a.participant_id is null and a.rights_state='APPROVED' and a.storage_state='STORED')
              or exists(select 1 from subculture_catalog_publication pub cross join lateral jsonb_array_elements(pub.snapshot_json->'participants') x join subculture_participant p on p.id=(x->>'id')::bigint and p.review_state<>'EXCLUDED' cross join lateral jsonb_array_elements(coalesce(x->'participant'->'locations','[]')) l where pub.event_id=e.id and nullif(btrim(l->>'code'),'') is not null)) has_map,
            exists(select 1 from event_comment c where c.event_id=e.id and c.deleted=false) has_reviews
            from subculture_event_candidate e where e.id in (
            """+String.join(",",Collections.nCopies(ids.size(),"?"))+")",ids.toArray());
        var result=new LinkedHashMap<Long,Map<String,Boolean>>();for(var row:rows)result.put(((Number)row.get("id")).longValue(),Map.of("map",Boolean.TRUE.equals(row.get("has_map")),"reviews",Boolean.TRUE.equals(row.get("has_reviews"))));return result;
    }

    private static String bounded(String value,int max){if(value==null)return "";if(value.length()>max)throw ApiException.badRequest("검색 조건이 너무 깁니다.");return Normalizer.normalize(value,Normalizer.Form.NFKC).strip();}
    public static List<Long> participantIds(String value){
        if(value==null||value.isBlank())return List.of();if(value.length()>22000)throw ApiException.badRequest("부스 선택 한도 오류");
        var ids=new LinkedHashSet<Long>();try{for(String item:value.split(",")){long id=Long.parseLong(item);if(id<1)throw new NumberFormatException();ids.add(id);}}catch(NumberFormatException e){throw ApiException.badRequest("부스 선택 형식 오류");}
        if(ids.size()>1000)throw ApiException.badRequest("부스 선택 한도 오류");return List.copyOf(ids);
    }
    private static String productFacet(String key){return "coalesce(("+SALES+")->'"+key+"','[]'::jsonb) || coalesce((select jsonb_agg(v) from jsonb_array_elements("+PRODUCTS+") g cross join lateral jsonb_array_elements_text(coalesce(g->'"+key+"','[]')) v),'[]'::jsonb)";}
    private static String compactSales(){return "case when ("+SALES+") is null or ("+SALES+")='null'::jsonb then null else (("+SALES+")-'products'-'sources'-'images'-'warnings') || jsonb_build_object('subjects',"+productFacet("subjects")+",'categories',"+productFacet("categories")+") end";}
    private record Filter(String sql,List<Object> args) {}
    private Filter filter(String q,String day,String hall,String subject,String category,String ids){
        var sql=new StringBuilder();var args=new ArrayList<Object>();q=bounded(q,100);day=bounded(day,10);hall=bounded(hall,150);subject=bounded(subject,150);category=bounded(category,100);
        if(!day.isEmpty())try{java.time.LocalDate.parse(day);}catch(java.time.format.DateTimeParseException e){throw ApiException.badRequest("방문일 형식 오류");}
        for(String word:q.toLowerCase(Locale.ROOT).split("\\s+"))if(!word.isBlank()){
            var alternatives=new LinkedHashSet<String>();alternatives.add(word);
            for(var aliases:List.of(List.of("미쿠","하츠네미쿠"),List.of("블아","블루아카이브"),List.of("보카로","보컬로","보컬로이드"),List.of("프세카","프로젝트세카이")))if(aliases.contains(word))alternatives.addAll(aliases);
            sql.append(" and (");int n=0;for(String term:alternatives){if(n++>0)sql.append(" or ");sql.append("lower(").append(SEARCH).append(") like ? escape '!' ");args.add("%"+term.replace("!","!!").replace("%","!%").replace("_","!_")+"%");}sql.append(")");
        }
        if(!day.isBlank()||!hall.isBlank()){
            // Unknown attendance remains visible; a different confirmed day/hall does not.
            sql.append(" and (not exists(select 1 from jsonb_array_elements(coalesce(x->'participant'->'locations','[]')) l) or exists(select 1 from jsonb_array_elements(coalesce(x->'participant'->'locations','[]')) l where true");
            if(!day.isBlank()){sql.append(" and (l->>'dateEvidence'='EVENT_PERIOD' or l->>'startDate' is null or l->>'endDate' is null or (l->>'startDate'<=? and l->>'endDate'>=?))");args.add(day);args.add(day);}
            if(!hall.isBlank()){sql.append(" and (nullif(l->>'hall','') is null or lower(l->>'hall')=lower(?))");args.add(hall);}sql.append("))");
        }
        for(var facet:List.of(Map.entry("subjects",subject),Map.entry("categories",category)))if(!facet.getValue().isBlank()){
            sql.append(" and exists(select 1 from jsonb_array_elements_text(coalesce(x->'participant'->'").append(facet.getKey()).append("','[]') || coalesce((").append(SALES).append(")->'").append(facet.getKey()).append("','[]') || coalesce((select jsonb_agg(v) from jsonb_array_elements(").append(PRODUCTS).append(") g cross join lateral jsonb_array_elements_text(coalesce(g->'").append(facet.getKey()).append("','[]')) v),'[]')) v where lower(v)=lower(?))");args.add(facet.getValue());
        }
        if("0".equals(ids)){sql.append(" and false");}
        else if(ids!=null&&!ids.isBlank()) {var selected=participantIds(ids);sql.append(" and p.id in (").append(String.join(",",Collections.nCopies(selected.size(),"?"))).append(")");args.addAll(selected);}
        return new Filter(sql.toString(),args);
    }

    @SuppressWarnings("unchecked") private Map<String,Object> compact(Map<String,Object> full){
        var p=new LinkedHashMap<>((Map<String,Object>)full.get("participant"));p.put("sources",List.of());p.put("images",List.of());p.put("warnings",List.of());p.put("officialLinks",List.of());p.put("description",null);p.remove("identity");
        var result=new LinkedHashMap<String,Object>();result.put("id",full.get("id"));result.put("participant",p);result.put("compact",true);if(full.containsKey("directRegistration"))result.put("directRegistration",full.get("directRegistration"));
        result.put("salesSummaryOrigin",full.getOrDefault("salesSummaryOrigin","COLLECTED"));result.put("searchText",full.getOrDefault("searchText",""));
        if(full.get("sales") instanceof Map<?,?> sales){var sale=new LinkedHashMap<String,Object>((Map<String,Object>)sales);sale.put("sources",List.of());sale.put("images",List.of());sale.put("warnings",List.of());sale.put("products",List.of());
            result.put("sales",sale);
        }else result.put("sales",null);
        return result;
    }
    private List<Map<String,Object>> participants(long id,Filter filter,int page,int size,boolean full){
        var args=new ArrayList<Object>();args.add(id);args.addAll(filter.args());args.add(size);args.add(page*size);
        // Strip source/product payloads inside PostgreSQL before they cross the wire.
        String projection=full?"x":"jsonb_build_object('id',x->'id','participant',(x->'participant')-'sources'-'images'-'warnings'-'officialLinks'-'description'-'identity','sales',"+compactSales()+",'salesSummaryOrigin',x->'salesSummaryOrigin','directRegistration',x->'directRegistration','searchText',"+SEARCH+")";
        var rows=db.queryForList("select "+projection+" participant_json,s.review_state sales_state "+VISIBLE+filter.sql()+" order by x->'participant'->>'registrationName',p.id limit ? offset ?",args.toArray());
        return rows.stream().map(r->{var value=decode(r.get("participant_json"));if("EXCLUDED".equals(r.get("sales_state"))){value.put("sales",null);value.remove("productRows");value.remove("productIds");}return full?value:compact(value);}).toList();
    }
    private List<Map<String,Object>> assets(long id,List<Map<String,Object>> participants,boolean map,boolean thumbnail){
        var ids=participants.stream().map(p->((Number)p.get("id")).longValue()).toList();
        var publishedProducts=new HashSet<Long>();var sales=new HashSet<Long>();
        for(var p:participants){if(p.get("sales")!=null)sales.add(((Number)p.get("id")).longValue());if(p.get("productIds") instanceof Map<?,?> products)for(var product:products.values())publishedProducts.add(((Number)product).longValue());}
        var chosen=new LinkedHashMap<Long,Map<String,Object>>();var result=new ArrayList<Map<String,Object>>();
        for(var a:media.pageAssets(id,ids,map)){
            if(!"APPROVED".equals(a.rightsState())||!"STORED".equals(a.storageState())||a.storedUrl()==null)continue;
            if(a.productId()!=null&&(!sales.contains(a.participantId())||(!thumbnail&&!publishedProducts.contains(a.productId()))))continue;
            if(a.type().equals("SALES_SHEET")&&!sales.contains(a.participantId()))continue;
            if(thumbnail&&a.participantId()!=null){chosen.putIfAbsent(a.participantId(),asset(a));}else result.add(asset(a));
        }
        result.addAll(chosen.values());return result;
    }
    public Map<String,Object> booths(long id,int page,int size,String q,String day,String hall,String subject,String category,String ids){
        if(page<0||page>10000||size<1||size>100)throw ApiException.badRequest("부스 페이지 범위 오류");
        var view=overview(id);var filter=filter(q,day,hall,subject,category,ids);long total=count(id,filter.sql(),filter.args());
        var people=participants(id,filter,page,size,false);view.put("participants",people);var images=new ArrayList<Object>((List<?>)view.get("assets"));images.addAll(assets(id,people,false,true));view.put("assets",images);
        var pagination=new LinkedHashMap<String,Object>();pagination.put("page",page);pagination.put("size",size);pagination.put("total",total);view.put("pagination",pagination);
        view.put("facets",facets(id));return view;
    }
    private Map<String,Object> facets(long id){
        var result=new LinkedHashMap<String,Object>();
        for(var entry:Map.of("subjects","subjects","categories","categories","halls","hall").entrySet()){
            String key=entry.getKey(),expr;
            if(key.equals("halls"))expr="coalesce((select jsonb_agg(l->>'hall') from jsonb_array_elements(coalesce(x->'participant'->'locations','[]')) l),'[]')";
            else expr="coalesce(x->'participant'->'"+key+"','[]') || coalesce(("+SALES+")->'"+key+"','[]') || coalesce((select jsonb_agg(v) from jsonb_array_elements("+PRODUCTS+") g cross join lateral jsonb_array_elements_text(coalesce(g->'"+key+"','[]')) v),'[]')";
            
            // Keep the lateral facet expansion in a derived table, outside the visibility joins.
            var values=db.queryForList("select distinct v from (select "+expr+" facets "+VISIBLE+") visible cross join lateral jsonb_array_elements_text(visible.facets) v where v is not null and btrim(v)<>'' order by v",String.class,id);
            result.put(key,values);
        }
        return result;
    }
    public Map<String,Object> map(long id){var view=overview(id);var people=participants(id,new Filter("",List.of()),0,3000,false);view.put("participants",people);var images=new ArrayList<Object>((List<?>)view.get("assets"));images.addAll(assets(id,people,true,false));view.put("assets",images);return view;}
    public Map<String,Object> booth(long id,long participantId){
        var view=overview(id);var people=participants(id,new Filter(" and p.id=?",List.of(participantId)),0,1,true);if(people.isEmpty())throw ApiException.notFound("공개된 부스 정보를 찾을 수 없습니다.");
        if(entityMedia!=null)for(var p:people)if(p.get("productRows") instanceof List<?> products){@SuppressWarnings("unchecked") var records=(List<Map<String,Object>>)products;entityMedia.attachLegacyProducts(records);}
        var images=new ArrayList<Object>((List<?>)view.get("assets"));images.addAll(assets(id,people,false,false));
        var related=participants(id,new Filter(" and p.id<>?",List.of(participantId)),0,4,false);
        var all=new ArrayList<>(people);all.addAll(related);view.put("participants",all);view.put("assets",images);return view;
    }
}
