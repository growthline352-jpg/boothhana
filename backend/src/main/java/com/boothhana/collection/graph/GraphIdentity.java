package com.boothhana.collection.graph;

import com.boothhana.collection.CollectionRules;
import com.boothhana.interests.InterestRules;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.collection.graph.GraphService.*;
import static com.boothhana.collection.graph.GraphProjection.*;

/** Reviewed source aliases reuse stable IDs. They do not rewrite user interests or legacy rows. */
@Component @ConditionalOnProperty(name="app.collection.graph.enabled",havingValue="true")
public class GraphIdentity {
 private final JdbcTemplate db;private final JsonMapper json;
 public GraphIdentity(JdbcTemplate db,JsonMapper json){this.db=db;this.json=json;}
 private String encode(Object x){return json.writeValueAsString(x);}
 private void history(String kind,String target,Object decision,UUID verdict){db.update("insert into collection_identity_history(id,kind,target_id,decision_json,verdict_id) values(?,?,?,cast(? as jsonb),?)",UUID.randomUUID(),kind,target,encode(decision),verdict);}
 private void proof(Object evidence,String first,String second){
  var urls=new HashSet<String>();for(var row:maps(evidence)){require(!InterestRules.text(text(row.get("evidence")),1000,true).isBlank(),"동일성 설명이 필요합니다.");urls.add(normalizedUrl(text(row.get("sourceUrl"))));}
  require(first!=null&&!first.isBlank()&&second!=null&&!second.isBlank()&&urls.contains(normalizedUrl(first))&&urls.contains(normalizedUrl(second)),"양쪽 공식 출처의 동일성 근거가 필요합니다.");
 }
 public UUID subject(Map<String,Object> in,String kind,UUID work,UUID verdict){
  String name=InterestRules.text(text(in.get("name")),160,true),source=InterestRules.url(text(in.get("sourceUrl"))),medium=InterestRules.text(text(in.get("medium")),24,false);
  require(!kind.equals("WORK")||InterestRules.MEDIA.contains(medium),"작품 종류 오류");
  String identity=CollectionRules.sha(kind+"\u001f"+Objects.toString(work,"")+"\u001f"+normalizedUrl(source)+"\u001f"+name);
  var aliases=db.queryForList("select s.* from collection_subject_identity i join subculture_subject s on s.id=i.subject_id where i.identity_key=?",identity);
  if(!aliases.isEmpty()){
   var s=aliases.getFirst();require(Boolean.TRUE.equals(s.get("active")),"비공개 식별자입니다.");require(kind.equals(s.get("kind"))&&Objects.equals(work,s.get("work_id")),"연결 이후 식별자의 작품 소속이 변경됐습니다.");
   if("DISTINCT".equals(in.get("identityDecision"))){
    require(text(in.get("id")).isBlank(),"별개 대상 판정에 기존 동일 ID를 지정할 수 없습니다.");proof(in.get("identityEvidence"),text(s.get("source_url")),source);
    db.update("delete from collection_subject_identity where identity_key=?",identity);history("SUBJECT",text(s.get("id")),Map.of("action","UNLINK","alias",in),verdict);
   }else{require(text(in.get("id")).isBlank()||text(in.get("id")).equals(text(s.get("id"))),"이미 다른 식별자에 연결된 출처입니다.");return (UUID)s.get("id");}
  }
  String id=text(in.get("id"));
  if(!id.isBlank()){
   UUID existing=UUID.fromString(id);var rows=db.queryForList("select * from subculture_subject where id=? and kind=? and work_id is not distinct from ? for update",existing,kind,work);
   require(!rows.isEmpty()&&Boolean.TRUE.equals(rows.getFirst().get("active")),"기존 작품·캐릭터의 소속을 확인하세요.");var old=rows.getFirst();
   require(!kind.equals("WORK")||medium.equals(old.get("medium")),"다른 종류의 작품을 합칠 수 없습니다.");
   if(!Objects.equals(name,old.get("name"))||!normalizedUrl(source).equals(normalizedUrl(text(old.get("source_url")))))proof(in.get("identityEvidence"),text(old.get("source_url")),source);
   // A previously established identity with this exact source/name cannot be reassigned silently.
   var conflict=db.queryForList("select id from subculture_subject where kind=? and name=? and work_id is not distinct from ? and source_url=? and id<>?",kind,name,work,source,existing);
   require(conflict.isEmpty(),"이미 별도 ID가 있는 출처입니다. 중복 ID는 자동 소거하지 않습니다.");
   db.update("insert into collection_subject_identity(identity_key,subject_id,source_url,name,evidence_json,verdict_id) values(?,?,?,?,cast(? as jsonb),?)",identity,existing,source,name,encode(in.getOrDefault("identityEvidence",List.of())),verdict);history("SUBJECT",id,in,verdict);return existing;
  }
  var exact=db.queryForList("select id,active from subculture_subject where kind=? and name=? and work_id is not distinct from ? and source_url=?",kind,name,work,source);
  require(exact.size()<=1,"동일 출처의 식별 후보가 여러 개입니다.");
  if(!exact.isEmpty()){require(!"DISTINCT".equals(in.get("identityDecision")),"동일한 이름·작품·출처만으로 별개 ID를 만들 수 없습니다.");require(Boolean.TRUE.equals(exact.getFirst().get("active")),"비공개 식별자를 다시 생성할 수 없습니다.");return (UUID)exact.getFirst().get("id");}
  var similar=db.queryForList("select id,source_url from subculture_subject where kind=? and name=? and work_id is not distinct from ?",kind,name,work);
  if(similar.size()==1&&"EXISTING".equals(in.get("identityDecision"))){var reuse=new LinkedHashMap<>(in);reuse.put("id",text(similar.getFirst().get("id")));return subject(reuse,kind,work,verdict);}
  if(!similar.isEmpty()){
   require("DISTINCT".equals(in.get("identityDecision")),"같은 이름의 기존 ID가 있습니다. 동일성 또는 다른 대상이라는 근거를 보완하세요.");
   for(var row:similar)proof(in.get("identityEvidence"),text(row.get("source_url")),source);
  }
  var rows=db.queryForList("insert into subculture_subject(id,kind,name,work_id,medium,source_url,system_verdict_id,source_identity) values(?,?,?,?,?,?,?,?) on conflict(source_identity) where source_identity is not null do update set source_identity=excluded.source_identity returning id,active",UUID.randomUUID(),kind,name,work,medium,source,verdict,identity);
  require(Boolean.TRUE.equals(rows.getFirst().get("active")),"비공개 식별자를 자동 복구할 수 없습니다.");return (UUID)rows.getFirst().get("id");
 }
 public void creator(long id,Map<String,Object> decision,UUID verdict){
  String action=text(decision.get("action"));if(action.isBlank()||action.equals("KEEP"))return;
  require(Set.of("LINK","UNLINK").contains(action),"작가 식별 판정 오류");
  var current=db.queryForList("select * from collection_creator_identity where alias_id=? for update",id);
  require(!action.equals("UNLINK")||!current.isEmpty(),"해제할 작가 연결이 없습니다.");
  long canonical=action.equals("UNLINK")&&!current.isEmpty()?number(current.getFirst().get("canonical_id")):number(decision.get("canonicalId"));require(canonical!=id,"자기 자신과 병합할 수 없습니다.");
  var profiles=db.queryForList("select exhibitor_id,data_json from collection_creator_publication where exhibitor_id in (?,?) and active order by exhibitor_id for update",id,canonical);
  require(profiles.size()==2,"공개된 양쪽 작가 프로필이 필요합니다.");
  var a=map(json.readValue(profiles.get(0).get("data_json").toString(),Map.class));var b=map(json.readValue(profiles.get(1).get("data_json").toString(),Map.class));proof(decision.get("evidence"),text(a.get("profileUrl")),text(b.get("profileUrl")));
  if(action.equals("UNLINK")){db.update("update collection_creator_identity set active=false,revision=revision+1,evidence_json=cast(? as jsonb),verdict_id=? where alias_id=?",encode(decision),verdict,id);history("CREATOR",Long.toString(id),decision,verdict);return;}
  require(db.queryForList("select alias_id from collection_creator_identity where active and (alias_id=? or canonical_id=?)",canonical,id).isEmpty(),"순환 또는 연쇄 작가 통합은 허용하지 않습니다.");
  require(current.isEmpty()||!Boolean.TRUE.equals(current.getFirst().get("active"))||number(current.getFirst().get("canonical_id"))==canonical,"기존 작가 연결을 먼저 해제해야 합니다.");
  db.update("insert into collection_creator_identity(alias_id,canonical_id,evidence_json,verdict_id) values(?,?,cast(? as jsonb),?) on conflict(alias_id) do update set canonical_id=excluded.canonical_id,active=true,revision=collection_creator_identity.revision+1,evidence_json=excluded.evidence_json,verdict_id=excluded.verdict_id",id,canonical,encode(decision),verdict);history("CREATOR",Long.toString(id),decision,verdict);
 }
 public List<Map<String,Object>> subjectCandidates(String text){return db.queryForList("select s.id,s.kind,s.name,s.work_id as \"workId\",w.name as \"workName\",s.medium,s.source_url as \"sourceUrl\",s.active from subculture_subject s left join subculture_subject w on w.id=s.work_id where position(lower(s.name) in lower(?))>0 or exists(select 1 from collection_subject_identity a where a.subject_id=s.id and position(lower(a.name) in lower(?))>0) order by s.kind,s.id limit 80",text,text);}
 public List<Map<String,Object>> creatorCandidates(long id,Map<String,Object> profile){
  var names=new LinkedHashSet<String>();names.add(text(profile.get("name")));for(Object alias:(List<?>)profile.getOrDefault("aliases",List.of()))names.add(text(alias));
  for(var row:db.queryForList("select data_json from collection_creator_publication where exhibitor_id=?",id)){var published=map(json.readValue(text(row.get("data_json")),Map.class));for(Object alias:(List<?>)published.getOrDefault("aliases",List.of()))names.add(text(alias));}
  String marks=String.join(",",Collections.nCopies(names.size(),"?"));var args=new ArrayList<Object>();args.add(id);args.addAll(names);args.addAll(names);args.add(id);
  return db.queryForList("select c.exhibitor_id as id,c.data_json as profile from collection_creator_publication c where c.active and c.exhibitor_id<>? and (c.data_json->>'name' in ("+marks+") or jsonb_exists_any(c.data_json->'aliases',array["+marks+"]) or exists(select 1 from collection_creator_identity i where i.active and i.alias_id=? and i.canonical_id=c.exhibitor_id)) order by c.exhibitor_id limit 40",args.toArray()).stream().map(r->{var v=new LinkedHashMap<>(r);v.put("profile",json.readValue(text(r.get("profile")),Map.class));return (Map<String,Object>)v;}).toList();
 }
}
