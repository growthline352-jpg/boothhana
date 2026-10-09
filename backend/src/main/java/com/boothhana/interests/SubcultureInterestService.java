package com.boothhana.interests;
import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogPublicationService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.interests.InterestModels.*;
import static com.boothhana.interests.InterestRules.*;
@Service @Transactional(readOnly=true)
public class SubcultureInterestService {
 @org.springframework.beans.factory.annotation.Value("${app.collection.graph.enabled:false}") private boolean graphEnabled;
 private final JdbcTemplate db; private final JsonMapper json; private final CatalogPublicationService publications; private final com.boothhana.collection.graph.EntityMediaService media;
 public SubcultureInterestService(JdbcTemplate db,JsonMapper json,CatalogPublicationService publications){this(db,json,publications,null);}
 @org.springframework.beans.factory.annotation.Autowired public SubcultureInterestService(JdbcTemplate db,JsonMapper json,CatalogPublicationService publications,com.boothhana.collection.graph.EntityMediaService media){this.db=db;this.json=json;this.publications=publications;this.media=media;}
 private Map<String,Object> withImage(String kind,Map<String,Object> value){if(media!=null)media.attach(kind,List.of(value));return value;}
 public Settings settings(long owner){var versions=db.queryForList("select revision from subculture_interest_settings where user_id=?",owner);var entries=db.queryForList("select * from subculture_interest where user_id=? order by created_at,id",owner).stream().map(r->new Entry((UUID)r.get("id"),(UUID)r.get("subject_id"),(Long)r.get("exhibitor_id"),r.get("custom_name").toString(),r.get("custom_work").toString(),r.get("medium").toString(),(UUID)r.get("custom_work_id"))).toList();return new Settings(versions.isEmpty()?0:((Number)versions.getFirst().get("revision")).longValue(),entries);}
 public Map<String,Object> view(long owner){var state=settings(owner);var publicCache=new HashMap<Long,Optional<Map<String,Object>>>();var rows=new ArrayList<Map<String,Object>>();for(var e:state.entries()){var row=new LinkedHashMap<String,Object>();row.put("id",e.id());row.put("subjectId",e.subjectId());row.put("exhibitorId",e.exhibitorId());row.put("customName",e.customName());row.put("customWork",e.customWork());row.put("medium",e.medium());row.put("customWorkId",e.customWorkId());row.put("label",e.customName());row.put("workName",e.customWork());row.put("available",false);try{if(e.subjectId()!=null){var subject=subject(e.subjectId());row.put("label",subject.get("name"));row.put("workName",Objects.toString(subject.get("workName"),""));row.put("kind",subject.get("kind"));for(String field:List.of("imageUrl","imageSourceUrl","imageCredit"))row.put(field,subject.get(field));row.put("available",true);}else if(e.exhibitorId()!=null){var creator=creator(e.exhibitorId(),publicCache);row.put("label",creator.get("name"));for(String field:List.of("imageUrl","imageSourceUrl","imageCredit"))row.put(field,creator.get(field));row.put("kind","CREATOR");row.put("available",true);}}catch(ApiException ex){if(ex.status.value()!=404)throw ex;row.put("label","현재 공개되지 않은 관심 대상");}rows.add(row);}return Map.of("revision",state.revision(),"entries",rows);}
 @Transactional public Settings save(long owner,Settings input){var entries=entries(input);db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","interest:"+owner);var before=settings(owner);if(before.revision()!=input.revision())throw ApiException.conflict("다른 화면에서 관심을 변경했어요. 다시 불러온 뒤 저장해 주세요.");
  for(Entry e:entries){if(e.customWorkId()!=null&&!"WORK".equals(subject(e.customWorkId()).get("kind")))throw ApiException.badRequest("캐릭터의 출처 작품을 확인해 주세요.");if(e.subjectId()!=null){boolean existing=before.entries().stream().anyMatch(old->Objects.equals(old.subjectId(),e.subjectId()));if(!existing)subject(e.subjectId());}if(e.exhibitorId()!=null&&!before.entries().stream().anyMatch(old->Objects.equals(old.exhibitorId(),e.exhibitorId())))creator(e.exhibitorId());}
  for(Entry e:entries)if(!db.queryForList("select id from subculture_interest where id=? and user_id<>?",e.id(),owner).isEmpty())throw ApiException.conflict("이미 사용 중인 관심 ID입니다.");
  db.update("delete from subculture_interest where user_id=?",owner);
  for(Entry e:entries)db.update("insert into subculture_interest(id,user_id,subject_id,exhibitor_id,custom_name,custom_work,medium,identity_key,custom_work_id) values(?,?,?,?,?,?,?,?,?)",e.id(),owner,e.subjectId(),e.exhibitorId(),e.customName(),e.customWork(),e.medium(),key(e),e.customWorkId());
  db.update("insert into subculture_interest_settings(user_id,revision) values(?,1) on conflict(user_id) do update set revision=subculture_interest_settings.revision+1,updated_at=now()",owner);return settings(owner);
 }
 public List<Map<String,Object>> subjects(String q,String kind,int page){
  q=text(q,100,false);if(!Set.of("","WORK","CHARACTER").contains(kind)||page<0||page>1000)throw ApiException.badRequest("검색 조건을 확인해 주세요.");
  String term="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
  var args=new ArrayList<Object>(List.of(kind,kind,term,term,term));
  String alias="";if(graphEnabled){alias=" or exists(select 1 from collection_subject_identity a where a.subject_id=s.id and a.name ilike ? escape '!')";args.add(term);}args.add(page*40);
  var rows=db.queryForList("""
   select s.id,s.kind,s.name,s.work_id as "workId",w.name as "workName",s.medium,s.source_url as "sourceUrl",s.revision
   from subculture_subject s left join subculture_subject w on w.id=s.work_id
   where s.active and (s.work_id is null or w.active) and (?='' or s.kind=?)
   and (s.name ilike ? escape '!' or w.name ilike ? escape '!' or s.aliases::text ilike ? escape '!'
   """+alias+") order by s.name,s.id limit 40 offset ?",args.toArray());return media==null?rows:media.attach("SUBJECT",rows);
 }
 public Map<String,Object> subject(UUID id){var rows=db.queryForList("""
 select s.id,s.kind,s.name,s.work_id as "workId",w.name as "workName",s.medium,s.source_url as "sourceUrl",s.revision
 from subculture_subject s left join subculture_subject w on w.id=s.work_id
 where s.id=? and s.active and (s.work_id is null or w.active)
 """,id);if(rows.isEmpty())throw ApiException.notFound("공개된 작품·캐릭터를 찾지 못했습니다.");return withImage("SUBJECT",rows.getFirst());}
 @SuppressWarnings("unchecked") static Map<String,Object> obj(Object v){return v instanceof Map<?,?>?(Map<String,Object>)v:Map.of();}
 @SuppressWarnings("unchecked") static List<Map<String,Object>> maps(Object v){return v instanceof List<?>?(List<Map<String,Object>>)v:List.of();}
 static long number(Object v){return v instanceof Number n?n.longValue():-1;}
 // Existing exhibitor IDs are reused. Collected profiles are NEVER returned without a matching public member.
 public Map<String,Object> creator(long id){return creator(id,new HashMap<>());}
 private Map<String,Object> creator(long id,Map<Long,Optional<Map<String,Object>>> cache){
  if(graphEnabled){var published=db.queryForList("select data_json,active from collection_creator_publication where exhibitor_id=?",id);if(!published.isEmpty()){if(!Boolean.TRUE.equals(published.getFirst().get("active")))throw ApiException.notFound("현재 공개된 작가 정보가 없습니다.");var value=new LinkedHashMap<String,Object>(json.readValue(published.getFirst().get("data_json").toString(),Map.class));value.put("id",id);return withImage("CREATOR",value);}}
  var rows=db.queryForList("select p.event_id,pm.participant_id,e.profile_json from subculture_exhibitor e join subculture_participant_member pm on pm.exhibitor_id=e.id join subculture_participant p on p.id=pm.participant_id join subculture_catalog_publication pub on pub.event_id=p.event_id where e.id=? and p.review_state<>'EXCLUDED' order by pub.published_at desc limit 20",id);
  for(var r:rows){var snapshot=cache.computeIfAbsent(number(r.get("event_id")),publications::findPublicDetail);if(snapshot.isEmpty())continue;Map<String,Object> raw=json.readValue(r.get("profile_json").toString(),Map.class);for(var p:maps(snapshot.get().get("participants")))if(number(p.get("id"))==number(r.get("participant_id")))for(var member:maps(obj(p.get("participant")).get("members")))if(sameMember(raw,member)){var result=new LinkedHashMap<String,Object>(member);result.put("id",id);return withImage("CREATOR",result);}}
  throw ApiException.notFound("현재 공개된 작가 정보를 찾지 못했습니다.");
 }
 static boolean sameMember(Map<String,Object> a,Map<String,Object> b){return Objects.equals(a.get("name"),b.get("name"))&&Objects.equals(a.get("profileUrl"),b.get("profileUrl"));}
 public boolean productLinkMatches(Map<String,Object> link,Map<String,Object> product){
  if(link.get("reviewed_by")!=null||link.get("system_verdict_id")==null)return true;
  if(link.get("target_snapshot_json")==null)return false;
  var expected=new LinkedHashMap<String,Object>(json.readValue(link.get("target_snapshot_json").toString(),Map.class));
  var current=new LinkedHashMap<>(product);expected.remove("images");current.remove("images");return expected.equals(current);
 }
 public List<Map<String,Object>> creators(String q,int page){q=text(q,100,false);if(page<0||page>1000)throw ApiException.badRequest("페이지를 확인해 주세요.");String term="%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%";var ids=db.queryForList("select distinct e.id from subculture_exhibitor e join subculture_participant_member pm on pm.exhibitor_id=e.id join subculture_participant p on p.id=pm.participant_id join subculture_catalog_publication pub on pub.event_id=p.event_id where e.name ilike ? escape '!' and p.review_state<>'EXCLUDED' order by e.id limit 20 offset ?",Long.class,term,page*20);if(graphEnabled)ids=db.queryForList("select e.id from subculture_exhibitor e where e.name ilike ? escape '!' and (exists(select 1 from collection_creator_publication cp where cp.exhibitor_id=e.id and cp.active) or exists(select 1 from subculture_participant_member pm join subculture_participant p on p.id=pm.participant_id join subculture_catalog_publication pub on pub.event_id=p.event_id where pm.exhibitor_id=e.id and p.review_state<>'EXCLUDED')) order by e.id limit 20 offset ?",Long.class,term,page*20);return creatorViews(ids);}
 public Set<Long> relatedCreatorIds(Set<Long> ids){
  if(!graphEnabled||ids.isEmpty())return new LinkedHashSet<>(ids);
  var result=new LinkedHashSet<>(ids);String marks=String.join(",",Collections.nCopies(ids.size(),"?"));
  var roots=db.queryForList("select coalesce(i.canonical_id,p.exhibitor_id) as id from collection_creator_publication p left join collection_creator_identity i on i.alias_id=p.exhibitor_id and i.active where p.active and p.exhibitor_id in ("+marks+")",Long.class,ids.toArray());
  for(long root:roots){if(db.queryForList("select exhibitor_id from collection_creator_publication where exhibitor_id=? and active",root).isEmpty())continue;result.add(root);result.addAll(db.queryForList("select i.alias_id from collection_creator_identity i join collection_creator_publication p on p.exhibitor_id=i.alias_id and p.active where i.canonical_id=? and i.active",Long.class,root));}return result;
 }
 public List<Map<String,Object>> creatorCards(List<Map<String,Object>> views){
  if(!graphEnabled||views.isEmpty())return views;
  String marks=String.join(",",Collections.nCopies(views.size(),"?"));var groups=new HashMap<Long,Long>();
  for(var row:db.queryForList("select i.alias_id,i.canonical_id from collection_creator_identity i join collection_creator_publication p on p.exhibitor_id=i.canonical_id and p.active where i.active and i.alias_id in ("+marks+")",views.stream().map(v->v.get("id")).toArray()))groups.put(number(row.get("alias_id")),number(row.get("canonical_id")));
  var cards=new LinkedHashMap<Long,Map<String,Object>>();for(var view:views){long id=number(view.get("id"));cards.putIfAbsent(groups.getOrDefault(id,id),view);}return new ArrayList<>(cards.values());
 }
 public List<Map<String,Object>> creatorViews(Collection<Long> ids){
  if(ids.isEmpty())return List.of();
  String marks=String.join(",",Collections.nCopies(ids.size(),"?"));
  String profileJoin=graphEnabled?" left join collection_creator_publication cp on cp.exhibitor_id=e.id ":" ";
  String profile=graphEnabled?"case when cp.exhibitor_id is not null then case when cp.active then cp.data_json end else legacy.member end":"legacy.member";
  String legacyGate=graphEnabled?"cp.exhibitor_id is null and ":"";
  var rows=db.queryForList("select e.id,"+profile+" as data_json from subculture_exhibitor e "+profileJoin+"""
   left join lateral (
    select member from subculture_participant_member pm
    join subculture_participant p on p.id=pm.participant_id
    join subculture_catalog_publication pub on pub.event_id=p.event_id
    join subculture_event_candidate event on event.id=p.event_id
    cross join lateral jsonb_array_elements(pub.snapshot_json->'participants') participant
    cross join lateral jsonb_array_elements(participant->'participant'->'members') member
    where %spm.exhibitor_id=e.id and p.review_state<>'EXCLUDED' and event.review_state<>'EXCLUDED'
    and participant->>'id'=p.id::text
    and member->>'name' is not distinct from e.profile_json->>'name'
    and member->>'profileUrl' is not distinct from e.profile_json->>'profileUrl'
    order by pub.published_at desc limit 1
   ) legacy on true where e.id in (
   """.formatted(legacyGate)+marks+")",ids.toArray());
  Map<Long,Map<String,Object>> found=new HashMap<>();
  for(var row:rows)if(row.get("data_json")!=null){long id=number(row.get("id"));var value=new LinkedHashMap<String,Object>(json.readValue(row.get("data_json").toString(),Map.class));value.put("id",id);found.put(id,value);}
  var values=ids.stream().map(found::get).filter(Objects::nonNull).toList();return media==null?values:media.attach("CREATOR",values);
 }
 public List<Map<String,Object>> adminSubjects(){return db.queryForList("select id,kind,name,work_id as \"workId\",medium,aliases::text as \"aliasesJson\",source_url as \"sourceUrl\",active,revision from subculture_subject order by reviewed_at desc limit 100");}
 public List<Map<String,Object>> adminLinks(UUID subjectId){return db.queryForList("select id,subject_id as \"subjectId\",kind,target_id as \"targetId\",event_id as \"eventId\",participant_id as \"participantId\",source_url as \"sourceUrl\",evidence,active,revision from subculture_subject_link where subject_id=? order by reviewed_at desc limit 100",subjectId);}
 @Transactional public Map<String,Object> reviewSubject(long actor,UUID id,SubjectInput in){if(in==null||in.kind()==null||!Set.of("WORK","CHARACTER").contains(in.kind())||in.revision()<0)throw ApiException.badRequest("종류와 버전을 확인해 주세요.");String name=text(in.name(),160,true),medium=text(in.medium(),24,false),source=url(in.sourceUrl());if(in.kind().equals("WORK")&&(!MEDIA.contains(medium)||in.workId()!=null)||in.kind().equals("CHARACTER")&&(in.workId()==null||!"WORK".equals(subject(in.workId()).get("kind"))))throw ApiException.badRequest("출처 작품을 확인해 주세요.");if(id.equals(in.workId()))throw ApiException.badRequest("자신을 출처로 지정할 수 없습니다.");if(in.aliases()==null||in.aliases().size()>30)throw ApiException.badRequest("별칭은 30개 이하로 입력해 주세요.");var aliases=in.aliases().stream().map(x->text(x,160,true)).toList();db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","subject:"+id);var old=db.queryForList("select revision,kind from subculture_subject where id=?",id);if(!old.isEmpty()&&(!old.getFirst().get("kind").equals(in.kind())||number(old.getFirst().get("revision"))!=in.revision()))throw ApiException.conflict("항목의 종류나 버전이 변경됐습니다.");if(old.isEmpty()&&in.revision()!=0)throw ApiException.conflict("새 항목의 버전은 0입니다.");db.update("insert into subculture_subject(id,kind,name,work_id,medium,aliases,source_url,active,reviewed_by) values(?,?,?,?,?,cast(? as jsonb),?,?,?) on conflict(id) do update set name=excluded.name,work_id=excluded.work_id,medium=excluded.medium,aliases=excluded.aliases,source_url=excluded.source_url,active=excluded.active,reviewed_by=excluded.reviewed_by,reviewed_at=now(),revision=subculture_subject.revision+1",id,in.kind(),name,in.workId(),medium,json.writeValueAsString(aliases),source,in.active(),actor);return Map.of("id",id,"active",in.active());}
 @Transactional public Map<String,Object> reviewLink(long actor,UUID id,LinkInput in){if(in==null||in.kind()==null||in.subjectId()==null||in.targetId()<1||in.revision()<0||!Set.of("EVENT","PRODUCT","CREATOR").contains(in.kind()))throw ApiException.badRequest("관계 정보를 확인해 주세요.");if(in.active())subject(in.subjectId());String source=url(in.sourceUrl()),evidence=text(in.evidence(),1000,true);
  if(in.active()){if(in.kind().equals("CREATOR")){if(in.eventId()!=null||in.participantId()!=null)throw ApiException.badRequest("작업 관계에 행사 판매를 함께 지정할 수 없습니다.");creator(in.targetId());}
  else{if(in.eventId()==null)throw ApiException.badRequest("행사가 필요합니다.");var event=publications.detail(in.eventId());if(in.kind().equals("EVENT")){if(in.eventId()!=in.targetId()||in.participantId()!=null)throw ApiException.badRequest("행사 ID가 일치하지 않습니다.");}else {var p=maps(event.get("participants")).stream().filter(x->number(x.get("id"))==Objects.requireNonNullElse(in.participantId(),-1L)).findFirst().orElseThrow(()->ApiException.badRequest("공개 참가 부스가 필요합니다."));if(p.get("sales")==null||maps(p.get("productRows")).stream().noneMatch(x->number(x.get("id"))==in.targetId()))throw ApiException.badRequest("공개된 판매물 ID가 필요합니다.");}}
  }
  db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","subject-link:"+in.subjectId()+":"+in.kind()+":"+in.targetId());
  if(!db.queryForList("select id from subculture_subject_link where subject_id=? and kind=? and target_id=? and id<>?",in.subjectId(),in.kind(),in.targetId(),id).isEmpty())throw ApiException.conflict("이미 등록된 관계입니다. 기존 연결을 수정해 주세요.");var old=db.queryForList("select * from subculture_subject_link where id=?",id);if(!old.isEmpty()&&(number(old.getFirst().get("revision"))!=in.revision()||!old.getFirst().get("subject_id").equals(in.subjectId())||!old.getFirst().get("kind").equals(in.kind())||number(old.getFirst().get("target_id"))!=in.targetId()))throw ApiException.conflict("관계의 대상이나 버전이 변경됐습니다.");if(old.isEmpty()&&in.revision()!=0)throw ApiException.conflict("새 관계의 버전은 0입니다.");db.update("insert into subculture_subject_link(id,subject_id,kind,target_id,event_id,participant_id,source_url,evidence,active,reviewed_by) values(?,?,?,?,?,?,?,?,?,?) on conflict(id) do update set source_url=excluded.source_url,evidence=excluded.evidence,active=excluded.active,reviewed_by=excluded.reviewed_by,reviewed_at=now(),revision=subculture_subject_link.revision+1",id,in.subjectId(),in.kind(),in.targetId(),in.eventId(),in.participantId(),source,evidence,in.active(),actor);return Map.of("id",id,"active",in.active());}
}
