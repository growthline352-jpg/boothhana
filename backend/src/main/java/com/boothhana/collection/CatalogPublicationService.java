package com.boothhana.collection;

import com.boothhana.api.ApiException;
import com.boothhana.interests.InterestTaxonomy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;

/** Reviewed, point-in-time INFO_ONLY snapshot. Publishing never enables platform applications/reservations. */
@Service
@Transactional(readOnly=true)
public class CatalogPublicationService {
    private final JdbcTemplate db;private final JsonMapper json;private final CatalogMediaService media;
    public CatalogPublicationService(JdbcTemplate db,JsonMapper json,CatalogMediaService media) {this.db=db;this.json=json;this.media=media;}
    @Transactional public Map<String,Object> publish(long eventId,PublishInput input) {
        var events=db.queryForList("select * from subculture_event_candidate where id=? for update",eventId);
        if(events.isEmpty()) throw ApiException.notFound("행사 없음");var e=events.getFirst();
        if(input==null||((Number)e.get("revision")).longValue()!=input.eventRevision()) throw ApiException.conflict("행사 검토 버전이 변경되었습니다.");
        if(!"REVIEWED".equals(e.get("review_state"))||e.get("reviewed_payload_json")==null) throw ApiException.conflict("행사 정보를 먼저 검토 완료로 저장하세요.");
        EventData raw=json.readValue(e.get("reviewed_payload_json").toString(),EventData.class);
        // Never expose unapproved remote image candidates through public snapshots.
        EventData event=PublicEventProjection.fromReviewed(raw);
        List<Map<String,Object>> participants=new ArrayList<>();
        var rows=db.queryForList("""
            select p.id,p.reviewed_payload_json,s.review_state sales_state,s.reviewed_payload_json sales_json,s.reviewed_product_checks_json checks_json
            from subculture_participant p left join subculture_sales s on s.participant_id=p.id
            where p.event_id=? and p.review_state='REVIEWED' and p.reviewed_payload_json is not null order by p.registration_name,p.id
            """,eventId);
        if(rows.size()>3000) throw ApiException.badRequest("한 행사에 공개할 수 있는 참가 부스 한도를 초과했습니다.");
        for(var row:rows) {
            long id=((Number)row.get("id")).longValue();Participant p=json.readValue(row.get("reviewed_payload_json").toString(),Participant.class);
            Participant safe=new Participant(p.sourceEntryId(),p.registrationName(),p.kind(),p.members(),p.locations(),p.subjects(),p.description(),p.officialLinks(),p.sources(),List.of(),p.warnings(),p.identity());
            Map<String,Object> view=new LinkedHashMap<>();view.put("id",id);view.put("participant",safe);view.put("sales",null);
            if("REVIEWED".equals(row.get("sales_state"))&&row.get("sales_json")!=null) {
                Sales s=json.readValue(row.get("sales_json").toString(),Sales.class);
                Map<String,ProductCheck> checks=new LinkedHashMap<>();
                Map<?,?> rawChecks=json.readValue(row.get("checks_json").toString(),Map.class);
                rawChecks.forEach((key,value)->checks.put(key.toString(),json.readValue(json.writeValueAsString(value),ProductCheck.class)));
                var linked=new CatalogIdentityIndex(json).products(s,db.queryForList("select * from subculture_catalog_product where participant_id=? order by id",id),checks);
                List<ProductData> products=new ArrayList<>();List<ProductRow> productRows=new ArrayList<>();Map<String,Long> productIds=new LinkedHashMap<>();
                for(var link:linked) {
                    ProductData p2=link.data();
                    ProductData safeProduct=new ProductData(p2.sourceEntryId(),p2.name(),p2.summary(),p2.memberName(),p2.categories(),p2.subjects(),p2.evidenceScope(),p2.price(),p2.saleState(),p2.productUrl(),p2.sources(),List.of(),p2.warnings(),p2.identity());
                    products.add(safeProduct);productRows.add(new ProductRow(link.id(),safeProduct,link.verification()));
                    if(link.id()!=null) productIds.put(Long.toString(link.id()),link.id());
                }
                view.put("sales",new Sales(s.summary(),s.evidenceScope(),s.categories(),s.subjects(),s.salesMethod(),s.sources(),List.of(),products,s.warnings()));
                view.put("productIds",productIds);view.put("productRows",productRows);
            }
            participants.add(view);
        }
        Map<String,Object> snapshot=Map.of("id",eventId,"mode","INFO_ONLY","event",event,"participants",participants,"publishedAt",java.time.Instant.now().toString());
        String encoded=json.writeValueAsString(snapshot);if(encoded.length()>8*1024*1024) throw ApiException.badRequest("공개 스냅샷이 너무 큽니다.");
        db.update("""
            insert into subculture_catalog_publication(event_id,snapshot_json,event_revision) values(?,cast(? as jsonb),?)
            on conflict(event_id) do update set snapshot_json=excluded.snapshot_json,event_revision=excluded.event_revision,published_at=now()
            """,eventId,encoded,input.eventRevision());return Map.of("id",eventId,"published",true,"participantCount",participants.size());
    }
    @Transactional public void unpublish(long id) {db.update("delete from subculture_catalog_publication where event_id=?",id);}
    /** Compatibility for existing callers: unchanged unfiltered, most-recent publication order. */
    public PageData<Map<String,Object>> list(int page,int size) {
        try { return list(new CatalogBrowseQuery(page,size,"SUBCULTURE","","","","","RECENT")); }
        catch (IllegalArgumentException e) { throw ApiException.badRequest(e.getMessage()); }
    }
    public PageData<Map<String,Object>> list(CatalogBrowseQuery query) {
        // Each enabled category is queried independently; never alias another category.
        if (!query.connected()) return new PageData<>(List.of(),query.page(),query.size(),0);
        String fromSql=" from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id where "+query.whereSql();
        var rows=db.queryForList("""
            select p.event_id,p.snapshot_json->'event' event_json,p.published_at,
            (select count(*) from jsonb_array_elements(p.snapshot_json->'participants') x
             join subculture_participant q on q.id=(x->>'id')::bigint where q.review_state<>'EXCLUDED') participant_count
            """+fromSql+" order by "+query.orderSql()+" limit ? offset ?",query.listArgs().toArray());
        var items=summaries(rows);
        long total=Objects.requireNonNull(db.queryForObject("select count(*)"+fromSql,Long.class,query.whereArgs().toArray()));
        return new PageData<>(items,query.page(),query.size(),total);
    }
    /** Only actual member EVENT saves count. Never infer popularity from views or local guest storage. */
    public List<Map<String,Object>> popular(int limit) {return popular(limit,"");}
    public List<Map<String,Object>> popular(int limit,String category) {
        return ranked(limit,category,"",null,false);
    }
    public Map<String,Object> featured(String category,String region,InterestTaxonomy.Selection selection) {
        InterestTaxonomy.field(category);
        var items=ranked(5,category,region,selection,false);
        boolean recent=items.isEmpty();
        if(recent)items=ranked(5,category,region,selection,true);
        return Map.of("mode",recent?"RECENT":"POPULAR","personalized",selection!=null,"items",items);
    }
    private List<Map<String,Object>> ranked(int limit,String category,String region,InterestTaxonomy.Selection selection,boolean recent) {
        if(limit<1||limit>12)throw ApiException.badRequest("인기 행사 조회 개수를 확인해 주세요.");
        if(category==null)category="";
        if(!category.isEmpty()&&!CatalogTaxonomy.GROUPS.containsKey(category))throw ApiException.badRequest("행사 분야를 확인해 주세요.");
        Collection<String> selected=category.isEmpty()?CatalogTaxonomy.TYPES:CatalogTaxonomy.GROUPS.get(category);
        if(region==null)region="";
        if(!Set.of("","SEOUL","GYEONGGI").contains(region))throw ApiException.badRequest("지역을 확인해 주세요.");
        String types=String.join(",",Collections.nCopies(selected.size(),"?"));
        List<Object> args=new ArrayList<>(selected);
        String regionSql=region.isEmpty()?"true":"p.snapshot_json->'event'->>'region'=?";
        if(!region.isEmpty())args.add(region);
        String today=LocalDate.now(ZoneId.of("Asia/Seoul")).toString();
        args.add(today);args.add(today);
        String interests=InterestTaxonomy.predicate(category,selection,"sibling",args);
        args.add(today);args.add(limit);
        String saveJoin=recent?"left join":"join";
        String order=recent?"p.published_at desc,p.event_id":"coalesce(s.save_count,0) desc,next_date,p.event_id";
        var rows=db.queryForList("""
            with visible as (
              select p.* from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id
              where e.review_state<>'EXCLUDED' and p.snapshot_json->'event'->>'region' in ('SEOUL','GYEONGGI')
                and p.snapshot_json->'event'->>'subcategory' in (%s)
                and (%s) and coalesce(p.snapshot_json->'event'->'operationStatus'->>'state','UNKNOWN') not in ('CANCELED','POSTPONED','RESCHEDULED')
            ), editions as (
              select p.*,case when p.event_id in (1,7)
                and exists(select 1 from visible where event_id=1 and snapshot_json->'event'->>'name'='제35회 디. 페스타 (토요일)')
                and exists(select 1 from visible where event_id=7 and snapshot_json->'event'->>'name'='제35회 디. 페스타 (일요일)')
                then 1 else p.event_id end edition_id from visible p
            ), saves as (
              select p.edition_id,count(distinct m.user_id) save_count from editions p join memory_item m on m.event_id=p.event_id
              where m.target_type='EVENT' and m.target_id=m.event_id group by p.edition_id
            )
            select p.event_id,
              case when exists(select 1 from editions sibling where sibling.edition_id=p.event_id and sibling.event_id<>p.event_id)
                then jsonb_set(jsonb_set(p.snapshot_json->'event','{name}',to_jsonb('제35회 디. 페스타'::text)), '{occurrences}',
                  (select jsonb_agg(d.value order by sibling.event_id,d.ordinality) from editions sibling
                   cross join lateral jsonb_array_elements(coalesce(sibling.snapshot_json->'event'->'occurrences','[]'::jsonb)) with ordinality d(value,ordinality)
                   where sibling.edition_id=p.event_id))
                else p.snapshot_json->'event' end event_json,p.published_at,coalesce(s.save_count,0) save_count,
              (select min(greatest(d->>'startDate',?)) from editions sibling
               cross join lateral jsonb_array_elements(coalesce(sibling.snapshot_json->'event'->'occurrences','[]'::jsonb)) d
               where sibling.edition_id=p.event_id and d->>'endDate'>=?) next_date,
              (select count(*) from editions sibling cross join lateral jsonb_array_elements(sibling.snapshot_json->'participants') x
               join subculture_participant q on q.id=(x->>'id')::bigint
               where sibling.edition_id=p.event_id and q.review_state<>'EXCLUDED') participant_count
            from editions p %s saves s on s.edition_id=p.event_id
            where p.event_id=p.edition_id and exists(select 1 from editions sibling where sibling.edition_id=p.event_id and (%s)) and exists(
              select 1 from editions sibling cross join lateral jsonb_array_elements(coalesce(sibling.snapshot_json->'event'->'occurrences','[]'::jsonb)) d
              where sibling.edition_id=p.event_id and d->>'endDate'>=?)
            order by %s
            limit ?
            """.formatted(types,regionSql,saveJoin,interests,order),args.toArray());
        return summaries(rows);
    }
    private List<Map<String,Object>> summaries(List<Map<String,Object>> rows) {
        List<Long> ids=rows.stream().map(r->((Number)r.get("event_id")).longValue()).toList();
        Map<Long,AssetView> banners=media.publicBanners(ids);
        var items=rows.stream().map(r->{
            long id=((Number)r.get("event_id")).longValue(); Map<String,Object> item=new LinkedHashMap<>();
            item.put("id",id);item.put("event",json.readValue(r.get("event_json").toString(),EventData.class));
            item.put("participantCount",r.get("participant_count"));
            if(r.containsKey("save_count"))item.put("saveCount",r.get("save_count"));
            Object stamp=r.get("published_at");item.put("publishedAt",stamp instanceof java.sql.Timestamp t?t.toInstant().toString():String.valueOf(stamp));
            AssetView banner=banners.get(id);
            if(banner!=null){Map<String,Object> asset=new LinkedHashMap<>();asset.put("id",banner.id());asset.put("participantId",null);asset.put("productId",null);
                asset.put("type","BANNER");asset.put("url",banner.storedUrl());asset.put("caption",banner.caption());asset.put("credit",banner.credit());asset.put("attribution",banner.pageUrl());item.put("banner",asset);}
            else item.put("banner",null);
            return item;
        }).toList();
        return items;
    }
    public Map<String,Object> detail(long id) {
        return findPublicDetail(id).orElseThrow(() -> ApiException.notFound("공개된 안내를 찾을 수 없습니다."));
    }
    /** Expected absence is a value; SQL failures still propagate and roll back the caller. */
    @SuppressWarnings("unchecked") public Optional<Map<String,Object>> findPublicDetail(long id) {
        var rows=db.queryForList("select p.snapshot_json from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id where p.event_id=? and e.review_state<>'EXCLUDED'",id);
        if(rows.isEmpty()) return Optional.empty();
        Map<String,Object> snapshot=json.readValue(rows.getFirst().get("snapshot_json").toString(),Map.class);
        Set<Long> publishedParticipants=new HashSet<>(),publishedProducts=new HashSet<>(),publishedSales=new HashSet<>();
        List<Map<String,Object>> participants=(List<Map<String,Object>>)snapshot.get("participants");
        Set<Long> excluded=new HashSet<>(db.query("select id from subculture_participant where event_id=? and review_state='EXCLUDED'",(rs,n)->rs.getLong(1),id));
        participants.removeIf(p->excluded.contains(((Number)p.get("id")).longValue()));
        Set<Long> hiddenSales=new HashSet<>(db.query("select s.participant_id from subculture_sales s join subculture_participant p on p.id=s.participant_id where p.event_id=? and s.review_state='EXCLUDED'",(rs,n)->rs.getLong(1),id));
        for(var p:participants) { if(hiddenSales.contains(((Number)p.get("id")).longValue())) {p.put("sales",null);p.put("productIds",Map.of());p.put("productRows",List.of());} publishedParticipants.add(((Number)p.get("id")).longValue());if(p.get("sales")!=null) publishedSales.add(((Number)p.get("id")).longValue());var products=(Map<String,Number>)p.get("productIds");if(products!=null) products.values().forEach(v->publishedProducts.add(v.longValue()));}
        var assets=media.assets(id,null).stream().filter(a->"APPROVED".equals(a.rightsState())&&"STORED".equals(a.storageState())&&a.storedUrl()!=null)
            .filter(a->a.participantId()==null||publishedParticipants.contains(a.participantId()))
            .filter(a->a.productId()==null||publishedProducts.contains(a.productId()))
            .filter(a->!"SALES_SHEET".equals(a.type())||a.participantId()!=null&&publishedSales.contains(a.participantId()))
            .map(a->{Map<String,Object> m=new LinkedHashMap<>();m.put("id",a.id());m.put("participantId",a.participantId());m.put("productId",a.productId());m.put("type",a.type());m.put("url",a.storedUrl());m.put("caption",a.caption());m.put("attribution",a.pageUrl());m.put("credit",a.credit());m.put("offlineAllowed",a.offlineAllowed());return m;}).toList();
        snapshot.put("assets",assets);
        AssetView banner=media.publicBanners(List.of(id)).get(id);
        // Explicit null matters: the frontend must not pick another banner after rights revocation.
        snapshot.put("banner",banner==null?null:assets.stream().filter(a->Objects.equals(a.get("id"),banner.id())).findFirst().orElse(null));
        return Optional.of(snapshot);
    }
}
