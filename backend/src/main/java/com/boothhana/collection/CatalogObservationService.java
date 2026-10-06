package com.boothhana.collection;

import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;

/** Lightweight source change detection. Confirmed changes use the configured intake approval policy. */
@Service
@Transactional(readOnly=true)
public class CatalogObservationService {
    static final Set<String> FIELDS=Set.of("venueName","address","admission","occurrences","operationStatus","visitorGuide","districts");
    static final Set<String> STATUSES=Set.of("CONFIRMED","SOURCE_UNPUBLISHED","ACCESS_FAILED","EXTRACTION_FAILED");
    static final String NEAR_SQL="""
        exists(select 1 from jsonb_array_elements((e.payload_json || e.overrides_json)->'occurrences') d
          where (d->>'endDate')::date>=(now() at time zone 'Asia/Seoul')::date
          and (d->>'startDate')::date<=(now() at time zone 'Asia/Seoul')::date+7)
        """;
    // A weekly check becomes due sooner when the event approaches or its facts change.
    // Failed checks on an unchanged revision retain the configured retry backoff.
    static final String DUE_SQL="(c.details_json->>'eventRevision' is distinct from e.revision::text or ((coalesce(c.details_json->>'repairResolution','')<>'EXHAUSTED' or c.details_json->>'repairPolicy' is distinct from 'source-completion-v2') and (c.next_check_at is null or c.next_check_at<=now()"
        +" or c.details_json->>'eventRevision' is distinct from e.revision::text"
        +" or (coalesce(c.failures,0)=0 and "+NEAR_SQL+" and c.checked_at<=now()-interval '24 hours'))))";
    private final JdbcTemplate db;private final JsonMapper json;private final CatalogService catalog;
    private final CatalogAutoApproval approval;
    public CatalogObservationService(JdbcTemplate db,JsonMapper json,CatalogService catalog){this(db,json,catalog,null);}
    @org.springframework.beans.factory.annotation.Autowired
    public CatalogObservationService(JdbcTemplate db,JsonMapper json,CatalogService catalog,CatalogAutoApproval approval){this.db=db;this.json=json;this.catalog=catalog;this.approval=approval;}
    public record ObservationInput(long eventRevision,String digest,String status,List<String> sourceUrls,Map<String,Object> values,Map<String,String> fieldStates,Map<String,String> fieldEvidence){}
    public record ReviewInput(long eventRevision,List<String> fields,String note,int reviewSeconds,boolean reject){}
    public record PlaceInput(long eventRevision,String neighborhood,String address,Double latitude,Double longitude,String sourceUrl,String checkedOn){}
    Map<String,Object> eventRow(long id){var rows=db.queryForList("select * from subculture_event_candidate where id=? for update",id);if(rows.isEmpty())throw ApiException.notFound("행사 없음");return rows.getFirst();}
    @SuppressWarnings("unchecked") Map<String,Object> fields(Object event){return json.readValue(json.writeValueAsString(event),Map.class);}
    static Object facts(Object value){
        if(value instanceof Map<?,?> map){var result=new TreeMap<String,Object>();map.forEach((k,v)->{if(!"checkedOn".equals(k))result.put(k.toString(),facts(v));});return result;}
        if(value instanceof List<?> list)return list.stream().map(CatalogObservationService::facts).toList();
        return value;
    }
    static String fingerprint(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    static Set<String> registeredSources(EventData event){var result=new HashSet<String>();for(var s:event.sources())if(Set.of("OFFICIAL","VENUE","ORGANIZER_SOCIAL").contains(s.kind())&&"ORIGINAL".equals(s.access()))result.add(s.url());return result;}
    public Map<String,Object> summary(){
        var pending=db.queryForMap("select count(*) pending,min(observed_at) oldest from catalog_event_observation where state='PENDING'");
        var checks=db.queryForList("select status,count(*) count from catalog_source_check group by status order by status");
        var reviews=db.queryForMap("select count(*) count,coalesce(sum(review_seconds),0) seconds from catalog_event_observation where reviewed_at>=(date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')");
        var queue=db.queryForList("select o.event_id,e.name,min(o.observed_at) observed_at,count(*) observations from catalog_event_observation o join subculture_event_candidate e on e.id=o.event_id where o.state='PENDING' group by o.event_id,e.name order by min(o.observed_at),o.event_id limit 20");
        return Map.of("pending",pending,"checks",checks,"todayReviews",reviews,"queue",queue,"workload",workload());
    }
    public Map<String,Object> workload(){
        return db.queryForMap("""
            select count(*) eligible,
              count(*) filter(where %s) due,
              count(*) filter(where %s) near,
              count(*) filter(where %s and c.checked_at>=now()-interval '24 hours' and c.failures=0 and c.details_json->>'eventRevision'=e.revision::text and c.status not in ('ACCESS_FAILED','EXTRACTION_FAILED')) near_checked
            from subculture_event_candidate e join subculture_catalog_publication p on p.event_id=e.id
            left join catalog_source_check c on c.event_id=e.id
            where e.review_state<>'EXCLUDED' and e.ends_on>=(now() at time zone 'Asia/Seoul')::date
            and exists(select 1 from jsonb_array_elements((e.payload_json || e.overrides_json)->'sources') s where s->>'kind' in ('OFFICIAL','VENUE','ORGANIZER_SOCIAL') and s->>'access'='ORIGINAL')
            """.formatted(DUE_SQL,NEAR_SQL,NEAR_SQL));
    }
    public List<Map<String,Object>> due(int limit){
        return due(limit,-1);
    }
    public List<Map<String,Object>> due(int limit,long afterId){
        if(limit<1||limit>100)throw ApiException.badRequest("조회 한도 오류");
        if(afterId < -1)throw ApiException.badRequest("조회 시작점 오류");
        return db.queryForList("""
            select e.id,e.revision,c.digest,c.status,c.failures,c.details_json->>'eventRevision' checked_revision,c.details_json->>'observationStatus' observation_status from subculture_event_candidate e
            join subculture_catalog_publication p on p.event_id=e.id
            left join catalog_source_check c on c.event_id=e.id
            where e.review_state<>'EXCLUDED' and e.ends_on>=(now() at time zone 'Asia/Seoul')::date
            and exists(select 1 from jsonb_array_elements((e.payload_json || e.overrides_json)->'sources') s where s->>'kind' in ('OFFICIAL','VENUE','ORGANIZER_SOCIAL') and s->>'access'='ORIGINAL')
            and %s and e.id>?
            order by %s limit ?
            """.formatted(DUE_SQL,afterId<0?"("+NEAR_SQL+") desc,c.next_check_at asc nulls first,e.starts_on,e.id":"e.id"),Math.max(0,afterId),limit).stream().map(row->{Map<String,Object> out=new LinkedHashMap<String,Object>(row);out.put("event",catalog.event(((Number)row.get("id")).longValue()));return out;}).toList();
    }
    @Transactional public Map<String,Object> observe(long id,ObservationInput input){
        if(approval!=null)approval.lock();
        var row=eventRow(id);var current=catalog.event(id);
        if(input==null||input.eventRevision()!=((Number)row.get("revision")).longValue())throw ApiException.conflict("행사 정보가 바뀌었습니다. 다시 확인하세요.");
        if("EXCLUDED".equals(row.get("review_state")))throw ApiException.conflict("제외된 행사");
        if(input.digest()==null||!input.digest().matches("[a-f0-9]{64}")||input.status()==null||!STATUSES.contains(input.status())||input.values()==null||!FIELDS.containsAll(input.values().keySet())||json.writeValueAsString(input).length()>100000)throw ApiException.badRequest("관측값 형식 오류");
        if(input.sourceUrls()==null||input.sourceUrls().isEmpty()||input.sourceUrls().size()>10||!registeredSources(current).containsAll(input.sourceUrls()))throw ApiException.badRequest("등록된 공식 원문으로 확인하세요.");
        if(input.fieldStates()==null||!FIELDS.containsAll(input.fieldStates().keySet())||input.fieldStates().values().stream().anyMatch(s->s==null||!STATUSES.contains(s)))throw ApiException.badRequest("항목별 확인 상태 오류");
        // Automatic observations describe changes to collected facts. Comparing only the
        // effective (manually overridden) event can otherwise discard the latest raw value.
        boolean automatic=approval!=null&&approval.enabled();
        Map<String,Object> before=automatic?json.readValue(row.get("payload_json").toString(),Map.class):fields(current);
        var changes=new TreeMap<String,Object>();
        if(!input.values().isEmpty()){
            var proposed=new LinkedHashMap<>(before);proposed.putAll(input.values());
            if(automatic)proposed.putAll(json.readValue(row.get("overrides_json").toString(),Map.class));
            try{
                EventData event=json.readValue(json.writeValueAsString(proposed),EventData.class);
                String start=event.occurrences().stream().map(Occurrence::startDate).min(String::compareTo).orElseThrow(),end=event.occurrences().stream().map(Occurrence::endDate).max(String::compareTo).orElseThrow();
                if(!CollectionRules.event(event,new Scope("SEOUL_GYEONGGI","Asia/Seoul",start,end)).accepted())throw new IllegalArgumentException();
            }catch(RuntimeException e){throw ApiException.badRequest("관측한 행사 정보의 날짜·형식을 확인하세요.");}
        }
        for(var entry:input.values().entrySet()){
            if(entry.getValue()==null||entry.getValue() instanceof String value&&value.isBlank())throw ApiException.badRequest("미확인 관측으로 기존값을 지울 수 없습니다.");
            if(!"CONFIRMED".equals(input.fieldStates().get(entry.getKey())))throw ApiException.badRequest("확인된 항목만 수정 제안할 수 있습니다.");
            if(input.fieldEvidence()==null||input.fieldEvidence().get(entry.getKey())==null||input.fieldEvidence().get(entry.getKey()).isBlank()||input.fieldEvidence().get(entry.getKey()).length()>2000)throw ApiException.badRequest("항목별 원문 근거를 남겨 주세요.");
            if(!Objects.equals(facts(before.get(entry.getKey())),facts(entry.getValue()))){
                var change=new LinkedHashMap<String,Object>();change.put("before",before.get(entry.getKey()));change.put("after",entry.getValue());change.put("evidence",input.fieldEvidence().get(entry.getKey()));changes.put(entry.getKey(),change);
            }
        }
        UUID observation=null;
        if(!changes.isEmpty()){
            observation=UUID.randomUUID();String fp=fingerprint(json.writeValueAsString(changes)+json.writeValueAsString(input.sourceUrls()));
            db.update("insert into catalog_event_observation(id,event_id,event_revision,fingerprint,observed_at,source_urls_json,changes_json) values(?,?,?,?,now(),cast(? as jsonb),cast(? as jsonb)) on conflict(event_id,event_revision,fingerprint) do nothing",observation,id,input.eventRevision(),fp,json.writeValueAsString(input.sourceUrls()),json.writeValueAsString(changes));
            if(automatic){
                catalog.applyCollectedObservation(id,input.eventRevision(),input.values());
                approval.approve(id);
                db.update("update catalog_event_observation set state='APPLIED',review_note=?,reviewed_at=now(),review_seconds=0 where event_id=? and event_revision=? and fingerprint=? and state='PENDING'",CatalogAutoApproval.NOTE,id,input.eventRevision(),fp);
            }
        }
        String state=changes.isEmpty()||automatic?input.status():"CONFLICT_REVIEW";
        if(db.queryForObject("select count(*) from catalog_event_observation where event_id=? and state='PENDING'",Long.class,id)>0&&!input.status().endsWith("FAILED"))state="CONFLICT_REVIEW";
        int failures=(input.status().endsWith("FAILED"))?db.queryForObject("select coalesce((select failures from catalog_source_check where event_id=?),0)+1",Integer.class,id):0;
        LocalDate today=LocalDate.now(ZoneId.of("Asia/Seoul"));
        boolean near=current.occurrences().stream().anyMatch(o->!LocalDate.parse(o.endDate()).isBefore(today)&&!LocalDate.parse(o.startDate()).isAfter(today.plusDays(7)));
        int hours=failures>0?Math.min(168,6*(1<<Math.min(failures-1,5))):near?24:168;
        // A source with unpublished fields is not fully confirmed, even if other fields were verified.
        if(state.equals("CONFIRMED")&&input.fieldStates().containsValue("SOURCE_UNPUBLISHED"))state="SOURCE_UNPUBLISHED";
        Map<String,Object> details=new LinkedHashMap<>();
        var previous=db.queryForList("select details_json from catalog_source_check where event_id=?",id);
        if(!previous.isEmpty())details=json.readValue(previous.getFirst().get("details_json").toString(),Map.class);
        // Empty values after an unchanged document hash do not erase prior per-field evidence.
        if(!input.fieldStates().isEmpty())details.put("fieldStates",input.fieldStates());
        if(input.fieldEvidence()!=null&&!input.fieldEvidence().isEmpty())details.put("fieldEvidence",input.fieldEvidence());
        @SuppressWarnings("unchecked") Map<String,Object> checkedFields=(Map<String,Object>)details.getOrDefault("fieldCheckedAt",new LinkedHashMap<>());
        input.values().keySet().forEach(key->checkedFields.put(key,Instant.now().toString()));details.put("fieldCheckedAt",checkedFields);
        details.remove("repairResolution");details.remove("repairCompletedAt");details.remove("repairPolicy");
        details.put("sourceUrls",input.sourceUrls());details.put("eventRevision",db.queryForObject("select revision from subculture_event_candidate where id=?",Long.class,id));details.put("observationStatus",input.status());
        db.update("""
            insert into catalog_source_check(event_id,checked_at,next_check_at,status,digest,details_json,failures)
            values(?,now(),now()+make_interval(hours=>?),?,?,cast(? as jsonb),?)
            on conflict(event_id) do update set checked_at=excluded.checked_at,next_check_at=excluded.next_check_at,status=excluded.status,digest=excluded.digest,details_json=excluded.details_json,failures=excluded.failures
            """,id,hours,state,input.digest(),json.writeValueAsString(details),failures);
        return Map.of("status",state,"changedFields",changes.keySet(),"nextCheckHours",hours);
    }
    public record ExhaustedInput(long eventRevision,List<String> methods,Map<String,String> methodStatuses){}
    @Transactional public Map<String,Object> sourceExhausted(long id,ExhaustedInput input){
        var row=eventRow(id);
        if(input==null||input.eventRevision()!=((Number)row.get("revision")).longValue())throw ApiException.conflict("행사 정보가 바뀌었습니다.");
        var methods=Set.of("SOURCE_DETAILS","ORGANIZER_SEARCH","VENUE_SEARCH");
        if(input.methods()==null||!new HashSet<>(input.methods()).containsAll(methods)||input.methodStatuses()==null||methods.stream().anyMatch(method->!"SUCCESS".equals(input.methodStatuses().get(method))))throw ApiException.badRequest("서로 다른 보완 경로의 조사를 모두 완료하세요. 부분 조사·접근 실패는 다시 보완합니다.");
        int changed=db.update("update catalog_source_check set details_json=details_json || jsonb_build_object('repairResolution','EXHAUSTED','repairCompletedAt',now()::text,'repairPolicy','source-completion-v2') where event_id=? and status in ('ACCESS_FAILED','EXTRACTION_FAILED') and details_json->>'eventRevision'=?",id,Long.toString(input.eventRevision()));
        return Map.of("id",id,"exhausted",changed==1);
    }
    @SuppressWarnings("unchecked") public Map<String,Object> workspace(long id){
        var checks=db.queryForList("select checked_at,next_check_at,status,details_json,failures from catalog_source_check where event_id=?",id);
        checks.forEach(check->check.put("details_json",json.readValue(check.get("details_json").toString(),Map.class)));
        var rows=db.queryForList("select * from catalog_event_observation where event_id=? order by (state='PENDING') desc,observed_at desc limit 30",id);
        var items=rows.stream().map(r->{var out=new LinkedHashMap<String,Object>();out.put("id",r.get("id").toString());out.put("eventRevision",r.get("event_revision"));out.put("state",r.get("state"));out.put("observedAt",r.get("observed_at").toString());out.put("sources",json.readValue(r.get("source_urls_json").toString(),List.class));out.put("changes",json.readValue(r.get("changes_json").toString(),Map.class));out.put("reviewNote",r.get("review_note"));return out;}).toList();
        return Map.of("checks",checks,"items",items,"places",db.queryForList("select * from catalog_event_place where event_id=?",id));
    }
    @Transactional @SuppressWarnings("unchecked") public Map<String,Object> review(long eventId,UUID id,ReviewInput input){
        eventRow(eventId);var rows=db.queryForList("select * from catalog_event_observation where id=? and event_id=? for update",id,eventId);
        if(rows.isEmpty())throw ApiException.notFound("관측 없음");var row=rows.getFirst();
        if(!"PENDING".equals(row.get("state")))throw ApiException.conflict("이미 처리한 관측입니다.");
        if(input==null||input.note()==null||input.note().isBlank()||input.note().length()>2000||input.reviewSeconds()<0||input.reviewSeconds()>86400)throw ApiException.badRequest("검토 근거를 남겨 주세요.");
        if(input.eventRevision()!=((Number)row.get("event_revision")).longValue())throw ApiException.conflict("관측 이후 행사 수정이 있습니다. 새 관측으로 검토하세요.");
        if(!input.reject()){
            Map<String,Map<String,Object>> changes=json.readValue(row.get("changes_json").toString(),Map.class);
            if(input.fields()==null||input.fields().isEmpty()||!changes.keySet().containsAll(input.fields()))throw ApiException.badRequest("반영할 항목을 선택하세요.");
            var overrides=new LinkedHashMap<String,Object>();for(String key:input.fields())overrides.put(key,changes.get(key).get("after"));
            // Validation, stale revision checks, typed columns and audit use the normal edit path.
            catalog.editEvent(eventId,new EditInput(input.eventRevision(),"PENDING",input.note(),overrides,List.of()));
            var remaining=new TreeMap<String,Object>();changes.forEach((key,change)->{if(!input.fields().contains(key))remaining.put(key,change);});
            if(!remaining.isEmpty())db.update("insert into catalog_event_observation(id,event_id,event_revision,fingerprint,observed_at,source_urls_json,changes_json) values(?,?,?,?,?,cast(? as jsonb),cast(? as jsonb)) on conflict(event_id,event_revision,fingerprint) do nothing",UUID.randomUUID(),eventId,input.eventRevision()+1,fingerprint(json.writeValueAsString(remaining)+row.get("source_urls_json")),row.get("observed_at"),row.get("source_urls_json").toString(),json.writeValueAsString(remaining));
        }
        db.update("update catalog_event_observation set state=?,review_note=?,reviewed_at=now(),review_seconds=? where id=?",input.reject()?"REJECTED":"APPLIED",input.note(),input.reviewSeconds(),id);
        return workspace(eventId);
    }
    @Transactional public Map<String,Object> place(long id,PlaceInput input){
        var row=eventRow(id);var event=catalog.event(id);
        if(input==null||input.eventRevision()!=((Number)row.get("revision")).longValue())throw ApiException.conflict("행사 정보가 바뀌었습니다.");
        if(input.neighborhood()==null||!Set.of("SEONGSU","YEONNAM").contains(input.neighborhood())||!"SEOUL".equals(event.region())||input.address()==null||input.address().isBlank()||!input.address().equals(event.address())||!registeredSources(event).contains(input.sourceUrl()))throw ApiException.badRequest("현재 공식 주소와 근거를 확인하세요.");
        try{if(LocalDate.parse(input.checkedOn()).isAfter(LocalDate.now(ZoneId.of("Asia/Seoul"))))throw new IllegalArgumentException();}catch(RuntimeException e){throw ApiException.badRequest("확인일 오류");}
        if((input.latitude()==null)!=(input.longitude()==null)||input.latitude()!=null&&(!Double.isFinite(input.latitude())||!Double.isFinite(input.longitude())||input.latitude()<37||input.latitude()>38||input.longitude()<126||input.longitude()>128))throw ApiException.badRequest("서울 위치 좌표 오류");
        db.update("insert into catalog_event_place(event_id,neighborhood,address,latitude,longitude,source_url,checked_on) values(?,?,?,?,?,?,cast(? as date)) on conflict(event_id) do update set neighborhood=excluded.neighborhood,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,source_url=excluded.source_url,checked_on=excluded.checked_on",id,input.neighborhood(),input.address(),input.latitude(),input.longitude(),input.sourceUrl(),input.checkedOn());
        return workspace(id);
    }
}
