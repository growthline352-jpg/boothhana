package com.boothhana.collection;

import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;

/** The external catalogue is isolated from commerce tables. All authority checks live on server routes. */
@Service
@Transactional(readOnly=true)
public class CatalogService {
    private final JdbcTemplate db;
    private final JsonMapper json;
    private final CatalogMediaService media;
    private final CatalogIdentityIndex identities;
    public CatalogService(JdbcTemplate db,JsonMapper json,CatalogMediaService media) { this.db=db;this.json=json;this.media=media;this.identities=new CatalogIdentityIndex(json); }
    String encode(Object v) { return json.writeValueAsString(v); }
    <T> T decode(Object v,Class<T> type) { return json.readValue(v.toString(),type); }
    @SuppressWarnings("unchecked")
    <T> T effective(Map<String,Object> row,Class<T> type) {
        Map<String,Object> data=decode(row.get("payload_json"),Map.class);
        data.putAll(decode(row.getOrDefault("overrides_json","{}"),Map.class));
        return decode(encode(data),type);
    }
    Map<String,Object> one(String sql,Object... values) {
        var rows=db.queryForList(sql,values);if(rows.isEmpty()) throw ApiException.notFound("수집 대상을 찾을 수 없습니다.");return rows.getFirst();
    }
    static long num(Map<String,Object> row,String key) { return ((Number)row.get(key)).longValue(); }
    static String instant(Object value) { return value instanceof Timestamp t?t.toInstant().toString():Objects.toString(value,""); }
    static void paging(int page,int size) { if(page<0||page>100000||size<1||size>100) throw ApiException.badRequest("페이지 범위 오류"); }
    private void lock() {
        db.execute("SET LOCAL lock_timeout='4s'");
        db.execute((ConnectionCallback<Void>) c->{try(var q=c.prepareStatement("select pg_advisory_xact_lock(728194302)")){q.execute();return null;}});
    }
    private Map<String,Object> requireRunning(String id) {
        var row=one("select * from subculture_pipeline_run where id=? for update",UUID.fromString(id));
        if(!"RUNNING".equals(row.get("state"))) throw ApiException.conflict("종료된 배치입니다. 다시 시작 또는 이어서 실행하세요.");
        db.update("update subculture_pipeline_run set heartbeat_at=now() where id=?",UUID.fromString(id));return row;
    }
    @Transactional(timeout=30)
    public Map<String,Object> start(PipelineInput input) {
        try { UUID.fromString(input.runId());CollectionRules.date(input.weekKey());
            if(input.scope()==null||!CatalogTaxonomy.SCOPES.contains(input.scope().region())||!"Asia/Seoul".equals(input.scope().timezone())||
                CollectionRules.date(input.scope().startDate()).isAfter(CollectionRules.date(input.scope().endDate()))||
                java.time.temporal.ChronoUnit.DAYS.between(CollectionRules.date(input.scope().startDate()),CollectionRules.date(input.scope().endDate()))>365) throw new IllegalArgumentException();
        } catch(RuntimeException e) { throw ApiException.badRequest("주간 배치 ID/범위 오류"); }
        lock();
        db.update("update subculture_pipeline_run set state='FAILED',finished_at=now() where state='RUNNING' and heartbeat_at<now()-interval '2 hours'");
        var existing=db.queryForList("select * from subculture_pipeline_run where id=?",UUID.fromString(input.runId()));
        if(!existing.isEmpty() && (!input.scope().equals(decode(existing.getFirst().get("scope_json"),Scope.class))||!input.weekKey().equals(existing.getFirst().get("week_key").toString())))
            throw ApiException.conflict("동일 배치 ID의 검색 범위를 바꿀 수 없습니다.");
        if(!existing.isEmpty() && "SUCCESS".equals(existing.getFirst().get("state"))) return pipeline(input.runId());
        var active=db.queryForList("select id from subculture_pipeline_run where state='RUNNING' and id<>?",UUID.fromString(input.runId()));
        if(!active.isEmpty()) throw ApiException.conflict("다른 주간 배치가 실행 중입니다.");
        db.update("""
            insert into subculture_pipeline_run(id,week_key,scope_json,state) values(?,cast(? as date),cast(? as jsonb),'RUNNING')
            on conflict(id) do update set state='RUNNING',heartbeat_at=now(),finished_at=null
            """,UUID.fromString(input.runId()),input.weekKey(),encode(input.scope()));
        return pipeline(input.runId());
    }
    public Map<String,Object> pipeline(String id) {
        var row=one("select * from subculture_pipeline_run where id=?",UUID.fromString(id));
        return Map.of("runId",row.get("id").toString(),"state",row.get("state"),"scope",decode(row.get("scope_json"),Scope.class),"startedAt",instant(row.get("started_at")),"heartbeatAt",instant(row.get("heartbeat_at")),"summary",decode(row.get("summary_json"),Map.class));
    }
    @Transactional public Map<String,Object> heartbeat(String id) { requireRunning(id);return pipeline(id); }
    @Transactional public Map<String,Object> finish(String id,PipelineFinish input) {
        if(input==null||!Set.of("SUCCESS","PARTIAL","FAILED").contains(input.state())||input.summary()==null||encode(input.summary()).length()>20000) throw ApiException.badRequest("완료 상태 오류");
        requireRunning(id);db.update("update subculture_pipeline_run set state=?,summary_json=cast(? as jsonb),finished_at=now(),heartbeat_at=now() where id=?",input.state(),encode(input.summary()),UUID.fromString(id));return pipeline(id);
    }
    public List<Map<String,Object>> eventTargets(String pipelineId,int limit) {
        if(limit<1||limit>200) throw ApiException.badRequest("행사 처리 한도 오류");
        var scope=decode(one("select scope_json from subculture_pipeline_run where id=?",UUID.fromString(pipelineId)).get("scope_json"),Scope.class);
        var rows=db.queryForList("""
            select * from subculture_event_candidate where review_state<>'EXCLUDED' and starts_on<=cast(? as date) and ends_on>=cast(? as date)
            and (possible_duplicate_of is null or review_state='REVIEWED') order by (select min(g.updated_at) from subculture_participant_progress g where g.event_id=subculture_event_candidate.id) asc nulls first,starts_on,id limit ?
            """,scope.endDate(),scope.startDate(),limit);
        return rows.stream().map(r->Map.<String,Object>of("id",num(r,"id"),"revision",num(r,"revision"),"event",effective(r,EventData.class))).toList();
    }
    public List<Map<String,Object>> salesTargets(String pipelineId,int limit) {
        if(limit<1||limit>1000) throw ApiException.badRequest("판매정보 처리 한도 오류");
        var scope=decode(one("select scope_json from subculture_pipeline_run where id=?",UUID.fromString(pipelineId)).get("scope_json"),Scope.class);
        return db.queryForList("""
            select p.* from subculture_participant p join subculture_event_candidate e on e.id=p.event_id
            left join subculture_sales s on s.participant_id=p.id where e.review_state<>'EXCLUDED' and p.review_state<>'EXCLUDED'
            and e.starts_on<=cast(? as date) and e.ends_on>=cast(? as date) and (e.possible_duplicate_of is null or e.review_state='REVIEWED')
            and (p.sales_retry_after is null or p.sales_retry_after<=now())
            order by p.sales_last_attempt_at asc nulls first,p.id limit ?
            """,scope.endDate(),scope.startDate(),limit).stream().map(p->Map.<String,Object>of("id",num(p,"id"),"eventId",num(p,"event_id"),"revision",num(p,"revision"),"participant",effective(p,Participant.class),"event",event(num(p,"event_id")))).toList();
    }
    @Transactional
    public List<Map<String,Object>> participantCursors(String pipelineId,long eventId) {
        requireRunning(pipelineId);
        var eventRow=one("select * from subculture_event_candidate where id=? for update",eventId);
        if("EXCLUDED".equals(eventRow.get("review_state"))) throw ApiException.conflict("제외된 행사");
        EventData event=effective(eventRow,EventData.class);
        var scope=decode(one("select scope_json from subculture_pipeline_run where id=?",UUID.fromString(pipelineId)).get("scope_json"),Scope.class);
        if(!CollectionRules.event(event,scope).accepted()) throw ApiException.conflict("배치 범위 밖의 행사");
        var roots=event.discoveryLinks().stream().filter(l->"PARTICIPANTS".equals(l.kind())&&l.url()!=null)
            .map(l->CatalogIdentity.canonical(l.url())).distinct().sorted().toList();
        if(roots.isEmpty()) roots=Collections.singletonList(null);
        List<Map<String,Object>> result=new ArrayList<>();
        for(String root:roots) {
            String key=CollectionRules.sha(Objects.toString(root,"AUTO"));
            db.update("insert into subculture_participant_progress(event_id,source_key,root_url,next_page_url) values(?,?,?,?) on conflict do nothing",eventId,key,root,root);
            var row=one("select * from subculture_participant_progress where event_id=? and source_key=? for update",eventId,key);
            if("COMPLETE".equals(row.get("state"))&&!pipelineId.equals(Objects.toString(row.get("last_pipeline_id"),""))) {
                db.update("update subculture_participant_progress set pass_no=pass_no+1,page_index=0,next_page_url=root_url,visited_json='[]',state='ACTIVE',revision=revision+1 where event_id=? and source_key=?",eventId,key);
                row=one("select * from subculture_participant_progress where event_id=? and source_key=?",eventId,key);
            }
            Map<String,Object> cursor=new LinkedHashMap<>();
            cursor.put("sourceKey",key);cursor.put("rootUrl",root);cursor.put("requestedUrl",row.get("next_page_url"));
            cursor.put("passNo",num(row,"pass_no"));cursor.put("pageIndex",num(row,"page_index"));
            cursor.put("revision",num(row,"revision"));cursor.put("state",row.get("state"));
            cursor.put("updatedAt",instant(row.get("updated_at")));result.add(cursor);
        }
        // Prefer unfinished cursors before a newly restarted refresh pass; tie-break by oldest attempt.
        result.sort(Comparator.comparing((Map<String,Object> r)->((Number)r.get("pageIndex")).intValue()==0)
            .thenComparing(r->r.get("updatedAt").toString()).thenComparing(r->r.get("sourceKey").toString()));
        return result;
    }
    @Transactional public Map<String,Object> salesAttempt(String pipelineId,long participantId,SalesAttemptInput input) {
        requireRunning(pipelineId);
        if(input==null||!Set.of("STARTED","FAILED").contains(input.state())||input.reason()==null||input.reason().length()>300)
            throw ApiException.badRequest("조사 시도 상태 오류");
        var p=one("select * from subculture_participant where id=? for update",participantId);
        if("EXCLUDED".equals(p.get("review_state"))) throw ApiException.conflict("제외된 참가자");
        var scope=decode(one("select scope_json from subculture_pipeline_run where id=?",UUID.fromString(pipelineId)).get("scope_json"),Scope.class);
        var eventRow=one("select * from subculture_event_candidate where id=?",num(p,"event_id"));
        if("EXCLUDED".equals(eventRow.get("review_state"))||!CollectionRules.event(effective(eventRow,EventData.class),scope).accepted()) throw ApiException.conflict("배치 범위 밖의 행사");
        if("STARTED".equals(input.state())) db.update("update subculture_participant set sales_last_attempt_at=now(),sales_attempt_status='RUNNING',sales_retry_after=now()+interval '2 hours' where id=?",participantId);
        else if("RUNNING".equals(p.get("sales_attempt_status"))) finishSalesAttempt(participantId,"FAILED",false);
        return Map.of("participantId",participantId,"state",input.state());
    }
    private void finishSalesAttempt(long id,String status,boolean success) {
        if("FAILED".equals(status)) db.update("update subculture_participant set sales_last_attempt_at=now(),sales_attempt_status='FAILED',sales_failure_count=sales_failure_count+1,sales_retry_after=now()+least(7,power(2,least(sales_failure_count,3))) * interval '1 day' where id=?",id);
        else db.update("update subculture_participant set sales_last_attempt_at=now(),sales_attempt_status=?,sales_failure_count=0,sales_retry_after=now()+interval '1 day',sales_last_success_at=case when ? then now() else sales_last_success_at end where id=?",status,success,id);
    }
    public EventData event(long id) { return effective(one("select * from subculture_event_candidate where id=?",id),EventData.class); }
    @Transactional public Map<String,Object> syncEventAssets(String pipelineId) {
        requireRunning(pipelineId);int count=0;
        // Includes older records in scope as well as this week's discoveries.
        for(var t:eventTargets(pipelineId,200)) {
            EventData e=(EventData)t.get("event");long id=(Long)t.get("id");
            for(var banner:e.banners()) { media.register(id,null,null,new Image("BANNER",banner.imageUrl(),banner.pageUrl(),banner.rightsEvidence(),e.name()));count++; }
            for(var link:e.discoveryLinks()) {
                if("FLOOR_PLAN".equals(link.kind()) && link.url()!=null && java.net.URI.create(link.url()).getPath().toLowerCase(java.util.Locale.ROOT).matches(".*\\.(png|jpe?g|webp|gif)$")) {
                    media.register(id,null,null,new Image("FLOOR_PLAN",link.url(),e.sources().getFirst().url(),null,Objects.toString(link.note(),"배치도")));count++;
                }
            }
        }
        return Map.of("registeredCandidates",count);
    }
    @Transactional(timeout=45)
    public StageReceipt ingest(StageBatch b) { return ingest(b,false); }
    @Transactional(timeout=45)
    public StageReceipt ingestManual(StageBatch b) { return ingest(b,true); }
    private StageReceipt ingest(StageBatch b,boolean manualImport) {
        try { if(manualImport) CatalogRules.manualStage(b); else CatalogRules.stage(b); }
        catch(RuntimeException e) { throw ApiException.badRequest("단계별 JSON 형식 또는 대상/출처를 확인하세요."); }
        String payload=encode(b),hash=CollectionRules.sha(payload);UUID run=UUID.fromString(b.runId());lock();
        var old=db.queryForList("select request_hash,request_json,receipt_json from subculture_stage_run where id=?",run);
        if(!old.isEmpty()) {
            var saved=old.getFirst();
            // v4 records predate optional identity/cursor properties. Compare the typed request
            // before refusing an otherwise identical legacy replay; never accept changed contents.
            boolean same=hash.equals(saved.get("request_hash")) || "4".equals(b.schemaVersion()) && encode(decode(saved.get("request_json"),StageBatch.class)).equals(payload);
            if(!same) throw ApiException.conflict("같은 작업 ID에 다른 결과를 보낼 수 없습니다.");
            return decode(saved.get("receipt_json"),StageReceipt.class);
        }
        var pipeline=requireRunning(b.pipelineId());Scope scope=decode(pipeline.get("scope_json"),Scope.class);
        var e=one("select * from subculture_event_candidate where id=? for update",b.eventId());
        if("EXCLUDED".equals(e.get("review_state"))) throw ApiException.conflict("제외된 행사에는 수집하지 않습니다.");
        EventData event=effective(e,EventData.class);
        if(!CollectionRules.event(event,scope).accepted()) throw ApiException.conflict("배치 대상 기간 밖의 행사입니다.");
        if("PARTICIPANTS".equals(b.stage())) { if(num(e,"revision")!=b.targetRevision()) throw ApiException.conflict("행사 정보가 변경되었습니다. 다음 배치에서 다시 확인하세요."); }
        else { var p=one("select * from subculture_participant where id=? and event_id=? for update",b.participantId(),b.eventId());
            if(num(p,"revision")!=b.targetRevision()||"EXCLUDED".equals(p.get("review_state"))) throw ApiException.conflict("참가자 정보가 변경/제외되었습니다."); }
        Map<String,Object> cursorRow=null;
        if(b.cursor()!=null) {
            var c=b.cursor();cursorRow=one("select * from subculture_participant_progress where event_id=? and source_key=? for update",b.eventId(),c.sourceKey());
            if(num(cursorRow,"revision")!=c.revision()||num(cursorRow,"pass_no")!=c.passNo()||num(cursorRow,"page_index")!=c.pageIndex()||!Objects.equals(cursorRow.get("next_page_url"),c.requestedUrl())||"COMPLETE".equals(cursorRow.get("state")))
                throw ApiException.conflict("명단 진행 지점이 변경되었습니다. 새 커서로 이어서 실행하세요.");
        }
        int inserted=0,changed=0,unchanged=0,rejected=0;List<String> issues=new ArrayList<>();List<Long> ids=new ArrayList<>();
        if(manualImport) issues.add("MANUAL_IMPORT: CLI 웹 검색 관측 없이 검토형 데이터로 저장됨");
        if("PARTICIPANTS".equals(b.stage())) {
            Set<Long> seen=new HashSet<>();
            var participantRows=db.queryForList("select * from subculture_participant where event_id=? for update",b.eventId());
            for(Participant p:b.result().participants()) {
                try { CatalogRules.participant(p);CatalogRules.locationDates(p,event); }
                catch(RuntimeException ex) { rejected++;issues.add("참가항목 제외: "+Objects.toString(p==null?null:p.registrationName(),"이름 없음"));continue; }
                var keys=CatalogIdentity.participantKeys(p);Map<String,Object> found;
                try { found=identities.match(participantRows,keys,CatalogIdentity.known(p.identity(),p.sourceEntryId(),p.sources()),false); }
                catch(ApiException ambiguous) {rejected++;issues.add("참가자 식별 검토 필요: "+p.registrationName());continue;}
                String key=keys.getFirst(),data=encode(p),digest=CollectionRules.sha(data);long id;
                if(found==null) {
                    id=Objects.requireNonNull(db.queryForObject("insert into subculture_participant(event_id,identity_key,identity_aliases,registration_name,payload_json,payload_hash) values(?,?,cast(? as jsonb),?,cast(? as jsonb),?) returning id",Long.class,b.eventId(),key,encode(keys),p.registrationName(),data,digest));inserted++;
                } else {
                    id=num(found,"id");
                    if(!seen.add(id)) {rejected++;issues.add("같은 페이지의 참가 항목 중복");continue;}
                    db.update("update subculture_participant set identity_aliases=cast(? as jsonb) where id=?",encode(CatalogIdentity.union(identities.aliases(found,false),keys)),id);
                    if(digest.equals(found.get("payload_hash"))) {db.update("update subculture_participant set last_seen_at=now() where id=?",id);unchanged++;}
                    else {db.update("""
                        update subculture_participant set payload_json=cast(? as jsonb),payload_hash=?,registration_name=coalesce(overrides_json->>'registrationName',?),last_seen_at=now(),revision=revision+1,
                        review_state=case when review_state='EXCLUDED' then 'EXCLUDED' else 'PENDING' end where id=?
                        """,data,digest,p.registrationName(),id);changed++;}
                    participantRows.remove(found);
                }
                seen.add(id);participantRows.add(one("select * from subculture_participant where id=?",id));
                ids.add(id);
                syncMembers(id,effective(one("select * from subculture_participant where id=?",id),Participant.class));
                for(Image image:p.images()) media.register(b.eventId(),id,null,image);
            }
        } else {
            Sales latest=b.result().sales();
            if(latest!=null) try {CatalogRules.sales(latest);} catch(RuntimeException ex) {throw ApiException.badRequest("판매정보·상품·가격·출처의 형식을 확인하세요.");}
            if(!"FAILED".equals(b.result().searchStatus())) {
                var previous=db.queryForList("select * from subculture_sales where participant_id=? for update",b.participantId());
                var productRows=db.queryForList("select * from subculture_catalog_product where participant_id=? order by id for update",b.participantId());
                Set<Long> seen=new HashSet<>();
                if(latest!=null) for(ProductData p:latest.products()) {
                    var keys=CatalogIdentity.productKeys(p);Map<String,Object> existing;
                    try {existing=identities.match(productRows,keys,CatalogIdentity.known(p.identity(),p.sourceEntryId(),p.sources()),true);}
                    catch(ApiException ambiguous) {rejected++;issues.add("상품 식별 검토 필요: "+p.name());continue;}
                    Long product;
                    if(existing==null) {
                        product=db.queryForObject("insert into subculture_catalog_product(participant_id,identity_key,identity_aliases,name,payload_json,last_seen_stage_id) values(?,?,cast(? as jsonb),?,cast(? as jsonb),?) returning id",Long.class,b.participantId(),keys.getFirst(),encode(keys),p.name(),encode(p),run);
                    } else {
                        product=num(existing,"id");
                        if(!seen.add(product)) {rejected++;issues.add("판매 목록 내 동일 상품 중복 제외");continue;}
                        db.update("update subculture_catalog_product set name=?,payload_json=cast(? as jsonb),identity_aliases=cast(? as jsonb),last_seen_at=now(),last_seen_stage_id=? where id=?",p.name(),encode(p),encode(CatalogIdentity.union(identities.aliases(existing,true),keys)),run,product);
                        productRows.remove(existing);
                    }
                    seen.add(product);productRows.add(one("select * from subculture_catalog_product where id=?",product));
                    for(Image image:p.images()) media.register(b.eventId(),b.participantId(),product,image);
                }
                productRows.sort(Comparator.comparingLong(r->num(r,"id")));
                Sales prior=previous.isEmpty()?null:decode(previous.getFirst().get("payload_json"),Sales.class);
                Sales snapshot=CatalogAccumulation.snapshot(latest,prior,productRows.stream().map(r->decode(r.get("payload_json"),ProductData.class)).toList());
                if(snapshot!=null) {
                    if(snapshot.products().size()>5000) throw ApiException.conflict("누적 상품 5000개 한도: 관리자가 범위를 확인하세요.");
                    Map<String,ProductCheck> checks=new LinkedHashMap<>();
                    for(var row:productRows) checks.put(Long.toString(num(row,"id")),CatalogAccumulation.check(seen.contains(num(row,"id")),instant(row.get("last_seen_at"))));
                    String data=encode(snapshot),digest=CollectionRules.sha(data),checkData=encode(checks);
                    if(previous.isEmpty()) {
                        db.update("insert into subculture_sales(participant_id,payload_json,payload_hash,latest_payload_json,latest_stage_id,product_checks_json) values(?,cast(? as jsonb),?,cast(? as jsonb),?,cast(? as jsonb))",b.participantId(),data,digest,latest==null?null:encode(latest),run,checkData);inserted++;
                    } else {
                        var oldSales=previous.getFirst();
                        boolean changedSnapshot=!digest.equals(oldSales.get("payload_hash"))||!checks.equals(productChecks(oldSales.get("product_checks_json")));
                        db.update("""
                            update subculture_sales set payload_json=cast(? as jsonb),payload_hash=?,latest_payload_json=cast(? as jsonb),latest_stage_id=?,product_checks_json=cast(? as jsonb),
                            collected_at=case when ? then now() else collected_at end,revision=revision+case when ? then 1 else 0 end,
                            review_state=case when review_state='EXCLUDED' then 'EXCLUDED' when ? then 'PENDING' else review_state end where participant_id=?
                            """,data,digest,latest==null?null:encode(latest),run,checkData,latest!=null,changedSnapshot,changedSnapshot,b.participantId());
                        if(changedSnapshot) changed++;else unchanged++;
                    }
                }
                if(latest!=null) for(Image image:latest.images()) media.register(b.eventId(),b.participantId(),null,image);
            }
            finishSalesAttempt(b.participantId(),"FAILED".equals(b.result().searchStatus())?"FAILED":latest==null?"NO_RESULTS":b.result().searchStatus(),latest!=null);
        }
        if(cursorRow!=null) {
            @SuppressWarnings("unchecked") List<String> visited=decode(cursorRow.get("visited_json"),List.class);
            var step=CatalogCursorRules.advance(b.cursor(),b.result().coverage(),visited,"FAILED".equals(b.result().searchStatus()));
            if(step.warning()!=null) issues.add(step.warning());
            db.update("update subculture_participant_progress set next_page_url=?,page_index=?,state=?,visited_json=cast(? as jsonb),last_pipeline_id=?,updated_at=now(),revision=revision+1 where event_id=? and source_key=?",step.nextPageUrl(),step.pageIndex(),step.state(),encode(step.visited()),UUID.fromString(b.pipelineId()),b.eventId(),b.cursor().sourceKey());
        }
        String status="FAILED".equals(b.result().searchStatus())?"FAILED":(!issues.isEmpty()||rejected>0||"PARTIAL".equals(b.result().searchStatus())||"PARTIAL".equals(b.result().coverage().completeness())?"PARTIAL":inserted+changed+unchanged==0?"NO_RESULTS":"SUCCESS");
        StageReceipt receipt=new StageReceipt(b.runId(),status,inserted,changed,unchanged,rejected,ids,issues);
        db.update("""
            insert into subculture_stage_run(id,pipeline_id,event_id,participant_id,stage,request_hash,request_json,coverage_json,receipt_json,status,started_at,finished_at)
            values(?,?,?,?,?,?,cast(? as jsonb),cast(? as jsonb),cast(? as jsonb),?,?,?)
            """,run,UUID.fromString(b.pipelineId()),b.eventId(),b.participantId(),b.stage(),hash,payload,encode(b.result().coverage()),encode(receipt),status,Timestamp.from(Instant.parse(b.startedAt())),Timestamp.from(Instant.parse(b.finishedAt())));
        return receipt;
    }
    private void syncMembers(long id,Participant participant) {
        // Current relation links match the effective record; historical raw membership remains in stage requests.
        db.update("delete from subculture_participant_member where participant_id=?",id);
        for(Member m:participant.members()) {
            String mk=CollectionRules.sha(CollectionRules.normalize(m.name())+"\u001f"+Objects.toString(m.profileUrl(),"participant:"+id));
            Long member=db.queryForObject("""
                insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb))
                on conflict(identity_key) do update set name=excluded.name,profile_json=excluded.profile_json,updated_at=now() returning id
                """,Long.class,mk,m.name(),encode(m));
            db.update("insert into subculture_participant_member(participant_id,exhibitor_id) values(?,?) on conflict do nothing",id,member);
        }
    }
    public PageData<Map<String,Object>> events(int page,int size) {
        paging(page,size);
        var rows=db.queryForList("""
            select e.*,(select count(*) from subculture_participant p where p.event_id=e.id) participant_count,
            (select count(*) from subculture_sales s join subculture_participant p on p.id=s.participant_id where p.event_id=e.id) sales_count,
            (select count(*) from subculture_catalog_asset a where a.event_id=e.id and a.storage_state='STORED' and a.rights_state='APPROVED') image_count,
            exists(select 1 from subculture_catalog_publication pub where pub.event_id=e.id) published
            from subculture_event_candidate e order by e.starts_on,e.id limit ? offset ?
            """,size,page*size);
        List<Map<String,Object>> items=rows.stream().map(e->{var data=effective(e,EventData.class);return Map.<String,Object>of("id",num(e,"id"),"name",data.name(),"subcategory",data.subcategory(),"reviewState",e.get("review_state"),"participantCount",e.get("participant_count"),"salesCount",e.get("sales_count"),"storedImageCount",e.get("image_count"),"published",e.get("published"),"startDate",e.get("starts_on").toString());}).toList();
        return new PageData<>(items,page,size,Objects.requireNonNull(db.queryForObject("select count(*) from subculture_event_candidate",Long.class)));
    }
    public Map<String,Object> eventDetail(long id) {
        var row=one("select * from subculture_event_candidate where id=?",id);Map<String,Object> detail=new LinkedHashMap<>();
        detail.put("id",id);detail.put("revision",num(row,"revision"));detail.put("event",effective(row,EventData.class));detail.put("collectedEvent",decode(row.get("payload_json"),EventData.class));detail.put("overrides",decode(row.get("overrides_json"),Map.class));
        detail.put("reviewState",row.get("review_state"));detail.put("note",row.get("review_note"));detail.put("possibleDuplicateOf",row.get("possible_duplicate_of"));
        detail.put("assets",media.assets(id,null));
        detail.put("bannerSelection",media.bannerSelection(id));
        detail.put("participantProgress",db.queryForList("select root_url,next_page_url,pass_no,page_index,state,updated_at from subculture_participant_progress where event_id=? order by updated_at",id));
        var stage=db.queryForList("select stage,status,coverage_json,received_at from subculture_stage_run where event_id=? order by received_at desc limit 100",id);
        detail.put("recentStages",stage.stream().map(s->Map.of("stage",s.get("stage"),"status",s.get("status"),"coverage",decode(s.get("coverage_json"),Coverage.class),"receivedAt",instant(s.get("received_at")))).toList());
        detail.put("publication",db.queryForList("select event_revision,published_at from subculture_catalog_publication where event_id=?",id));return detail;
    }
    public PageData<ParticipantView> participants(long eventId,int page,int size,String query) {
        paging(page,size);if(query==null||query.length()>100) throw ApiException.badRequest("검색어 길이 오류");
        String q="%"+query.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
        String where=" where event_id=? and (registration_name ilike ? or ((payload_json || overrides_json)->'locations')::text ilike ?)";
        var rows=db.queryForList("select * from subculture_participant"+where+" order by registration_name,id limit ? offset ?",eventId,q,q,size,page*size);
        Long total=db.queryForObject("select count(*) from subculture_participant"+where,Long.class,eventId,q,q);
        return new PageData<>(rows.stream().map(this::participantView).toList(),page,size,total==null?0:total);
    }
    public ParticipantView participant(long id) { return participantView(one("select * from subculture_participant where id=?",id)); }
    private ParticipantView participantView(Map<String,Object> p) {
        long id=num(p,"id"),event=num(p,"event_id");
        return new ParticipantView(id,event,num(p,"revision"),p.get("review_state").toString(),effective(p,Participant.class),decode(p.get("payload_json"),Participant.class),p.get("review_note").toString(),instant(p.get("last_seen_at")),salesView(id),media.assets(event,id),decode(p.get("overrides_json"),Map.class));
    }
    private Map<String,ProductCheck> productChecks(Object value) {
        Map<String,ProductCheck> result=new LinkedHashMap<>();
        if(value==null) return result;
        Map<?,?> raw=decode(value,Map.class);raw.forEach((key,v)->result.put(key.toString(),decode(encode(v),ProductCheck.class)));
        return result;
    }
    private SalesView salesView(long participant) {
        var rows=db.queryForList("select * from subculture_sales where participant_id=?",participant);if(rows.isEmpty()) return null;
        var s=rows.getFirst();Sales view=effective(s,Sales.class);
        return new SalesView(num(s,"revision"),s.get("review_state").toString(),view,
            s.get("latest_payload_json")==null?null:decode(s.get("latest_payload_json"),Sales.class),s.get("review_note").toString(),instant(s.get("collected_at")),decode(s.get("overrides_json"),Map.class),
            identities.products(view,db.queryForList("select * from subculture_catalog_product where participant_id=? order by id",participant),productChecks(s.get("product_checks_json"))));
    }
    @Transactional public Map<String,Object> editEvent(long id,EditInput input) {
        var row=one("select * from subculture_event_candidate where id=? for update",id);
        checkEdit(row,input,Set.of("name","venueName","address","description","admission","organizer","edition","subjects","occurrences","eventFormat","discoveryLinks","warnings","subcategory","region","operationStatus"),EventData.class);
        EventData e=effective(after(row,input),EventData.class);
        String start=e.occurrences().stream().map(Occurrence::startDate).min(String::compareTo).orElseThrow(),end=e.occurrences().stream().map(Occurrence::endDate).max(String::compareTo).orElseThrow();
        if(!CollectionRules.event(e,new Scope("SEOUL_GYEONGGI","Asia/Seoul",start,end)).accepted()) throw ApiException.badRequest("행사 수정값을 확인하세요.");
        review("subculture_event_candidate","id",id,row,input,e);
        db.update("update subculture_event_candidate set name=?,subcategory=?,venue_name=?,starts_on=cast(? as date),ends_on=cast(? as date) where id=?",e.name(),e.subcategory(),e.venueName(),start,end,id);
        return eventDetail(id);
    }
    @Transactional public ParticipantView editParticipant(long id,EditInput input) {
        var row=one("select * from subculture_participant where id=? for update",id);
        checkEdit(row,input,Set.of("registrationName","kind","members","locations","subjects","officialLinks","warnings"),Participant.class);
        Participant data=effective(after(row,input),Participant.class);
        try {CatalogRules.participant(data);CatalogRules.locationDates(data,event(num(row,"event_id")));} catch(RuntimeException e) {throw ApiException.badRequest("참가정보 수정값 오류");}
        review("subculture_participant","id",id,row,input,data);
        db.update("update subculture_participant set registration_name=? where id=?",data.registrationName(),id);
        syncMembers(id,data);return participant(id);
    }
    @Transactional public ParticipantView editSales(long id,EditInput input) {
        var row=one("select * from subculture_sales where participant_id=? for update",id);
        checkEdit(row,input,Set.of("summary","evidenceScope","categories","subjects","salesMethod","products","warnings"),Sales.class);
        Sales data=effective(after(row,input),Sales.class);
        try {CatalogRules.salesSnapshot(data);} catch(RuntimeException e) {throw ApiException.badRequest("판매정보 수정값 오류");}
        review("subculture_sales","participant_id",id,row,input,data);
        if("REVIEWED".equals(input.reviewState())) db.update("update subculture_sales set reviewed_product_checks_json=product_checks_json where participant_id=?",id);
        return participant(id);
    }
    private <T> void checkEdit(Map<String,Object> row,EditInput input,Set<String> fields,Class<T> type) {
        try {CatalogRules.edit(input,fields);effective(after(row,input),type);} catch(RuntimeException e) {throw ApiException.badRequest("편집 입력 형식 오류");}
        if(num(row,"revision")!=input.revision()) throw ApiException.conflict("다른 수집/편집이 반영되었습니다. 다시 확인하세요.");
    }
    @SuppressWarnings("unchecked") private Map<String,Object> after(Map<String,Object> row,EditInput input) {
        var result=new LinkedHashMap<>(row);Map<String,Object> overrides=decode(row.get("overrides_json"),Map.class);
        // Submitted fields replace those fields; untouched overrides survive collection and review changes.
        result.put("overrides_json",encode(CatalogReviewRules.apply(overrides,input)));return result;
    }
    private void review(String table,String key,long id,Map<String,Object> row,EditInput input,Object data) {
        // table/key are internal constants, never supplied by the client.
        String overrides=after(row,input).get("overrides_json").toString();
        db.update("update "+table+" set overrides_json=cast(? as jsonb),review_state=?,review_note=?,revision=revision+1,reviewed_payload_json=case when ?='REVIEWED' then cast(? as jsonb) else reviewed_payload_json end where "+key+"=?",overrides,input.reviewState(),input.note(),input.reviewState(),encode(data),id);
        db.update("insert into subculture_catalog_review_history(target_type,target_id,before_json,after_json,actor_id) values(?,?,cast(? as jsonb),cast(? as jsonb),?)",table.replace("subculture_",""),id,encode(Map.of("overrides",decode(row.get("overrides_json"),Map.class),"state",row.get("review_state"),"note",row.get("review_note"))),encode(input),reviewActor());
    }
    private Long reviewActor() {
        var auth=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if(auth==null||!auth.isAuthenticated()||auth instanceof org.springframework.security.authentication.AnonymousAuthenticationToken)return null;
        var rows=db.queryForList("select id from app_user where kakao_subject=?",auth.getName());
        return rows.isEmpty()?null:((Number)rows.getFirst().get("id")).longValue();
    }
    public PageData<Map<String,Object>> pipelineRuns(int page,int size) {
        paging(page,size);var rows=db.queryForList("select * from subculture_pipeline_run order by started_at desc limit ? offset ?",size,page*size);
        var items=rows.stream().map(r->pipeline(r.get("id").toString())).toList();
        return new PageData<>(items,page,size,Objects.requireNonNull(db.queryForObject("select count(*) from subculture_pipeline_run",Long.class)));
    }
}
