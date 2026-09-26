package com.boothhana.support;

import com.boothhana.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

/** Approval grants correction-request provenance, NEVER unrestricted catalogue editing. */
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
  long user=SupportService.n(t,"requester_id"),exhibitor=SupportService.n(t,"exhibitor_id");
  if(Objects.equals(actor.userId(),user))throw ApiException.forbidden("본인의 업체 관리권 요청은 다른 관리자가 심사해야 합니다.");
  if("APPROVE".equals(d.decision())){
   Target target=support.mapper().readValue(t.get("target_json").toString(),Target.class);support.targetResolver().requireClaimable(target,exhibitor);
   support.database().queryForList("select id from subculture_exhibitor where id=? for update",exhibitor);
   support.database().update("""
    insert into exhibitor_manager(exhibitor_id,user_id,claim_ticket_id,state,granted_by,reason) values(?,?,?,'ACTIVE',?,?)
    on conflict(exhibitor_id,user_id) do update set state='ACTIVE',claim_ticket_id=excluded.claim_ticket_id,
      granted_by=excluded.granted_by,granted_at=now(),revoked_by=null,revoked_at=null,reason=excluded.reason,revision=exhibitor_manager.revision+1
    """,exhibitor,user,id,actor.userId(),d.note());
  }
  support.database().update("update support_ticket set status='RESOLVED',resolution=?,revision=revision+1,resolved_at=now(),updated_at=now() where id=?","APPROVE".equals(d.decision())?"APPROVED":"REJECTED",id);
  support.insertSystemMessage(id,actor,d.reply());
  support.audit(id,actor.userId(),"CLAIM_"+d.decision(),Map.of("exhibitorId",exhibitor,"userId",user,"note",d.note(),"permission","CORRECTION_REQUEST"));return support.detail(id,actor);
 }
 public List<Map<String,Object>> mine(long user){
  var out=new ArrayList<Map<String,Object>>();
  for(var r:support.database().queryForList("select m.*,e.name from exhibitor_manager m join subculture_exhibitor e on e.id=m.exhibitor_id where m.user_id=? order by m.granted_at desc",user)){
   long ex=SupportService.n(r,"exhibitor_id");Map<String,Object> entry=new LinkedHashMap<>();entry.put("exhibitorId",ex);entry.put("name",r.get("name"));entry.put("state",r.get("state"));entry.put("permission",r.get("permission"));entry.put("revision",r.get("revision"));entry.put("claimId",r.get("claim_ticket_id").toString());
   List<Map<String,Object>> participants=new ArrayList<>();
   if("ACTIVE".equals(r.get("state")))for(var p:support.database().queryForList("select p.id,p.event_id from subculture_participant_member pm join subculture_participant p on p.id=pm.participant_id where pm.exhibitor_id=? order by p.last_seen_at desc limit 100",ex)){
    long pid=SupportService.n(p,"id"),eid=SupportService.n(p,"event_id");
    try{if(support.targetResolver().claimables(eid,pid).stream().anyMatch(x->((Number)x.get("id")).longValue()==ex)){
     var resolved=support.targetResolver().resolve(new Target("CATALOG","PARTICIPANT",eid,pid,null,null,null,null),user);participants.add(Map.of("id",pid,"eventId",eid,"name",resolved.label(),"route",resolved.route()));}
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
