package com.boothhana.support;

import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogService;
import com.boothhana.collection.CatalogModels.EditInput;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

/** Relationship changes never grant platform POS/reservation permissions. */
@Service
@Transactional(readOnly=true)
public class OwnershipCatalogService {
 private final SupportService support;
 private final CatalogService catalog;
 public OwnershipCatalogService(SupportService support,CatalogService catalog){this.support=support;this.catalog=catalog;}
 private org.springframework.jdbc.core.JdbcTemplate db(){return support.database();}
 private Map<String,Object> one(String sql,Object...args){var rows=db().queryForList(sql,args);if(rows.isEmpty())throw ApiException.notFound("대상을 찾을 수 없습니다.");return rows.getFirst();}
 private void admin(Principal p){if(p==null||!p.admin()||p.userId()==null)throw ApiException.forbidden("관리자 전용입니다.");}
 private void publicEvent(long id){one("select e.id from subculture_event_candidate e join subculture_catalog_publication p on p.event_id=e.id where e.id=? and e.review_state<>'EXCLUDED'",id);}
 public List<Map<String,Object>> organizers(Principal p){admin(p);return db().queryForList("select id,name,official_url as \"officialUrl\" from organizer_identity order by name,id limit 500");}
 public List<Map<String,Object>> series(Principal p){admin(p);return db().queryForList("select id,name,official_url as \"officialUrl\" from event_series order by name,id limit 500");}
 public List<Map<String,Object>> managedEvents(long user){return db().queryForList("""
  select m.event_id as "eventId",e.name,m.state,m.revision,m.claim_ticket_id as "claimId",o.name as "organizerName"
  from event_manager m join subculture_event_candidate e on e.id=m.event_id join organizer_identity o on o.id=m.organizer_id
  where m.user_id=? order by m.granted_at desc limit 500
  """,user);}
 public Map<String,Object> publicInfo(long eventId){
  publicEvent(eventId);
  var organizers=db().queryForList("""
   select o.id,o.name,o.official_url as "officialUrl",min(m.granted_at) as "verifiedAt" from event_manager m
   join organizer_identity o on o.id=m.organizer_id where m.event_id=? and m.state='ACTIVE' group by o.id
   """,eventId);
  // A badge identifies only verified members, never every member of a joint booth.
  var exhibitors=db().queryForList("""
   select distinct pm.participant_id as "participantId",e.id,e.name from subculture_participant_member pm
   join subculture_participant p on p.id=pm.participant_id join subculture_exhibitor e on e.id=pm.exhibitor_id
   join exhibitor_manager m on m.exhibitor_id=e.id and m.state='ACTIVE' and m.permission='CATALOG_EDIT'
   join subculture_catalog_publication pub on pub.event_id=p.event_id
   where p.event_id=? and p.review_state<>'EXCLUDED'
    and exists(select 1 from jsonb_array_elements(pub.snapshot_json->'participants') x,
     jsonb_array_elements(x->'participant'->'members') member where x->>'id'=p.id::text
      and member->>'name'=e.profile_json->>'name'
      and (member->>'profileUrl') is not distinct from (e.profile_json->>'profileUrl'))
   """,eventId);
  var series=db().queryForList("select s.id,s.name,m.edition from event_series_member m join event_series s on s.id=m.series_id where m.event_id=?",eventId);
  var direct=db().queryForList("select participant_id from catalog_creator_booth where event_id=?",Long.class,eventId);
  return Map.of("organizers",organizers,"exhibitors",exhibitors,"series",series,"directParticipantIds",direct);
 }
 public Map<String,Object> history(long eventId,int page){
  publicEvent(eventId);if(page<0||page>10000)throw ApiException.badRequest("페이지 오류");
  String from=" from event_series_member m join subculture_catalog_publication p on p.event_id=m.event_id join subculture_event_candidate e on e.id=m.event_id where m.series_id=(select series_id from event_series_member where event_id=?) and m.event_id<>? and e.review_state<>'EXCLUDED'";
  var rows=db().queryForList("select m.event_id as id,m.edition,p.snapshot_json->'event'->>'name' as name,p.snapshot_json->'event'->'occurrences' as occurrences"+from+" order by e.starts_on desc,e.id desc limit 20 offset ?",eventId,eventId,page*20);
  for(var row:rows)row.put("occurrences",support.mapper().readValue(row.get("occurrences").toString(),List.class));
  return Map.of("items",rows,"total",db().queryForObject("select count(*)"+from,Long.class,eventId,eventId),"page",page,"size",20);
 }
 @Transactional public void revokeEvent(long event,long user,Revoke input,Principal p){
  admin(p);if(input==null)throw ApiException.badRequest("입력 오류");validateText(input.reason(),4000,true);
  var peek=one("select claim_ticket_id from event_manager where event_id=? and user_id=?",event,user);
  UUID claim=(UUID)peek.get("claim_ticket_id");support.row(claim,true);
  var row=one("select * from event_manager where event_id=? and user_id=? for update",event,user);
  if(!claim.equals(row.get("claim_ticket_id"))||SupportService.n(row,"revision")!=input.revision()||!"ACTIVE".equals(row.get("state")))throw ApiException.conflict("관리 관계가 변경되었습니다.");
  db().update("update event_manager set state='REVOKED',revoked_by=?,revoked_at=now(),reason=?,revision=revision+1 where event_id=? and user_id=?",p.userId(),input.reason(),event,user);
  support.insertSystemMessage(claim,p,"행사 관리권이 회수되었습니다. 사유: "+input.reason());
  db().update("update support_ticket set revision=revision+1,updated_at=now() where id=?",claim);
  support.audit(claim,p.userId(),"ORGANIZER_REVOKED",Map.of("eventId",event,"userId",user,"reason",input.reason()));
 }
 public record SeriesInput(long revision,Long seriesId,String name,String officialUrl,String edition,String evidenceUrl,String note) {}
 public Map<String,Object> seriesLink(long event,Principal p){admin(p);one("select id from subculture_event_candidate where id=?",event);var rows=db().queryForList("select series_id as \"seriesId\",edition,revision,evidence_url as \"evidenceUrl\" from event_series_member where event_id=?",event);return rows.isEmpty()?Map.of("revision",0,"edition",""):rows.getFirst();}
 @Transactional public Map<String,Object> linkSeries(long event,SeriesInput input,Principal p){
  admin(p);if(input==null)throw ApiException.badRequest("입력 오류");
  validateText(input.note(),4000,true);validateText(input.edition(),160,false);validUrl(input.evidenceUrl());
  one("select id from subculture_event_candidate where id=? for update",event);
  var before=seriesLink(event,p);if(SupportService.n(before,"revision")!=input.revision())throw ApiException.conflict("회차 연결이 변경되었습니다.");
  Long series=input.seriesId();
  if(series==null&&input.name()!=null&&!input.name().isBlank()){
   validateText(input.name(),160,true);validUrl(input.officialUrl());
   series=db().queryForObject("insert into event_series(name,official_url,created_by) values(?,?,?) returning id",Long.class,input.name().strip(),input.officialUrl(),p.userId());
  } else if(series!=null)one("select id from event_series where id=?",series);
  db().update("""
   insert into event_series_member(event_id,series_id,edition,revision,evidence_url,checked_by) values(?,?,?,1,?,?)
   on conflict(event_id) do update set series_id=excluded.series_id,edition=excluded.edition,revision=event_series_member.revision+1,
    evidence_url=excluded.evidence_url,checked_by=excluded.checked_by,checked_at=now()
   """,event,series,input.edition()==null?"":input.edition().strip(),input.evidenceUrl(),p.userId());
  auditEdit("series_link",event,before,Map.of("seriesId",series==null?0:series,"evidenceUrl",input.evidenceUrl(),"note",input.note()),p.userId());return seriesLink(event,p);
 }
 /** Suggestions only: category and a user-selected title phrase; never an automatic merge. */
 public List<Map<String,Object>> candidates(long event,String q,Principal p){admin(p);validateText(q,100,true);if(q.strip().length()<2)throw ApiException.badRequest("두 글자 이상 입력해 주세요.");
  return db().queryForList("""
   select e.id,e.name,e.starts_on as "startsOn",e.venue_name as "venueName",e.review_state as "reviewState",m.series_id as "seriesId"
   from subculture_event_candidate e left join event_series_member m on m.event_id=e.id
   where e.id<>? and e.review_state<>'EXCLUDED' and e.subcategory=(select subcategory from subculture_event_candidate where id=?)
    and strpos(lower(e.name),lower(?))>0 order by e.starts_on desc,e.id desc limit 50
   """,event,event,q.strip());
 }
 public record OwnerEdit(long revision,Map<String,Object> fields,String note) {}
 public record ProductEdit(long revision,String name,String summary,String amount,String currency,String saleState,String note) {}
 public Map<String,Object> products(long event,long participant,long user){
  authority("PARTICIPANT",event,participant,user,false);publicEvent(event);
  var pub=one("select snapshot_json from subculture_catalog_publication where event_id=?",event);
  var booth=participants(support.obj(pub.get("snapshot_json"))).stream().filter(x->SupportService.n(x,"id")==participant).findFirst().orElseThrow(()->ApiException.notFound("공개 부스가 없습니다."));
  one("select id from subculture_participant where id=? and event_id=? and review_state<>'EXCLUDED'",participant,event);
  var sales=one("select revision,review_state from subculture_sales where participant_id=? and review_state<>'EXCLUDED'",participant);
  return Map.of("revision",sales.get("revision"),"items",booth.getOrDefault("productRows",List.of()),"directRegistration",direct(event,participant,user));
 }
 @Transactional public Map<String,Object> editProduct(long event,long participant,long product,ProductEdit input,long user){
  if(input==null)throw ApiException.badRequest("입력 오류");validateText(input.note(),2000,true);
  one("select id from subculture_event_candidate where id=? and review_state<>'EXCLUDED' for update",event);
  one("select id from subculture_participant where id=? and event_id=? and review_state<>'EXCLUDED' for update",participant,event);
  authority("PARTICIPANT",event,participant,user,true);
  var storedProduct=one("select * from subculture_catalog_product where id=? and participant_id=? for update",product,participant);
  var pub=one("select snapshot_json from subculture_catalog_publication where event_id=? for update",event);
  var snapshot=support.obj(pub.get("snapshot_json"));
  var booth=participants(snapshot).stream().filter(x->SupportService.n(x,"id")==participant).findFirst().orElseThrow(()->ApiException.notFound("공개 부스가 없습니다."));
  one("select participant_id from subculture_sales where participant_id=? and review_state<>'EXCLUDED'",participant);
  var productRows=maps(booth.get("productRows"));
  var row=productRows.stream().filter(x->x.get("id") instanceof Number n&&n.longValue()==product).findFirst().orElseThrow(()->ApiException.notFound("공개 상품이 아닙니다."));
  Map<String,Object> before=map(row.get("data")),after=new LinkedHashMap<>(before);
  after.put("name",input.name());after.put("summary",input.summary());after.put("saleState",input.saleState());
  if(input.amount()==null||input.amount().isBlank())after.put("price",null);
  else after.put("price",Map.of("amount",input.amount(),"currency",input.currency()==null?"KRW":input.currency(),"checkedOn",java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul")).toString(),"note",direct(event,participant,user)?"등록자 직접 입력":"확인된 운영자 입력"));
  try{com.boothhana.collection.CatalogRules.product(support.mapper().readValue(support.enc(after),com.boothhana.collection.CatalogModels.ProductData.class));}catch(RuntimeException e){throw ApiException.badRequest("상품명·설명·가격·판매 상태를 확인해 주세요.");}
  var sales=map(booth.get("sales"));var products=maps(sales.get("products"));
  var matching=products.stream().filter(before::equals).toList();if(matching.size()!=1)throw ApiException.conflict("상품 연결이 모호합니다. 관리자에게 연결 확인을 요청해 주세요.");
  int index=products.indexOf(matching.getFirst());products.set(index,after);row.put("data",after);
  var currentSales=one("select revision from subculture_sales where participant_id=? for update",participant);
  if(SupportService.n(currentSales,"revision")!=input.revision())throw ApiException.conflict("다른 수집/편집이 반영되었습니다. 다시 확인하세요.");
  // Persist only this product's display fields. Do not freeze the collected products array.
  Map<String,Object> ownerFields=new LinkedHashMap<>();
  for(String key:List.of("name","summary","price","saleState"))ownerFields.put(key,after.get(key));
  db().update("update subculture_catalog_product set owner_overrides_json=cast(? as jsonb) where id=?",support.enc(ownerFields),product);
  db().update("update subculture_sales set revision=revision+1 where participant_id=?",participant);
  auditEdit("owner_product",product,support.obj(storedProduct.get("owner_overrides_json")),Map.of("fields",ownerFields,"note",input.note()),user);
  snapshot.put("publishedAt",java.time.Instant.now().toString());
  db().update("update subculture_catalog_publication set snapshot_json=cast(? as jsonb),published_at=now() where event_id=?",support.enc(snapshot),event);
  return products(event,participant,user);
 }
 public static void validateFields(String type,Map<String,Object> fields){
  Set<String> allowed=switch(type){case "EVENT"->Set.of("description","venueName","address","admission","occurrences");case "PARTICIPANT"->Set.of("description","officialLinks");case "SALES"->Set.of("summary","salesMethod");default->throw ApiException.badRequest("편집 대상 오류");};
  if(fields==null||fields.isEmpty()||!allowed.containsAll(fields.keySet()))throw ApiException.badRequest("허용된 정보만 수정할 수 있습니다. 주최자·회차·부스 위치·공동 부스 구성은 관리자 확인이 필요합니다.");
 }
 private boolean direct(long event,long participant,long user){return !db().queryForList("select participant_id from catalog_creator_booth where event_id=? and participant_id=? and user_id=?",event,participant,user).isEmpty();}
 private void authority(String type,long event,long participant,long user,boolean lock){
  if("EVENT".equals(type)) {
   one("select event_id from event_manager where event_id=? and user_id=? and state='ACTIVE'"+(lock?" for update":""),event,user);return;
  }
  if(direct(event,participant,user))return;
  var members=db().queryForList("select exhibitor_id from subculture_participant_member where participant_id=?",participant);
  if(members.size()!=1)throw ApiException.forbidden("공동 부스 전체는 직접 수정할 수 없습니다. 본인 업체의 정정 요청을 이용해 주세요.");
  var target=new Target("CATALOG","PARTICIPANT",event,participant,null,null,null,null);
  var visible=support.targetResolver().resolve(target,user);
  var publicParticipant=map(map(map(visible.snapshot()).get("data")).get("participant"));
  if(maps(publicParticipant.get("members")).size()!=1)throw ApiException.forbidden("공개된 공동 부스는 정정 요청으로 처리해 주세요.");
  support.targetResolver().requireClaimable(target,SupportService.n(members.getFirst(),"exhibitor_id"));
  if(lock)one("select id from subculture_exhibitor where id=? for update",members.getFirst().get("exhibitor_id"));
  one("select exhibitor_id from exhibitor_manager where exhibitor_id=? and user_id=? and state='ACTIVE' and permission='CATALOG_EDIT'"+(lock?" for update":""),members.getFirst().get("exhibitor_id"),user);
 }
 public Map<String,Object> editable(String type,long event,long participant,long user){
  validateType(type);publicEvent(event);if(!"EVENT".equals(type))one("select id from subculture_participant where id=? and event_id=? and review_state<>'EXCLUDED'",participant,event);
  authority(type,event,participant,user,false);
  if("EVENT".equals(type)){var v=catalog.eventDetail(event);return Map.of("revision",v.get("revision"),"data",v.get("event"));}
  var v=catalog.participant(participant);
  if("PARTICIPANT".equals(type))return Map.of("revision",v.revision(),"data",v.data());
  one("select participant_id from subculture_sales where participant_id=? and review_state<>'EXCLUDED'",participant);
  if(v.sales()==null)throw ApiException.notFound("판매정보가 없습니다.");return Map.of("revision",v.sales().revision(),"data",v.sales().data());
 }
 private static void validateType(String type){if(!Set.of("EVENT","PARTICIPANT","SALES").contains(type))throw ApiException.badRequest("편집 대상 오류");}
 @Transactional public Map<String,Object> edit(String type,long event,long participant,OwnerEdit input,long user){
  if(input==null)throw ApiException.badRequest("입력 오류");validateFields(type,input.fields());validateText(input.note(),2000,true);
  if(direct(event,participant,user))throw ApiException.conflict("직접 등록한 부스 정보는 내 부스 목록에서 수정해 주세요.");
  // Same order as catalogue publication: event -> participant -> grant -> publication.
  one("select id from subculture_event_candidate where id=? and review_state<>'EXCLUDED' for update",event);
  if(!"EVENT".equals(type))one("select id from subculture_participant where id=? and event_id=? and review_state<>'EXCLUDED' for update",participant,event);
  authority(type,event,participant,user,true);
  if("SALES".equals(type))one("select participant_id from subculture_sales where participant_id=? and review_state<>'EXCLUDED'",participant);
  var pub=one("select snapshot_json from subculture_catalog_publication where event_id=? for update",event);
  Map<String,Object> snapshot=support.obj(pub.get("snapshot_json"));
  Map<String,Object> selected;
  if("EVENT".equals(type))selected=map(snapshot.get("event"));
  else {
   var row=participants(snapshot).stream().filter(x->SupportService.n(x,"id")==participant).findFirst().orElseThrow(()->ApiException.notFound("공개된 부스가 아닙니다."));
   selected=map(row.get("PARTICIPANT".equals(type)?"participant":"sales"));
  }
  var edit=new EditInput(input.revision(),"PENDING","확인된 운영자 수정: "+input.note(),input.fields(),List.of());
  // Keep any unrelated newly collected fields pending; publish ONLY these submitted fields.
  if("EVENT".equals(type))catalog.editEvent(event,edit);else if("PARTICIPANT".equals(type))catalog.editParticipant(participant,edit);else catalog.editSales(participant,edit);
  selected.putAll(input.fields());
  if("SALES".equals(type)&&input.fields().containsKey("summary"))participants(snapshot).stream().filter(x->SupportService.n(x,"id")==participant).findFirst().orElseThrow().put("salesSummaryOrigin","EDITORIAL");
  snapshot.put("publishedAt",java.time.Instant.now().toString());
  db().update("update subculture_catalog_publication set snapshot_json=cast(? as jsonb),published_at=now() where event_id=?",support.enc(snapshot),event);
  return editable(type,event,participant,user);
 }
 @SuppressWarnings("unchecked") private static Map<String,Object> map(Object v){if(!(v instanceof Map))throw ApiException.notFound("공개 정보가 없습니다.");return (Map<String,Object>)v;}
 @SuppressWarnings("unchecked") private static List<Map<String,Object>> participants(Map<String,Object> v){return (List<Map<String,Object>>)v.get("participants");}
 @SuppressWarnings("unchecked") private static List<Map<String,Object>> maps(Object v){if(!(v instanceof List))throw ApiException.notFound("공개 상품 정보가 없습니다.");return (List<Map<String,Object>>)v;}
 private void auditEdit(String type,long id,Object before,Object after,long user){db().update("insert into subculture_catalog_review_history(target_type,target_id,before_json,after_json,actor_id) values(?,?,cast(? as jsonb),cast(? as jsonb),?)",type,id,support.enc(before),support.enc(after),user);}
 private static void validateText(String v,int max,boolean required){try{SupportRules.text(v,max,required);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}}
 private static void validUrl(String url){try{SupportRules.evidence(List.of(url==null?"":url));}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}}
}
