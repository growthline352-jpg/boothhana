package com.boothhana.collection.graph;
import com.boothhana.collection.CollectionRules;
import com.boothhana.interests.InterestRules;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.collection.graph.GraphService.*;
import static com.boothhana.collection.graph.GraphProjection.*;

final class GraphEventRelations {
 static Map<String,Object> apply(JdbcTemplate db,JsonMapper json,GraphIdentity identities,long event,Map<String,Object> context,Map<String,Object> result,UUID verdict){
  var confirmed=new ArrayList<UUID>();var raw=json.readValue(json.writeValueAsString(map(map(context.get("event")).get("data"))),com.boothhana.collection.CollectionModels.EventData.class);
  var snapshot=com.boothhana.collection.PublicEventProjection.fromReviewed(raw);
  require(maps(result.get("subjects")).size()<=30,"행사 주제 연결 수 초과");
  for(var assignment:maps(result.get("subjects"))){
   UUID work=identities.subject(map(assignment.get("work")),"WORK",null,verdict);
   UUID subject=assignment.get("character")==null?work:identities.subject(map(assignment.get("character")),"CHARACTER",work,verdict);confirmed.add(subject);
   String url=InterestRules.url(text(assignment.get("evidenceUrl"))),evidence=InterestRules.text(text(assignment.get("evidence")),1000,true);
   db.update("insert into subculture_subject_link(id,subject_id,kind,target_id,event_id,source_url,evidence,system_verdict_id,target_snapshot_json) values(?,?,'EVENT',?,?,?,?,?,cast(? as jsonb)) on conflict(subject_id,kind,target_id) do update set active=true,source_url=excluded.source_url,evidence=excluded.evidence,system_verdict_id=excluded.system_verdict_id,target_snapshot_json=excluded.target_snapshot_json,revision=subculture_subject_link.revision+1,reviewed_at=now() where subculture_subject_link.reviewed_by is null",UUID.randomUUID(),subject,event,event,url,evidence,verdict,json.writeValueAsString(snapshot));
  }
  boolean complete=((List<?>)result.getOrDefault("unresolved",List.of())).isEmpty();
  if(complete)for(var old:db.queryForList("select id,subject_id from subculture_subject_link where kind='EVENT' and target_id=? and active and reviewed_by is null",event))if(!confirmed.contains(old.get("subject_id")))db.update("update subculture_subject_link set active=false,revision=revision+1 where id=?",old.get("id"));
  var series=map(result.get("series"));String state=text(series.get("status"));require(Set.of("CONFIRMED","NONE","UNKNOWN").contains(state),"행사 시리즈 판정 오류");
  if("CONFIRMED".equals(state)){
   String name=InterestRules.text(text(series.get("name")),160,true),official=InterestRules.url(text(series.get("officialUrl"))),proof=InterestRules.url(text(series.get("evidenceUrl"))),edition=InterestRules.text(text(series.get("edition")),160,false);
   InterestRules.text(text(series.get("evidence")),1000,true);String key=CollectionRules.sha(normalizedUrl(official)+"\u001f"+CollectionRules.normalize(name));Long id;
   if(series.get("id")!=null){id=number(series.get("id"));var rows=db.queryForList("select official_url from event_series where id=?",id);require(!rows.isEmpty(),"기존 시리즈를 확인하세요.");var evidence=maps(series.get("identityEvidence"));var urls=new HashSet<String>();for(var e:evidence){InterestRules.text(text(e.get("evidence")),1000,true);urls.add(normalizedUrl(text(e.get("sourceUrl"))));}require(urls.contains(normalizedUrl(text(rows.getFirst().get("official_url"))))&&urls.contains(normalizedUrl(official)),"시리즈 양쪽 원문 근거가 필요합니다.");}
   else{var existing=db.queryForList("select id,official_url from event_series where lower(name)=lower(?)",name).stream().filter(r->r.get("official_url")!=null&&normalizedUrl(text(r.get("official_url"))).equals(normalizedUrl(official))).toList();require(existing.size()<=1,"동일 시리즈 후보가 여러 개입니다.");id=existing.isEmpty()?db.queryForObject("insert into event_series(name,official_url,system_verdict_id,source_identity) values(?,?,?,?) on conflict(source_identity) where source_identity is not null do update set source_identity=excluded.source_identity returning id",Long.class,name,official,verdict,key):number(existing.getFirst().get("id"));}
   db.update("insert into event_series_member(event_id,series_id,edition,revision,evidence_url,system_verdict_id) values(?,?,?,1,?,?) on conflict(event_id) do update set series_id=excluded.series_id,edition=excluded.edition,evidence_url=excluded.evidence_url,system_verdict_id=excluded.system_verdict_id,revision=event_series_member.revision+1,checked_at=now() where event_series_member.checked_by is null",event,id,edition,proof,verdict);
  }else if("NONE".equals(state)&&complete)db.update("update event_series_member set series_id=null,revision=revision+1,system_verdict_id=? where event_id=? and checked_by is null",verdict,event);
  return Map.of("verdict","APPROVE","eventId",event,"linkedSubjects",confirmed.size(),"needsEnrichment",!complete||"UNKNOWN".equals(state));
 }
}
