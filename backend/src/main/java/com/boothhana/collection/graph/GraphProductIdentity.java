package com.boothhana.collection.graph;

import com.boothhana.collection.CatalogIdentity;
import com.boothhana.collection.CollectionRules;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.graph.GraphService.require;

/** Creator-wide matching retains UUIDs and source aliases across catalog refreshes. */
final class GraphProductIdentity {
 private GraphProductIdentity() {}
 static ProductData normalize(ProductData p) {
  String entry=p.sourceEntryId();
  if(entry!=null&&entry.isBlank())entry=null;
  return new ProductData(entry,p.name(),p.summary(),p.memberName(),p.categories(),p.subjects(),p.evidenceScope(),p.price(),p.saleState(),p.productUrl(),p.sources(),p.images(),p.warnings(),p.identity());
 }
 static List<String> keys(ProductData p) {
  var keys=new ArrayList<>(CatalogIdentity.productKeys(p));
  // The legacy matcher is scoped to a single booth. A creator has many forms;
  // a name without any source must not merge equal-named options across forms.
  if(p.identity()==null&&p.sourceEntryId()==null&&p.productUrl()==null)
   keys.remove(CollectionRules.sha(CollectionRules.normalize(p.name())+"\u001f"));
  require(!keys.isEmpty(),"상품의 출처별 식별 근거가 필요합니다.");
  return keys;
 }
 static Identity known(ProductData p) {return CatalogIdentity.known(p.identity(),p.sourceEntryId(),p.sources());}
 @SuppressWarnings("unchecked") static Set<String> aliases(Map<String,Object> row,JsonMapper json) {
  var aliases=new TreeSet<String>();
  if(row.get("identity_aliases")!=null)aliases.addAll(json.readValue(row.get("identity_aliases").toString(),List.class));
  aliases.addAll(keys(normalize(json.readValue(row.get("data_json").toString(),ProductData.class))));
  return aliases;
 }
 static Map<String,Object> match(ProductData product,List<Map<String,Object>> rows,JsonMapper json) {
  var matches=new ArrayList<Map<String,Object>>();var keys=keys(product);var identity=known(product);
  for(var row:rows) {
   var previous=normalize(json.readValue(row.get("data_json").toString(),ProductData.class));
   if(!CatalogIdentity.conflicts(identity,known(previous))&&CatalogIdentity.intersects(keys,aliases(row,json)))matches.add(row);
  }
  require(matches.size()<=1,"동일 상품 근거에 기존 ID가 여러 개 있습니다. 자동 병합하지 않습니다.");
  return matches.isEmpty()?null:matches.getFirst();
 }
}
