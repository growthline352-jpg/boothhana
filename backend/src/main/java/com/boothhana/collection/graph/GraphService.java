package com.boothhana.collection.graph;

import com.boothhana.api.ApiException;
import com.boothhana.collection.CollectionRules;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.collection.graph.GraphModels.*;

/** Durable extraction/review queue. Collector authentication never supplies a pretend app_user. */
@Service @ConditionalOnProperty(name="app.collection.graph.enabled",havingValue="true")
@Transactional(readOnly=true)
public class GraphService {
 public static final String MODEL="gpt-6.1-sol";
 private static final Set<String> KINDS=Set.of("DISCOVERY","EVENT","PARTICIPANTS","SALES","CREATOR","CHARACTERS","RELATIONS");
 private final JdbcTemplate db;private final JsonMapper json;private final GraphProjection projection;private final GraphImages images;private final GraphIdentity identities;
 public GraphService(JdbcTemplate db,JsonMapper json,GraphProjection projection,GraphImages images,GraphIdentity identities){this.db=db;this.json=json;this.projection=projection;this.images=images;this.identities=identities;}
 public String encode(Object x){return json.writeValueAsString(x);}
 @SuppressWarnings("unchecked") public Map<String,Object> decode(Object x){return x==null?Map.of():json.readValue(x.toString(),Map.class);}
 static Object sorted(Object x){if(x instanceof Map<?,?> m){var result=new TreeMap<String,Object>();m.forEach((k,v)->result.put(k.toString(),sorted(v)));return result;}if(x instanceof List<?> l)return l.stream().map(GraphService::sorted).toList();return x;}
 String hash(Object x){return CollectionRules.sha(encode(sorted(x)));}
 static long number(Object x){return x instanceof Number n?n.longValue():Long.parseLong(x.toString());}
 static String text(Object x){return Objects.toString(x,"");}
 static void require(boolean ok,String message){if(!ok)throw ApiException.badRequest(message);}
 private Map<String,Object> one(String sql,Object...args){var rows=db.queryForList(sql,args);if(rows.isEmpty())throw ApiException.notFound("수집 대상이 없습니다.");return rows.getFirst();}

 @Transactional public Map<String,Object> seed(Seed in){
  require(in!=null&&KINDS.contains(in.kind())&&in.targetId()!=null&&in.targetId().length()<=200&&in.input()!=null&&in.generation()!=null&&in.generation().length()<=100,"작업 형식을 확인하세요.");
  require(encode(in.input()).length()<=50000,"작업 입력이 너무 큽니다.");
  try{
   if(in.input().containsKey("imageOffset")||in.input().containsKey("analysisParent")){
    require("CHARACTERS".equals(in.kind())&&in.input().containsKey("analysisParent"),"이미지 묶음 작업 형식 오류");UUID.fromString(text(in.input().get("analysisParent")));
    for(String key:List.of("imageOffset","imageTotal","productRevision"))require(in.input().get(key) instanceof Integer||in.input().get(key) instanceof Long,"이미지 묶음 범위는 정수여야 합니다.");
    long offset=number(in.input().get("imageOffset")),total=number(in.input().get("imageTotal"));require(offset>=0&&offset%4==0&&total>4&&offset<total&&number(in.input().get("productRevision"))>0,"이미지 묶음 범위 오류");
   }
   if("CHARACTERS".equals(in.kind()))UUID.fromString(in.targetId());
   else if(!"DISCOVERY".equals(in.kind()))require(Long.parseLong(in.targetId())>0,"대상 ID 오류");
   else{var scope=GraphProjection.map(in.input().get("scope"));require("SEOUL_GYEONGGI".equals(scope.get("region"))&&"Asia/Seoul".equals(scope.get("timezone")),"발견 지역 오류");var a=java.time.LocalDate.parse(text(scope.get("startDate")));var b=java.time.LocalDate.parse(text(scope.get("endDate")));require(!a.isAfter(b)&&java.time.temporal.ChronoUnit.DAYS.between(a,b)<=365,"발견 기간 오류");}
  }catch(IllegalArgumentException|java.time.format.DateTimeParseException ex){throw ApiException.badRequest("작업 대상 형식 오류");}
  // A live refresh must not bypass an unfinished historical import and announce old goods.
  if(!in.baseline()){
   var baseline=db.queryForList("select id,state from collection_job where kind=? and target_id=? and baseline and state in ('PENDING','RUNNING','VERIFYING','WAITING') order by created_at,id limit 1",in.kind(),in.targetId());
   if(!baseline.isEmpty())return baseline.getFirst();
  }
  String key=hash(List.of(in.kind(),in.targetId(),in.input(),in.generation(),in.baseline()));
  String active=hash(List.of(in.kind(),in.targetId(),in.input(),in.baseline()));
  db.update("insert into collection_job(id,kind,target_id,input_json,dedupe_key,baseline,active_key) values(?,?,?,cast(? as jsonb),?,?,?) on conflict do nothing",UUID.randomUUID(),in.kind(),in.targetId(),encode(in.input()),key,in.baseline(),active);
  return one("select id,state from collection_job where dedupe_key=? or (active_key=? and state in ('PENDING','RUNNING','VERIFYING','WAITING')) order by (dedupe_key=?) desc limit 1",key,active,key);
 }
 /** Stable keyset backfill; all legacy IDs and published snapshots remain in place. */
 @Transactional public Map<String,Object> bootstrap(Bootstrap in){
  require(in!=null&&in.runId()!=null&&in.afterId()>=0&&in.size()>0&&in.size()<=200,"이전 범위를 확인하세요.");
  var rows=db.queryForList("select id,revision from subculture_event_candidate where id>? and review_state<>'EXCLUDED' and not publication_withdrawn and subcategory in ("+com.boothhana.interests.SubcultureScope.SQL+") order by id limit ?",in.afterId(),in.size()+1);
  long cursor=in.afterId();int count=0;
  for(var row:rows.stream().limit(in.size()).toList()){
   cursor=number(row.get("id"));var job=seed(new Seed("EVENT",Long.toString(cursor),Map.of(),true,in.runId()+":"+row.get("revision")));
   db.update("insert into collection_migration(run_id,source_kind,source_id,source_revision,job_id) values(?,'EVENT',?,?,?) on conflict do nothing",in.runId(),cursor,row.get("revision"),job.get("id"));count++;
  }
  return Map.of("afterId",cursor,"hasMore",rows.size()>in.size(),"queued",count);
 }
 @Transactional public Map<String,Object> claim(){
  var rows=db.queryForList("select * from collection_job where state in ('PENDING','WAITING','RUNNING','VERIFYING') and available_at<=now() and (lease_until is null or lease_until<now()) order by available_at,created_at,id for update skip locked limit 1");
  if(rows.isEmpty())return Map.of("empty",true);
  var row=rows.getFirst();UUID id=(UUID)row.get("id"),token=UUID.randomUUID();
  Map<String,Object> context;
  try{context=context(row,false);}catch(ApiException ex){if(ex.status.value()!=404&&ex.status.value()!=409)throw ex;db.update("update collection_job set state='STALE',lease_token=null,lease_until=null,last_error='대상 제외 또는 삭제',updated_at=now() where id=?",id);return Map.of("empty",false,"skipped",id);}
  if(Boolean.FALSE.equals(GraphProjection.map(context.get("publication")).get("active"))){db.update("update collection_job set state='STALE',lease_token=null,lease_until=null,last_error='작가 공개 철회',updated_at=now() where id=?",id);return Map.of("empty",false,"skipped",id);}
  if(images.plan(row,context,s->seed(s)))return Map.of("empty",false,"skipped",id);
  var saved=db.queryForList("select e.* from collection_extraction e where job_id=? and not exists(select 1 from collection_verdict v where v.extraction_id=e.id) order by created_at desc limit 1",id);
  String state=saved.isEmpty()?"RUNNING":"VERIFYING";
  db.update("update collection_job set state=?,lease_token=?,lease_until=now()+interval '30 minutes',attempts=attempts+1,updated_at=now() where id=?",state,token,id);
  var result=new LinkedHashMap<String,Object>();result.put("id",id);result.put("kind",row.get("kind"));result.put("targetId",row.get("target_id"));result.put("input",decode(row.get("input_json")));result.put("baseline",row.get("baseline"));result.put("leaseToken",token);result.put("context",context);result.put("contextHash",hash(context));
  result.put("previousReview",row.get("last_error"));
  if(!saved.isEmpty()){var e=saved.getFirst();result.put("extraction",Map.of("id",e.get("id"),"result",decode(e.get("result_json")),"resultHash",e.get("result_hash"),"contextHash",e.get("context_hash"),"context",decode(e.get("context_json")),"audit",decode(e.get("audit_json"))));}
  return result;
 }
 /** Recurring discovery uses date windows, never a selected fandom list or a total-call ceiling. */
 @Transactional public Map<String,Object> refresh(Bootstrap in){
  require(in!=null&&in.afterId()>=0&&in.size()>0&&in.size()<=200,"갱신 범위 오류");
  var now=java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Seoul"));var today=now.toLocalDate();String cycle=today+":"+(now.getHour()/6);
  if(in.afterId()==0)for(int days=0;days<90;days+=7){var start=today.plusDays(days);seed(new Seed("DISCOVERY",start.toString(),Map.of("scope",Map.of("region","SEOUL_GYEONGGI","timezone","Asia/Seoul","startDate",start.toString(),"endDate",start.plusDays(6).toString())),false,cycle));}
  var rows=db.queryForList("select id from subculture_event_candidate where id>? and ends_on>=cast(? as date) and review_state<>'EXCLUDED' and not publication_withdrawn and subcategory in ("+com.boothhana.interests.SubcultureScope.SQL+") order by id limit ?",in.afterId(),today.minusDays(1).toString(),in.size()+1);long after=in.afterId();
  for(var row:rows.stream().limit(in.size()).toList()){after=number(row.get("id"));seed(new Seed("EVENT",Long.toString(after),Map.of(),false,cycle));}
  return Map.of("afterId",after,"hasMore",rows.size()>in.size());
 }
 private Map<String,Object> leased(UUID id,UUID token){var row=one("select *,lease_until>now() as lease_valid from collection_job where id=? for update",id);if(token==null||!token.equals(row.get("lease_token"))||!Boolean.TRUE.equals(row.get("lease_valid")))throw ApiException.conflict("수집 임대가 만료되거나 교체되었습니다.");return row;}
 @Transactional public Map<String,Object> refreshCreators(Bootstrap in){
  require(in!=null&&in.afterId()>=0&&in.size()>0&&in.size()<=200,"작가 갱신 범위 오류");
  String cycle=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString();
  var rows=db.queryForList("select c.id, not exists(select 1 from collection_creator_publication initial where initial.exhibitor_id=c.id) as initial_baseline from subculture_exhibitor c where c.id>? and (exists(select 1 from collection_creator_publication cp where cp.exhibitor_id=c.id and cp.active) or exists(select 1 from subculture_participant_member pm join subculture_participant p on p.id=pm.participant_id join subculture_event_candidate e on e.id=p.event_id where pm.exhibitor_id=c.id and p.review_state<>'EXCLUDED' and e.review_state<>'EXCLUDED' and not e.publication_withdrawn and e.subcategory in ("+com.boothhana.interests.SubcultureScope.SQL+"))) and not exists(select 1 from collection_creator_publication hidden where hidden.exhibitor_id=c.id and not hidden.active) order by c.id limit ?",in.afterId(),in.size()+1);long after=in.afterId();
  for(var row:rows.stream().limit(in.size()).toList()){after=number(row.get("id"));seed(new Seed("CREATOR",Long.toString(after),Map.of(),Boolean.TRUE.equals(row.get("initial_baseline")),cycle));}
  return Map.of("afterId",after,"hasMore",rows.size()>in.size());
 }
 @Transactional public Object heartbeat(UUID id,UUID token){leased(id,token);db.update("update collection_job set lease_until=now()+interval '30 minutes',updated_at=now() where id=?",id);return Map.of("renewed",true);}
 private void audit(Audit audit){require(audit!=null&&MODEL.equals(audit.model())&&(audit.webSearchObserved()||audit.sourceDocuments()!=null&&!audit.sourceDocuments().isEmpty())&&audit.openedUrls()!=null&&audit.openedUrls().size()<=500&&audit.promptVersion()!=null&&!audit.promptVersion().isBlank()&&Set.of("graph-1","graph-2","graph-3","graph-4").contains(audit.schemaVersion())&&audit.imageHashes()!=null,"모델·원문 확인 기록이 필요합니다.");audit.openedUrls().forEach(CollectionRules::url);if(audit.sourceDocuments()!=null)for(var doc:audit.sourceDocuments()){require(doc!=null&&doc.sha256()!=null&&doc.sha256().matches("[0-9a-f]{64}")&&audit.openedUrls().contains(doc.url()),"원문 스냅샷 근거 오류");CollectionRules.url(doc.url());if(doc.transportUrl()!=null){CollectionRules.url(doc.transportUrl());require(audit.openedUrls().contains(doc.transportUrl()),"원문 전송 출처 확인 누락");}try{java.time.Instant.parse(doc.capturedAt());}catch(Exception ex){throw ApiException.badRequest("원문 확인 시각 오류");}}for(String image:audit.imageHashes())require(image.matches("[0-9a-f]{64}"),"이미지 해시 오류");}
 @Transactional public Object extract(UUID id,Extraction in){
  var row=leased(id,in.leaseToken());audit(in.audit());require(in.extractionId()!=null&&in.result()!=null&&encode(in.result()).length()<=1200000,"추출 결과 형식 오류");
  var context=context(row,false);if(!hash(context).equals(in.contextHash()))throw ApiException.conflict("추출 중 대상 정보가 변경됐습니다.");
  var previous=db.queryForList("select * from collection_extraction where id=?",in.extractionId());
  if(!previous.isEmpty()){var old=previous.getFirst();if(!id.equals(old.get("job_id"))||!hash(in.result()).equals(old.get("result_hash"))||!in.contextHash().equals(old.get("context_hash")))throw ApiException.conflict("추출 ID 내용 불일치");return Map.of("id",in.extractionId(),"resultHash",old.get("result_hash"));}
  require("RUNNING".equals(row.get("state")),"이미 검토할 추출 결과가 있습니다.");
  db.update("insert into collection_extraction(id,job_id,context_hash,result_hash,result_json,context_json,audit_json) values(?,?,?,?,cast(? as jsonb),cast(? as jsonb),cast(? as jsonb))",in.extractionId(),id,in.contextHash(),hash(in.result()),encode(in.result()),encode(context),encode(in.audit()));
  db.update("update collection_job set state='VERIFYING',updated_at=now() where id=?",id);
  return Map.of("id",in.extractionId(),"resultHash",hash(in.result()));
 }
 @Transactional public Object decide(UUID id,Decision in){
  // Lost-response replay returns the committed receipt; it cannot execute a second publication.
  var done=db.queryForList("select v.receipt_json from collection_verdict v join collection_extraction e on e.id=v.extraction_id where e.job_id=? and e.id=? and e.result_hash=?",id,in.extractionId(),in.resultHash());
  if(!done.isEmpty())return decode(done.getFirst().get("receipt_json"));
  var row=leased(id,in.leaseToken());audit(in.audit());require(Set.of("APPROVE","REJECT","ENRICH").contains(in.verdict())&&in.reason()!=null&&!in.reason().isBlank()&&in.reason().length()<=2000,"검토 판정 형식 오류");
  var extraction=one("select * from collection_extraction where id=? and job_id=?",in.extractionId(),id);if(!Objects.equals(extraction.get("result_hash"),in.resultHash()))throw ApiException.conflict("검토 결과 해시가 다릅니다.");
  // Serialize graph projections with the legacy catalog writer. Recheck and lock targets before apply.
  db.queryForList("select pg_advisory_xact_lock(728194301)");
  db.queryForList("select pg_advisory_xact_lock(728194302)");
  var current=context(row,true);String verdict=in.verdict();if(!hash(current).equals(extraction.get("context_hash")))verdict="STALE";
  boolean changedPage=GraphPageBatch.changed(decode(extraction.get("result_json")),decode(row.get("input_json")),in.audit());if(changedPage)verdict="STALE";
  var decisionAudit=new LinkedHashMap<>(decode(encode(in.audit())));if(in.eventDecisions()!=null)decisionAudit.put("eventDecisions",in.eventDecisions());
  UUID decisionId=UUID.randomUUID();db.update("insert into collection_verdict(id,extraction_id,verdict,reason,audit_json) values(?,?,?,?,cast(? as jsonb))",decisionId,in.extractionId(),verdict,in.reason(),encode(decisionAudit));
  Map<String,Object> receipt;
  if(verdict.equals("APPROVE")){var value=decode(extraction.get("result_json"));
   if(in.eventDecisions()!=null&&!in.eventDecisions().isEmpty())value=reviewedDiscovery(row,value,in);
   projection.checkSources(value,in.audit().openedUrls());
   GraphPageBatch.validate(db,json,row,value,in.audit(),decode(extraction.get("audit_json")));
   if("CHARACTERS".equals(row.get("kind")))images.validateEvidence(current,value,in.audit(),decode(extraction.get("audit_json")));
   if("CHARACTERS".equals(row.get("kind")))for(var assignment:GraphProjection.maps(value.get("assignments")))if("IMAGE".equals(assignment.get("basis"))){String image=text(assignment.get("imageHash"));var originalAudit=decode(extraction.get("audit_json"));require(in.audit().imageHashes().contains(image)&&((List<?>)originalAudit.getOrDefault("imageHashes",List.of())).contains(image),"양쪽 호출에서 동일한 상품 이미지를 확인해야 합니다.");}
   receipt=projection.apply(text(row.get("kind")),text(row.get("target_id")),decode(row.get("input_json")),current,value,decisionId,(Boolean)row.get("baseline"),s->seed(s));
   var continuation=GraphPageBatch.next(decode(row.get("input_json")),value,decisionId,text(row.get("kind")));
   if(!continuation.isEmpty()){seed(new Seed(text(row.get("kind")),text(row.get("target_id")),continuation,(Boolean)row.get("baseline"),"batch:"+decisionId));receipt=new LinkedHashMap<>(receipt);receipt.put("needsEnrichment",false);receipt.put("pageRemaining",true);}
   var news=new com.boothhana.interests.InterestNews(db);boolean baseline=(Boolean)row.get("baseline");
   if(receipt.get("eventId") instanceof Number event)news.event(event.longValue(),baseline);
   if("CREATOR".equals(row.get("kind")))for(var p:db.queryForList("select id from collection_product where verdict_id=?",decisionId))news.product((UUID)p.get("id"),baseline);
   if("CHARACTERS".equals(row.get("kind"))){UUID product=UUID.fromString(text(row.get("target_id")));news.product(product,baseline);for(long event:db.queryForList("select p.event_id from collection_product cp join subculture_catalog_product g on g.id=cp.legacy_product_id join subculture_participant p on p.id=g.participant_id where cp.id=?",Long.class,product))news.event(event,baseline);}
  }
  else receipt=Map.of("verdict",verdict);
  String state=verdict.equals("APPROVE")?(Boolean.TRUE.equals(receipt.get("needsEnrichment"))?"WAITING":"COMPLETE"):verdict.equals("REJECT")?"REJECTED":verdict.equals("STALE")?"STALE":"WAITING";
  db.update("update collection_verdict set receipt_json=cast(? as jsonb) where id=?",encode(receipt),decisionId);
  db.update("update collection_job set state=?,lease_token=null,lease_until=null,available_at=now()+interval '6 hours',last_error=?,updated_at=now() where id=?",state,in.reason()+" "+encode(receipt),id);
  var jobInput=decode(row.get("input_json"));
  if(state.equals("REJECTED")&&jobInput.containsKey("analysisParent"))db.update("update collection_job set state='REJECTED',lease_token=null,lease_until=null,last_error=?,updated_at=now() where id=? and kind='CHARACTERS' and target_id=?","이미지 묶음 반려: "+in.reason(),UUID.fromString(text(jobInput.get("analysisParent"))),row.get("target_id"));
  if(state.equals("STALE")){var restart=new LinkedHashMap<>(decode(row.get("input_json")));if(changedPage)restart.remove("pageBatch");seed(new Seed(text(row.get("kind")),text(row.get("target_id")),restart,(Boolean)row.get("baseline"),changedPage?"page-restart:"+decisionId:hash(current)));}
  return receipt;
 }
 private Map<String,Object> reviewedDiscovery(Map<String,Object> job,Map<String,Object> value,Decision decision){
  require("DISCOVERY".equals(job.get("kind")),"행사별 판정은 발견 작업에만 사용할 수 있습니다.");
  var events=GraphProjection.maps(value.get("events"));require(decision.eventDecisions().size()==events.size(),"모든 행사에 독립 판정이 필요합니다.");
  var seen=new HashSet<Integer>();var approved=new ArrayList<Map<String,Object>>();
  for(var item:decision.eventDecisions()){
   require(item.index()>=0&&item.index()<events.size()&&seen.add(item.index())&&Set.of("APPROVE","ENRICH","REJECT").contains(item.verdict())&&item.reason()!=null&&!item.reason().isBlank()&&item.reason().length()<=2000,"행사별 판정 형식 오류");audit(item.audit());
   var event=events.get(item.index());
   if("APPROVE".equals(item.verdict())){projection.checkSources(event,item.audit().openedUrls());approved.add(event);}
   else if("ENRICH".equals(item.verdict())){
    var sources=GraphProjection.maps(event.get("sources"));String url=sources.stream().filter(s->"ORIGINAL".equals(s.get("access"))).map(s->text(s.get("url"))).findFirst().orElse("");require(!url.isBlank(),"보완할 행사 원문이 필요합니다.");CollectionRules.url(url);
    var input=new LinkedHashMap<String,Object>();input.put("scope",decode(job.get("input_json")).get("scope"));input.put("leadUrl",url);
    var hint=new LinkedHashMap<String,Object>();for(String key:List.of("name","edition","organizer","occurrences"))hint.put(key,event.get(key));input.put("eventHint",hint);
    var next=seed(new Seed("DISCOVERY",CollectionRules.sha(encode(hint)),input,(Boolean)job.get("baseline"),"review:"+decision.extractionId()));
    db.update("update collection_job set last_error=? where id=? and state='PENDING'",item.reason(),next.get("id"));
   }
  }
  require(!approved.isEmpty(),"승인할 행사가 없습니다.");var result=new LinkedHashMap<>(value);result.put("events",approved);return result;
 }
 @Transactional public Object fail(UUID id,Failure in){var row=leased(id,in.leaseToken());String reason=text(in.reason());require(reason.length()<=2000,"오류 설명 길이 초과");int hours=Math.min(24,1<<Math.min(5,((Number)row.get("attempts")).intValue()-1));db.update("update collection_job set state='WAITING',lease_token=null,lease_until=null,available_at=now()+(? * interval '1 hour'),last_error=?,updated_at=now() where id=?",hours,reason,id);return Map.of("retryAfterHours",hours);}
 public Object status(){return db.queryForList("select kind,state,count(*) as count,min(available_at) as next_at from collection_job group by kind,state order by kind,state");}
 private Map<String,Object> event(long id,boolean lock){var row=one("select id,revision,review_state,payload_json,overrides_json from subculture_event_candidate where id=? and review_state<>'EXCLUDED' and not publication_withdrawn"+(lock?" for update":""),id);return target(row);}
 private Map<String,Object> target(Map<String,Object> row){var result=new LinkedHashMap<String,Object>();for(String key:List.of("id","event_id","revision","review_state"))if(row.containsKey(key))result.put(key,row.get(key));var data=new LinkedHashMap<>(decode(row.get("payload_json")));data.putAll(decode(row.get("overrides_json")));result.put("data",data);return result;}
 Map<String,Object> context(Map<String,Object> job,boolean lock){String kind=text(job.get("kind")),id=text(job.get("target_id"));var result=new LinkedHashMap<String,Object>();result.put("input",decode(job.get("input_json")));
  if(kind.equals("DISCOVERY"))return result;
  if(kind.equals("RELATIONS")){var e=event(Long.parseLong(id),lock);result.put("event",e);result.put("identityCandidates",identities.subjectCandidates(encode(e.get("data"))));result.put("seriesCandidates",db.queryForList("select id,name,official_url as \"officialUrl\" from event_series order by id desc limit 100"));result.put("seriesLink",db.queryForList("select * from event_series_member where event_id=?"+(lock?" for update":""),Long.parseLong(id)));return result;}
  if(kind.equals("EVENT")||kind.equals("PARTICIPANTS")){result.put("event",event(Long.parseLong(id),lock));
   if(kind.equals("PARTICIPANTS"))result.put("existingOverrides",db.queryForList("select id,revision,review_state,payload_json,overrides_json from subculture_participant where event_id=? and overrides_json<>'{}'::jsonb order by id"+(lock?" for update":""),Long.parseLong(id)).stream().map(this::target).toList());return result;}
  if(kind.equals("SALES")){var p=one("select * from subculture_participant where id=? and review_state<>'EXCLUDED'"+(lock?" for update":""),Long.parseLong(id));result.put("participant",target(p));result.put("event",event(number(p.get("event_id")),lock));var sales=db.queryForList("select revision,review_state,payload_json,overrides_json from subculture_sales where participant_id=?"+(lock?" for update":""),Long.parseLong(id));result.put("sales",sales.isEmpty()?Map.of():target(sales.getFirst()));return result;}
  if(kind.equals("CREATOR")){var c=one("select id,profile_json from subculture_exhibitor where id=?"+(lock?" for update":""),Long.parseLong(id));result.put("creator",Map.of("id",c.get("id"),"data",decode(c.get("profile_json"))));
   var published=db.queryForList("select active,revision from collection_creator_publication where exhibitor_id=?"+(lock?" for update":""),Long.parseLong(id));
   result.put("publication",published.isEmpty()?Map.of():published.getFirst());result.put("identityCandidates",identities.creatorCandidates(Long.parseLong(id),decode(c.get("profile_json"))));result.put("currentIdentity",db.queryForList("select canonical_id,active,revision from collection_creator_identity where alias_id=?",Long.parseLong(id)));return result;}
  var product=one("select * from collection_product where id=? and active"+(lock?" for update":""),UUID.fromString(id));var value=new LinkedHashMap<String,Object>();value.put("id",id);value.put("revision",product.get("revision"));value.put("data",decode(product.get("data_json")));value.put("legacyProductId",product.get("legacy_product_id"));result.put("product",value);result.put("identityCandidates",identities.subjectCandidates(encode(value.get("data"))));
  var input=decode(job.get("input_json"));if(input.containsKey("analysisParent"))result.put("reviewedImageParts",db.queryForList("select result_json from collection_image_part where parent_id=? and product_revision=? and image_offset<>? and complete order by image_offset",UUID.fromString(text(input.get("analysisParent"))),product.get("revision"),number(input.get("imageOffset"))).stream().map(r->decode(r.get("result_json"))).toList());return result;
 }
}
