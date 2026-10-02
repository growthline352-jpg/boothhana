package com.boothhana.collection;

import com.boothhana.api.ApiException;
import com.boothhana.service.CreatorBoothLimits;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;

/** Member-entered catalogue content. Never grants a verified exhibitor/organizer identity. */
@Service
@Transactional(readOnly=true)
public class CreatorCatalogBooths {
 private final JdbcTemplate db;private final JsonMapper json;
 public CreatorCatalogBooths(JdbcTemplate db,JsonMapper json){this.db=db;this.json=json;}
 public record Input(long boothId,String name,String description,List<String> subjects,String boothNumber,String startDate,String endDate) {}
 public record Update(long revision,Input booth) {}
 public record ProductInput(long revision,String name,String summary,String amount,String currency,String saleState) {}
 private String encode(Object v){return json.writeValueAsString(v);}
 @SuppressWarnings("unchecked") private Map<String,Object> object(Object v){return json.readValue(v.toString(),Map.class);}
 private long number(Map<String,Object> v,String key){return ((Number)v.get(key)).longValue();}
 private Map<String,Object> one(String sql,Object...args){var rows=db.queryForList(sql,args);if(rows.isEmpty())throw ApiException.notFound("등록할 행사 또는 본인 부스를 찾을 수 없습니다.");return rows.getFirst();}
 private String text(String value){return value==null?"":value.strip();}
 private String nullable(String value){String v=text(value);return v.isEmpty()?null:v;}
 private Map<String,Object> publication(long event,boolean lock){return one("select p.* from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id where p.event_id=? and e.review_state<>'EXCLUDED'"+(lock?" for update of p":""),event);}
 private EventData eventData(Map<String,Object> pub){return json.readValue(encode(object(pub.get("snapshot_json")).get("event")),EventData.class);}
 private void mutable(EventData e){
  String today=LocalDate.now(ZoneId.of("Asia/Seoul")).toString();
  if(e.occurrences().stream().noneMatch(o->o.endDate().compareTo(today)>=0)||Set.of("CANCELED","POSTPONED","RESCHEDULED").contains(e.operationStatus().state()))
   throw ApiException.conflict("종료되었거나 일정이 취소·변경된 행사에는 새 부스를 등록하거나 수정할 수 없습니다.");
 }
 private Map<String,Object> owned(long event,long participant,long user,boolean lock){
  return one("select p.*,c.base_booth_id from catalog_creator_booth c join subculture_participant p on p.id=c.participant_id where c.event_id=? and c.participant_id=? and c.user_id=? and p.review_state<>'EXCLUDED'"+(lock?" for update of p":""),event,participant,user);
 }
 private List<Source> sources(long event,long participant){return List.of(new Source("https://boothana.kr/discover/"+event+"/booths/"+participant,"OTHER","ORIGINAL","등록자가 직접 입력한 부스 정보"));}
 private Participant participant(long event,long id,Input i,Map<String,Object> base){
  if(i==null||i.boothId()<=0)throw ApiException.badRequest("기본 부스를 선택해 주세요.");
  String url=nullable(Objects.toString(base.get("sns_url"),""));
  String from=nullable(i.startDate()),to=nullable(i.endDate()),code=nullable(i.boothNumber());
  var locations=code==null&&from==null&&to==null?List.<Location>of():List.of(new Location(code,code==null?"UNKNOWN":"ASSIGNED",null,null,from,to,null,from==null?"UNKNOWN":"DECLARED"));
  if(i.subjects()!=null&&i.subjects().stream().anyMatch(Objects::isNull))throw ApiException.badRequest("주제 목록을 확인해 주세요.");
  var p=new Participant(null,text(i.name()),"UNKNOWN",List.of(new Member(String.valueOf(base.get("name")),"UNKNOWN",List.of(),url)),locations,
   i.subjects()==null?List.of():i.subjects().stream().map(String::strip).filter(s->!s.isEmpty()).distinct().toList(),text(i.description()),url==null?List.of():List.of(url),sources(event,id),List.of(),List.of());
  try{CatalogRules.participant(p);}catch(IllegalArgumentException ex){throw ApiException.badRequest("부스명·소개·주제·참가일·SNS 주소를 확인해 주세요.");}
  return p;
 }
 @SuppressWarnings("unchecked") private void publishBooth(long event,Map<String,Object> pub,long id,Participant p,Map<String,Object> salesRow){
  var snapshot=object(pub.get("snapshot_json"));var rows=(List<Map<String,Object>>)snapshot.get("participants");
  var row=rows.stream().filter(r->number(r,"id")==id).findFirst().orElseGet(()->{var r=new LinkedHashMap<String,Object>();r.put("id",id);r.put("sales",null);rows.add(r);return r;});
  row.put("directRegistration",true);row.put("participant",p);if(salesRow!=null)row.putAll(salesRow);
  snapshot.put("publishedAt",Instant.now().toString());
  String encoded=encode(snapshot);if(rows.size()>3000||encoded.length()>8*1024*1024)throw ApiException.conflict("이 행사의 공개 정보 한도를 초과했습니다. 고객센터로 문의해 주세요.");
  db.update("update subculture_catalog_publication set snapshot_json=cast(? as jsonb),published_at=now() where event_id=?",encoded,event);
 }
 public List<Map<String,Object>> mine(long user){return db.queryForList("""
  select c.event_id as "eventId",c.participant_id as "participantId",c.base_booth_id as "boothId",
   p.registration_name as name,p.revision,p.review_state as "reviewState",e.name as "eventName"
  from catalog_creator_booth c join subculture_participant p on p.id=c.participant_id
  join subculture_event_candidate e on e.id=c.event_id where c.user_id=? order by c.created_at desc
  """,user);}
 public Map<String,Object> detail(long event,long participant,long user){
  var row=owned(event,participant,user,false);publication(event,false);
  return Map.of("eventId",event,"participantId",participant,"boothId",row.get("base_booth_id"),"revision",row.get("revision"),"data",object(row.get("reviewed_payload_json")));
 }
 public Map<String,Object> availability(long event,long user){
  EventData e=eventData(publication(event,false));var ids=CreatorBoothLimits.owned(db,user,event);
  boolean open=true;try{mutable(e);}catch(ApiException ex){open=false;}
  return Map.of("canRegister",open&&ids.isEmpty(),"existingParticipantIds",ids,"eventOpen",open);
 }
 @Transactional public Map<String,Object> create(long event,long user,Input input){
  if(input==null)throw ApiException.badRequest("부스 정보를 입력해 주세요.");
  CreatorBoothLimits.lock(db,user);one("select id from subculture_event_candidate where id=? for update",event);
  var pub=publication(event,true);var e=eventData(pub);mutable(e);CreatorBoothLimits.available(db,user,event,null);
  var base=one("select * from booth where id=? and owner_user_id=? for update",input.boothId(),user);
  long id=db.queryForObject("select nextval(pg_get_serial_sequence('subculture_participant','id'))",Long.class);
  var p=participant(event,id,input,base);
  try{CatalogRules.locationDates(p,e);}catch(IllegalArgumentException ex){throw ApiException.badRequest("참가일은 행사 일정에 포함되어야 합니다.");}
  // A matching collected name must use the existing booth's ownership request.
  for(var r:db.queryForList("select registration_name from subculture_participant where event_id=? and review_state<>'EXCLUDED'",event))
   if(CollectionRules.normalize(String.valueOf(r.get("registration_name"))).equals(CollectionRules.normalize(p.registrationName())))
    throw ApiException.conflict("같은 이름의 부스가 이미 있습니다. 행사 부스 목록에서 본인 부스 연결을 요청해 주세요.");
  String payload=encode(p),key=CollectionRules.sha("creator:"+user+":"+event);
  db.update("insert into subculture_participant(id,event_id,identity_key,registration_name,payload_json,payload_hash,reviewed_payload_json,review_state,review_note) values(?,?,?,?,cast(? as jsonb),?,cast(? as jsonb),'REVIEWED','등록자 직접 등록')",id,event,key,p.registrationName(),payload,CollectionRules.sha(payload),payload);
  db.update("insert into catalog_creator_booth(participant_id,event_id,user_id,base_booth_id) values(?,?,?,?)",id,event,user,input.boothId());
  Sales sales=new Sales("판매 상품 준비 중","EVENT_LISTED",List.of(),List.of(),"",sources(event,id),List.of(),List.of(),List.of());String salesJson=encode(sales);
  db.update("insert into subculture_sales(participant_id,payload_json,payload_hash,reviewed_payload_json,review_state,review_note) values(?,cast(? as jsonb),?,cast(? as jsonb),'REVIEWED','등록자 직접 등록')",id,salesJson,CollectionRules.sha(salesJson),salesJson);
  publishBooth(event,pub,id,p,Map.of("sales",sales,"salesSummaryOrigin","EDITORIAL","productRows",List.of(),"productIds",Map.of()));
  audit(id,user,Map.of(),Map.of("action","SELF_REGISTER","booth",p));return detail(event,id,user);
 }
 @Transactional public Map<String,Object> update(long event,long participant,long user,Update input){
  if(input==null||input.booth()==null)throw ApiException.badRequest("부스 정보를 입력해 주세요.");
  CreatorBoothLimits.lock(db,user);one("select id from subculture_event_candidate where id=? for update",event);
  var row=owned(event,participant,user,true);var pub=publication(event,true);var e=eventData(pub);mutable(e);
  if(input.revision()!=number(row,"revision")||input.booth().boothId()!=number(row,"base_booth_id"))throw ApiException.conflict("부스 정보가 변경되었습니다. 다시 확인해 주세요.");
  var base=one("select * from booth where id=? and owner_user_id=?",input.booth().boothId(),user);var p=participant(event,participant,input.booth(),base);
  try{CatalogRules.locationDates(p,e);}catch(IllegalArgumentException ex){throw ApiException.badRequest("참가일은 행사 일정에 포함되어야 합니다.");}
  for(var r:db.queryForList("select registration_name from subculture_participant where event_id=? and id<>? and review_state<>'EXCLUDED'",event,participant))
   if(CollectionRules.normalize(String.valueOf(r.get("registration_name"))).equals(CollectionRules.normalize(p.registrationName())))throw ApiException.conflict("같은 이름의 다른 부스가 있습니다.");
  String payload=encode(p);db.update("update subculture_participant set payload_json=cast(? as jsonb),reviewed_payload_json=cast(? as jsonb),payload_hash=?,registration_name=?,overrides_json='{}'::jsonb,revision=revision+1,last_seen_at=now() where id=?",payload,payload,CollectionRules.sha(payload),p.registrationName(),participant);
  publishBooth(event,pub,participant,p,null);audit(participant,user,object(row.get("reviewed_payload_json")),Map.of("action","SELF_UPDATE","booth",p));return detail(event,participant,user);
 }
 @Transactional @SuppressWarnings("unchecked") public Map<String,Object> addProduct(long event,long participant,long user,ProductInput input){
  if(input==null)throw ApiException.badRequest("상품 정보를 입력해 주세요.");
  CreatorBoothLimits.lock(db,user);one("select id from subculture_event_candidate where id=? for update",event);
  var booth=owned(event,participant,user,true);var pub=publication(event,true);mutable(eventData(pub));
  var salesRow=one("select * from subculture_sales where participant_id=? and review_state<>'EXCLUDED' for update",participant);
  if(input.revision()!=number(salesRow,"revision"))throw ApiException.conflict("상품 목록이 변경되었습니다. 다시 확인해 주세요.");
  String entry=UUID.randomUUID().toString();var source=sources(event,participant);
  Price price=nullable(input.amount())==null?null:new Price(text(input.amount()),text(input.currency()),LocalDate.now(ZoneId.of("Asia/Seoul")).toString(),"등록자 직접 입력");
  var product=new ProductData(entry,text(input.name()),text(input.summary()),null,List.of(),List.of(),"EVENT_LISTED",price,input.saleState(),null,source,List.of(),List.of(),new Identity("https://boothana.kr",entry,null));
  try{CatalogRules.product(product);}catch(IllegalArgumentException ex){throw ApiException.badRequest("상품명·설명·가격·판매 상태를 확인해 주세요.");}
  var snapshot=object(pub.get("snapshot_json"));var publicBooth=((List<Map<String,Object>>)snapshot.get("participants")).stream().filter(r->number(r,"id")==participant).findFirst().orElseThrow(()->ApiException.notFound("공개 부스를 찾을 수 없습니다."));
  var sales=json.readValue(encode(publicBooth.get("sales")),Sales.class);var products=new ArrayList<>(sales.products());if(products.size()>=100)throw ApiException.conflict("한 부스에는 상품을 100개까지 등록할 수 있습니다.");products.add(product);
  var keys=CatalogIdentity.productKeys(product);long id=db.queryForObject("insert into subculture_catalog_product(participant_id,identity_key,identity_aliases,name,payload_json) values(?,?,cast(? as jsonb),?,cast(? as jsonb)) returning id",Long.class,participant,keys.getFirst(),encode(keys),product.name(),encode(product));
  Sales next=new Sales(sales.summary(),sales.evidenceScope(),sales.categories(),sales.subjects(),sales.salesMethod(),sales.sources(),sales.images(),products,sales.warnings());String encoded=encode(next);
  ProductCheck check=new ProductCheck("CONFIRMED_CURRENT",Instant.now().toString());var checks=object(salesRow.get("product_checks_json"));checks.put(Long.toString(id),check);
  db.update("update subculture_sales set payload_json=cast(? as jsonb),reviewed_payload_json=cast(? as jsonb),payload_hash=?,product_checks_json=cast(? as jsonb),reviewed_product_checks_json=cast(? as jsonb),revision=revision+1 where participant_id=?",encoded,encoded,CollectionRules.sha(encoded),encode(checks),encode(checks),participant);
  var rows=new ArrayList<>((List<Map<String,Object>>)publicBooth.getOrDefault("productRows",List.of()));rows.add(Map.of("id",id,"data",product,"verification",check));
  var ids=new LinkedHashMap<>((Map<String,Object>)publicBooth.getOrDefault("productIds",Map.of()));ids.put(Long.toString(id),id);
  publishBooth(event,pub,participant,json.readValue(booth.get("reviewed_payload_json").toString(),Participant.class),Map.of("sales",next,"productRows",rows,"productIds",ids,"salesSummaryOrigin","EDITORIAL"));
  audit(participant,user,Map.of(),Map.of("action","SELF_PRODUCT_ADD","productId",id));return Map.of("revision",number(salesRow,"revision")+1,"items",rows);
 }
 private void audit(long id,long user,Object before,Object after){db.update("insert into subculture_catalog_review_history(target_type,target_id,before_json,after_json,actor_id) values('creator_booth',?,cast(? as jsonb),cast(? as jsonb),?)",id,encode(before),encode(after),user);}
}
