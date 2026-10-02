package com.boothhana.support;

import com.boothhana.api.ApiException;
import com.boothhana.collection.*;
import com.boothhana.floorplan.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.boothhana.support.SupportModels.*;
import static com.boothhana.collection.CatalogModels.*;

/** Resolving a report and publishing its correction share ONE database transaction. */
@Service
public class SupportResolutionService {
 private final SupportService tickets;private final CatalogService catalog;private final CatalogPublicationService publications;
 private final CatalogMediaService media;private final FloorplanService plans;
 public SupportResolutionService(SupportService tickets,CatalogService catalog,CatalogPublicationService publications,CatalogMediaService media,FloorplanService plans){this.tickets=tickets;this.catalog=catalog;this.publications=publications;this.media=media;this.plans=plans;}
 @Transactional public Map<String,Object> publishReviewed(UUID id,Correction c,Principal actor){
  if(!actor.admin())throw ApiException.forbidden("관리자만 처리할 수 있습니다.");
  if(c==null)throw ApiException.badRequest("입력 오류");var ticket=tickets.row(id,true);tickets.version(ticket,c.revision());
  try{SupportRules.transitioned(ticket.get("kind").toString(),ticket.get("status").toString(),"CORRECT");SupportRules.text(c.note(),2000,true);SupportRules.text(c.reply(),4000,true);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}
  Target t=tickets.mapper().readValue(ticket.get("target_json").toString(),Target.class);
  if(!"CATALOG".equals(t.namespace())||!Set.of("EVENT","PARTICIPANT","PRODUCT").contains(t.type()))throw ApiException.badRequest("이 대상은 해당 편집 화면에서 수정 후 '공개 변경 확인'으로 완료해 주세요.");
  var now=tickets.targetResolver().resolve(t,null);if(!Objects.equals(c.expectedFingerprint(),now.fingerprint()))throw ApiException.conflict("공개 정보가 변경되었습니다. 다시 확인하세요.");
  // Membership/publication lock precedes event rows in both direct and report-based publishing.
  publications.lockForPublication();
  // Lock parent first; publication and crawler updates also use it. All changes roll back on failure.
  var event=tickets.database().queryForList("select revision from subculture_event_candidate where id=? for update",t.eventId()).getFirst();
  if(SupportService.n(event,"revision")!=c.eventRevision())throw ApiException.conflict("행사 검토 버전이 변경되었습니다.");
  Map<String,Object> edits=c.overrides()==null?Map.of():c.overrides();
  if(!edits.isEmpty()){
   // Product rows are edited in existing admin forms; do NOT replace a whole joint-booth catalogue from a single report.
   if(t.type().equals("EVENT"))catalog.editEvent(t.eventId(),new EditInput(c.targetRevision(),"REVIEWED",c.note(),edits,List.of()));
   else if(t.type().equals("PARTICIPANT"))catalog.editParticipant(t.id(),new EditInput(c.targetRevision(),"REVIEWED",c.note(),edits,List.of()));
   else throw ApiException.badRequest("개별 상품은 수집 관리 화면의 상품 폼에서 검토한 뒤 공개해 주세요.");
  }
  long revision=Objects.requireNonNull(tickets.database().queryForObject("select revision from subculture_event_candidate where id=?",Long.class,t.eventId()));
  publications.publish(t.eventId(),new PublishInput(revision));
  var after=tickets.targetResolver().current(t,null);
  if(!Objects.equals(c.expectedFingerprint(),after.fingerprint()))tickets.audit(id,actor.userId(),"PUBLISHED_CORRECTION",Map.of("before",now.fingerprint(),"after",after.fingerprint(),"eventId",t.eventId(),"note",c.note()));
  // Fails if the target is unchanged; prevents a reply being mistaken for a public correction.
  return tickets.action(id,new Action(c.revision(),"VERIFY_CHANGED",c.reply(),null,after.fingerprint()),actor);
 }
 @Transactional public Map<String,Object> hide(UUID id,Action input,Principal actor){
  if(!actor.admin())throw ApiException.forbidden("관리자 전용");if(input==null)throw ApiException.badRequest("입력 오류");
  var ticket=tickets.row(id,true);tickets.version(ticket,input.revision());
  try{SupportRules.transitioned(ticket.get("kind").toString(),ticket.get("status").toString(),"HIDE");SupportRules.text(input.note(),2000,true);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}
  Target t=tickets.mapper().readValue(ticket.get("target_json").toString(),Target.class);
  if(!"CATALOG".equals(t.namespace()))throw ApiException.badRequest("운영 상품은 기존 운영 화면에서 비공개로 변경해 주세요.");
  var before=tickets.targetResolver().current(t,null);if(!Objects.equals(input.expectedFingerprint(),before.fingerprint())||!before.visible())throw ApiException.conflict("공개 상태가 변경되었습니다.");
  switch(t.type()){
   case "EVENT"->{long r=tickets.database().queryForObject("select revision from subculture_event_candidate where id=?",Long.class,t.eventId());catalog.editEvent(t.eventId(),new EditInput(r,"EXCLUDED",input.note(),Map.of()));}
   case "PARTICIPANT"->{var p=catalog.participant(t.id());catalog.editParticipant(t.id(),new EditInput(p.revision(),"EXCLUDED",input.note(),Map.of()));}
   case "ASSET"->{var a=media.detail(t.id());media.rights(t.id(),new RightsInput(a.revision(),"REJECTED",input.note(),a.credit()==null?"":a.credit()));}
   case "FLOORPLAN"->{var v=plans.version(UUID.fromString(t.planId()));long rev=((Number)v.get("revision")).longValue();plans.withdraw(UUID.fromString(t.planId()),new FloorplanModels.Publish(rev,false,input.note()));}
   default->throw ApiException.badRequest("개별 상품을 숨기려면 기존 상품 검토 화면을 이용해 주세요. 공동 부스 전체는 숨기지 않습니다.");
  }
  var after=tickets.targetResolver().current(t,null);
  // A withdrawn floorplan can remain as an UNAVAILABLE state but must not expose coordinates.
  boolean hidden=!after.visible();
  if(t.type().equals("FLOORPLAN")&&after.visible()){
   var data=tickets.targetResolver().map(tickets.targetResolver().map(after.snapshot()).get("data"));hidden=!"READY".equals(data.get("state"));
  }
  if(!hidden)throw ApiException.conflict("공개 차단 결과를 확인하지 못했습니다. 변경을 저장하지 않습니다.");
  var proof=Map.of("visible",false,"fingerprint",after.fingerprint(),"verifiedAt",Instant.now().toString());
  tickets.database().update("update support_ticket set status='RESOLVED',resolution='HIDDEN',verified_result_json=cast(? as jsonb),revision=revision+1,updated_at=now(),resolved_at=now() where id=?",tickets.enc(proof),id);
  tickets.insertSystemMessage(id,actor,input.note());tickets.audit(id,actor.userId(),"HIDDEN",proof);return tickets.detail(id,actor);
 }
}
