package com.boothhana.floorplan;
import com.boothhana.api.ApiException;
import com.boothhana.collection.*;
import com.boothhana.upload.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import java.time.*;
import java.sql.Timestamp;
import java.io.*;
import static com.boothhana.floorplan.FloorplanModels.*;
import static com.boothhana.collection.CollectionModels.*;

/** Versioned source + coordinates + roster mapping. Worker can collect, NEVER approve or publish. */
@Service
@Transactional(readOnly=true)
public class FloorplanService {
 private final JdbcTemplate db;private final JsonMapper json;private final CatalogMediaService media;private final VerifiedImageStorage storage;private final String imageBase;
 public FloorplanService(JdbcTemplate db,JsonMapper json,CatalogMediaService media,VerifiedImageStorage storage,@Value("${app.storage.public-url:}") String base){this.db=db;this.json=json;this.media=media;this.storage=storage;this.imageBase=base.replaceAll("/$","");}
 private String enc(Object v){return json.writeValueAsString(v);} private <T>T dec(Object v,Class<T> c){return json.readValue(v.toString(),c);}
 private Map<String,Object> one(String q,Object... args){var rows=db.queryForList(q,args);if(rows.isEmpty())throw ApiException.notFound("배치도 대상을 찾을 수 없습니다.");return rows.getFirst();}
 private static long num(Map<String,Object> r,String k){return ((Number)r.get(k)).longValue();}
 private static String stamp(Object v){return v instanceof Timestamp t?t.toInstant().toString():Objects.toString(v,"");}
 @SuppressWarnings("unchecked") private <T>T effective(Map<String,Object> r,Class<T> c){Map<String,Object> v=dec(r.get("payload_json"),Map.class);v.putAll(dec(r.get("overrides_json"),Map.class));return dec(enc(v),c);}
 private Map<String,Object> event(long id,boolean lock){if(lock)db.execute("SET LOCAL lock_timeout='5s'");var r=one("select * from subculture_event_candidate where id=?"+(lock?" for update":""),id);if("EXCLUDED".equals(r.get("review_state")))throw ApiException.conflict("제외한 행사입니다.");return r;}
 private void watch(long id){db.update("insert into subculture_floorplan_watch(event_id) values(?) on conflict do nothing",id);}
 private static UUID uuid(String text){try{return UUID.fromString(text);}catch(RuntimeException e){throw ApiException.badRequest("올바른 작업 UUID가 필요합니다.");}}
 private void lease(long id,String token){event(id,true);var r=one("select * from subculture_floorplan_watch where event_id=? for update",id);if(Boolean.TRUE.equals(r.get("disabled"))||!uuid(token).equals(r.get("lease_id"))||r.get("lease_until")==null||((Timestamp)r.get("lease_until")).toInstant().isBefore(Instant.now()))throw ApiException.conflict("배치도 작업 권한이 만료되었습니다.");db.update("update subculture_floorplan_watch set lease_until=now()+interval '25 minutes' where event_id=?",id);}
 private List<String> eventDates(EventData e){List<String> days=new ArrayList<>();for(var o:e.occurrences()){LocalDate end=LocalDate.parse(o.endDate());for(LocalDate d=LocalDate.parse(o.startDate());!d.isAfter(end);d=d.plusDays(1)){if(days.size()>366)break;days.add(d.toString());}}return days;}
 private List<Map<String,Object>> floorplanHints(long id,EventData event){Map<String,List<Place>> grouped=new LinkedHashMap<>();List<String> eventDays=eventDates(event);
  // A map URL remains useful as a discovery seed even when the booth number is
  // still UNKNOWN, so hints are read from every collected location. Mapping itself
  // continues to use only ASSIGNED locations through roster().
  for(var row:db.queryForList("select * from subculture_participant where event_id=? and review_state<>'EXCLUDED' order by id",id)){
   CatalogModels.Participant participant=effective(row,CatalogModels.Participant.class);
   for(CatalogModels.Location location:participant.locations())if(location.floorPlanUrl()!=null&&!location.floorPlanUrl().isBlank()){
    List<String> dates=new ArrayList<>();if(location.startDate()!=null&&location.endDate()!=null){for(LocalDate d=LocalDate.parse(location.startDate()),end=LocalDate.parse(location.endDate());!d.isAfter(end)&&dates.size()<367;d=d.plusDays(1))dates.add(d.toString());}else dates.addAll(eventDays);
    grouped.computeIfAbsent(location.floorPlanUrl(),k->new ArrayList<>()).add(new Place(location.code(),location.hall(),location.zone(),dates,location.floorPlanUrl()));
   }
  }
  List<Map<String,Object>> out=new ArrayList<>();for(var entry:grouped.entrySet()){
   List<Place> places=entry.getValue();Set<String> halls=new TreeSet<>(),zones=new TreeSet<>(),dates=new TreeSet<>();
   for(Place p:places){if(p.hall()!=null&&!p.hall().isBlank())halls.add(p.hall());if(p.zone()!=null&&!p.zone().isBlank())zones.add(p.zone());dates.addAll(p.dates());}
   Map<String,Object> hint=new LinkedHashMap<>();hint.put("url",entry.getKey());hint.put("hall",halls.size()==1?halls.iterator().next():null);hint.put("zone",zones.size()==1?zones.iterator().next():null);
   hint.put("dates",dates.isEmpty()?eventDates(event):List.copyOf(dates));hint.put("title",event.name()+" 배치도");hint.put("evidence","참가부스 위치 데이터에 연결된 배치도 URL. 공식 원문을 다시 확인해야 함.");out.add(hint);
   if(out.size()==20)break;
  }return out;
 }
 private PlanScope verifiedScope(PlanScope s,EventData e){FloorplanRules.scope(s);Set<String> days=new HashSet<>(eventDates(e));if(!days.containsAll(s.dates()))throw ApiException.badRequest("배치도 적용 날짜가 행사 운영일과 다릅니다.");return s;}
 private String scopeKey(long asset,PlanScope s){return CollectionRules.sha(FloorplanRules.scopeIdentity(asset,s));}

 @Transactional public List<Map<String,Object>> targets(boolean imminent,int limit){
  if(limit<1||limit>100)throw ApiException.badRequest("조회 한도 오류");
  db.update("insert into subculture_floorplan_watch(event_id) select id from subculture_event_candidate where review_state<>'EXCLUDED' on conflict do nothing");
  // Actual non-contiguous occurrences, not announcement dates. Effective admin corrections are respected.
  var rows=db.queryForList("""
   select e.*,w.last_checked_at,w.next_check_at,w.last_status from subculture_event_candidate e
   join subculture_floorplan_watch w on w.event_id=e.id
   where e.review_state<>'EXCLUDED' and not w.disabled and (
      w.next_check_at<=now() or (? and w.last_checked_at<now()-interval '1 day')
      or exists(select 1 from jsonb_array_elements(coalesce((e.payload_json||e.overrides_json)->'discoveryLinks','[]'::jsonb)) link
        where link->>'kind'='FLOOR_PLAN' and nullif(link->>'url','') is not null
        and not coalesce(w.result_json->'checkedUrls','[]'::jsonb) @> jsonb_build_array(to_jsonb(link->>'url')))
      or exists(select 1 from subculture_participant p
        cross join lateral jsonb_array_elements(coalesce((p.payload_json||p.overrides_json)->'locations','[]'::jsonb)) location
        where p.event_id=e.id and p.review_state<>'EXCLUDED' and nullif(location->>'floorPlanUrl','') is not null
        and not coalesce(w.result_json->'checkedUrls','[]'::jsonb) @> jsonb_build_array(to_jsonb(location->>'floorPlanUrl')))
    )
    and (w.lease_until is null or w.lease_until<now())
    and exists(select 1 from jsonb_array_elements((e.payload_json||e.overrides_json)->'occurrences') o
      where (o->>'endDate')::date >= (now() at time zone 'Asia/Seoul')::date
      and (o->>'startDate')::date <= (now() at time zone 'Asia/Seoul')::date + ?)
   order by w.next_check_at,e.id limit ?
   """,imminent,imminent?14:90,limit);
  return rows.stream().map(r->{Map<String,Object> out=new LinkedHashMap<>();long id=num(r,"id");EventData data=effective(r,EventData.class);out.put("eventId",id);out.put("event",data);out.put("floorplanHints",floorplanHints(id,data));out.put("status",r.get("last_status"));out.put("nextCheckAt",stamp(r.get("next_check_at")));return out;}).toList();
 }
 @Transactional public Map<String,Object> claim(long id,Claim c){event(id,true);watch(id);UUID token=uuid(c.leaseId());int n=db.update("update subculture_floorplan_watch set lease_id=?,lease_until=now()+interval '25 minutes' where event_id=? and not disabled and (lease_until is null or lease_until<now() or lease_id=?)",token,id,token);if(n!=1)throw ApiException.conflict("다른 배치도 작업이 실행 중입니다.");return Map.of("leaseId",token.toString());}
 @Transactional public Map<String,Object> heartbeat(long id,Claim c){lease(id,c.leaseId());return Map.of("leaseId",c.leaseId());}
 @Transactional public Map<String,Object> observe(long id,Observation input){
  lease(id,input.leaseId());String hash=CollectionRules.sha(enc(input.result()));UUID request=uuid(input.requestId());
  var old=db.queryForList("select * from subculture_floorplan_receipt where request_id=?",request);
  if(!old.isEmpty()){if(num(old.getFirst(),"event_id")!=id||!hash.equals(old.getFirst().get("request_hash")))throw ApiException.conflict("다른 내용의 수집 재전송");return dec(old.getFirst().get("response_json"),Map.class);}
  Discovery d=input.result();if(d==null||(d.status()==null||!Set.of("FOUND","NOT_FOUND","ANNOUNCED","ERROR").contains(d.status()))||d.plans()==null||d.plans().size()>20||d.checkedUrls()==null||d.checkedUrls().size()>30||d.warnings()==null||d.warnings().size()>50)throw ApiException.badRequest("배치도 탐색 형식 오류");
  if(!"ERROR".equals(d.status())&&(!input.webSearchObserved()||d.checkedUrls().isEmpty()))throw ApiException.badRequest("실제 웹 검색·확인 주소가 없습니다.");
  if("FOUND".equals(d.status())!=!d.plans().isEmpty())throw ApiException.badRequest("발견 상태와 배치도 개수가 다릅니다.");
  d.checkedUrls().forEach(CollectionRules::url);d.warnings().forEach(s->FloorplanRules.text(s,1000,true));
  EventData ev=effective(event(id,false),EventData.class);
  List<Long> ids=new ArrayList<>();
  for(PlanSource p:d.plans()){
   if(p==null)throw ApiException.badRequest("빈 배치도 원본");
   CollectionRules.url(p.imageUrl());CollectionRules.url(p.pageUrl());FloorplanRules.text(p.evidence(),1000,true);verifiedScope(p.scope(),ev);
   media.register(id,null,null,new CatalogModels.Image("FLOOR_PLAN",p.imageUrl(),p.pageUrl(),null,p.scope().title()));
   long asset=Objects.requireNonNull(db.queryForObject("select id from subculture_catalog_asset where event_id=? and participant_id is null and product_id is null and type='FLOOR_PLAN' and image_url=? and page_url=?",Long.class,id,p.imageUrl(),p.pageUrl()));
   // Never silently replace an administrator-reviewed scope on an existing source.
   db.update("insert into subculture_floorplan_source(asset_id,scope_json) values(?,cast(? as jsonb)) on conflict do nothing",asset,enc(p.scope()));ids.add(asset);
  }
  LocalDate today=LocalDate.now(ZoneId.of("Asia/Seoul"));List<String> ds=eventDates(ev);LocalDate end=LocalDate.parse(Collections.max(ds));
  LocalDate start=ds.stream().map(LocalDate::parse).filter(x->!x.isBefore(today)).min(LocalDate::compareTo).orElse(end);
  LocalDate announced=d.availableOn()==null?null:LocalDate.parse(d.availableOn());
  Instant next=FloorplanRules.nextCheck(today,start,end,d.status(),announced,Instant.now());
  db.update("update subculture_floorplan_watch set last_status=?,last_checked_at=now(),next_check_at=?,announced_on=?,result_json=cast(? as jsonb),last_error='',revision=revision+1 where event_id=?",d.status(),Timestamp.from(next),announced==null?null:java.sql.Date.valueOf(announced),enc(d),id);
  Map<String,Object> response=Map.of("requestId",input.requestId(),"assetIds",ids,"nextCheckAt",next.toString());
  db.update("insert into subculture_floorplan_receipt(request_id,event_id,request_hash,response_json) values(?,?,?,cast(? as jsonb))",request,id,hash,enc(response));return response;
 }
 public List<Map<String,Object>> sources(long id){event(id,false);var list=new ArrayList<Map<String,Object>>();for(var a:media.assets(id,null))if(a.participantId()==null&&a.productId()==null&&"FLOOR_PLAN".equals(a.type())){
  var rows=db.queryForList("select * from subculture_floorplan_source where asset_id=?",a.id());Map<String,Object> m=new LinkedHashMap<>();m.put("asset",a);m.put("scope",rows.isEmpty()?new PlanScope(null,null,List.of(),Objects.toString(a.caption(),"배치도")):dec(rows.getFirst().get("scope_json"),PlanScope.class));m.put("canTransform",!rows.isEmpty()&&Boolean.TRUE.equals(rows.getFirst().get("can_transform")));m.put("sourceRevision",rows.isEmpty()?0:num(rows.getFirst(),"revision"));m.put("lastError",rows.isEmpty()?"":rows.getFirst().get("last_error"));m.put("checkedAt",rows.isEmpty()?"":stamp(rows.getFirst().get("checked_at")));list.add(m);
 }list.sort(Comparator.comparing(m->Objects.toString(m.get("checkedAt"),"")));return list;}
 @Transactional public Map<String,Object> permit(long id,long asset,Permission p){
  event(id,true);var a=media.detail(asset);if(a.eventId()!=id||a.participantId()!=null||!"FLOOR_PLAN".equals(a.type()))throw ApiException.badRequest("이 행사의 배치도가 아닙니다.");
  FloorplanRules.text(p.note(),2000,true);FloorplanRules.text(p.credit(),1000,true);
  db.update("insert into subculture_floorplan_source(asset_id,scope_json) values(?,cast(? as jsonb)) on conflict do nothing",asset,enc(new PlanScope(null,null,List.of(),Objects.toString(a.caption(),"배치도"))));
  var s=one("select * from subculture_floorplan_source where asset_id=? for update",asset);long rev=num(s,"revision");if(p.sourceRevision()!=0&&p.sourceRevision()!=rev)throw ApiException.conflict("이미지 범위 변경됨");
  // Existing untracked source has revision 1, but an old screen must never bypass CAS after first approval.
  if(p.sourceRevision()==0&&(Boolean.TRUE.equals(s.get("can_transform"))||rev!=1))throw ApiException.conflict("이미지 권한 변경됨");
  media.rights(asset,new CatalogModels.RightsInput(p.assetRevision(),p.allowed()?"APPROVED":"REJECTED",p.note(),p.credit()));
  db.update("update subculture_floorplan_source set can_transform=?,transform_note=?,revision=revision+1 where asset_id=?",p.allowed(),p.note(),asset);
  watch(id);db.update("update subculture_floorplan_watch set next_check_at=least(next_check_at,now()),revision=revision+1 where event_id=?",id);return Map.of("saved",true);
 }
 @Transactional public Map<String,Object> editSource(long eventId,long assetId,SourceEdit input){
  EventData ev=effective(event(eventId,true),EventData.class);PlanScope scope=verifiedScope(input.scope(),ev);
  var a=media.detail(assetId);if(a.eventId()!=eventId)throw ApiException.badRequest("다른 행사 이미지");
  if(db.update("update subculture_floorplan_source set scope_json=cast(? as jsonb),revision=revision+1 where asset_id=? and revision=?",enc(scope),assetId,input.revision())!=1)throw ApiException.conflict("원본 범위가 변경되었습니다.");
  watch(eventId);db.update("update subculture_floorplan_watch set next_check_at=now() where event_id=?",eventId);return Map.of("saved",true);
 }
 @Transactional public Map<String,Object> begin(long eventId,Begin b){
  lease(eventId,b.leaseId());var source=one("select s.*,a.event_id,a.rights_state,a.type from subculture_floorplan_source s join subculture_catalog_asset a on a.id=s.asset_id where s.asset_id=? for update of s",b.assetId());
  if(num(source,"event_id")!=eventId||!Boolean.TRUE.equals(source.get("can_transform"))||!"APPROVED".equals(source.get("rights_state")))throw ApiException.forbidden("배치도 원본 사용·분석·변환 허용이 필요합니다.");
  if(b.sourceRevision()!=num(source,"revision"))throw ApiException.conflict("원본 사용 권한·범위가 변경되었습니다.");
  if(b.sha256()==null||!b.sha256().matches("[a-f0-9]{64}")||b.width()<=0||b.height()<=0||(long)b.width()*b.height()>25_000_000||b.size()<1||b.size()>10485760||(b.contentType()==null||!Set.of("image/png","image/jpeg","image/webp","image/gif").contains(b.contentType())))throw ApiException.badRequest("원본 파일 메타데이터 오류");
  PlanScope scope=dec(source.get("scope_json"),PlanScope.class);String key=scopeKey(b.assetId(),scope);
  UUID id=UUID.nameUUIDFromBytes((b.assetId()+":"+key+":"+b.sha256()).getBytes(java.nio.charset.StandardCharsets.UTF_8));
  db.update("insert into subculture_floorplan_version(id,event_id,asset_id,scope_key,scope_json,sha256,image_width,image_height,byte_size,content_type) values(?,?,?,?,cast(? as jsonb),?,?,?,?,?) on conflict(asset_id,scope_key,sha256) do nothing",id,eventId,b.assetId(),key,enc(scope),b.sha256(),b.width(),b.height(),b.size(),b.contentType());
  var previous=versionRow(id);
  if(num(previous,"image_width")!=b.width()||num(previous,"image_height")!=b.height()||num(previous,"byte_size")!=b.size()||!b.contentType().equals(previous.get("content_type")))throw ApiException.conflict("같은 원본의 메타데이터가 다릅니다.");
  db.update("update subculture_floorplan_source set current_sha256=?,checked_at=now() where asset_id=?",b.sha256(),b.assetId());
  return version(id);
 }
 private Map<String,Object> versionRow(UUID id){return one("select * from subculture_floorplan_version where id=?",id);}
 @SuppressWarnings("unchecked") public Map<String,Object> version(UUID id){var r=versionRow(id);var a=media.detail(num(r,"asset_id"));Map<String,Object> v=new LinkedHashMap<>();
  for(String k:List.of("id","event_id","asset_id","state","revision","sha256","image_width","image_height"))v.put(k,r.get(k) instanceof UUID u?u.toString():r.get(k));
  v.put("scope",dec(r.get("scope_json"),PlanScope.class));v.put("geometry",r.get("geometry_json")==null?null:dec(r.get("geometry_json"),Geometry.class));v.put("mapping",r.get("mapping_json")==null?null:dec(r.get("mapping_json"),Mapping.class));
  v.put("manualLinks",dec(r.get("manual_links_json"),Map.class));v.put("createdAt",stamp(r.get("created_at")));v.put("updatedAt",stamp(r.get("updated_at")));v.put("note",r.get("review_note"));v.put("imageUrl",r.get("object_key")==null||imageBase.isBlank()||!"APPROVED".equals(a.rightsState())?null:imageBase+"/"+r.get("object_key"));v.put("pageUrl",a.pageUrl());v.put("credit",a.credit());return v;
 }
 @Transactional(timeout=70) public Map<String,Object> content(UUID id,String token,InputStream stream)throws IOException{
  var r=versionRow(id);long eventId=num(r,"event_id");lease(eventId,token);
  var s=one("select * from subculture_floorplan_source where asset_id=? for update",num(r,"asset_id"));var a=media.detail(num(r,"asset_id"));
  if(!Boolean.TRUE.equals(s.get("can_transform"))||!"APPROVED".equals(a.rightsState()))throw ApiException.forbidden("배치도 권한이 철회되었습니다.");
  r=one("select * from subculture_floorplan_version where id=? for update",id);
  if(!scopeKey(num(r,"asset_id"),dec(s.get("scope_json"),PlanScope.class)).equals(r.get("scope_key")))throw ApiException.conflict("원본 적용 범위가 변경되었습니다.");
  byte[] bytes=ImageUploadRules.readVerified(stream,num(r,"byte_size"),r.get("content_type").toString(),r.get("sha256").toString());
  int[] dim=FloorplanImageInfo.size(bytes,r.get("content_type").toString());if(dim[0]!=num(r,"image_width")||dim[1]!=num(r,"image_height"))throw ApiException.badRequest("실제 원본 크기 불일치");
  String key="verified/floorplan/"+eventId+"/"+a.id()+"/"+r.get("sha256")+ImageUploadRules.extension(r.get("content_type").toString());
  if(r.get("object_key")==null)storage.put(key,r.get("content_type").toString(),bytes,r.get("sha256").toString());
  storage.verify(key,r.get("content_type").toString(),bytes.length,r.get("sha256").toString());
  db.update("update subculture_floorplan_version set object_key=?,state=case when state='AWAITING_IMAGE' then 'AWAITING_ANALYSIS' else state end,updated_at=now() where id=?",key,id);
  // Immutable version objects remain; only current SOURCE hash advances. Public reads detect changed originals.
  db.update("update subculture_floorplan_source set current_sha256=?,checked_at=now(),last_error='' where asset_id=?",r.get("sha256"),a.id());
  return version(id);
 }
 private Roster rosterEntry(long id,CatalogModels.Participant p,List<String> days){List<Place> places=new ArrayList<>();
  for(var l:p.locations())if("ASSIGNED".equals(l.status())&&l.code()!=null){List<String> ds=new ArrayList<>();if(l.startDate()!=null&&l.endDate()!=null){for(LocalDate d=LocalDate.parse(l.startDate()),end=LocalDate.parse(l.endDate());!d.isAfter(end)&&ds.size()<367;d=d.plusDays(1))ds.add(d.toString());}else if(days.size()==1)ds.addAll(days);places.add(new Place(l.code(),l.hall(),l.zone(),ds,l.floorPlanUrl()));}
  places.sort(Comparator.comparing(this::enc));return new Roster(id,p.registrationName(),places);
 }
 private List<Roster> roster(long id){var ev=effective(event(id,false),EventData.class);List<String> days=eventDates(ev);List<Roster> out=new ArrayList<>();
  for(var row:db.queryForList("select * from subculture_participant where event_id=? and review_state<>'EXCLUDED' order by id",id))out.add(rosterEntry(num(row,"id"),effective(row,CatalogModels.Participant.class),days));
  return out;
 }
 private String rosterHash(List<Roster> rs){return CollectionRules.sha(enc(rs));}
 @SuppressWarnings("unchecked") private Map<String,ManualLink> manual(Object value){Map<String,Object> raw=dec(value,Map.class);Map<String,ManualLink> out=new LinkedHashMap<>();raw.forEach((k,v)->out.put(k,dec(enc(v),ManualLink.class)));return out;}
 private Mapping mapped(Map<String,Object> r,Geometry g,List<Roster> rs){return FloorplanRules.map(g,dec(r.get("scope_json"),PlanScope.class),rs,manual(r.get("manual_links_json")));}
 @Transactional public Map<String,Object> analysis(UUID id,Analysis a){
  var r=versionRow(id);lease(num(r,"event_id"),a.leaseId());r=one("select * from subculture_floorplan_version where id=? for update",id);
  var source=one("select * from subculture_floorplan_source where asset_id=?",num(r,"asset_id"));var asset=media.detail(num(r,"asset_id"));
  if(!Boolean.TRUE.equals(source.get("can_transform"))||!"APPROVED".equals(asset.rightsState()))throw ApiException.forbidden("분석 사용 권한이 없습니다.");
  if(r.get("object_key")==null||!Objects.equals(a.sha256(),r.get("sha256")))throw ApiException.conflict("분석 대상 원본이 다릅니다.");
  FloorplanRules.geometry(a.geometry());String hash=CollectionRules.sha(enc(a.geometry()));
  if(hash.equals(r.get("analysis_hash")))return remapLocked(id,r);
  if(a.revision()!=num(r,"revision")||"APPROVED".equals(r.get("state"))||"WITHDRAWN".equals(r.get("state")))throw ApiException.conflict("검토된 도면은 자동 재분석으로 덮어쓸 수 없습니다.");
  List<Roster> rs=roster(num(r,"event_id"));Mapping map=mapped(r,a.geometry(),rs);
  db.update("update subculture_floorplan_version set geometry_json=cast(? as jsonb),mapping_json=cast(? as jsonb),analysis_hash=?,participant_hash=?,state='DRAFT',revision=revision+1,analyzed_at=now(),updated_at=now() where id=?",enc(a.geometry()),enc(map),hash,rosterHash(rs),id);return version(id);
 }
 @Transactional public Map<String,Object> remap(UUID id,Claim c){var r=versionRow(id);lease(num(r,"event_id"),c.leaseId());return remapLocked(id,one("select * from subculture_floorplan_version where id=? for update",id));}
 private Map<String,Object> remapLocked(UUID id,Map<String,Object> r){if(r.get("geometry_json")==null||"WITHDRAWN".equals(r.get("state")))return version(id);List<Roster> rs=roster(num(r,"event_id"));String h=rosterHash(rs);if(!h.equals(r.get("participant_hash"))){
  // Removed/excluded participants must not make an old manual association persist.
  Map<String,ManualLink> overrides=manual(r.get("manual_links_json"));Set<Long> ids=new HashSet<>();rs.forEach(p->ids.add(p.id()));overrides.entrySet().removeIf(e->!ids.contains(e.getValue().participantId()));
  r.put("manual_links_json",enc(overrides));Mapping m=mapped(r,dec(r.get("geometry_json"),Geometry.class),rs);
  db.update("update subculture_floorplan_version set mapping_json=cast(? as jsonb),manual_links_json=cast(? as jsonb),participant_hash=?,state='DRAFT',revision=revision+1,updated_at=now() where id=?",enc(m),enc(overrides),h,id);
 }return version(id);}
 @Transactional public Map<String,Object> edit(UUID id,Edit input){var r=versionRow(id);event(num(r,"event_id"),true);r=one("select * from subculture_floorplan_version where id=? for update",id);if(input.revision()!=num(r,"revision"))throw ApiException.conflict("다른 화면에서 수정되었습니다.");if(r.get("object_key")==null)throw ApiException.conflict("원본 저장이 먼저 필요합니다.");FloorplanRules.text(input.note(),2000,true);FloorplanRules.geometry(input.geometry());if(input.manualLinks()==null||input.manualLinks().size()>3000)throw ApiException.badRequest("수동 연결 오류");
  List<Roster> rs=roster(num(r,"event_id"));Mapping map=FloorplanRules.map(input.geometry(),dec(r.get("scope_json"),PlanScope.class),rs,input.manualLinks());
  db.update("update subculture_floorplan_version set geometry_json=cast(? as jsonb),manual_links_json=cast(? as jsonb),mapping_json=cast(? as jsonb),participant_hash=?,review_note=?,state='DRAFT',revision=revision+1,updated_at=now() where id=?",enc(input.geometry()),enc(input.manualLinks()),enc(map),rosterHash(rs),input.note(),id);return version(id);
 }
 @Transactional public Map<String,Object> publish(UUID id,Publish input){var r=versionRow(id);long event=num(r,"event_id");event(event,true);r=one("select * from subculture_floorplan_version where id=? for update",id);FloorplanRules.text(input.note(),2000,true);if(num(r,"revision")!=input.revision())throw ApiException.conflict("도면이 변경되었습니다.");
  var s=one("select * from subculture_floorplan_source where asset_id=?",num(r,"asset_id"));var asset=media.detail(num(r,"asset_id"));
  if(!"APPROVED".equals(asset.rightsState())||!Boolean.TRUE.equals(s.get("can_transform"))||r.get("object_key")==null||!Objects.equals(s.get("current_sha256"),r.get("sha256"))||r.get("mapping_json")==null)throw ApiException.conflict("현재 원본·권한·분석 상태를 확인하세요.");
  if(!scopeKey(num(r,"asset_id"),dec(s.get("scope_json"),PlanScope.class)).equals(r.get("scope_key")))throw ApiException.conflict("적용 날짜·전시관이 변경되었습니다.");
  if(!rosterHash(roster(event)).equals(r.get("participant_hash")))throw ApiException.conflict("참가 명단이 바뀌었습니다. 재매핑 후 검토하세요.");
  Mapping map=dec(r.get("mapping_json"),Mapping.class);Geometry g=dec(r.get("geometry_json"),Geometry.class);if((map.unresolved()>0||!g.complete())&&!input.acceptPartial())throw ApiException.badRequest("미연결/부분 추출을 확인해 주세요.");
  if(g.shapes().isEmpty())throw ApiException.badRequest("부스 영역이 없습니다.");
  db.update("update subculture_floorplan_version set state='APPROVED',review_note=?,revision=revision+1,updated_at=now() where id=?",input.note(),id);
  Map<String,Object> snapshot=new LinkedHashMap<>();snapshot.put("geometry",g);snapshot.put("mapping",map);snapshot.put("participantHash",r.get("participant_hash"));snapshot.put("sha256",r.get("sha256"));
  db.update("insert into subculture_floorplan_publication(event_id,scope_key,version_id,snapshot_json) values(?,?,?,cast(? as jsonb)) on conflict(event_id,scope_key) do update set version_id=excluded.version_id,snapshot_json=excluded.snapshot_json,published_at=now()",event,r.get("scope_key"),id,enc(snapshot));return version(id);
 }
 @Transactional public void withdraw(UUID id,Publish input){var r=versionRow(id);event(num(r,"event_id"),true);r=one("select * from subculture_floorplan_version where id=? for update",id);if(input.revision()!=num(r,"revision"))throw ApiException.conflict("도면 변경됨");FloorplanRules.text(input.note(),2000,true);db.update("update subculture_floorplan_version set state='WITHDRAWN',review_note=?,revision=revision+1,updated_at=now() where id=?",input.note(),id);}
 public Map<String,Object> admin(long id){event(id,false);Map<String,Object> out=new LinkedHashMap<>();var w=db.queryForList("select * from subculture_floorplan_watch where event_id=?",id);out.put("watch",w.isEmpty()?null:watchView(w.getFirst()));out.put("sources",sources(id));out.put("versions",db.queryForList("select id,event_id,asset_id,state,revision,sha256,image_width,image_height,scope_json,created_at,updated_at from subculture_floorplan_version where event_id=? order by created_at desc limit 100",id).stream().map(this::versionSummary).toList());out.put("roster",roster(id));return out;}
 private Map<String,Object> versionSummary(Map<String,Object> r){Map<String,Object> v=new LinkedHashMap<>();for(String key:List.of("id","event_id","asset_id","state","revision","sha256","image_width","image_height"))v.put(key,r.get(key) instanceof UUID u?u.toString():r.get(key));v.put("scope",dec(r.get("scope_json"),PlanScope.class));v.put("createdAt",stamp(r.get("created_at")));v.put("updatedAt",stamp(r.get("updated_at")));return v;}
 private Map<String,Object> watchView(Map<String,Object> r){Map<String,Object> o=new LinkedHashMap<>();for(String key:List.of("revision","disabled","last_status","last_error"))o.put(key,r.get(key));o.put("lastCheckedAt",stamp(r.get("last_checked_at")));o.put("nextCheckAt",stamp(r.get("next_check_at")));o.put("result",dec(r.get("result_json"),Map.class));return o;}
 @Transactional public Map<String,Object> editWatch(long id,WatchEdit input){event(id,true);watch(id);if(db.update("update subculture_floorplan_watch set disabled=?,revision=revision+1,next_check_at=now() where event_id=? and revision=?",input.disabled(),id,input.revision())!=1)throw ApiException.conflict("탐색 상태 변경됨");return admin(id);}
 @Transactional public Map<String,Object> sourceFailure(long eventId,long assetId,Failure input){
  lease(eventId,input.leaseId());FloorplanRules.text(input.message(),1000,true);
  if(media.detail(assetId).eventId()!=eventId)throw ApiException.badRequest("다른 행사 이미지");
  db.update("update subculture_floorplan_source set checked_at=now(),last_error=? where asset_id=?",input.message(),assetId);
  return Map.of("recorded",true);
 }
 @Transactional public Map<String,Object> finish(long id,Failure input){lease(id,input.leaseId());FloorplanRules.text(input.message(),1000,false);if(input.message()!=null&&!input.message().isBlank())db.update("update subculture_floorplan_watch set last_error=?,next_check_at=least(next_check_at,now()+interval '6 hours') where event_id=?",input.message(),id);db.update("update subculture_floorplan_watch set lease_id=null,lease_until=null where event_id=?",id);return Map.of("finished",true);}
 /** Keep expected missing publication inside this service's transaction boundary. */
 public Optional<Map<String,Object>> findPublicPlans(long id) {
  try { return Optional.of(publicPlans(id)); }
  catch (ApiException error) { if (error.status.value() != 404) throw error; return Optional.empty(); }
 }
 @SuppressWarnings("unchecked") public Map<String,Object> publicPlans(long id){
  var pub=one("select p.snapshot_json from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id where p.event_id=? and e.review_state<>'EXCLUDED'",id);
  Map<String,Object> eventSnap=dec(pub.get("snapshot_json"),Map.class);List<Map<String,Object>> published=(List<Map<String,Object>>)eventSnap.get("participants");
  Set<Long> allowed=new HashSet<>();for(var p:published)allowed.add(((Number)p.get("id")).longValue());
  allowed.removeAll(db.query("select id from subculture_participant where event_id=? and review_state='EXCLUDED'",(r,n)->r.getLong(1),id));
  List<Roster> live=roster(id);String currentRoster=rosterHash(live);List<Map<String,Object>> plans=new ArrayList<>();
  List<String> publicDays=eventDates(dec(enc(eventSnap.get("event")),EventData.class));
  List<Roster> publicRoster=new ArrayList<>();
  for(var p:published){long pid=((Number)p.get("id")).longValue();if(allowed.contains(pid))publicRoster.add(rosterEntry(pid,dec(enc(p.get("participant")),CatalogModels.Participant.class),publicDays));}
  publicRoster.sort(Comparator.comparingLong(Roster::id));
  boolean publicationFresh=rosterHash(publicRoster).equals(rosterHash(live.stream().filter(r->allowed.contains(r.id())).toList()))
    &&new TreeSet<>(publicDays).equals(new TreeSet<>(eventDates(effective(event(id,false),EventData.class))));
  for(var r:db.queryForList("select v.*,p.snapshot_json,p.published_at,s.current_sha256,s.scope_json source_scope,s.can_transform,a.rights_state,a.offline_allowed,a.credit,a.page_url from subculture_floorplan_publication p join subculture_floorplan_version v on v.id=p.version_id join subculture_floorplan_source s on s.asset_id=v.asset_id join subculture_catalog_asset a on a.id=v.asset_id where p.event_id=? order by p.published_at desc",id)){
   Map<String,Object> snap=dec(r.get("snapshot_json"),Map.class),m=new LinkedHashMap<>();String state="READY";
   if(!"APPROVED".equals(r.get("state"))||!"APPROVED".equals(r.get("rights_state"))||!Boolean.TRUE.equals(r.get("can_transform")))state="UNAVAILABLE";
   else if(!scopeKey(num(r,"asset_id"),dec(r.get("source_scope"),PlanScope.class)).equals(r.get("scope_key")))state="SCOPE_CHANGED";
   else if(!Objects.equals(r.get("current_sha256"),r.get("sha256")))state="SOURCE_CHANGED";
   else if(!Objects.equals(snap.get("participantHash"),currentRoster))state="ROSTER_CHANGED";
   else if(!publicationFresh)state="PUBLICATION_STALE";
   if(imageBase.isBlank())state="UNAVAILABLE";
   m.put("id",r.get("id").toString());m.put("assetId",r.get("asset_id"));m.put("scope",dec(r.get("scope_json"),PlanScope.class));m.put("state",state);m.put("publishedAt",stamp(r.get("published_at")));m.put("sourceUrl",r.get("page_url"));m.put("credit",r.get("credit"));
   m.put("offlineAllowed","READY".equals(state)&&Boolean.TRUE.equals(r.get("offline_allowed")));
   if("READY".equals(state)){
    Mapping map=dec(enc(snap.get("mapping")),Mapping.class);List<Map<String,Object>> shapes=new ArrayList<>();
     for(MappedShape shape:map.shapes()) {Map<String,Object> item=new LinkedHashMap<>();item.put("id",shape.shape().id());item.put("kind",shape.shape().mapKind());item.put("label",shape.shape().label());item.put("points",shape.shape().points());item.put("status",shape.status());item.put("links",shape.links().stream().filter(l->allowed.contains(l.participantId())).toList());item.put("issues",shape.issues());shapes.add(item);}
    m.put("width",r.get("image_width"));m.put("height",r.get("image_height"));m.put("imageUrl",imageBase+"/"+r.get("object_key"));m.put("sourceSha256",r.get("sha256"));m.put("shapes",shapes);m.put("partial",map.unresolved()>0||!dec(enc(snap.get("geometry")),Geometry.class).complete());
   }else {m.put("shapes",List.of());m.put("imageUrl",null);}
   plans.add(m);
  }
  // IDs only: prevent stale v7 image fallback for a source now under version management.
  var managed=db.query("select s.asset_id from subculture_floorplan_source s join subculture_catalog_asset a on a.id=s.asset_id where a.event_id=? and s.current_sha256 is not null",(r,n)->r.getLong(1),id);
  return Map.of("plans",plans,"managedAssetIds",managed);
 }
}
