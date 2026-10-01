package com.boothhana.library;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.library.LibraryModels.*;

/** Public snapshot projection and batched images. No unreviewed payloads or historical image URLs. */
@Service
public class LibraryTargets {
    private final JdbcTemplate db; private final JsonMapper json;
    public LibraryTargets(JdbcTemplate db,JsonMapper json){this.db=db;this.json=json;}
    static final String COLUMNS="""
        cp.snapshot_json->'event' live_event, cp.published_at live_published,
        case when pp.id is not null and pp.review_state<>'EXCLUDED' then p.value->'participant' end live_participant,
        case when pp.id is not null and pp.review_state<>'EXCLUDED' and ss.review_state<>'EXCLUDED' then p.value->'sales' end live_sales,
        case when pp.id is not null and pp.review_state<>'EXCLUDED' and ss.review_state<>'EXCLUDED' and p.value->'sales'<>'null'::jsonb then product.value->'data' end live_product,
        case when pp.id is not null and pp.review_state<>'EXCLUDED' and ss.review_state<>'EXCLUDED' and p.value->'sales'<>'null'::jsonb then product.value->'verification' end live_verification
        """;
    static final String JOINS="""
        left join subculture_event_candidate ec on ec.id=m.event_id and ec.review_state<>'EXCLUDED'
        left join subculture_catalog_publication cp on cp.event_id=ec.id
        left join lateral (
            select value from jsonb_array_elements(coalesce(cp.snapshot_json->'participants','[]'::jsonb))
            where value->>'id'=m.participant_id::text limit 1
        ) p on true
        left join subculture_participant pp on pp.id=m.participant_id and pp.event_id=m.event_id
        left join subculture_sales ss on ss.participant_id=pp.id
        left join lateral (
            select value from jsonb_array_elements(coalesce(p.value->'productRows','[]'::jsonb))
            where m.target_type='PRODUCT' and value->>'id'=m.target_id::text limit 1
        ) product on true
        """;
    private static final String IMAGE_COLUMNS = "image.id image_id,image.object_key image_key,image.page_url image_page,image.credit image_credit";
    private static final String IMAGE_JOIN = """
        left join lateral (
            select a.id,a.object_key,a.page_url,a.credit
            from subculture_catalog_asset a
            where a.event_id=m.event_id and a.rights_state='APPROVED'
              and a.storage_state='STORED' and a.object_key is not null
              and ((m.target_type='EVENT' and a.type='BANNER' and a.participant_id is null
                    and (not exists(select 1 from subculture_catalog_presentation x where x.event_id=a.event_id and x.banner_asset_id is not null)
                         or a.id=(select banner_asset_id from subculture_catalog_presentation where event_id=a.event_id)))
                or (m.target_type='PARTICIPANT' and a.participant_id=m.participant_id and a.product_id is null and a.type in ('BOOTH_CUT','LOGO'))
                or (m.target_type='PRODUCT' and a.product_id=m.target_id and a.participant_id=m.participant_id and a.type='PRODUCT'))
            order by a.id limit 1
        ) image on cp.event_id is not null
            and (m.target_type='EVENT' or (pp.id is not null and pp.review_state<>'EXCLUDED' and p.value->'participant'<>'null'::jsonb))
            and (m.target_type<>'PRODUCT' or (ss.review_state<>'EXCLUDED' and p.value->'sales'<>'null'::jsonb and product.value->'data'<>'null'::jsonb))
        """;
    private record Batch(String from,Object[] arguments,List<Target> targets) {}
    private static Batch batch(List<Target> values) {
        if(values==null||values.isEmpty()||values.size()>200)throw new IllegalArgumentException("한 번에 1~200개 대상을 확인해 주세요.");
        List<Target> targets=values.stream().map(LibraryRules::target).toList();List<Object> args=new ArrayList<>();StringJoiner rows=new StringJoiner(",");
        for(int i=0;i<targets.size();i++){Target t=targets.get(i);rows.add("(cast(? as integer),cast(? as bigint),cast(? as varchar),cast(? as bigint),cast(? as bigint))");Collections.addAll(args,i,t.eventId(),t.type(),t.id(),t.participantId());}
        return new Batch(" from (values "+rows+") m(request_index,event_id,target_type,target_id,participant_id) ",args.toArray(),targets);
    }
    public Resolved resolve(Target original){return resolveAll(List.of(LibraryRules.target(original))).getFirst();}
    /** One SQL round trip, including current image eligibility, for up to 200 requested targets. */
    public List<Resolved> resolveAll(List<Target> values) {
        if(values == null) throw new IllegalArgumentException("대상 목록이 필요합니다.");
        if(values.isEmpty()) return List.of();
        // Enforce the ORIGINAL request cap before de-duplicating. Parent identity is part of Target.
        if(values.size() > 200) throw new IllegalArgumentException("한 번에 1~200개 대상을 확인해 주세요.");
        List<Target> requested = values.stream().map(LibraryRules::target).toList();
        Batch b = batch(requested.stream().distinct().toList());
        var rows = db.queryForList("select m.request_index," + COLUMNS + "," + IMAGE_COLUMNS
            + b.from() + JOINS + IMAGE_JOIN + " order by m.request_index", b.arguments());
        Map<Integer, Map<String, Object>> indexed = new HashMap<>();
        for(var row : rows) indexed.put(((Number)row.get("request_index")).intValue(), row);
        Map<Target, Resolved> resolved = new HashMap<>();
        for(int i = 0; i < b.targets().size(); i++) {
            Target t = b.targets().get(i);
            var row = indexed.getOrDefault(i, Map.of());
            Resolved value = project(t, row);
            resolved.put(t, new Resolved(t, value.available(), value.current(), value.available() ? imageRow(row) : null));
        }
        // Preserve duplicates and original order in the API response without repeating SQL/JSON work.
        return requested.stream().map(resolved::get).toList();
    }
    /** The member page already projects all content at once; resolve only its visible thumbnails in one query. */
    public Map<Target,Image> images(List<Target> values) {
        if(values.isEmpty())return Map.of();Batch b=batch(values.stream().distinct().toList());Map<Target,Image> result=new HashMap<>();
        for(var row:db.queryForList("select m.request_index,"+IMAGE_COLUMNS+b.from()+JOINS+IMAGE_JOIN+" order by m.request_index",b.arguments())){
            Image value=imageRow(row);if(value!=null)result.put(b.targets().get(((Number)row.get("request_index")).intValue()),value);
        }
        return Map.copyOf(result);
    }
    public List<Map<String,Object>> rows(long user){return db.queryForList("select m.*, "+COLUMNS+" from memory_item m "+JOINS+" where m.user_id=? order by m.saved_at desc,m.id limit ?",user,LibraryRules.MAX_ITEMS);}
    @SuppressWarnings("unchecked") Map<String,Object> object(Object value){if(value==null)return Map.of();if(value instanceof Map<?,?>)return (Map<String,Object>)value;Object parsed=json.readValue(value.toString(),Object.class);return parsed instanceof Map<?,?>?(Map<String,Object>)parsed:Map.of();}
    @SuppressWarnings("unchecked") static List<Map<String,Object>> objects(Object o){return o instanceof List<?> list?list.stream().filter(x->x instanceof Map).map(x->(Map<String,Object>)x).toList():List.of();}
    static List<String> strings(Object o){return o instanceof List<?> list?list.stream().filter(x->x instanceof String).map(Object::toString).toList():List.of();}
    private static String text(Map<String,Object> m,String key){return LibraryRules.str(m.get(key));}
    public Resolved project(Target t,Map<String,Object> row){var e=object(row.get("live_event"));var p=object(row.get("live_participant"));var s=object(row.get("live_sales"));var product=object(row.get("live_product"));
        if(e.isEmpty()||(!"EVENT".equals(t.type())&&p.isEmpty())||("PRODUCT".equals(t.type())&&product.isEmpty()))return new Resolved(t,false,null);
        String title="EVENT".equals(t.type())?text(e,"name"):"PARTICIPANT".equals(t.type())?text(p,"registrationName"):text(product,"name");
        String summary="EVENT".equals(t.type())?text(e,"description"):"PARTICIPANT".equals(t.type())
            ?(!text(p,"description").isBlank()?text(p,"description"):text(s,"summary")):text(product,"summary");
        Set<String> tags=new LinkedHashSet<>(strings(e.get("subjects")));tags.addAll(strings(p.get("subjects")));tags.addAll(strings(s.get("categories")));tags.addAll(strings(s.get("subjects")));tags.addAll(strings(product.get("categories")));tags.addAll(strings(product.get("subjects")));
        for(var member:objects(p.get("members"))){tags.add(text(member,"name"));tags.addAll(strings(member.get("aliases")));}
        var memory=new Memory(title,text(e,"name"),text(p,"registrationName"),summary.length()>1200?summary.substring(0,1200):summary,tags.stream().filter(x->!x.isBlank()).limit(100).toList());
        LinkedHashMap<String,Link> links=new LinkedHashMap<>();
        if("PRODUCT".equals(t.type()))add(links,"공식 상품·판매 안내",text(product,"productUrl"));
        for(String url:strings(p.get("officialLinks")))add(links,"업체 공식 안내",url);
        for(var source:objects(("EVENT".equals(t.type())?e:!product.isEmpty()?product:p).get("sources")))
            add(links,"OFFICIAL".equals(text(source,"kind"))?"공식 안내":"정보 출처",text(source,"url"));
        var op=object(e.get("operationStatus"));Set<String> warnings=new LinkedHashSet<>(strings(e.get("warnings")));warnings.addAll(strings(p.get("warnings")));warnings.addAll(strings(s.get("warnings")));warnings.addAll(strings(product.get("warnings")));
        return new Resolved(t,true,new Current(memory,text(op,"state"),text(op,"note"),text(e,"venueName"),objects(e.get("occurrences")),objects(p.get("locations")),
            text(product.isEmpty()?s:product,"evidenceScope"),product.get("price")==null?null:object(product.get("price")),text(product,"saleState"),links.values().stream().limit(12).toList(),stamp(row.get("live_published")),warnings.stream().limit(10).toList(),verification(t,row),text(e,"subcategory")));
    }
    private static void add(Map<String,Link> out,String label,String raw){String url=LibraryRules.url(raw);if(url!=null)out.putIfAbsent(url,new Link(label,url));}
    public static String stamp(Object o){return o instanceof java.sql.Timestamp ts?ts.toInstant().toString():o==null?null:o.toString();}
    private ProductVerification verification(Target t,Map<String,Object> row) {
        if(!"PRODUCT".equals(t.type()))return null;var value=object(row.get("live_verification"));
        String state=text(value,"state");if(!Set.of("CONFIRMED_CURRENT","NOT_RECONFIRMED","LEGACY").contains(state))state="LEGACY";
        return new ProductVerification(state,stamp(value.get("lastSeenAt")));
    }
    /** Same batched eligibility query is used for detail and thumbnails; no per-row image loop. */
    public Image image(Target t){return images(List.of(t)).get(t);}
    private Image imageRow(Map<String,Object> row) {
        if(row.get("image_id")==null||publicUrl.isBlank())return null;
        String key=LibraryRules.str(row.get("image_key"));if(key.isBlank()||key.startsWith("/")||key.contains("..")||key.contains(":"))return null;
        String url=LibraryRules.url(publicUrl.replaceAll("/$","")+"/"+key);
        return url==null?null:new Image(((Number)row.get("image_id")).longValue(),url,LibraryRules.str(row.get("image_credit")),LibraryRules.url(LibraryRules.str(row.get("image_page"))));
    }
    private String publicUrl="";
    @org.springframework.beans.factory.annotation.Value("${app.storage.public-url:}") public void publicUrl(String value){publicUrl=value==null?"":value;}
}
