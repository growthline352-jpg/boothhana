package com.boothhana.collection.graph;

import java.util.*;
import static com.boothhana.collection.graph.GraphProjection.*;
import static com.boothhana.collection.graph.GraphService.text;

/** Server-derived omissions; an approved partial result can advance downstream and still need repair. */
final class GraphDiagnostics {
 private GraphDiagnostics() {}
 record Report(List<Map<String,Object>> issues,Map<String,Object> coverage) {
  boolean incomplete(){return !issues.isEmpty();}
  int retryHours(){return issues.stream().anyMatch(i->Set.of("UNPUBLISHED","BLOCKED","INVALID_CANDIDATE").contains(i.get("code")))?24:6;}
 }
 static Map<String,Object> issue(String code,String field,String message){return Map.of("code",code,"field",field,"message",message);}
 static Report inspect(String kind,Map<String,Object> value,Map<String,Object> receipt,String verdict,String reason){
  var issues=new ArrayList<Map<String,Object>>();var coverage=new LinkedHashMap<String,Object>();
  if(!"APPROVE".equals(verdict)){
   String code=switch(verdict){case "REJECT"->"INVALID_CANDIDATE";case "STALE"->"REVISION_CHANGED";default->"EVIDENCE_CONFLICT";};
   issues.add(issue(code,"",reason));return new Report(issues,coverage);
  }
  Object raw=value.get("coverage");if(raw instanceof Map<?,?>)coverage.putAll(map(raw));else if(raw!=null)coverage.put("completeness",raw);
  if(value.containsKey("sourceCoverage"))coverage.put("sources",value.get("sourceCoverage"));
  for(String key:List.of("summary","warnings"))if(value.containsKey(key))coverage.put(key,value.get(key));
  if(value.containsKey("sources"))coverage.put("sourceUrls",maps(value.get("sources")).stream().map(s->text(s.get("url"))).toList());
  if(value.containsKey("productCoverage"))coverage.put("products",value.get("productCoverage"));
  for(String key:List.of("pageBatch","nextPageUrl","imageCoverage"))if(value.get(key)!=null)coverage.put(key,value.get(key));
  boolean continuing=Boolean.TRUE.equals(receipt.get("pageRemaining"))||!text(coverage.get("nextPageUrl")).isBlank()||!text(value.get("nextPageUrl")).isBlank();
  coverage.put("continuing",continuing);
  String completeness=text(coverage.get("completeness"));
  if(Set.of("UNPUBLISHED","BLOCKED").contains(completeness))issues.add(issue(completeness,"coverage","공식 자료 미발표 또는 접근 제한"));
  else if(!continuing&&Set.of("PARTIAL","UNKNOWN").contains(completeness))issues.add(issue("PARTIAL_COVERAGE","coverage","확인하지 못한 명단·상품 범위가 남아 있음"));
  if("FAILED".equals(value.get("searchStatus")))issues.add(issue("SOURCE_ERROR","searchStatus",text(value.get("summary"))));
  if(kind.equals("EVENT")){
   for(String field:List.of("address","admission"))missing(issues,value,field,"MISSING_EVENT_FIELD");
   var days=maps(value.get("occurrences"));for(int i=0;i<days.size();i++)for(String field:List.of("startTime","endTime"))if(text(days.get(i).get(field)).isBlank())issues.add(issue("MISSING_EVENT_TIME","occurrences["+i+"]."+field,"운영시간 미확인"));
  }
  if(kind.equals("PARTICIPANTS")){
   var participants=maps(value.get("participants"));coverage.put("collectedCount",participants.size());
   for(int i=0;i<participants.size();i++){
    var participant=participants.get(i);String field="participants["+i+"]";
    if(maps(participant.get("members")).isEmpty())issues.add(issue("MISSING_MEMBER",field+".members","참가 업체·작가 식별 미완료"));
    if(text(participant.get("description")).isBlank())issues.add(issue("MISSING_PARTICIPANT_DETAILS",field+".description","참가 업체·작가의 상세 소개 미확인"));
    if(maps(participant.get("locations")).isEmpty()||maps(participant.get("locations")).stream().anyMatch(p->"UNKNOWN".equals(p.get("status"))))issues.add(issue("MISSING_BOOTH_LOCATION",field+".locations","부스 위치 또는 해당 없음 여부 미확인"));
   }
  }
  if(kind.equals("CREATOR")){
   var profile=map(value.get("profile"));missing(issues,profile,"profileUrl","MISSING_PROFILE_LINK");
   if("UNKNOWN".equals(profile.get("kind")))issues.add(issue("MISSING_MEMBER_KIND","profile.kind","업체·서클·작가 유형 미확인"));
   if(value.containsKey("description"))missing(issues,value,"description","MISSING_PROFILE_DETAILS");
   if(maps(value.get("productCoverage")).stream().anyMatch(p->!Boolean.TRUE.equals(p.get("complete"))))issues.add(issue("PARTIAL_PRODUCT_PAGE","productCoverage","일부 상품 옵션 미확인"));
  }
  if(kind.equals("SALES")&&value.get("sales")==null&&!"NOT_APPLICABLE".equals(completeness))issues.add(issue("SALES_UNCONFIRMED","sales","이번 행사 판매 정보 미확인; 상품 없음으로 확정하지 않음"));
  if(kind.equals("SALES")||kind.equals("CREATOR")){
   var products=maps(kind.equals("CREATOR")?value.get("goods"):map(value.get("sales")).get("products"));coverage.put("collectedCount",products.size());
   for(int i=0;i<products.size();i++)if(text(products.get(i).get("memberName")).isBlank())issues.add(issue("MISSING_PRODUCT_OWNER","products["+i+"].memberName","상품 판매자·제작자 귀속 미확인"));
  }
  for(Object problem:(List<?>)value.getOrDefault("unresolved",List.of()))issues.add(issue("UNRESOLVED_RELATION","unresolved",text(problem)));
  if(Boolean.TRUE.equals(receipt.get("needsEnrichment"))&&issues.isEmpty())issues.add(issue("INCOMPLETE_RESEARCH","","조사·관계 검증이 완료되지 않음"));
  // Keep diagnostics bounded even for a page containing hundreds of missing fields.
  return new Report(List.copyOf(issues.stream().limit(100).toList()),coverage);
 }
 private static void missing(List<Map<String,Object>> issues,Map<String,Object> value,String field,String code){if(text(value.get(field)).isBlank())issues.add(issue(code,field,"공식 근거로 확인할 항목이 남아 있음"));}
}
