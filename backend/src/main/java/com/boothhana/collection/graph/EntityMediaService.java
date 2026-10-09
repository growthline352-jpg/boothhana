package com.boothhana.collection.graph;

import com.boothhana.api.ApiException;
import com.boothhana.collection.CollectionRules;
import com.boothhana.upload.ImageUploadRules;
import com.boothhana.upload.VerifiedImageStorage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.io.*;
import java.time.Instant;
import java.util.*;
import static com.boothhana.collection.graph.EntityMediaModels.*;
import static com.boothhana.collection.graph.GraphModels.*;

/** Separate immutable extraction and review records. The server only stores verified worker bytes. */
@Service @Transactional(readOnly=true)
public class EntityMediaService {
 private final JdbcTemplate db; private final JsonMapper json; private final VerifiedImageStorage storage; private final String base;
 @Value("${app.collection.graph.enabled:false}") private boolean enabled;
 public EntityMediaService(JdbcTemplate db,JsonMapper json,VerifiedImageStorage storage,@Value("${app.storage.public-url:}") String base){
  this.db=db;this.json=json;this.storage=storage;this.base=base.replaceAll("/$","");
 }
 private static final Set<String> KINDS=Set.of("SUBJECT","CREATOR","PRODUCT");
 private static void require(boolean value,String reason){if(!value)throw ApiException.badRequest(reason);}
 private static String text(Object value){return Objects.toString(value,"");}
 private static String required(String value,int max,String field){require(value!=null&&!value.isBlank()&&value.length()<=max,field+" 근거를 확인하세요.");return value;}
 @SuppressWarnings("unchecked") private Map<String,Object> object(Object value){return value==null?Map.of():json.readValue(value.toString(),Map.class);}
 private String encode(Object value){return json.writeValueAsString(value);}
 private String hash(Object value){return CollectionRules.sha(encode(GraphService.sorted(value)));}
 private static String targetId(String kind,String id){
  require(kind!=null&&KINDS.contains(kind)&&id!=null,"이미지 대상 종류·ID 오류");
  try {if(kind.equals("CREATOR")){long parsed=Long.parseLong(id);require(parsed>0&&Long.toString(parsed).equals(id),"작가 ID 오류");}
   else require(UUID.fromString(id).toString().equals(id),"이미지 대상 UUID 오류");
  } catch(IllegalArgumentException ex){throw ApiException.badRequest("이미지 대상 ID 오류");}return id;
 }
 private static String url(String value){try{CollectionRules.url(value);}catch(RuntimeException ex){throw ApiException.badRequest("공개 이미지 원문 URL 오류");}return value;}
 private String creatorVisibility(){return """
  ((cp.exhibitor_id is not null and cp.active) or (cp.exhibitor_id is null and exists(
   select 1 from subculture_participant_member pm join subculture_participant part on part.id=pm.participant_id
   join subculture_event_candidate ev on ev.id=part.event_id
   join subculture_catalog_publication pub on pub.event_id=part.event_id
   cross join lateral jsonb_array_elements(coalesce(pub.snapshot_json->'participants','[]'::jsonb)) person
   cross join lateral jsonb_array_elements(coalesce(person->'participant'->'members','[]'::jsonb)) member
   where pm.exhibitor_id=e.id and part.review_state<>'EXCLUDED' and ev.review_state<>'EXCLUDED' and not ev.publication_withdrawn
   and person->>'id'=part.id::text and member->>'name' is not distinct from e.profile_json->>'name'
   and member->>'profileUrl' is not distinct from e.profile_json->>'profileUrl')))
  """;
 }
 private String creatorProvenance(){return """
  coalesce((select jsonb_agg(provenance) from (
   select jsonb_build_object('eventId',ev.id,'participantId',part.id,'registrationName',person->'participant'->'registrationName',
    'member',member,'officialLinks',person->'participant'->'officialLinks','sources',person->'participant'->'sources',
    'eventSources',pub.snapshot_json->'event'->'sources') provenance
   from subculture_participant_member pm join subculture_participant part on part.id=pm.participant_id
   join subculture_event_candidate ev on ev.id=part.event_id join subculture_catalog_publication pub on pub.event_id=part.event_id
   cross join lateral jsonb_array_elements(coalesce(pub.snapshot_json->'participants','[]'::jsonb)) person
   cross join lateral jsonb_array_elements(coalesce(person->'participant'->'members','[]'::jsonb)) member
   where pm.exhibitor_id=e.id and part.review_state<>'EXCLUDED' and ev.review_state<>'EXCLUDED' and not ev.publication_withdrawn
    and person->>'id'=part.id::text and member->>'name' is not distinct from e.profile_json->>'name'
    and member->>'profileUrl' is not distinct from e.profile_json->>'profileUrl'
   order by pub.published_at desc,part.id limit 3
  ) checked_provenance),'[]'::jsonb)
  """;}
 /** The same projection is used by research, review, upload and every public image read. */
 private String targetSql(String kind){return switch(kind){
  case "SUBJECT" -> """
   select s.id::text target_id,jsonb_build_object('id',s.id,'kind',s.kind,'name',s.name,'workId',s.work_id,
    'workName',w.name,'medium',s.medium,'aliases',s.aliases,'sourceUrl',s.source_url,'revision',s.revision,
    'work',case when w.id is null then null else jsonb_build_object('id',w.id,'name',w.name,'sourceUrl',w.source_url,
     'medium',w.medium,'aliases',w.aliases,'revision',w.revision) end) snapshot
   from subculture_subject s left join subculture_subject w on w.id=s.work_id
   where s.active and (s.work_id is null or w.active)
   """;
  case "CREATOR" -> "select e.id::text target_id,jsonb_build_object('id',e.id,'name',e.name,'profile',coalesce(cp.data_json,e.profile_json),'publicationRevision',cp.revision,'provenance',"+creatorProvenance()+") snapshot from subculture_exhibitor e left join collection_creator_publication cp on cp.exhibitor_id=e.id where "+creatorVisibility();
  case "PRODUCT" -> """
   select p.id::text target_id,jsonb_build_object('id',p.id,'creatorId',p.exhibitor_id,'legacyProductId',p.legacy_product_id,
    'revision',p.revision,'data',p.data_json,'creator',coalesce(cp.data_json,e.profile_json)) snapshot
   from collection_product p left join subculture_exhibitor e on e.id=p.exhibitor_id
   left join collection_creator_publication cp on cp.exhibitor_id=p.exhibitor_id
   where p.active and ((p.legacy_product_id is null and p.verdict_id is not null and cp.active) or
    (p.legacy_product_id is not null and exists(
     select 1 from subculture_catalog_product legacy join subculture_participant part on part.id=legacy.participant_id
     join subculture_sales sale on sale.participant_id=part.id join subculture_event_candidate ev on ev.id=part.event_id
     join subculture_catalog_publication pub on pub.event_id=part.event_id
     cross join lateral jsonb_array_elements(coalesce(pub.snapshot_json->'participants','[]'::jsonb)) person
     cross join lateral jsonb_array_elements(coalesce(person->'productRows','[]'::jsonb)) product
     where legacy.id=p.legacy_product_id and part.review_state<>'EXCLUDED' and sale.review_state<>'EXCLUDED'
      and ev.review_state<>'EXCLUDED' and not ev.publication_withdrawn and person->>'id'=part.id::text
      and product->>'id'=legacy.id::text and ((product->'data')-'images')=(p.data_json-'images'))))
   """;
  default -> throw ApiException.badRequest("이미지 대상 종류 오류");};}
 private Map<String,Object> target(String kind,String id){
  targetId(kind,id);var rows=db.queryForList("select * from ("+targetSql(kind)+") t where target_id=?",id);
  if(rows.isEmpty())throw ApiException.notFound("공개된 이미지 수집 대상을 찾지 못했습니다.");return object(rows.getFirst().get("snapshot"));
 }
 private void lockTarget(String kind,String id){
  targetId(kind,id);String table=kind.equals("SUBJECT")?"subculture_subject":kind.equals("CREATOR")?"subculture_exhibitor":"collection_product";
  Object key=kind.equals("CREATOR")?Long.valueOf(id):UUID.fromString(id);
  if(db.queryForList("select id from "+table+" where id=? for update",key).isEmpty())throw ApiException.notFound("이미지 대상 없음");
 }
 private Map<String,Object> context(String kind,Map<String,Object> target){
  String id=text(target.get("id"));var result=new LinkedHashMap<String,Object>();result.put("kind",kind);result.put("targetId",id);result.put("targetHash",hash(target));result.put("target",target);
  result.put("existingMedia",db.queryForList("select id,extraction_id as \"extractionId\",revision,image_url as \"imageUrl\",page_url as \"pageUrl\",usage_status as \"usageStatus\",rights_state as \"rightsState\",review_verdict as \"reviewVerdict\",review_reason as \"reviewReason\",storage_state as \"storageState\",expected_sha256 as \"imageHash\",target_hash as \"targetHash\" from subculture_entity_media where target_kind=? and target_id=? and active order by created_at desc,id limit 20",kind,id));
  return result;
 }
 public Map<String,Object> context(String kind,String id){return context(kind,target(kind,id));}
 public Map<String,Object> targets(String kind,String afterId,int limit){
  require(kind!=null&&KINDS.contains(kind)&&limit>=1&&limit<=100,"이미지 수집 범위 오류");require(afterId!=null,"이미지 커서 오류");if(!afterId.isBlank())targetId(kind,afterId);
  String comparison=kind.equals("CREATOR")?"cast(target_id as bigint)>?":"cast(target_id as uuid)>cast(? as uuid)";
  Object cursor=kind.equals("CREATOR")?(afterId.isBlank()?0L:Long.parseLong(afterId)):(afterId.isBlank()?"00000000-0000-0000-0000-000000000000":afterId);
  String order=kind.equals("CREATOR")?"cast(target_id as bigint)":"cast(target_id as uuid)";
  var rows=db.queryForList("select * from ("+targetSql(kind)+") t where "+comparison+" order by "+order+" limit ?",cursor,limit+1);
  var visible=publicImages(kind,rows.stream().limit(limit).map(r->text(r.get("target_id"))).toList());var items=new ArrayList<Map<String,Object>>();String next=afterId;
  for(var row:rows.stream().limit(limit).toList()){next=text(row.get("target_id"));var value=object(row.get("snapshot"));if(!visible.containsKey(next)&&text(value.get("imageUrl")).isBlank())items.add(context(kind,value));}
  return Map.of("items",items,"afterId",next,"hasMore",rows.size()>limit);
 }
 private Set<String> identityUrls(Object value){var result=new LinkedHashSet<String>();collectIdentityUrls(value,result);return result;}
 private void collectIdentityUrls(Object value,Set<String> found){
  if(value instanceof Map<?,?> map){
   map.forEach((key,item)->{
    String field=key.toString();
    if(Set.of("images","banners","existingMedia").contains(field))return;
    if(Set.of("sourceUrl","profileUrl","productUrl","url").contains(field)&&item instanceof String text&&!text.isBlank()){
     try{url(text);found.add(text);}catch(ApiException ignored){}
    } else if(Set.of("officialLinks","links").contains(field)&&item instanceof List<?> values){
     for(Object link:values){
      if(link instanceof String text){try{url(text);found.add(text);}catch(ApiException ignored){}}
      else collectIdentityUrls(link,found);
     }
    } else collectIdentityUrls(item,found);
   });
  } else if(value instanceof List<?> list){
   list.forEach(item->collectIdentityUrls(item,found));
  }
 }
 private Map<String,String> audit(Audit audit,String imageHash){
  require(audit!=null&&GraphService.MODEL.equals(audit.model())&&audit.openedUrls()!=null&&audit.openedUrls().size()<=500&&audit.imageHashes()!=null&&audit.imageHashes().contains(imageHash)
   &&audit.promptVersion()!=null&&!audit.promptVersion().isBlank()&&audit.promptVersion().length()<=100&&audit.schemaVersion()!=null&&Set.of("graph-1","graph-2","graph-3","graph-4").contains(audit.schemaVersion())
   &&audit.sourceDocuments()!=null&&!audit.sourceDocuments().isEmpty()&&audit.sourceDocuments().size()<=500,"양쪽 모델·이미지·원문 확인 기록이 필요합니다.");
  audit.openedUrls().forEach(EntityMediaService::url);for(String digest:audit.imageHashes())require(digest!=null&&digest.matches("[0-9a-f]{64}"),"이미지 확인 해시 오류");
  var docs=new LinkedHashMap<String,String>();
  for(var doc:audit.sourceDocuments()){
   require(doc!=null&&doc.sha256()!=null&&doc.sha256().matches("[0-9a-f]{64}")&&audit.openedUrls().contains(doc.url()),"원문 스냅샷 근거 오류");url(doc.url());
   require(!docs.containsKey(doc.url())||Objects.equals(docs.get(doc.url()),doc.sha256()),"서로 다른 원문을 같은 URL로 기록할 수 없습니다.");
   if(doc.transportUrl()!=null){url(doc.transportUrl());require(audit.openedUrls().contains(doc.transportUrl()),"원문 전송 출처 확인 누락");}
   try{Instant.parse(doc.capturedAt());}catch(RuntimeException ex){throw ApiException.badRequest("원문 확인 시각 오류");}docs.put(doc.url(),doc.sha256());
  }return docs;
 }
 private void sources(Candidate candidate,Map<String,Object> target,Map<String,String> docs){
  require(docs.containsKey(candidate.pageUrl())&&docs.containsKey(candidate.usageSourceUrl()),"이미지 게시 원문·사용 조건의 직접 확인이 필요합니다.");
  var identity=identityUrls(target);require(!identity.isEmpty()&&identity.stream().anyMatch(docs::containsKey),"대상 정체성 원문 확인이 필요합니다.");
 }
 @Transactional public Map<String,Object> extract(ExtractionInput input){
  require(input!=null&&input.extractionId()!=null&&input.candidate()!=null&&input.targetHash()!=null&&input.targetHash().matches("[0-9a-f]{64}"),"이미지 추출 입력 오류");String id=targetId(input.kind(),input.targetId());Candidate candidate=input.candidate();
  url(candidate.imageUrl());url(candidate.pageUrl());url(candidate.usageSourceUrl());required(candidate.credit(),1000,"이미지 출처");required(candidate.identityEvidence(),2000,"동일성");
  required(candidate.usageEvidence(),2000,"사용 조건");require(candidate.caption()!=null&&candidate.caption().length()<=500&&candidate.usageStatus()!=null&&Set.of("PERMITTED","UNKNOWN","FORBIDDEN").contains(candidate.usageStatus()),"이미지 후보 조건 오류");
  require(candidate.imageHash()!=null&&candidate.imageHash().matches("[0-9a-f]{64}"),"추출에서 확인한 이미지 해시가 필요합니다.");var documents=audit(input.audit(),candidate.imageHash());
  String resultHash=hash(candidate);String identity=hash(List.of(input.kind(),id,input.targetHash(),resultHash,documents));
  var previous=db.queryForList("select * from subculture_entity_media where extraction_id=? or identity_key=?",input.extractionId(),identity);
  if(!previous.isEmpty()){
   var row=previous.getFirst();if(!Objects.equals(row.get("identity_key"),identity)||!Objects.equals(row.get("result_hash"),resultHash))throw ApiException.conflict("이미지 추출 ID가 다른 대상에 사용되었습니다.");return detail((UUID)row.get("id"));
  }
  lockTarget(input.kind(),id);var current=target(input.kind(),id);if(!hash(current).equals(input.targetHash()))throw ApiException.conflict("이미지 수집 중 대상 정보가 변경되었습니다.");sources(candidate,current,documents);
  UUID media=UUID.randomUUID();db.update("""
   insert into subculture_entity_media(id,target_kind,target_id,subject_id,creator_id,product_id,extraction_id,identity_key,
    target_hash,target_snapshot_json,result_hash,candidate_json,extraction_audit_json,image_url,page_url,expected_sha256,
    caption,credit,identity_evidence,usage_status,usage_evidence,usage_source_url)
   values(?,?,?,?,?,?,?,?,?,cast(? as jsonb),?,cast(? as jsonb),cast(? as jsonb),?,?,?,?,?,?,?,?,?)
   on conflict do nothing
   """,media,input.kind(),id,input.kind().equals("SUBJECT")?UUID.fromString(id):null,input.kind().equals("CREATOR")?Long.valueOf(id):null,input.kind().equals("PRODUCT")?UUID.fromString(id):null,
   input.extractionId(),identity,input.targetHash(),encode(current),resultHash,encode(candidate),encode(input.audit()),candidate.imageUrl(),candidate.pageUrl(),candidate.imageHash(),candidate.caption(),candidate.credit(),candidate.identityEvidence(),candidate.usageStatus(),candidate.usageEvidence(),candidate.usageSourceUrl());
  var saved=db.queryForList("select id,identity_key from subculture_entity_media where extraction_id=? or identity_key=?",input.extractionId(),identity);
  require(saved.size()==1&&identity.equals(saved.getFirst().get("identity_key")),"이미지 추출 ID 충돌");return detail((UUID)saved.getFirst().get("id"));
 }
 private Map<String,Object> row(UUID id,boolean lock){var rows=db.queryForList("select * from subculture_entity_media where id=?"+(lock?" for update":""),id);if(rows.isEmpty())throw ApiException.notFound("이미지 후보 없음");return rows.getFirst();}
 public Map<String,Object> detail(UUID id){var row=row(id,false);var value=new LinkedHashMap<String,Object>();
  for(String key:List.of("id","revision","caption","credit","error","active"))value.put(key,row.get(key));
  for(var entry:Map.ofEntries(Map.entry("target_kind","kind"),Map.entry("target_id","targetId"),Map.entry("target_hash","targetHash"),Map.entry("extraction_id","extractionId"),Map.entry("result_hash","resultHash"),Map.entry("image_url","imageUrl"),Map.entry("page_url","pageUrl"),Map.entry("expected_sha256","imageHash"),Map.entry("rights_state","rightsState"),Map.entry("storage_state","storageState"),Map.entry("usage_status","usageStatus"),Map.entry("review_verdict","reviewVerdict"),Map.entry("review_reason","reviewReason")).entrySet())value.put(entry.getValue(),row.get(entry.getKey()));
  value.put("candidate",object(row.get("candidate_json")));value.put("target",object(row.get("target_snapshot_json")));value.put("extractionAudit",object(row.get("extraction_audit_json")));value.put("reviewAudit",object(row.get("review_audit_json")));
  value.put("storedUrl",base.isBlank()||row.get("object_key")==null?null:base+"/"+row.get("object_key"));return value;
 }
 @Transactional public Map<String,Object> review(UUID id,ReviewInput input){
  require(input!=null&&input.revision()>=0&&input.extractionId()!=null&&input.resultHash()!=null&&input.audit()!=null&&input.verdict()!=null&&Set.of("APPROVE","REJECT","ENRICH").contains(input.verdict()),"이미지 검토 입력 오류");required(input.reason(),2000,"독립 검토");
  var initial=row(id,false);String kind=text(initial.get("target_kind")),targetId=text(initial.get("target_id"));lockTarget(kind,targetId);var row=row(id,true);
  require(input.extractionId().equals(row.get("extraction_id"))&&input.resultHash().equals(row.get("result_hash")),"다른 이미지 추출을 검토할 수 없습니다.");
  String reviewHash=hash(List.of(input.extractionId(),input.resultHash(),input.verdict(),input.reason(),input.audit()));
  if(reviewHash.equals(row.get("review_hash")))return detail(id);
  if(row.get("review_verdict")!=null||((Number)row.get("revision")).longValue()!=input.revision()||row.get("reviewed_by")!=null)throw ApiException.conflict("이미지 검토 상태가 변경되었습니다.");
  var current=target(kind,targetId);if(!hash(current).equals(row.get("target_hash")))throw ApiException.conflict("이미지 검토 중 대상 정보가 변경되었습니다.");
  Candidate candidate=json.readValue(row.get("candidate_json").toString(),Candidate.class);var docs=audit(input.audit(),candidate.imageHash());sources(candidate,current,docs);
  Audit extracted=json.readValue(row.get("extraction_audit_json").toString(),Audit.class);var prior=audit(extracted,candidate.imageHash());
  require(!Objects.equals(extracted.promptVersion(),input.audit().promptVersion()),"추출과 독립 검토는 서로 다른 검토 프롬프트 기록이 필요합니다.");
  var required=new LinkedHashSet<String>(List.of(candidate.pageUrl(),candidate.usageSourceUrl()));
  var identity=identityUrls(current);var shared=identity.stream().filter(prior::containsKey).filter(docs::containsKey).toList();require(!shared.isEmpty(),"양쪽 호출에서 같은 정체성 원문을 확인해야 합니다.");required.addAll(shared);
  for(String source:required)require(Objects.equals(prior.get(source),docs.get(source)),"추출과 검토 사이 원문 내용이 변경되었습니다. 새로 수집하세요.");
  require(!"APPROVE".equals(input.verdict())||"PERMITTED".equals(candidate.usageStatus()),"명시적으로 사용이 확인된 이미지에만 공개 승인을 부여할 수 있습니다.");
  String rights=input.verdict().equals("APPROVE")?"APPROVED":input.verdict().equals("REJECT")?"REJECTED":"PENDING";
  db.update("update subculture_entity_media set review_verdict=?,review_reason=?,review_audit_json=cast(? as jsonb),review_hash=?,reviewed_at=now(),rights_state=?,revision=revision+1 where id=?",input.verdict(),input.reason(),encode(input.audit()),reviewHash,rights,id);return detail(id);
 }
 @Transactional(timeout=70) public Map<String,Object> content(UUID id,long revision,String type,String digest,long size,InputStream input) throws IOException {
  var initial=row(id,false);String kind=text(initial.get("target_kind")),targetId=text(initial.get("target_id"));lockTarget(kind,targetId);var row=row(id,true);
  if(!Boolean.TRUE.equals(row.get("active"))||!"APPROVED".equals(row.get("rights_state"))||!"APPROVE".equals(row.get("review_verdict")))throw ApiException.forbidden("사용·동일성 검토를 통과한 이미지에만 저장할 수 있습니다.");
  if(!hash(target(kind,targetId)).equals(row.get("target_hash")))throw ApiException.conflict("이미지 대상 정보가 변경되었습니다.");
  require(digest!=null&&digest.equals(row.get("expected_sha256")),"모델이 확인한 이미지와 저장 이미지가 다릅니다.");byte[] bytes;
  try{bytes=ImageUploadRules.readVerified(input,size,type,digest);}catch(IllegalArgumentException ex){throw ApiException.badRequest("이미지 크기·형식·해시 오류");}
  if("STORED".equals(row.get("storage_state"))&&digest.equals(row.get("sha256")))return detail(id);
  if(((Number)row.get("revision")).longValue()!=revision||row.get("reviewed_by")!=null)throw ApiException.conflict("이미지 승인 상태가 변경되었습니다.");
  String key="verified/subculture/"+kind.toLowerCase(Locale.ROOT)+"/"+id+"/"+digest+ImageUploadRules.extension(type);
  storage.put(key,type,bytes,digest);storage.verify(key,type,size,digest);
  db.update("update subculture_entity_media set object_key=?,sha256=?,byte_size=?,content_type=?,storage_state='STORED',stored_at=clock_timestamp(),last_attempt_at=clock_timestamp(),error='',revision=revision+1 where id=?",key,digest,size,type,id);return detail(id);
 }
 @Transactional public Map<String,Object> failed(UUID id,FailureInput input){require(input!=null&&input.revision()>=0&&input.reason()!=null&&input.reason().length()<=1000,"이미지 오류 형식 확인 필요");db.update("update subculture_entity_media set storage_state='FAILED',last_attempt_at=now(),error=?,revision=revision+1 where id=? and revision=? and storage_state<>'STORED' and reviewed_by is null",input.reason(),id,input.revision());return detail(id);}
 /** Bounds every result page and checks current target visibility/snapshot; never returns source candidates. */
 public Map<String,Map<String,Object>> publicImages(String kind,Collection<String> ids){
  if(ids.size()>3000){
   var unique=new ArrayList<String>(new LinkedHashSet<>(ids));var result=new LinkedHashMap<String,Map<String,Object>>();
   for(int start=0;start<unique.size();start+=3000)result.putAll(publicImages(kind,unique.subList(start,Math.min(start+3000,unique.size()))));
   return result;
  }
  if(!enabled||ids.isEmpty()||base.isBlank())return Map.of();require(ids.size()<=3000&&KINDS.contains(kind),"이미지 조회 범위 오류");ids.forEach(id->targetId(kind,id));
  String marks=String.join(",",Collections.nCopies(ids.size(),"?"));var args=new ArrayList<Object>();args.add(kind);args.addAll(ids);
  var rows=db.queryForList("select distinct on(m.target_id) m.target_id,m.object_key,m.page_url,m.credit,m.sha256 from subculture_entity_media m join ("+targetSql(kind)+") t on t.target_id=m.target_id where m.target_kind=? and m.target_id in ("+marks+") and m.active and m.rights_state='APPROVED' and m.review_verdict='APPROVE' and m.storage_state='STORED' and m.object_key is not null and (m.reviewed_by is not null or m.target_snapshot_json=t.snapshot) order by m.target_id,(m.reviewed_by is not null) desc,m.stored_at asc nulls last,m.created_at,m.id",args.toArray());
  var result=new LinkedHashMap<String,Map<String,Object>>();for(var row:rows)result.put(text(row.get("target_id")),Map.of("imageUrl",base+"/"+row.get("object_key"),"imageSourceUrl",row.get("page_url"),"imageCredit",row.get("credit")));return result;
 }
 public List<Map<String,Object>> attach(String kind,List<Map<String,Object>> values){
  if(values.isEmpty())return values;var images=publicImages(kind,values.stream().map(v->text(v.get("id"))).toList());
  for(var value:values){var image=images.get(text(value.get("id")));if(text(value.get("imageUrl")).isBlank()&&image!=null)value.putAll(image);
   value.putIfAbsent("imageUrl",null);value.putIfAbsent("imageSourceUrl",null);value.putIfAbsent("imageCredit",null);}return values;
 }
 /** UUID product media also supplements legacy event goods without changing any existing asset selection. */
 public void attachLegacyProducts(List<Map<String,Object>> products){
  if(!enabled||products.isEmpty())return;var ids=products.stream().map(p->p.get("id")).filter(Objects::nonNull).toList();if(ids.isEmpty())return;
  String marks=String.join(",",Collections.nCopies(ids.size(),"?"));var rows=db.queryForList("select id::text id,legacy_product_id from collection_product where active and legacy_product_id in ("+marks+")",ids.toArray());
  var images=publicImages("PRODUCT",rows.stream().map(r->text(r.get("id"))).toList());var found=new HashMap<String,Map<String,Object>>();for(var row:rows)if(images.containsKey(text(row.get("id"))))found.put(text(row.get("legacy_product_id")),images.get(text(row.get("id"))));
  for(var product:products)if(text(product.get("imageUrl")).isBlank()&&found.containsKey(text(product.get("id"))))product.putAll(found.get(text(product.get("id"))));
 }
}
