package com.boothhana.collection;

import com.boothhana.api.ApiException;
import com.boothhana.security.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;
import java.time.LocalDate;
import java.util.*;
import static com.boothhana.collection.CollectionModels.*;

/** One edition, several source records. This never grants ownership or enables trading. */
@Service
@Transactional(readOnly=true)
public class CatalogOperatingGroups {
 private final JdbcTemplate db;private final JsonMapper json;
 public CatalogOperatingGroups(JdbcTemplate db,JsonMapper json){this.db=db;this.json=json;}
 public record Input(long revision,String name,String sourceUrl,String checkedOn,List<Long> eventIds) {}
 public record Member(long eventId,String name,String venueName,List<Occurrence> occurrences) {}
 public record PublicGroup(long rootEventId,String name,List<Member> members) {}
 /** Publication and membership changes always acquire this lock before event rows. */
 void lockPublication(){db.queryForList("select pg_advisory_xact_lock(hashtext('boothhana_operating_groups'))");}
 private static String category(String subtype){
  return CatalogTaxonomy.GROUPS.entrySet().stream().filter(g->g.getValue().contains(subtype)).map(Map.Entry::getKey).findFirst().orElseThrow(()->ApiException.badRequest("행사 분야를 확인하세요."));
 }
 void validatePublishedCategory(long event,String subtype){
  String expected=category(subtype);
  var others=db.queryForList("select p.snapshot_json->'event'->>'subcategory' subtype from catalog_operating_group_member selected join catalog_operating_group_member sibling on sibling.root_event_id=selected.root_event_id join subculture_catalog_publication p on p.event_id=sibling.event_id where selected.event_id=? and sibling.event_id<>?",event,event);
  if(others.stream().anyMatch(r->!expected.equals(category(String.valueOf(r.get("subtype"))))))throw ApiException.conflict("같은 운영일 묶음의 행사 분야가 다릅니다. 묶음을 해제하거나 같은 분야로 검토한 뒤 공개해 주세요.");
 }
 public static void validate(long root,Input input){
  if(input==null||input.revision() < -1||input.eventIds()==null||input.eventIds().size()<2||input.eventIds().size()>14||new HashSet<>(input.eventIds()).size()!=input.eventIds().size()||!Objects.equals(input.eventIds().getFirst(),root)||input.eventIds().stream().anyMatch(i->i==null||i<1))throw ApiException.badRequest("대표 행사를 첫 번째로 포함한 2~14개의 서로 다른 행사를 선택해 주세요.");
  try{CollectionRules.text(input.name(),255,false);if(input.name().isBlank())throw new IllegalArgumentException();CollectionRules.url(input.sourceUrl());LocalDate.parse(input.checkedOn());}catch(RuntimeException e){throw ApiException.badRequest("묶음 이름과 공식 출처·확인일을 입력해 주세요.");}
 }
 public Map<String,Object> admin(long event){
  var roots=db.queryForList("select g.* from catalog_operating_group g join catalog_operating_group_member m on m.root_event_id=g.root_event_id where m.event_id=?",event);
  if(roots.isEmpty())return Map.of("rootEventId",event,"revision",-1,"name","","sourceUrl","","checkedOn","","fixedMembers",false,"eventIds",List.of(event));
  var r=roots.getFirst();long root=((Number)r.get("root_event_id")).longValue();
  return Map.of("rootEventId",root,"revision",r.get("revision"),"name",r.get("name"),"sourceUrl",r.get("source_url"),"checkedOn",r.get("checked_on").toString(),"fixedMembers",r.get("fixed_members"),"eventIds",db.queryForList("select event_id from catalog_operating_group_member where root_event_id=? order by position",Long.class,root));
 }
 @Transactional(timeout=15) public Map<String,Object> save(long root,Input input,long actor){
  validate(root,input);
  // Serialize membership changes. Event publication uses the same event-row locks.
  lockPublication();
  var old=db.queryForList("select * from catalog_operating_group where root_event_id=? for update",root);
  if((old.isEmpty()?-1:((Number)old.getFirst().get("revision")).longValue())!=input.revision())throw ApiException.conflict("다른 변경이 반영되었습니다. 다시 불러와 주세요.");
  var previous=db.queryForList("select event_id from catalog_operating_group_member where root_event_id=? order by position",Long.class,root);
  if(!old.isEmpty()&&Boolean.TRUE.equals(old.getFirst().get("fixed_members"))&&!previous.equals(input.eventIds()))throw ApiException.conflict("기존 공유 주소와 연결된 운영일은 구성 변경을 지원하지 않습니다. 이름과 출처는 수정할 수 있습니다.");
  Set<Long> lockIds=new TreeSet<>(input.eventIds());lockIds.addAll(previous);
  for(long id:lockIds)db.queryForList("select id from subculture_event_candidate where id=? for update",id);
  String category=null;
  for(long id:input.eventIds()){
   var attached=db.queryForList("select root_event_id from catalog_operating_group_member where event_id=? and root_event_id<>?",id,root);
   if(!attached.isEmpty())throw ApiException.conflict("다른 묶음에 속한 행사가 있습니다. 기존 묶음을 먼저 확인해 주세요.");
   var rows=db.queryForList("select p.snapshot_json->'event'->>'subcategory' subtype from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id where p.event_id=? and e.review_state<>'EXCLUDED'",id);
   if(rows.isEmpty())throw ApiException.badRequest("현재 공개된 행사만 묶을 수 있습니다.");
   String current=category(String.valueOf(rows.getFirst().get("subtype")));
   if(category!=null&&!category.equals(current))throw ApiException.badRequest("서브컬처·박람회·축제는 같은 분야끼리 묶어 주세요.");category=current;
  }
  db.update("insert into catalog_operating_group(root_event_id,name,source_url,checked_on,updated_by) values(?,?,?,cast(? as date),?) on conflict(root_event_id) do update set name=excluded.name,source_url=excluded.source_url,checked_on=excluded.checked_on,updated_by=excluded.updated_by,updated_at=now(),revision=catalog_operating_group.revision+1",root,input.name().strip(),input.sourceUrl(),input.checkedOn(),actor);
  db.update("delete from catalog_operating_group_member where root_event_id=?",root);
  for(int n=0;n<input.eventIds().size();n++)db.update("insert into catalog_operating_group_member(event_id,root_event_id,position) values(?,?,?)",input.eventIds().get(n),root,n);
  var after=admin(root);
  db.update("insert into subculture_catalog_review_history(target_type,target_id,before_json,after_json,actor_id) values('operating_group',?,cast(? as jsonb),cast(? as jsonb),?)",root,json.writeValueAsString(Map.of("group",old,"eventIds",previous)),json.writeValueAsString(Map.of("group",after,"actorId",actor)),actor);
  return after;
 }
 @Transactional(timeout=15) public void remove(long root,long revision,long actor){
  lockPublication();
  var old=db.queryForList("select * from catalog_operating_group where root_event_id=? for update",root);
  if(old.isEmpty()||((Number)old.getFirst().get("revision")).longValue()!=revision)throw ApiException.conflict("묶음 설정이 변경되었습니다. 다시 확인해 주세요.");
  if(Boolean.TRUE.equals(old.getFirst().get("fixed_members")))throw ApiException.conflict("기존 공유 주소와 연결된 운영일은 해제할 수 없습니다.");
  var members=db.queryForList("select event_id from catalog_operating_group_member where root_event_id=? order by position",Long.class,root);
  db.update("delete from catalog_operating_group_member where root_event_id=?",root);
  db.update("delete from catalog_operating_group where root_event_id=?",root);
  db.update("insert into subculture_catalog_review_history(target_type,target_id,before_json,after_json,actor_id) values('operating_group',?,cast(? as jsonb),cast(? as jsonb),?)",root,json.writeValueAsString(Map.of("group",old,"eventIds",members)),json.writeValueAsString(Map.of("removed",true,"actorId",actor)),actor);
 }
 public Map<Long,PublicGroup> publicGroups(Collection<Long> ids){
  if(ids.isEmpty())return Map.of();
  String marks=String.join(",",Collections.nCopies(ids.size(),"?"));
  var rows=db.queryForList("select g.root_event_id,g.name,m.event_id,p.snapshot_json->'event' event_json from catalog_operating_group g join catalog_operating_group_member m on m.root_event_id=g.root_event_id join subculture_catalog_publication p on p.event_id=m.event_id join subculture_event_candidate e on e.id=m.event_id where e.review_state<>'EXCLUDED' and g.root_event_id in (select root_event_id from catalog_operating_group_member where event_id in ("+marks+")) order by g.root_event_id,m.position",ids.toArray());
  Map<Long,List<Member>> members=new LinkedHashMap<>();Map<Long,String> names=new HashMap<>();
  for(var r:rows){long root=((Number)r.get("root_event_id")).longValue();var e=json.readValue(r.get("event_json").toString(),EventData.class);names.put(root,r.get("name").toString());members.computeIfAbsent(root,k->new ArrayList<>()).add(new Member(((Number)r.get("event_id")).longValue(),e.name(),e.venueName(),e.occurrences()));}
  Map<Long,PublicGroup> result=new HashMap<>();members.forEach((root,items)->{if(items.size()>1){var group=new PublicGroup(root,names.get(root),List.copyOf(items));items.forEach(m->result.put(m.eventId(),group));}});return result;
 }
 public List<Long> commentEvents(long event){var group=publicGroups(List.of(event)).get(event);return group==null?List.of(event):group.members().stream().map(Member::eventId).toList();}
}

@RestController
class CatalogOperatingGroupController {
 private final CatalogOperatingGroups groups;private final CurrentUser current;
 CatalogOperatingGroupController(CatalogOperatingGroups groups,CurrentUser current){this.groups=groups;this.current=current;}
 @GetMapping("/api/admin/subculture/v4/events/{id}/operating-group") public Map<String,Object> get(@PathVariable long id){return groups.admin(id);}
 @PutMapping("/api/admin/subculture/v4/events/{id}/operating-group") public Map<String,Object> save(@PathVariable long id,@RequestBody CatalogOperatingGroups.Input input,Authentication auth){return groups.save(id,input,current.require(auth).id);}
 @DeleteMapping("/api/admin/subculture/v4/events/{id}/operating-group") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
 public void remove(@PathVariable long id,@RequestParam long revision,Authentication auth){groups.remove(id,revision,current.require(auth).id);}
}
