package com.boothhana.collection.graph;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import java.util.function.Consumer;
import static com.boothhana.collection.graph.GraphModels.*;
import static com.boothhana.collection.graph.GraphService.*;
import static com.boothhana.collection.graph.GraphProjection.*;

/** A product's complete image set is reviewed in durable groups of four. */
@Component @ConditionalOnProperty(name="app.collection.graph.enabled",havingValue="true")
public class GraphImages {
 private final JdbcTemplate db; private final JsonMapper json;
 public GraphImages(JdbcTemplate db,JsonMapper json){this.db=db;this.json=json;}

 public boolean plan(Map<String,Object> job,Map<String,Object> context,Consumer<Seed> enqueue){
  if(!"CHARACTERS".equals(job.get("kind")))return false;
  var input=map(context.get("input"));var product=map(context.get("product"));
  int total=maps(map(product.get("data")).get("images")).size();
  if(input.containsKey("analysisParent")){
   var parent=db.queryForList("select state from collection_job where id=?",UUID.fromString(text(input.get("analysisParent"))));
   if(parent.isEmpty()||Set.of("REJECTED","COMPLETE","STALE").contains(parent.getFirst().get("state"))){db.update("update collection_job set state='STALE',lease_token=null,lease_until=null,last_error='종료된 상위 이미지 작업' where id=?",job.get("id"));return true;}
   if(number(input.get("productRevision"))!=number(product.get("revision"))){
    db.update("update collection_job set state='STALE',lease_token=null,lease_until=null,last_error='이미지 분석 중 상품 변경' where id=?",job.get("id"));
    enqueue.accept(new Seed("CHARACTERS",text(job.get("target_id")),Map.of(),(Boolean)job.get("baseline"),"revision:"+product.get("revision")));return true;
   }
   return false;
  }
  if(total<=4)return false;
  UUID parent=(UUID)job.get("id");long revision=number(product.get("revision"));
  for(int offset=0;offset<total;offset+=4){
   if(!db.queryForList("select id from collection_job where input_json->>'analysisParent'=? and input_json->>'productRevision'=? and input_json->>'imageOffset'=?",parent.toString(),Long.toString(revision),Integer.toString(offset)).isEmpty())continue;
   enqueue.accept(new Seed("CHARACTERS",text(job.get("target_id")),Map.of("analysisParent",parent.toString(),"productRevision",revision,"imageOffset",offset,"imageTotal",total),(Boolean)job.get("baseline"),parent+":"+revision));
  }
  db.update("update collection_job set state='WAITING',lease_token=null,lease_until=null,available_at=now()+interval '6 hours',last_error='이미지 묶음 검토 대기' where id=?",parent);
  return true;
 }

 public Map<String,Object> accept(Map<String,Object> input,Map<String,Object> context,Map<String,Object> result,UUID verdict){
  if(!input.containsKey("analysisParent"))return result;
  UUID parent=UUID.fromString(text(input.get("analysisParent")));var product=map(context.get("product"));long revision=number(product.get("revision"));
  int offset=(int)number(input.get("imageOffset")),total=maps(map(product.get("data")).get("images")).size();
  require(revision==number(input.get("productRevision"))&&total==number(input.get("imageTotal"))&&offset>=0&&offset<total&&offset%4==0,"이미지 분할 대상이 변경됐습니다.");
  var rows=db.queryForList("select * from collection_job where id=?",parent);
  require(!rows.isEmpty()&&"CHARACTERS".equals(rows.getFirst().get("kind"))&&text(rows.getFirst().get("target_id")).equals(text(product.get("id")))&&Set.of("PENDING","WAITING","RUNNING").contains(rows.getFirst().get("state")),"이미지 상위 작업이 유효하지 않습니다.");
  boolean complete=((List<?>)result.getOrDefault("unresolved",List.of())).isEmpty()&&maps(result.get("assignments")).stream().allMatch(a->"CONFIRMED".equals(a.get("status")));
  db.update("insert into collection_image_part(parent_id,product_revision,image_offset,result_json,verdict_id,complete) values(?,?,?,cast(? as jsonb),?,?) on conflict(parent_id,product_revision,image_offset) do update set result_json=excluded.result_json,verdict_id=excluded.verdict_id,complete=excluded.complete",parent,revision,offset,json.writeValueAsString(result),verdict,complete);
  var parts=db.queryForList("select image_offset,result_json,complete from collection_image_part where parent_id=? and product_revision=? order by image_offset",parent,revision);
  if(parts.size()!=(total+3)/4||parts.stream().anyMatch(p->!Boolean.TRUE.equals(p.get("complete"))))return Map.of("pendingParts",true,"needsEnrichment",!complete);
  var assignments=new LinkedHashMap<String,Map<String,Object>>();var sources=new ArrayList<Map<String,Object>>();
  for(int i=0;i<parts.size();i++){
   require(number(parts.get(i).get("image_offset"))==i*4,"이미지 묶음 누락");
   var part=map(json.readValue(parts.get(i).get("result_json").toString(),Map.class));
   for(var a:maps(part.get("assignments")))assignments.putIfAbsent(json.writeValueAsString(sorted(List.of(map(a.get("work")),map(a.get("character"))))),a);
   sources.addAll(maps(part.get("sources")));
  }
  return Map.of("assignments",new ArrayList<>(assignments.values()),"unresolved",List.of(),"sources",sources);
 }

 public void finish(Map<String,Object> input){if(input.containsKey("analysisParent"))db.update("update collection_job set state='COMPLETE',lease_token=null,lease_until=null,last_error='전체 이미지 묶음 검토 및 연결 완료',updated_at=now() where id=?",UUID.fromString(text(input.get("analysisParent"))));}

 public void validateEvidence(Map<String,Object> context,Map<String,Object> result,Audit review,Map<String,Object> extractionAudit){
  var candidates=maps(map(map(context.get("product")).get("data")).get("images"));var input=map(context.get("input"));
  int offset=input.containsKey("imageOffset")?(int)number(input.get("imageOffset")):0;
  require(candidates.size()<=4||input.containsKey("analysisParent"),"전체 이미지 분할 작업이 필요합니다.");
  var coverage=maps(result.get("imageCoverage"));int end=Math.min(offset+4,candidates.size());
  if(!candidates.isEmpty()){
   require(offset>=0&&offset<candidates.size()&&coverage.size()==end-offset,"이미지 확인 범위 누락");
   for(int i=offset;i<end;i++){final int index=i;var found=coverage.stream().filter(c->number(c.get("index"))==index).toList();require(found.size()==1,"중복 또는 누락된 이미지");String hash=text(found.getFirst().get("sha256"));
    if("UNAVAILABLE".equals(found.getFirst().get("status"))){require(hash.isBlank()&&!((List<?>)result.getOrDefault("unresolved",List.of())).isEmpty(),"미확보 이미지는 보완 대상으로 남겨야 합니다.");continue;}
    require("AVAILABLE".equals(found.getFirst().get("status"))&&review.imageHashes().contains(hash)&&((List<?>)extractionAudit.getOrDefault("imageHashes",List.of())).contains(hash),"추출·검토에서 같은 이미지 묶음을 모두 확인해야 합니다.");
   }
  }
  for(var a:maps(result.get("assignments")))if("IMAGE".equals(a.get("basis"))){
   require(a.get("imageHash") instanceof String&&coverage.stream().anyMatch(c->"AVAILABLE".equals(c.get("status"))&&Objects.equals(c.get("sha256"),a.get("imageHash"))),"상품 묶음에 없는 이미지 근거입니다.");
   var box=map(a.get("imageRegion"));require(box.size()==4,"상품 이미지 영역이 필요합니다.");
   for(String key:List.of("x","y","width","height"))require(box.get(key) instanceof Number&&Double.isFinite(((Number)box.get(key)).doubleValue()),"이미지 영역 형식 오류");
   double x=((Number)box.get("x")).doubleValue(),y=((Number)box.get("y")).doubleValue(),w=((Number)box.get("width")).doubleValue(),h=((Number)box.get("height")).doubleValue();require(x>=0&&y>=0&&w>0&&h>0&&x+w<=1&&y+h<=1,"이미지 영역 범위 오류");
  }
 }
}
