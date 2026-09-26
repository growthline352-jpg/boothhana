package com.boothhana.collection;

import static com.boothhana.collection.CollectionModels.*;
import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** All writes are private inbox writes. Never inserts/updates the existing event table. */
@Service
@Transactional(readOnly = true)
public class CollectionService {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    public CollectionService(JdbcTemplate jdbc, JsonMapper json) { this.jdbc=jdbc;this.json=json; }

    @Transactional(timeout = 30)
    public Receipt ingest(Batch batch) {
        try { CollectionRules.batch(batch); }
        catch(RuntimeException e) { throw ApiException.badRequest("수집 배치 형식/기간/검색 기록을 확인해 주세요."); }
        String request=json.writeValueAsString(batch), hash=CollectionRules.sha(request);
        UUID runId=UUID.fromString(batch.runId());
        // A small daily ingestion workload: serialize writers instead of racing unique inserts.
        // Transaction-scoped and DB-wide, therefore also works with multiple backend instances.
        jdbc.execute("SET LOCAL lock_timeout = '4s'");
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            try(var statement=connection.prepareStatement("select pg_advisory_xact_lock(728194301)")) {
                statement.execute(); return null;
            }
        });
        List<Map<String,Object>> previous=jdbc.queryForList("select request_hash,receipt_json::text as receipt from subculture_collection_run where id=?",runId);
        if(!previous.isEmpty()) {
            if(!hash.equals(previous.getFirst().get("request_hash"))) throw ApiException.conflict("같은 runId에 다른 내용은 저장할 수 없습니다.");
            return json.readValue((String)previous.getFirst().get("receipt"),Receipt.class);
        }
        // Run row first, observations refer to it. All of these changes commit or roll back together.
        jdbc.update("""
            insert into subculture_collection_run(id,request_hash,execution_mode,web_search_observed,scope_json,
                request_json,receipt_json,status,summary,started_at,finished_at)
            values(?,?,?,?,cast(? as jsonb),cast(? as jsonb),'{}'::jsonb,'FAILED',?,?,?)
            """,runId,hash,batch.executionMode(),batch.webSearchObserved(),json.writeValueAsString(batch.scope()),request,
            batch.result().summary(),Timestamp.from(Instant.parse(batch.startedAt())),Timestamp.from(Instant.parse(batch.finishedAt())));
        int inserted=0,changed=0,unchanged=0;
        List<Rejection> rejects=new ArrayList<>();Set<String> seen=new HashSet<>();
        List<EventData> events=batch.result().events();
        for(int index=0;index<events.size();index++) {
            EventData event=events.get(index);CollectionRules.Check check=CollectionRules.event(event,batch.scope());
            if(!check.accepted()) { rejects.add(new Rejection(index,event==null?"":event.name(),check.errors()));continue; }
            String key=CollectionRules.identity(event);
            if(!seen.add(key)) { rejects.add(new Rejection(index,event.name(),List.of("배치 내 동일 행사 중복")));continue; }
            String payload=json.writeValueAsString(event), payloadHash=CollectionRules.sha(payload);
            String warnings=json.writeValueAsString(check.warnings()), match=CollectionRules.matchKey(event);
            String start=event.occurrences().stream().map(Occurrence::startDate).min(String::compareTo).orElseThrow();
            String end=event.occurrences().stream().map(Occurrence::endDate).max(String::compareTo).orElseThrow();
            List<Map<String,Object>> existing=jdbc.queryForList("select id,payload_hash,overrides_json from subculture_event_candidate where identity_key=? for update",key);
            long id;
            if(existing.isEmpty()) {
                List<Long> possible=jdbc.query("select id from subculture_event_candidate where match_key=? order by last_seen_at desc,id desc limit 1",(rs,row)->rs.getLong(1),match);
                Long possibleId=possible.isEmpty()?null:possible.getFirst();
                Long generated=jdbc.queryForObject("""
                    insert into subculture_event_candidate(identity_key,match_key,name,subcategory,venue_name,starts_on,ends_on,
                        payload_json,payload_hash,warnings_json,possible_duplicate_of)
                    values(?,?,?,?,?,cast(? as date),cast(? as date),cast(? as jsonb),?,cast(? as jsonb),?) returning id
                    """,Long.class,key,match,event.name(),event.subcategory(),event.venueName(),start,end,payload,payloadHash,warnings,possibleId);
                id=Objects.requireNonNull(generated);inserted++;
            } else {
                id=((Number)existing.getFirst().get("id")).longValue();
                if(payloadHash.equals(existing.getFirst().get("payload_hash"))) {
                    jdbc.update("update subculture_event_candidate set last_seen_at=now() where id=?",id);unchanged++;
                } else {
                    // Search/sort columns use the effective manually corrected view, not the fresh raw payload.
                    @SuppressWarnings("unchecked") Map<String,Object> effectiveMap=json.readValue(payload,Map.class);
                    effectiveMap.putAll(json.readValue(existing.getFirst().get("overrides_json").toString(),Map.class));
                    EventData effective=json.readValue(json.writeValueAsString(effectiveMap),EventData.class);
                    String indexedStart=effective.occurrences().stream().map(Occurrence::startDate).min(String::compareTo).orElseThrow();
                    String indexedEnd=effective.occurrences().stream().map(Occurrence::endDate).max(String::compareTo).orElseThrow();
                    // An excluded item stays excluded; a reviewed item's old snapshot is preserved.
                    jdbc.update("""
                        update subculture_event_candidate set payload_json=cast(? as jsonb),payload_hash=?,warnings_json=cast(? as jsonb),
                            name=?,subcategory=?,venue_name=?,starts_on=cast(? as date),ends_on=cast(? as date),match_key=?,
                            review_state=case when review_state='EXCLUDED' then 'EXCLUDED' else 'PENDING' end,
                            revision=revision+1,last_seen_at=now() where id=?
                        """,payload,payloadHash,warnings,effective.name(),effective.subcategory(),effective.venueName(),indexedStart,indexedEnd,match,id);
                    changed++;
                }
            }
            jdbc.update("""
                insert into subculture_collection_observation(run_id,candidate_id,payload_json,warnings_json)
                values(?,?,cast(? as jsonb),cast(? as jsonb))
                """,runId,id,payload,warnings);
        }
        String status;
        if("FAILED".equals(batch.result().searchStatus())) status="FAILED";
        else if(events.isEmpty()) status="PARTIAL".equals(batch.result().searchStatus())?"PARTIAL":"NO_RESULTS";
        else if(inserted+changed+unchanged==0) status="REJECTED_ALL";
        else status=(!rejects.isEmpty()||"PARTIAL".equals(batch.result().searchStatus()))?"PARTIAL":"SUCCESS";
        Receipt receipt=new Receipt(runId.toString(),status,inserted,changed,unchanged,rejects.size(),rejects);
        jdbc.update("update subculture_collection_run set status=?,receipt_json=cast(? as jsonb) where id=?",status,json.writeValueAsString(receipt),runId);
        return receipt;
    }

    public PageData<CandidateSummary> candidates(String state,int page,int size) {
        paging(page,size);
        if(!Set.of("ALL","PENDING","REVIEWED","EXCLUDED").contains(state)) throw ApiException.badRequest("검토 상태 오류");
        String where="ALL".equals(state)?"":" where review_state=?";
        Long total="ALL".equals(state)?jdbc.queryForObject("select count(*) from subculture_event_candidate",Long.class)
            :jdbc.queryForObject("select count(*) from subculture_event_candidate"+where,Long.class,state);
        Object[] params="ALL".equals(state)?new Object[]{size,page*size}:new Object[]{state,size,page*size};
        List<CandidateSummary> items=jdbc.query("select * from subculture_event_candidate"+where+" order by last_seen_at desc,id desc limit ? offset ?",(rs,row)->summary(rs),params);
        return new PageData<>(items,page,size,total==null?0:total);
    }
    public CandidateDetail detail(long id) {
        List<CandidateDetail> values=jdbc.query("select * from subculture_event_candidate where id=?",(rs,row)->detail(rs),id);
        if(values.isEmpty()) throw ApiException.notFound("수집 후보를 찾을 수 없습니다.");return values.getFirst();
    }
    @Transactional
    public CandidateDetail review(long id,ReviewInput input) {
        if(input==null || input.reviewState()==null || !Set.of("PENDING","REVIEWED","EXCLUDED").contains(input.reviewState())
            || input.note()==null || input.note().length()>2000) throw ApiException.badRequest("검토 상태/메모를 확인하세요.");
        int changed=jdbc.update("""
            update subculture_event_candidate set review_state=?,review_note=?,revision=revision+1,
                reviewed_payload_json=case when ?='REVIEWED' then payload_json || overrides_json else reviewed_payload_json end,
                reviewed_at=case when ?='REVIEWED' then now() else reviewed_at end
            where id=? and revision=?
            """,input.reviewState(),input.note(),input.reviewState(),input.reviewState(),id,input.revision());
        if(changed!=1) throw ApiException.conflict("수집 결과 또는 검토 상태가 변경되었습니다. 새로고침 후 확인하세요.");
        return detail(id);
    }
    public PageData<RunSummary> runs(int page,int size) {
        paging(page,size);
        List<RunSummary> items=jdbc.query("select * from subculture_collection_run order by received_at desc,id desc limit ? offset ?",(rs,row)->new RunSummary(
            rs.getString("id"),rs.getString("status"),rs.getString("execution_mode"),instant(rs,"started_at"),instant(rs,"finished_at"),
            json.readValue(rs.getString("scope_json"),Scope.class),rs.getString("summary"),json.readValue(rs.getString("receipt_json"),Receipt.class)),size,page*size);
        Long total=jdbc.queryForObject("select count(*) from subculture_collection_run",Long.class);
        return new PageData<>(items,page,size,total==null?0:total);
    }
    private CandidateSummary summary(ResultSet rs) throws SQLException {
        return new CandidateSummary(rs.getLong("id"),rs.getString("name"),rs.getString("subcategory"),rs.getString("venue_name"),
            rs.getString("starts_on"),rs.getString("ends_on"),rs.getString("review_state"),rs.getLong("revision"),
            rs.getObject("possible_duplicate_of",Long.class),instant(rs,"last_seen_at"));
    }
    private CandidateDetail detail(ResultSet rs) throws SQLException {
        String reviewed=rs.getString("reviewed_payload_json");
        return new CandidateDetail(rs.getLong("id"),rs.getLong("revision"),rs.getString("review_state"),json.readValue(rs.getString("payload_json"),EventData.class),
            reviewed==null?null:json.readValue(reviewed,EventData.class),Arrays.asList(json.readValue(rs.getString("warnings_json"),String[].class)),
            rs.getString("review_note"),rs.getObject("possible_duplicate_of",Long.class),instant(rs,"first_seen_at"),instant(rs,"last_seen_at"));
    }
    private static String instant(ResultSet rs,String column) throws SQLException { return rs.getTimestamp(column).toInstant().toString(); }
    private static void paging(int page,int size) { if(page<0||page>100000||size<1||size>100) throw ApiException.badRequest("page/size 범위 오류"); }
}
