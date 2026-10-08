package com.boothhana.collection.graph;

import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.collection.graph.GraphService.*;
import static com.boothhana.collection.graph.GraphProjection.*;
import static com.boothhana.collection.graph.GraphModels.*;

/** A reviewed window of one unchanged source page. Continuations reference committed verdicts. */
final class GraphPageBatch {
 static boolean changed(Map<String,Object> result,Map<String,Object> input,Audit review){var batch=map(input.get("pageBatch"));if(batch.isEmpty())batch=map(result.get("pageBatch"));if(batch.isEmpty()||review.sourceDocuments()==null)return false;String url=normalizedUrl(text(batch.get("sourceUrl"))),digest=text(batch.get("sourceHash"));return review.sourceDocuments().stream().anyMatch(d->normalizedUrl(d.url()).equals(url)&&!digest.equals(d.sha256()));}
 static List<Map<String,Object>> items(String kind,Map<String,Object> result){return maps(kind.equals("PARTICIPANTS")?result.get("participants"):kind.equals("CREATOR")?result.get("goods"):map(result.get("sales")).get("products"));}
 static void validate(JdbcTemplate db,JsonMapper json,Map<String,Object> job,Map<String,Object> result,Audit review,Map<String,Object> extractionAudit){
  var batch=map(result.get("pageBatch"));var input=json.readValue(job.get("input_json").toString(),Map.class);var prior=map(input.get("pageBatch"));
  if(batch.isEmpty()){require(prior.isEmpty(),"페이지 묶음 이어받기 정보가 누락됐습니다.");var coverage=map(result.get("coverage"));if(Set.of("PARTICIPANTS","SALES").contains(text(job.get("kind")))&&"COMPLETE".equals(coverage.get("completeness"))&&coverage.get("reportedTotal") instanceof Number total&&((List<?>)input.getOrDefault("visited",List.of())).isEmpty())require(items(text(job.get("kind")),result).size()>=total.longValue(),"원문 총수보다 적은 첫 페이지를 전체 완료로 표시할 수 없습니다.");return;}
  String kind=text(job.get("kind"));require(Set.of("PARTICIPANTS","SALES","CREATOR").contains(kind),"묶음을 지원하지 않는 작업입니다.");
  String url=normalizedUrl(text(batch.get("sourceUrl"))),digest=text(batch.get("sourceHash"));require(digest.matches("[0-9a-f]{64}"),"원문 해시 오류");
  for(String key:List.of("offset","total"))require(batch.get(key) instanceof Integer||batch.get(key) instanceof Long,"묶음 범위는 정수여야 합니다.");
  long offset=number(batch.get("offset")),total=number(batch.get("total"));var items=items(kind,result);int count=items.size();
  require(offset>=0&&offset%100==0&&total>100&&total<=1000000&&count==Math.min(100,total-offset)&&count>0,"묶음 수량 또는 전체 수 대조 실패");
  var labels=items.stream().map(i->text(i.get(kind.equals("PARTICIPANTS")?"registrationName":"name"))).toList();
  require(labels.equals(batch.get("labels"))&&new HashSet<>(labels).size()==labels.size(),"묶음 항목명 대조 실패: 구별 가능한 원문 이름이 필요합니다.");
  require(review.sourceDocuments()!=null&&review.sourceDocuments().stream().anyMatch(d->normalizedUrl(d.url()).equals(url)&&digest.equals(d.sha256())),"검토 원문 스냅샷이 묶음과 다릅니다.");
  require(maps(extractionAudit.get("sourceDocuments")).stream().anyMatch(d->normalizedUrl(text(d.get("url"))).equals(url)&&digest.equals(d.get("sha256"))),"추출 원문 스냅샷이 묶음과 다릅니다.");
  if(offset==0)require(prior.isEmpty(),"이어받기 도중 처음부터 다시 적용할 수 없습니다.");
  else{
   require(number(prior.get("offset"))==offset&&number(prior.get("total"))==total&&digest.equals(prior.get("sourceHash"))&&url.equals(normalizedUrl(text(prior.get("sourceUrl")))),"이전 묶음과 범위·원문이 다릅니다.");
   var rows=db.queryForList("select e.result_json,j.kind,j.target_id from collection_verdict v join collection_extraction e on e.id=v.extraction_id join collection_job j on j.id=e.job_id where v.id=? and v.verdict='APPROVE'",UUID.fromString(text(prior.get("previousVerdict"))));
   require(rows.size()==1,"승인된 이전 묶음이 필요합니다.");var previous=rows.getFirst();var data=json.readValue(previous.get("result_json").toString(),Map.class);var before=map(data.get("pageBatch"));
   require(kind.equals(previous.get("kind"))&&job.get("target_id").equals(previous.get("target_id"))&&number(before.get("total"))==total&&number(before.get("offset"))+items(kind,data).size()==offset&&digest.equals(before.get("sourceHash")),"이전 묶음 연결이 올바르지 않습니다.");
   // Follow committed verdicts rather than trusting a caller-provided list of preceding labels.
   var seen=db.queryForList("with recursive trail as(select e.result_json,j.input_json from collection_verdict v join collection_extraction e on e.id=v.extraction_id join collection_job j on j.id=e.job_id where v.id=? union all select e.result_json,j.input_json from trail t join collection_verdict v on v.id=cast(t.input_json->'pageBatch'->>'previousVerdict' as uuid) join collection_extraction e on e.id=v.extraction_id join collection_job j on j.id=e.job_id) select jsonb_array_elements_text(result_json->'pageBatch'->'labels') from trail",String.class,UUID.fromString(text(prior.get("previousVerdict"))));require(seen.size()==offset&&Collections.disjoint(seen,labels),"앞 묶음의 항목 반복 또는 누락이 발견됐습니다.");
  }
  if(offset+count<total){String next=kind.equals("CREATOR")?text(result.get("nextPageUrl")):text(map(result.get("coverage")).get("nextPageUrl"));require(next.isBlank(),"현재 페이지의 남은 묶음을 먼저 수집하세요.");require(kind.equals("CREATOR")?"PARTIAL".equals(result.get("coverage")):"PARTIAL".equals(map(result.get("coverage")).get("completeness"))&&"PARTIAL".equals(result.get("searchStatus")),"남은 묶음을 전체 완료로 표시할 수 없습니다.");}
 }
 /** Called only after validate; preserve confirmations from this approved same-page chain. */
 static Set<UUID> previousSalesStages(JdbcTemplate db,Map<String,Object> input,String target){
  var batch=map(input.get("pageBatch"));if(batch.isEmpty())return Set.of();
  return new HashSet<>(db.queryForList("""
   with recursive trail as (
    select v.id,j.input_json from collection_verdict v
     join collection_extraction e on e.id=v.extraction_id join collection_job j on j.id=e.job_id
     where v.id=? and v.verdict='APPROVE' and j.kind='SALES' and j.target_id=?
    union all
    select v.id,j.input_json from trail t join collection_verdict v on v.id=cast(t.input_json->'pageBatch'->>'previousVerdict' as uuid)
     join collection_extraction e on e.id=v.extraction_id join collection_job j on j.id=e.job_id
     where v.verdict='APPROVE' and j.kind='SALES' and j.target_id=?
   ) select id from trail
   """,UUID.class,UUID.fromString(text(batch.get("previousVerdict"))),target,target));
 }
 static Map<String,Object> next(Map<String,Object> input,Map<String,Object> result,UUID verdict,String kind){
  var batch=map(result.get("pageBatch"));if(batch.isEmpty()||number(batch.get("offset"))+items(kind,result).size()>=number(batch.get("total")))return Map.of();
  var next=new LinkedHashMap<String,Object>(batch);next.put("offset",number(batch.get("offset"))+items(kind,result).size());next.put("previousVerdict",verdict.toString());
  next.remove("labels");
  var continuation=new LinkedHashMap<>(input);continuation.put("pageUrl",batch.get("sourceUrl"));continuation.put("pageBatch",next);return continuation;
 }
 static Map<String,Object> legacy(Map<String,Object> result){var legacy=new LinkedHashMap<>(result);legacy.remove("pageBatch");return legacy;}
}
