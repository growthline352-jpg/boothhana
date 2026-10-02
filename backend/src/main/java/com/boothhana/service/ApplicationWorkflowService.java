package com.boothhana.service;
import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.*;
import com.boothhana.domain.*;
import com.boothhana.domain.DomainEnums.*;
import com.boothhana.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
@Service
@Transactional(readOnly=true)
public class ApplicationWorkflowService {
 private final EventBoothRepository applications;private final EventRepository events;private final BoothRepository booths;private final UserAccountRepository users;private final JdbcTemplate db;
 public ApplicationWorkflowService(EventBoothRepository applications,EventRepository events,BoothRepository booths,UserAccountRepository users,JdbcTemplate db){this.applications=applications;this.events=events;this.booths=booths;this.users=users;this.db=db;}
 private EventBooth require(long id,boolean lock){return (lock?applications.findLocked(id):applications.findById(id)).orElseThrow(()->ApiException.notFound("참가 신청이 없습니다."));}
 private void owner(UserAccount u,EventBooth a){Booth b=booths.findById(a.boothId).orElseThrow();if(!Objects.equals(u.id,b.ownerUserId))throw ApiException.notFound("참가 신청이 없습니다.");}
 private ApplicationView view(EventBooth a){var e=events.findById(a.eventId).orElseThrow();var b=booths.findById(a.boothId).orElseThrow();String name=users.findById(b.ownerUserId).map(u->u.displayName).orElse("업체");return new ApplicationView(a.id,e.id,e.name,b.id,b.name,name,a.status,a.rejectionReason,a.version);}
 @Transactional public ApplicationView apply(UserAccount user,ApplicationInput input){
  if(input==null||input.eventId()==null||input.boothId()==null)throw ApiException.badRequest("행사·부스를 선택해 주세요.");
  var e=events.findById(input.eventId()).orElseThrow(()->ApiException.notFound("행사가 없습니다."));if(e.status!=EventStatus.PUBLISHED)throw ApiException.conflict("현재 신청 가능한 행사가 아닙니다.");
  var b=booths.findById(input.boothId()).orElseThrow(()->ApiException.notFound("부스가 없습니다."));if(!Objects.equals(b.ownerUserId,user.id))throw ApiException.forbidden("본인 부스만 신청할 수 있습니다.");
  if(applications.findByEventIdAndBoothId(e.id,b.id).isPresent())throw ApiException.conflict("이미 신청 내역이 있습니다. 반려·철회 내역은 재신청을 이용해 주세요.");
  available(user.id,e.id,null);
  var a=new EventBooth();a.eventId=e.id;a.boothId=b.id;a.intro=b.description;a.status=ApplicationStatus.APPROVED;a.isPublic=true;a.boothNumber="미정";applications.saveAndFlush(a);
  db.update("insert into application_action(application_id,application_ref,actor_id,action,before_state,after_state,reason,revision) values(?,?,?,'APPLY','NONE','APPROVED','',?)",a.id,a.id,user.id,a.version);return view(a);
 }
 private void available(long user,long event,Long except){
  db.queryForList("select id from app_user where id=? for update",user);
  if(!db.queryForList("select a.id from event_booth a join booth b on b.id=a.booth_id where b.owner_user_id=? and a.event_id=? and a.status in ('PENDING','APPROVED') and a.id<>?",user,event,except==null?0:except).isEmpty())throw ApiException.conflict("한 행사에는 계정당 부스 1개만 등록할 수 있습니다.");
 }
 public List<ApplicationView> mine(UserAccount u){var ids=booths.findByOwnerUserIdOrderByIdDesc(u.id).stream().map(b->b.id).toList();return ids.isEmpty()?List.of():applications.findByBoothIdIn(ids).stream().filter(a->events.findById(a.eventId).map(e->e.status!=EventStatus.DRAFT).orElse(false)).map(this::view).toList();}
 public List<Map<String,Object>> history(UserAccount u,long id,boolean admin){var a=require(id,false);if(!admin)owner(u,a);return db.queryForList("select action,before_state,after_state,reason,created_at from application_action where application_id=? order by id",id);}
 @Transactional public ApplicationView change(UserAccount user,long id,ApplicationDecision input,String action,boolean admin){
  if(input==null||input.revision()<0)throw ApiException.badRequest("신청 버전을 확인해 주세요.");
  db.execute("set local lock_timeout='5s'");var peek=require(id,false);long account=booths.findById(peek.boothId).orElseThrow().ownerUserId;
  db.queryForList("select id from app_user where id=? for update",account);var a=require(id,true);if(!admin)owner(user,a);
  if(admin&&!Set.of("APPROVE","REJECT").contains(action)||!admin&&!Set.of("RESUBMIT","WITHDRAW").contains(action))throw ApiException.forbidden("허용되지 않는 처리입니다.");
  if(a.version!=input.revision())throw ApiException.conflict("신청이 이미 변경되었습니다. 새로고침해 주세요.");
  String reason=input.reason()==null?"":input.reason().strip();if(reason.length()>512||"REJECT".equals(action)&&reason.isBlank())throw ApiException.badRequest("반려 사유를 512자 이내로 입력해 주세요.");
  String before=a.status.name(),next;try{next=ApplicationRules.next(before,action,events.findById(a.eventId).orElseThrow().status==EventStatus.PUBLISHED);}catch(IllegalArgumentException e){throw ApiException.conflict(e.getMessage());}
  if("APPROVED".equals(next))available(account,a.eventId,a.id);
  a.status=ApplicationStatus.valueOf(next);a.isPublic=a.status==ApplicationStatus.APPROVED;
  if(a.status==ApplicationStatus.APPROVED){a.rejectionReason=null;if(a.boothNumber==null)a.boothNumber="미정";}
  if(a.status==ApplicationStatus.REJECTED)a.rejectionReason=reason;
  if(a.status==ApplicationStatus.PENDING)a.rejectionReason=null;
  applications.saveAndFlush(a);
  db.update("insert into application_action(application_id,application_ref,actor_id,action,before_state,after_state,reason,revision) values(?,?,?,?,?,?,?,?)",id,id,user.id,action,before,next,reason,a.version);
  return view(a);
 }
}
