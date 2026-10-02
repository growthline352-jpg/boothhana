package com.boothhana.support;

import com.boothhana.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

/** Verified grants are subject-scoped; legacy approvals remain correction-request only. */
@Service
@Transactional(readOnly=true)
public class ExhibitorClaimsService {
 private final SupportService support;
 public ExhibitorClaimsService(SupportService support){this.support=support;}
 @Transactional public Map<String,Object> decide(UUID id,ClaimDecision d,Principal actor){
  if(!actor.admin())throw ApiException.forbidden("관리자 전용");if(d==null||d.decision()==null||!Set.of("APPROVE","REJECT").contains(d.decision()))throw ApiException.badRequest("처리값 오류");
  try{SupportRules.text(d.note(),4000,true);SupportRules.text(d.reply(),4000,true);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}
  var t=support.row(id,true);support.version(t,d.revision());
  if(!"CLAIM".equals(t.get("kind"))||!Set.of("OPEN","IN_PROGRESS","WAITING_USER").contains(t.get("status")))throw ApiException.conflict("대기 중인 관리권 요청만 처리할 수 있습니다.");
  if("ORGANIZER".equals(t.get("category")))return decideOrganizer(id,t,d,actor);
  long user=SupportService.n(t,"requester_id"),exhibitor=SupportService.n(t,"exhibitor_id");
  if(Objects.equals(actor.userId(),user))throw ApiException.forbidden("본인의 업체 관리권 요청은 다른 관리자가 심사해야 합니다.");
  String permission=d.officialUrl()==null?"CORRECTION_REQUEST":"CATALOG_EDIT";
  if("CATALOG_EDIT".equals(permission))try{SupportRules.evidence(List.of(d.officialUrl()));}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}
  if("APPROVE".equals(d.decision())){
   Target target=support.mapper().readValue(t.get("target_json").toString(),Target.class);support.targetResolver().requireClaimable(target,exhibitor);
   com.boothhana.service.CreatorBoothLimits.claim(support.database(),user,exhibitor);
   support.database().queryForList("select id from subculture_exhibitor where id=? for update",exhibitor);
   support.database().update("""
    insert into exhibitor_manager(exhibitor_id,user_id,claim_ticket_id,state,granted_by,reason) values(?,?,?,'ACTIVE',?,?)
    on conflict(exhibitor_id,user_id) do update set state='ACTIVE',permission='CORRECTION_REQUEST',claim_ticket_id=excluded.claim_ticket_id,
      granted_by=excluded.granted_by,granted_at=now(),revoked_by=null,revoked_at=null,reason=excluded.reason,revision=exhibitor_manager.revision+1
    """,exhibitor,user,id,actor.userId(),d.note());
   if("CATALOG_EDIT".equals(permission))support.database().update("update exhibitor_manager set permission='CATALOG_EDIT' where exhibitor_id=? and user_id=?",exhibitor,user);
  }
  support.database().update("update support_ticket set status='RESOLVED',resolution=?,revision=revision+1,resolved_at=now(),updated_at=now() where id=?","APPROVE".equals(d.decision())?"APPROVED":"REJECTED",id);
  support.insertSystemMessage(id,actor,d.reply());
  support.audit(id,actor.userId(),"CLAIM_"+d.decision(),Map.of("exhibitorId",exhibitor,"userId",user,"note",d.note(),"permission",permission,"verifiedUrl",d.officialUrl()==null?"":d.officialUrl()));return support.detail(id,actor);
 }
 private Map<String,Object> decideOrganizer(UUID id,Map<String,Object> t,ClaimDecision d,Principal actor) {
  long user=SupportService.n(t,"requester_id");
  if(Objects.equals(actor.userId(),user))throw ApiException.forbidden("본인 신청은 다른 관리자가 심사해야 합니다.");
  Target target=support.mapper().readValue(t.get("target_json").toString(),Target.class);
  if(!"CATALOG".equals(target.namespace())||!"EVENT".equals(target.type()))throw ApiException.badRequest("행사 신청 대상 오류");
  Long organizer=null;
  if("APPROVE".equals(d.decision())) {
   support.targetResolver().resolve(target,user);
   support.database().queryForList("select id from subculture_event_candidate where id=? for update",target.eventId());
   if(d.organizerId()!=null) {
    var org=support.database().queryForList("select id from organizer_identity where id=?",d.organizerId());
    if(org.isEmpty())throw ApiException.notFound("주최 단체가 없습니다.");organizer=d.organizerId();
   } else {
    try{SupportRules.text(d.verifiedName(),160,true);SupportRules.evidence(List.of(d.officialUrl()==null?"":d.officialUrl()));}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}
    organizer=support.database().queryForObject("insert into organizer_identity(name,official_url,created_by) values(?,?,?) returning id",Long.class,d.verifiedName().strip(),d.officialUrl(),actor.userId());
   }
   if(!support.database().queryForList("select 1 from event_manager where event_id=? and state='ACTIVE' and organizer_id<>?",target.eventId(),organizer).isEmpty())throw ApiException.conflict("다른 주최 단체가 연결되어 있습니다. 기존 관리권을 검토·회수한 뒤 처리해 주세요.");
   support.database().update("""
    insert into event_manager(event_id,user_id,organizer_id,claim_ticket_id,state,granted_by,reason) values(?,?,?,?,'ACTIVE',?,?)
    on conflict(event_id,user_id) do update set organizer_id=excluded.organizer_id,claim_ticket_id=excluded.claim_ticket_id,
     state='ACTIVE',granted_by=excluded.granted_by,granted_at=now(),revoked_by=null,revoked_at=null,reason=excluded.reason,revision=event_manager.revision+1
    """,target.eventId(),user,organizer,id,actor.userId(),d.note());
  }
  support.database().update("update support_ticket set status='RESOLVED',resolution=?,revision=revision+1,resolved_at=now(),updated_at=now() where id=?","APPROVE".equals(d.decision())?"APPROVED":"REJECTED",id);
  support.insertSystemMessage(id,actor,d.reply());
  support.audit(id,actor.userId(),"ORGANIZER_"+d.decision(),Map.of("eventId",target.eventId(),"userId",user,"organizerId",organizer==null?0:organizer,"note",d.note(),"scope","THIS_EDITION_ONLY"));
  return support.detail(id,actor);
 }
 public List<Map<String,Object>> mine(long user){
  var out=new ArrayList<Map<String,Object>>();
  for(var r:support.database().queryForList("select m.*,e.name from exhibitor_manager m join subculture_exhibitor e on e.id=m.exhibitor_id where m.user_id=? order by m.granted_at desc",user)){
   long ex=SupportService.n(r,"exhibitor_id");Map<String,Object> entry=new LinkedHashMap<>();entry.put("exhibitorId",ex);entry.put("name",r.get("name"));entry.put("state",r.get("state"));entry.put("permission",r.get("permission"));entry.put("revision",r.get("revision"));entry.put("claimId",r.get("claim_ticket_id").toString());
   List<Map<String,Object>> participants=new ArrayList<>();
   if("ACTIVE".equals(r.get("state")))for(var p:support.database().queryForList("select p.id,p.event_id from subculture_participant_member pm join subculture_participant p on p.id=pm.participant_id where pm.exhibitor_id=? order by p.last_seen_at desc limit 100",ex)){
    long pid=SupportService.n(p,"id"),eid=SupportService.n(p,"event_id");
    try{if(support.targetResolver().claimables(eid,pid).stream().anyMatch(x->((Number)x.get("id")).longValue()==ex)){
     var resolved=support.targetResolver().resolve(new Target("CATALOG","PARTICIPANT",eid,pid,null,null,null,null),user);
     var data=(Map<?,?>)((Map<?,?>)resolved.snapshot()).get("data");
     var publishedParticipant=(Map<?,?>)data.get("participant");
     int publicMembers=((List<?>)publishedParticipant.get("members")).size();
     int currentMembers=support.database().queryForObject("select count(*) from subculture_participant_member where participant_id=?",Integer.class,pid);
     boolean sales=data.get("sales")!=null&&!support.database().queryForList("select 1 from subculture_sales where participant_id=? and review_state<>'EXCLUDED'",pid).isEmpty();
     participants.add(Map.of("id",pid,"eventId",eid,"name",resolved.label(),"route",resolved.route(),"editCapabilities",OwnerEditCapabilities.of(String.valueOf(r.get("permission")),currentMembers,publicMembers,sales)));}
    }catch(ApiException e){if(e.status.value()!=404)throw e;}
   }
   entry.put("participants",participants);out.add(entry);
  }
  return out;
 }
 @Transactional public void revoke(long exhibitor,long user,Revoke d,Principal actor){
  if(!actor.admin())throw ApiException.forbidden("관리자 전용");if(d==null)throw ApiException.badRequest("입력 오류");try{SupportRules.text(d.reason(),4000,true);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}
  var peek=support.database().queryForList("select * from exhibitor_manager where exhibitor_id=? and user_id=?",exhibitor,user);if(peek.isEmpty())throw ApiException.notFound("관리 관계 없음");UUID claimId=(UUID)peek.getFirst().get("claim_ticket_id");support.row(claimId,true);
  var rows=support.database().queryForList("select * from exhibitor_manager where exhibitor_id=? and user_id=? for update",exhibitor,user);if(rows.isEmpty())throw ApiException.notFound("관리 관계 없음");var r=rows.getFirst();if(!claimId.equals(r.get("claim_ticket_id")))throw ApiException.conflict("관리 관계가 다른 신청으로 갱신되었습니다.");if(SupportService.n(r,"revision")!=d.revision()||!"ACTIVE".equals(r.get("state")))throw ApiException.conflict("관리 관계가 변경되었습니다.");
  support.database().update("update exhibitor_manager set state='REVOKED',revoked_by=?,revoked_at=now(),reason=?,revision=revision+1 where exhibitor_id=? and user_id=?",actor.userId(),d.reason(),exhibitor,user);
  support.insertSystemMessage((UUID)r.get("claim_ticket_id"),actor,"업체 관리 관계가 해제되었습니다. 사유: "+d.reason());
  support.database().update("update support_ticket set revision=revision+1,updated_at=now() where id=?",r.get("claim_ticket_id"));
  support.audit((UUID)r.get("claim_ticket_id"),actor.userId(),"CLAIM_REVOKED",Map.of("exhibitorId",exhibitor,"userId",user,"reason",d.reason()));
 }
}
