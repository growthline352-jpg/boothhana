package com.boothhana.collection;

import java.time.LocalDate;
import java.util.*;

/** v18 shared catalogue filters. All caller values are SQL parameters. */
public record CatalogBrowseQuery(int page,int size,String category,String q,String subcategory,
                                 String from,String to,String sort,String region,String areas) {
    public CatalogBrowseQuery(int page,int size,String category,String q,String subcategory,String from,String to,String sort,String region) {
        this(page,size,category,q,subcategory,from,to,sort,region,"");
    }
    /** Source compatibility for callers predating the optional region filter. */
    public CatalogBrowseQuery(int page,int size,String category,String q,String subcategory,String from,String to,String sort) {
        this(page,size,category,q,subcategory,from,to,sort,"");
    }
    public CatalogBrowseQuery {
        category=normalized(category,"SUBCULTURE");q=normalized(q,"");subcategory=normalized(subcategory,"");
        from=normalized(from,"");to=normalized(to,"");sort=normalized(sort,"RECENT");region=normalized(region,"");areas=normalized(areas,"");
        CatalogAreas.selected(areas);
        if(!areas.isEmpty()&&!"SEOUL".equals(region))throw new IllegalArgumentException("서울 세부 지역은 서울 선택 시 사용할 수 있습니다.");
        if(page<0||page>100000||size<1||size>100)throw new IllegalArgumentException("페이지 값을 확인해 주세요.");
        if(!CatalogTaxonomy.GROUPS.containsKey(category))throw new IllegalArgumentException("지원하지 않는 행사 분야입니다.");
        if(q.length()>100)throw new IllegalArgumentException("검색어는 100자 이하로 입력해 주세요.");
        if(!subcategory.isEmpty()&&!CatalogTaxonomy.browseTypes(category).contains(subcategory))throw new IllegalArgumentException("선택한 분야의 세부 분류가 아닙니다.");
        if(!region.isEmpty()&&!CatalogTaxonomy.REGIONS.contains(region))throw new IllegalArgumentException("서울·경기만 지원합니다. 인천은 제외합니다.");
        validateDate(from);validateDate(to);
        if(!from.isEmpty()&&!to.isEmpty()&&from.compareTo(to)>0)throw new IllegalArgumentException("조회 시작일은 종료일 이후일 수 없습니다.");
        if(!Set.of("DATE_ASC","RECENT").contains(sort))throw new IllegalArgumentException("지원하지 않는 정렬입니다.");
    }
    public boolean connected(){return CatalogTaxonomy.GROUPS.containsKey(category);}
    private static String normalized(String v,String fallback){return v==null||v.isBlank()?fallback:v.trim();}
    /** SQL expression is an internal constant; the user's text remains a bound parameter. */
    static String searchSql(String expression){
        return "strpos(regexp_replace(lower("+expression+"),'[[:space:]　 ]+','','g'),regexp_replace(lower(?),'[[:space:]　 ]+','','g'))>0";
    }
    private static void validateDate(String v){
        if(v.isEmpty())return;
        try{if(!v.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")||!LocalDate.parse(v).toString().equals(v))throw new IllegalArgumentException();}
        catch(RuntimeException e){throw new IllegalArgumentException("날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.");}
    }
    public String whereSql(){
        var args=new ArrayList<Object>();
        var sql=new StringBuilder("e.review_state<>'EXCLUDED' and p.snapshot_json->'event'->>'region' in ('SEOUL','GYEONGGI')");
        sql.append(" and ").append(CatalogTaxonomy.scopeSql(category,"p.snapshot_json->'event'",args));
        if(!region.isEmpty())sql.append(" and p.snapshot_json->'event'->>'region'=?");
        if(!areas.isEmpty())sql.append(" and ").append(CatalogAreas.filterSql("p.snapshot_json->'event'",CatalogAreas.selected(areas),new ArrayList<>()));
        if(!subcategory.isEmpty())sql.append(" and ").append(CatalogTaxonomy.subtypeSql(category,subcategory,"p.snapshot_json->'event'",args));
        if(!q.isEmpty())sql.append(" and ").append(searchSql("concat_ws(' ',p.snapshot_json->'event'->>'name',p.snapshot_json->'event'->>'venueName',p.snapshot_json->'event'->>'address',p.snapshot_json->'event'->>'organizer',p.snapshot_json->'event'->>'subjects')"));
        if(!from.isEmpty()||!to.isEmpty()){
            sql.append(" and exists(select 1 from jsonb_array_elements(coalesce(p.snapshot_json->'event'->'occurrences','[]'::jsonb)) d where true");
            if(!from.isEmpty())sql.append(" and d->>'endDate'>=?");
            if(!to.isEmpty())sql.append(" and d->>'startDate'<=?");
            sql.append(')');
        }
        return sql.toString();
    }
    public List<Object> whereArgs(){
        List<Object> a=new ArrayList<>();CatalogTaxonomy.scopeSql(category,"p.snapshot_json->'event'",a);
        if(!region.isEmpty())a.add(region);if(!areas.isEmpty())CatalogAreas.filterSql("p.snapshot_json->'event'",CatalogAreas.selected(areas),a);if(!subcategory.isEmpty())CatalogTaxonomy.subtypeSql(category,subcategory,"p.snapshot_json->'event'",a);if(!q.isEmpty())a.add(q);
        if(!from.isEmpty())a.add(from);if(!to.isEmpty())a.add(to);return a;
    }
    public String orderSql(){
        if("RECENT".equals(sort))return "p.published_at desc,p.event_id";
        return "(select min(d->>'startDate') from jsonb_array_elements(coalesce(p.snapshot_json->'event'->'occurrences','[]'::jsonb)) d"+
          (!from.isEmpty()?" where d->>'endDate'>=?":"")+") asc nulls last,p.event_id";
    }
    public List<Object> listArgs(){var a=whereArgs();if("DATE_ASC".equals(sort)&&!from.isEmpty())a.add(from);a.add(size);a.add(page*size);return a;}
}
