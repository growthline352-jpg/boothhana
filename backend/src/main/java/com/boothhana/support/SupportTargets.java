package com.boothhana.support;

import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogPublicationService;
import com.boothhana.floorplan.FloorplanService;
import com.boothhana.service.PlatformService;
import com.boothhana.domain.UserAccount;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

/** Resolve only currently PUBLIC targets or the caller's own reservation. Never trust client snapshots. */
@Service
public class SupportTargets {
 private final CatalogPublicationService publications;private final FloorplanService plans;
 private final PlatformService platform;private final JdbcTemplate db;private final JsonMapper json;
 public SupportTargets(CatalogPublicationService publications,FloorplanService plans,PlatformService platform,JdbcTemplate db,JsonMapper json){this.publications=publications;this.plans=plans;this.platform=platform;this.db=db;this.json=json;}
 @SuppressWarnings("unchecked") public Map<String,Object> map(Object x){return json.readValue(json.writeValueAsString(x),Map.class);}
 public String hash(Object x){return SupportRules.digest(json.writeValueAsString(canonical(x)));}
 private Object canonical(Object x){
  if(x instanceof Map<?,?> m){Map<String,Object> out=new TreeMap<>();m.forEach((k,v)->out.put(k.toString(),canonical(v)));return out;}
  if(x instanceof List<?> list)return list.stream().map(this::canonical).toList();return x;
 }
 private static long number(Object x){return x instanceof Number n?n.longValue():-1;}
 @SuppressWarnings("unchecked") private static List<Map<String,Object>> list(Object x){return x instanceof List<?>?(List<Map<String,Object>>)x:List.of();}
 private static String s(Object x){return x==null?"":x.toString();}
 private static Map<String,Object> item(List<Map<String,Object>> list,long id){return list.stream().filter(p->number(p.get("id"))==id).findFirst().orElseThrow(()->ApiException.notFound("현재 공개된 신고 대상을 찾을 수 없습니다."));}
 public Resolved resolve(Target t,Long owner){
  if(t==null||t.namespace()==null||t.type()==null)throw ApiException.badRequest("대상을 확인해 주세요.");
  if(!Set.of("CATALOG","PLATFORM").contains(t.namespace()))throw ApiException.badRequest("대상 구분 오류");
  try{SupportRules.text(t.areaId(),100,false);SupportRules.text(t.hall(),100,false);if(t.day()!=null&&!t.day().isBlank())java.time.LocalDate.parse(t.day());}catch(RuntimeException e){throw ApiException.badRequest("방문 날짜·위치를 확인해 주세요.");}
  Map<String,Object> snapshot=new LinkedHashMap<>();String label,route;long event=t.eventId();Long id=t.id();
  if("CATALOG".equals(t.namespace())){
   if(event<1)throw ApiException.badRequest("행사를 확인해 주세요.");
   var detail=map(publications.findPublicDetail(event).orElseThrow(() -> ApiException.notFound("공개된 안내를 찾을 수 없습니다.")));var ev=map(detail.get("event"));String eventName=s(ev.get("name"));
   route="/discover/"+event;label=eventName;
   snapshot.put("eventName",eventName);snapshot.put("publishedAt",detail.get("publishedAt"));
   switch(t.type()){
    case "EVENT"->{if(id!=null&&id!=event)throw ApiException.badRequest("행사 ID 불일치");id=event;snapshot.put("data",ev);}
    case "PARTICIPANT"->{if(id==null)throw ApiException.badRequest("부스를 선택하세요.");var p=item(list(detail.get("participants")),id);snapshot.put("data",p);label=s(map(p.get("participant")).get("registrationName"));route+="?booth="+id;}
    case "PRODUCT"->{if(id==null)throw ApiException.badRequest("상품을 선택하세요.");Map<String,Object> found=null;long pid=0;
     for(var p:list(detail.get("participants")))for(var product:list(p.get("productRows")))if(number(product.get("id"))==id){found=product;pid=number(p.get("id"));}
     if(found==null)throw ApiException.notFound("현재 공개된 상품이 없습니다.");snapshot.put("participantId",pid);snapshot.put("data",found);label=s(map(found.get("data")).get("name"));route+="?booth="+pid;
    }
    case "ASSET"->{if(id==null)throw ApiException.badRequest("이미지를 선택하세요.");var a=item(list(detail.get("assets")),id);snapshot.put("data",a);label=eventName+" · "+s(a.get("type"))+" 이미지";}
    case "FLOORPLAN"->{if(t.planId()==null)throw ApiException.badRequest("배치도 버전을 선택하세요.");try{UUID.fromString(t.planId());}catch(RuntimeException e){throw ApiException.badRequest("배치도 ID 오류");}
     var result=map(plans.findPublicPlans(event).orElseThrow(() -> ApiException.notFound("공개된 배치도가 없습니다.")));var plan=list(result.get("plans")).stream().filter(p->t.planId().equals(s(p.get("id")))).findFirst().orElseThrow(()->ApiException.notFound("현재 공개된 배치도 버전이 없습니다."));
     if (!"READY".equals(plan.get("state"))) throw ApiException.notFound("현재 공개된 위치 연결이 없습니다.");
     Map<String,Object> publicPlan=new LinkedHashMap<>(plan);
     if(t.areaId()!=null&&!t.areaId().isBlank()){
      var shape=list(plan.get("shapes")).stream().filter(p->t.areaId().equals(s(p.get("id")))).findFirst().orElseThrow(()->ApiException.notFound("배치도 위치가 변경되었습니다. 행사 정보 신고를 이용해 주세요."));publicPlan.remove("shapes");publicPlan.put("selectedShape",shape);
     }
     snapshot.put("data",publicPlan);label=eventName+" · 배치도 "+(t.areaId()==null?"":t.areaId());route+="?view=map";id=null;
    }
    default->throw ApiException.badRequest("신고할 수 없는 대상입니다.");
   }
  }else{
   if(id==null||id<1)throw ApiException.badRequest("대상을 선택하세요.");Object data;
   switch(t.type()){
    case "EVENT"->{var v=platform.findPublicEvent(id).orElseThrow(() -> ApiException.notFound("현재 공개된 대상을 찾을 수 없습니다."));data=v;event=id;label=v.name();route="/events/"+id;}
    case "BOOTH"->{var v=platform.findPublicBooth(id).orElseThrow(() -> ApiException.notFound("현재 공개된 대상을 찾을 수 없습니다."));data=v;event=v.eventId();label=v.name();route="/booths/"+id;}
    case "PRODUCT"->{var v=platform.findPublicProduct(id).orElseThrow(() -> ApiException.notFound("현재 공개된 대상을 찾을 수 없습니다."));var b=platform.findPublicBooth(v.eventBoothId()).orElseThrow(() -> ApiException.notFound("현재 공개된 대상을 찾을 수 없습니다."));data=v;event=b.eventId();label=v.name();route="/products/"+id;}
    case "RESERVATION"->{if(owner==null)throw ApiException.notFound("본인 예약만 문의할 수 있습니다.");UserAccount u=new UserAccount();u.id=owner;var v=platform.findUserReservation(u,id).orElseThrow(() -> ApiException.notFound("현재 공개된 대상을 찾을 수 없습니다."));var b=db.queryForList("select event_id from event_booth where id=?",v.eventBoothId());event=number(b.getFirst().get("event_id"));data=Map.of("reservationNo",v.reservationNo(),"status",v.status(),"eventName",v.eventName(),"boothName",v.boothName());label=v.reservationNo();route="/reservations/"+id;}
    default->throw ApiException.badRequest("운영 대상 유형 오류");
   }
   if(t.eventId()!=0&&t.eventId()!=event)throw ApiException.badRequest("부모 행사 불일치");snapshot.put("data",map(data));
  }
  snapshot.put("label",label);snapshot.put("route",route);
  Target normalized=new Target(t.namespace(),t.type(),event,id,t.planId(),t.areaId(),t.day(),t.hall());
  // Labels/version and caller's selected date are provenance, NOT part of content-change evidence.
  Object comparable = snapshot.get("data");
  if ("FLOORPLAN".equals(t.type())) {
   comparable = SupportComparison.floorplan(map(comparable), t.areaId());
   snapshot.put("comparisonVersion", SupportComparison.VERSION);
   snapshot.put("comparisonData", comparable);
  }
  if (!"FLOORPLAN".equals(t.type())) {
   var projection=SupportComparison.business(snapshot,normalized,"OTHER");
   if(projection.isPresent()) { comparable=projection.get(); snapshot.put("comparisonVersion",SupportComparison.BUSINESS_VERSION); snapshot.put("comparisonData",comparable); }
  }
  return new Resolved(normalized,label,route,snapshot,hash(comparable),true);
 }
 public Resolved current(Target target,Long owner){try{return resolve(target,owner);}catch(ApiException e){if(e.status.value()!=404)throw e;return new Resolved(target,"현재 비공개 또는 삭제된 대상","",Map.of(),hash(Map.of("visible",false)),false);}}
 /** IDs exposed only when an exact public member is also in the current membership relation. */
 public List<Map<String,Object>> claimables(long event,long participant){
  if(!db.queryForList("select 1 from catalog_creator_booth where event_id=? and participant_id=?",event,participant).isEmpty())return List.of();
  var resolved=resolve(new Target("CATALOG","PARTICIPANT",event,participant,null,null,null,null),null);
  var participantData=map(map(resolved.snapshot()).get("data"));var p=map(participantData.get("participant"));
  List<Map<String,Object>> members=list(p.get("members")),out=new ArrayList<>();
  for(var r:db.queryForList("select e.id,e.name,e.profile_json from subculture_participant_member m join subculture_exhibitor e on e.id=m.exhibitor_id where m.participant_id=? order by e.id",participant)){
   var profile=json.readValue(r.get("profile_json").toString(),Map.class);
   if(members.stream().anyMatch(m->Objects.equals(m.get("name"),profile.get("name"))&&Objects.equals(m.get("profileUrl"),profile.get("profileUrl")))){
    Map<String,Object> safe=new LinkedHashMap<>();safe.put("id",r.get("id"));safe.put("name",profile.get("name"));safe.put("profileUrl",profile.get("profileUrl"));out.add(safe);
   }
  }
  return out;
 }
 public void requireClaimable(Target t,long exhibitor){
  if(!"CATALOG".equals(t.namespace())||!"PARTICIPANT".equals(t.type())||t.id()==null||claimables(t.eventId(),t.id()).stream().noneMatch(x->number(x.get("id"))==exhibitor))throw ApiException.badRequest("공개된 공동 부스의 해당 구성원을 확인해 주세요.");
 }
}
