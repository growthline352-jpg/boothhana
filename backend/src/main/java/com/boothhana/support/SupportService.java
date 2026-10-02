package com.boothhana.support;

import com.boothhana.api.ApiException;
import com.boothhana.collection.CollectionModels.PageData;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

@Service
@Transactional(readOnly=true)
public class SupportService {
 private final JdbcTemplate db;private final JsonMapper json;private final SupportTargets targets;
 private final boolean guests;private final String rateSecret;private final SupportRateLimiter limiter;
 public SupportService(JdbcTemplate db,JsonMapper json,SupportTargets targets,SupportRateLimiter limiter,
     @Value("${app.support.guest-enabled:false}") boolean guests,@Value("${app.support.rate-secret:}") String rateSecret){this.db=db;this.json=json;this.targets=targets;this.limiter=limiter;this.guests=guests;this.rateSecret=rateSecret;}
 // Dependency access must dispatch through the transactional proxy. Reading fields of an
 // injected CGLIB proxy bypasses its target; peers use these methods, never proxy fields.
 public JdbcTemplate database(){return db;}
 public JsonMapper mapper(){return json;}
 public SupportTargets targetResolver(){return targets;}
 String enc(Object x){return json.writeValueAsString(x);}
 @SuppressWarnings("unchecked") Map<String,Object> obj(Object x){return x==null?Map.of():json.readValue(x.toString(),Map.class);}
 static long n(Map<String,Object> r,String key){return ((Number)r.get(key)).longValue();}
 static String st(Object x){return x==null?"":x.toString();}
 static String time(Object x){return x instanceof java.sql.Timestamp t?t.toInstant().toString():st(x);}
 Map<String,Object> row(UUID id,boolean lock){var rows=db.queryForList("select * from support_ticket where id=?"+(lock?" for update":""),id);if(rows.isEmpty())throw ApiException.notFound("접수 내역을 찾을 수 없습니다.");return rows.getFirst();}
 void access(Map<String,Object> t,Principal actor){Long owner=t.get("requester_id")==null?null:n(t,"requester_id");if(!SupportRules.canRead(owner,actor))throw ApiException.notFound("접수 내역을 찾을 수 없습니다.");}
 void version(Map<String,Object> t,long revision){if(n(t,"revision")!=revision)throw ApiException.conflict("새 답변이나 처리 결과가 있습니다. 새로고침 후 다시 확인해 주세요.");}
 void audit(UUID id,Long actor,String action,Object details){db.update("insert into support_action(ticket_id,actor_id,action,details_json) values(?,?,?,cast(? as jsonb))",id,actor,action,enc(details));}
 private void rules(Runnable validation){try{validation.run();}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}}
 public Map<String,Object> capabilities(){return Map.of("guestEnabled",guests&&rateSecret.length()>=32,"feedbackEnabled",rateSecret.length()>=32,"guestExpiryDays",30,"guestAttachments",false);}
 private void guestEnabled(){if(!guests||rateSecret.length()<32)throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"GUEST_DISABLED","비회원 문의 준비 중입니다. 로그인 문의를 이용해 주세요.");}
 public Map<String,Object> detail(UUID id,Principal actor){var r=row(id,false);access(r,actor);return view(r,actor);}
 Map<String,Object> view(Map<String,Object> r,Principal actor){
  UUID id=(UUID)r.get("id");Map<String,Object> v=summary(r);v.put("target",r.get("target_json")==null?null:obj(r.get("target_json")));
  v.put("receivedSnapshot",obj(r.get("received_snapshot_json")));v.put("receivedFingerprint",r.get("received_fingerprint"));v.put("clientContext",obj(r.get("client_context_json")));
  v.put("messages",db.queryForList("select id,actor_kind,body,evidence_json,visibility,created_at,message_kind from support_message where ticket_id=?"+(actor.admin()?"":" and visibility='PUBLIC'")+" order by created_at,id",id).stream().map(m->{Map<String,Object> x=new LinkedHashMap<>();x.put("id",m.get("id").toString());x.put("author",m.get("actor_kind"));x.put("internal","INTERNAL".equals(m.get("visibility")));x.put("body",m.get("body"));x.put("messageKind",m.get("message_kind"));x.put("evidence",json.readValue(m.get("evidence_json").toString(),List.class));x.put("createdAt",time(m.get("created_at")));return x;}).toList());
  v.put("attachments",db.queryForList("select id,content_type,byte_size,created_at from support_attachment where ticket_id=? and state='STORED' order by created_at",id).stream().map(a->Map.of("id",a.get("id").toString(),"contentType",a.get("content_type"),"size",a.get("byte_size"),"createdAt",time(a.get("created_at")))).toList());
  if(actor.admin()){
   if(r.get("target_json")!=null){Target ref=json.readValue(r.get("target_json").toString(),Target.class);
    if("CATALOG".equals(ref.namespace())){
     var ev=db.queryForList("select revision,review_state from subculture_event_candidate where id=?",ref.eventId());
     if(!ev.isEmpty()){v.put("eventRevision",ev.getFirst().get("revision"));v.put("eventReviewState",ev.getFirst().get("review_state"));}
    }
   }
   if("CLAIM".equals(r.get("kind"))){var grants="ORGANIZER".equals(r.get("category"))
    ?db.queryForList("select state,revision,organizer_id from event_manager where event_id=? and user_id=?",json.readValue(r.get("target_json").toString(),Target.class).eventId(),r.get("requester_id"))
    :db.queryForList("select state,revision from exhibitor_manager where exhibitor_id=? and user_id=?",r.get("exhibitor_id"),r.get("requester_id"));v.put("management",grants.isEmpty()?null:grants.getFirst());}
   if("REPORT".equals(r.get("kind"))&&r.get("requester_id")!=null&&r.get("target_json")!=null){Target ref=json.readValue(r.get("target_json").toString(),Target.class);
    if("CATALOG".equals(ref.namespace())&&"PARTICIPANT".equals(ref.type()))v.put("verifiedManagers",db.queryForList("select e.id,e.name from exhibitor_manager m join subculture_exhibitor e on e.id=m.exhibitor_id join subculture_participant_member pm on pm.exhibitor_id=e.id where m.user_id=? and m.state='ACTIVE' and pm.participant_id=?",r.get("requester_id"),ref.id()));}
   v.put("requesterId",r.get("requester_id"));v.put("assignedTo",r.get("assigned_to"));v.put("exhibitorId",r.get("exhibitor_id"));
   v.put("actions",db.queryForList("select actor_id,action,details_json,created_at from support_action where ticket_id=? order by id",id).stream().map(a->{Map<String,Object>x=new LinkedHashMap<>();x.put("actorId",a.get("actor_id"));x.put("action",a.get("action"));x.put("details",obj(a.get("details_json")));x.put("createdAt",time(a.get("created_at")));return x;}).toList());
   if(r.get("target_json")!=null){Target t=json.readValue(r.get("target_json").toString(),Target.class);v.put("currentTarget",targets.current(t,r.get("requester_id")==null?null:n(r,"requester_id")));v.put("contentComparisonAvailable",comparable(r,t));}
   v.put("verifiedResult",obj(r.get("verified_result_json")));
  }
  return v;
 }
 boolean comparable(Map<String,Object> ticket,Target target) {
  return SupportComparison.business(obj(ticket.get("received_snapshot_json")),target,st(ticket.get("category"))).isPresent();
 }
 /** Owner-only receipt probe. Missing and other users' IDs have the same response, without resolving the target. */
 public Map<String,Object> receipt(UUID requestId,Principal actor) {
  if (actor.userId()==null || actor.guest()) throw ApiException.forbidden("로그인이 필요합니다.");
  var rows=db.queryForList("select id from support_ticket where id=? and requester_id=?",requestId,actor.userId());
  return rows.isEmpty()?Map.of("found",false):Map.of("found",true,"id",requestId.toString());
 }
 Map<String,Object> summary(Map<String,Object> r){Map<String,Object> v=new LinkedHashMap<>();v.put("id",r.get("id").toString());v.put("number","BH-"+r.get("id").toString().substring(0,8).toUpperCase(Locale.ROOT));v.put("kind",r.get("kind"));v.put("category",r.get("category"));v.put("title",r.get("title"));v.put("status",r.get("status"));v.put("resolution",r.get("resolution"));v.put("revision",r.get("revision"));v.put("createdAt",time(r.get("created_at")));v.put("updatedAt",time(r.get("updated_at")));return v;}
 public PageData<Map<String,Object>> list(Principal actor,String kind,String status,int page){
  return list(actor,kind,status,page,"");
 }
 public PageData<Map<String,Object>> list(Principal actor,String kind,String status,int page,String category){
  if(page<0||page>100000||kind==null||!Set.of("REPORT","INQUIRY","CLAIM").contains(kind)||status!=null&&!status.isBlank()&&!Set.of("OPEN","IN_PROGRESS","WAITING_USER","ANSWERED","RESOLVED","CLOSED").contains(status))throw ApiException.badRequest("목록 조건을 확인해 주세요.");
  List<Object> args=new ArrayList<>(List.of(kind));String where=" where kind=?";
  if(category!=null&&!category.isBlank()){
   if(!("INQUIRY".equals(kind)&&SupportRules.INQUIRY_REASONS.contains(category))&&!("CLAIM".equals(kind)&&Set.of("ORGANIZER","OWNERSHIP").contains(category)))throw ApiException.badRequest("분류를 확인해 주세요.");
   where+=" and category=?";args.add(category);
  }
  if(!actor.admin()){if(actor.userId()==null)throw ApiException.notFound("접수 내역 없음");where+=" and requester_id=?";args.add(actor.userId());}
  if(status!=null&&!status.isBlank()){where+=" and status=?";args.add(status);}
  long total=Objects.requireNonNull(db.queryForObject("select count(*) from support_ticket"+where,Long.class,args.toArray()));args.add(page*20);
  var items=db.queryForList("select * from support_ticket"+where+" order by updated_at desc,id limit 20 offset ?",args.toArray()).stream().map(this::summary).toList();return new PageData<>(items,page,20,total);
 }
 @Transactional public Map<String,Object> create(Create c,Principal p){if(p.userId()==null||p.guest())throw ApiException.forbidden("로그인이 필요합니다.");return createInternal(c,new Principal(p.userId(),false,false),null,null);}
 private Map<String,Object> createInternal(Create c,Principal actor,String guestHash,String remote){
  rules(()->SupportRules.create(c));String subject=actor.userId()==null?"g:"+guestHash:"u:"+actor.userId();String hash=targets.hash(targets.map(c));
  // Same-user creates serialized to cover rate counters / pending ownership uniqueness.
  db.execute("set local lock_timeout='5s'");db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))", "support-create:"+subject);
  var old=db.queryForList("select * from support_ticket where id=?",c.requestId());
  if(!old.isEmpty()){var r=old.getFirst();if(!subject.equals(r.get("subject_key"))||!hash.equals(r.get("request_hash")))throw ApiException.conflict("접수 요청 ID를 다른 내용에 재사용할 수 없습니다.");if(guestHash!=null&&((java.sql.Timestamp)r.get("guest_expires_at")).toInstant().isBefore(Instant.now()))throw ApiException.notFound("접수번호·조회키 또는 유효기간을 확인해 주세요.");return view(r,actor);}
  // Rate admission is committed by SupportOperations before this transaction.
  Resolved target=c.target()==null?null:targets.resolve(c.target(),actor.userId());
  if(c.kind().equals("REPORT")&&c.target().type().equals("RESERVATION"))throw ApiException.badRequest("예약은 고객문의로 접수해 주세요.");
  if(c.kind().equals("CLAIM")&&"ORGANIZER".equals(c.category())) {
   if(!db.queryForList("select 1 from event_manager where event_id=? and user_id=? and state='ACTIVE'",target.target().eventId(),actor.userId()).isEmpty())throw ApiException.conflict("이미 승인된 행사입니다.");
   if(!db.queryForList("select 1 from support_ticket where requester_id=? and kind='CLAIM' and category='ORGANIZER' and target_json->>'eventId'=? and status in ('OPEN','IN_PROGRESS','WAITING_USER')",actor.userId(),Long.toString(target.target().eventId())).isEmpty())throw ApiException.conflict("이미 검토 중인 주최자 신청이 있습니다.");
  } else if(c.kind().equals("CLAIM")){
   targets.requireClaimable(target.target(),c.exhibitorId());
   com.boothhana.service.CreatorBoothLimits.lock(db,actor.userId());
   com.boothhana.service.CreatorBoothLimits.available(db,actor.userId(),target.target().eventId(),target.target().id());
   if(!db.queryForList("select 1 from exhibitor_manager where exhibitor_id=? and user_id=? and state='ACTIVE' and permission='CATALOG_EDIT'",c.exhibitorId(),actor.userId()).isEmpty())throw ApiException.conflict("이미 관리 관계가 승인된 업체입니다.");
   if(!db.queryForList("select 1 from support_ticket where requester_id=? and exhibitor_id=? and kind='CLAIM' and status in ('OPEN','IN_PROGRESS','WAITING_USER')",actor.userId(),c.exhibitorId()).isEmpty())throw ApiException.conflict("이미 검토 중인 관리권 요청이 있습니다.");
  }
  db.update("""
   insert into support_ticket(id,requester_id,subject_key,request_hash,guest_secret_hash,guest_expires_at,kind,category,title,
    target_json,received_snapshot_json,received_fingerprint,client_context_json,exhibitor_id)
   values(?,?,?,?,?,?,?, ?,?, cast(? as jsonb),cast(? as jsonb),?,cast(? as jsonb),?)
   """,c.requestId(),actor.userId(),subject,hash,guestHash,guestHash==null?null:java.sql.Timestamp.from(Instant.now().plus(Duration.ofDays(30))),c.kind(),c.category(),c.title().strip(),target==null?null:enc(target.target()),target==null?null:enc(target.snapshot()),target==null?null:target.fingerprint(),enc(c.context()==null?Map.of():c.context()),c.exhibitorId());
  insertMessage(c.requestId(),c.requestId(),actor,c.body(),c.evidence(),false,hash);
  audit(c.requestId(),actor.userId(),"CREATED",Map.of("kind",c.kind()));return view(row(c.requestId(),false),actor);
 }
 void insertMessage(UUID messageId,UUID ticket,Principal actor,String body,List<String> links,boolean internal,String hash) {
  if (dialogueCount(ticket) >= 200) throw ApiException.conflict("대화 한도에 도달했습니다. 새 문의로 이어서 접수해 주세요.");
  storeMessage(messageId,ticket,actor,body,links,internal,hash,"DIALOGUE");
 }
 long dialogueCount(UUID ticket) {
  return Objects.requireNonNull(db.queryForObject("select count(*) from support_message where ticket_id=? and message_kind='DIALOGUE'",Long.class,ticket));
 }
 /** Only controlled administrator transitions may write SYSTEM. Not exposed by the message input API. */
 void insertSystemMessage(UUID ticket,Principal actor,String body) {
  if (!actor.admin() || actor.userId()==null) throw ApiException.forbidden("시스템 처리 안내는 관리자 작업에서만 기록합니다.");
  rules(() -> SupportRules.text(body,10000,true));
  storeMessage(UUID.randomUUID(),ticket,actor,body,List.of(),false,SupportRules.digest(body),"SYSTEM");
 }
 private void storeMessage(UUID messageId,UUID ticket,Principal actor,String body,List<String> links,boolean internal,String hash,String kind) {
  db.update("insert into support_message(id,ticket_id,actor_id,actor_kind,visibility,body,evidence_json,request_hash,message_kind) values(?,?,?,?,?,?,cast(? as jsonb),?,?)",messageId,ticket,actor.userId(),actor.actorKind(),internal?"INTERNAL":"PUBLIC",body.strip(),enc(links==null?List.of():links),hash,kind);
 }
 @Transactional public Map<String,Object> message(UUID id,Message m,Principal actor){rules(()->SupportRules.message(m,actor.admin()));var t=row(id,true);access(t,actor);
  String hash=targets.hash(targets.map(m));var previous=db.queryForList("select * from support_message where id=?",m.requestId());
  if(!previous.isEmpty()){var old=previous.getFirst();if(!id.equals(old.get("ticket_id"))||!Objects.equals(actor.userId(),old.get("actor_id"))||!actor.actorKind().equals(old.get("actor_kind"))||!hash.equals(old.get("request_hash")))throw ApiException.conflict("다른 답변에 같은 요청 ID를 사용할 수 없습니다.");return view(t,actor);}
  version(t,m.revision());if("CLOSED".equals(t.get("status")))throw ApiException.conflict("종료된 문의입니다. 새 문의를 작성해 주세요.");
  if("CLAIM".equals(t.get("kind"))&&"RESOLVED".equals(t.get("status")))throw ApiException.conflict("결정된 관리권 요청에는 추가할 수 없습니다. 새로 신청해 주세요.");
  if(dialogueCount(id)>=200)throw ApiException.conflict("대화 한도에 도달했습니다. 접수번호를 적어 새 문의를 작성해 주세요.");

  insertMessage(m.requestId(),id,actor,m.body(),m.evidence(),m.internal(),hash);
  String state=st(t.get("status"));if(!m.internal())state=actor.admin()?("INQUIRY".equals(t.get("kind"))?"ANSWERED":"IN_PROGRESS"):"OPEN";
  db.update("update support_ticket set status=?,revision=revision+1,updated_at=now(),resolution=case when ? then resolution else null end,resolved_at=case when ? then resolved_at else null end,verified_result_json=case when ? then verified_result_json else null end where id=?",state,m.internal(),m.internal(),m.internal(),id);
  audit(id,actor.userId(),m.internal()?"INTERNAL_NOTE":"MESSAGE",Map.of("messageId",m.requestId().toString()));return view(row(id,false),actor);
 }
 @Transactional public Map<String,Object> action(UUID id,Action a,Principal actor){
  if(!actor.admin())throw ApiException.forbidden("관리자만 처리할 수 있습니다.");if(a==null)throw ApiException.badRequest("처리 내용을 확인해 주세요.");
  var t=row(id,true);version(t,a.revision());String state;try{state=SupportRules.transitioned(st(t.get("kind")),st(t.get("status")),a.action());SupportRules.text(a.note(),4000,true);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}
  if(Set.of("HIDE","CORRECT").contains(a.action()))throw ApiException.badRequest("정정·숨김 전용 동작을 이용하세요.");

  if("ASSIGN_SELF".equals(a.action())){db.update("update support_ticket set assigned_to=?,revision=revision+1,updated_at=now() where id=?",actor.userId(),id);audit(id,actor.userId(),"ASSIGN_SELF",Map.of("note",a.note()));return view(row(id,false),actor);}
  Map<String,Object> proof=new LinkedHashMap<>();
  if("VERIFY_CHANGED".equals(a.action())){
   if(t.get("target_json")==null)throw ApiException.conflict("연결 대상 없음");var target=json.readValue(t.get("target_json").toString(),Target.class);
   var now=targets.current(target,t.get("requester_id")==null?null:n(t,"requester_id"));
   if(!Objects.equals(a.expectedFingerprint(),now.fingerprint()))throw ApiException.conflict("공개 정보가 다시 변경되었습니다. 현재 정보를 다시 확인하세요.");
   if(now.visible() && !comparable(t,target)) throw ApiException.conflict("접수 당시 신고 항목의 비교 근거가 부족합니다. 수동 확인 사유로 처리하거나 실제 공개 중지 여부를 확인하세요.");
   if(now.visible()) {
    var beforeContent=SupportComparison.business(obj(t.get("received_snapshot_json")),target,st(t.get("category")));
    var afterContent=SupportComparison.business(targets.map(now.snapshot()),target,st(t.get("category")));
    if(beforeContent.isEmpty() || afterContent.isEmpty()) throw ApiException.conflict("접수 당시의 비교 근거가 부족합니다. 원문을 수동 확인하고 처리 사유를 안내하세요.");
    if(targets.hash(beforeContent.get()).equals(targets.hash(afterContent.get()))) throw ApiException.conflict("신고한 항목의 실제 내용이 그대로입니다. 확인·공개 시각만 바뀐 것은 정정이 아닙니다.");
    proof.put("comparisonVersion",SupportComparison.BUSINESS_VERSION);
    proof.put("beforeContentHash",targets.hash(beforeContent.get()));
    proof.put("afterContentHash",targets.hash(afterContent.get()));
   }
   proof.put("visible",now.visible());proof.put("fingerprint",now.fingerprint());proof.put("verifiedAt",Instant.now().toString());
  }
  if("DUPLICATE".equals(a.action())){if(a.duplicateOf()==null||a.duplicateOf().equals(id))throw ApiException.badRequest("다른 원접수 ID가 필요합니다.");var original=row(a.duplicateOf(),false);if(!"REPORT".equals(original.get("kind")))throw ApiException.badRequest("신고에만 중복 연결할 수 있습니다.");proof.put("duplicateOf",a.duplicateOf().toString());}
  boolean resolved=Set.of("RESOLVED","CLOSED").contains(state);String outcome=resolved?("VERIFY_CHANGED".equals(a.action())?(Boolean.FALSE.equals(proof.get("visible"))?"HIDDEN":"UPDATED"):a.action()):null;
  db.update("update support_ticket set status=?,resolution=?,verified_result_json=cast(? as jsonb),revision=revision+1,updated_at=now(),resolved_at=case when ? then now() else null end where id=?",state,outcome,enc(proof),resolved,id);
  // No duplicate target id, private verification note, or internal information is sent to the requester.
  if(resolved||"WAIT".equals(a.action()))insertSystemMessage(id,actor,a.note());
  audit(id,actor.userId(),a.action(),Map.of("note",a.note(),"proof",proof));return view(row(id,false),actor);
 }
 @Transactional public Map<String,Object> feedbackCreate(GuestCreate g,String remote){
  if(rateSecret.length()<32)throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"FEEDBACK_DISABLED","개선 의견 접수를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.");
  rules(()->SupportRules.feedback(g));
  var saved=createInternal(g.ticket(),new Principal(null,false,true),SupportRules.guestHash(g.accessKey()),remote);
  return Map.of("id",saved.get("id"),"number",saved.get("number"));
 }
 @Transactional public Map<String,Object> guestCreate(GuestCreate g,String remote){guestEnabled();if(g==null||g.ticket()==null)throw ApiException.badRequest("입력 오류");String hash;try{hash=SupportRules.guestHash(g.accessKey());}catch(IllegalArgumentException e){throw ApiException.badRequest("조회키 형식 오류");}
  if(g.website()!=null&&!g.website().isBlank())throw ApiException.badRequest("접수할 수 없습니다.");if(!"INQUIRY".equals(g.ticket().kind())||!"ACCOUNT".equals(g.ticket().category())||g.ticket().target()!=null)throw ApiException.badRequest("비회원은 로그인·계정 문의만 접수할 수 있습니다.");
  return createInternal(g.ticket(),new Principal(null,false,true),hash,remote);
 }
 private Principal guest(GuestAccess g,String remote){guestEnabled();String hash;
  try{hash=SupportRules.guestHash(g==null?null:g.accessKey());}catch(RuntimeException e){throw ApiException.notFound("접수번호·조회키 또는 유효기간을 확인해 주세요.");}
  if(g.ticketId()==null)throw ApiException.notFound("접수번호·조회키를 확인해 주세요.");var t=row(g.ticketId(),false);if(t.get("requester_id")!=null||!"ACCOUNT".equals(t.get("category"))||!SupportRules.constantEquals(hash,st(t.get("guest_secret_hash")))||((java.sql.Timestamp)t.get("guest_expires_at")).toInstant().isBefore(Instant.now()))throw ApiException.notFound("접수번호·조회키 또는 유효기간을 확인해 주세요.");return new Principal(null,false,true);
 }
 @Transactional public Map<String,Object> guestRead(GuestAccess g,String remote){Principal p=guest(g,remote);return detail(g.ticketId(),p);}
 @Transactional public Map<String,Object> guestReply(GuestMessage g,String remote){if(g==null)throw ApiException.badRequest("입력값을 확인해 주세요.");Principal p=guest(g.access(),remote);return message(g.access().ticketId(),g.message(),p);}
}
