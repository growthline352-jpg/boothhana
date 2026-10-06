package com.boothhana.itinerary;
import com.boothhana.api.ApiException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import java.nio.charset.StandardCharsets;

final class PurchasePlanRules {
 private PurchasePlanRules(){}
 static ApiException invalid(){return ApiException.badRequest("구매할 물건·수량·예산을 확인해 주세요.");}
 static String text(JsonNode p,String key,int max,boolean required){var v=p.get(key);if(v==null||!v.isString())throw invalid();String s=v.asString();if(s.length()>max||s.indexOf('\0')>=0||required&&s.isBlank())throw invalid();return s;}
 static Object money(JsonNode p,String key){var v=p.get(key);if(v==null||v.isNull())return null;if(!v.isIntegralNumber()||!v.canConvertToLong()||v.asLong()<0||v.asLong()>100000000)throw invalid();return v.asLong();}
 static boolean flag(JsonNode p,String key){var v=p.get(key);if(v==null||!v.isBoolean())throw invalid();return v.asBoolean();}
 static JsonNode checked(JsonNode p,long eventId,JsonMapper json){
  if(eventId<1||p==null||!p.isObject()||!p.path("eventId").isIntegralNumber()||!p.path("eventId").canConvertToLong()||p.path("eventId").asLong()!=eventId)throw invalid();
  if(json.writeValueAsString(p).getBytes(StandardCharsets.UTF_8).length>PrivatePlanStore.MAX_PLAN_BYTES)throw ApiException.badRequest("구매 메모가 너무 길어요. 물건이나 메모를 줄인 뒤 저장해 주세요.");
  var out=new LinkedHashMap<String,Object>();out.put("eventId",eventId);out.put("eventName",text(p,"eventName",255,true));out.put("budget",money(p,"budget"));var values=p.get("items");if(values==null||!values.isArray()||values.size()>100)throw invalid();var items=new ArrayList<Map<String,Object>>();var seen=new HashSet<String>();
  for(var row:values){if(!row.isObject())throw invalid();var item=new LinkedHashMap<String,Object>();String id=text(row,"id",36,true);try{UUID.fromString(id);}catch(IllegalArgumentException e){throw invalid();}if(!seen.add(id))throw invalid();item.put("id",id);
   for(String k:List.of("boothKey","boothName","name","note"))item.put(k,text(row,k,k.equals("note")?1000:k.equals("boothKey")?128:200,!k.equals("note")));
   var memory=row.get("memoryId");if(memory==null||memory.isNull())item.put("memoryId",null);else{String s=text(row,"memoryId",36,true);try{UUID.fromString(s);}catch(IllegalArgumentException e){throw invalid();}item.put("memoryId",s);}
   var quantity=row.get("quantity");if(quantity==null||!quantity.isIntegralNumber()||!quantity.canConvertToInt()||quantity.asInt()<1||quantity.asInt()>999)throw invalid();item.put("quantity",quantity.asInt());item.put("unitBudget",money(row,"unitBudget"));
   boolean prepaid=flag(row,"prepaid"),received=flag(row,"received");if(received&&!prepaid)throw invalid();item.put("purchased",flag(row,"purchased"));item.put("prepaid",prepaid);item.put("received",received);items.add(item);
  }out.put("items",items);
  var booths=new ArrayList<Map<String,Object>>();var keys=new HashSet<String>();var boothRows=p.get("booths");
  if(boothRows!=null){if(!boothRows.isArray()||boothRows.size()>500)throw invalid();for(var row:boothRows){if(!row.isObject())throw invalid();String key=text(row,"key",128,true);if(!keys.add(key))throw invalid();var booth=new LinkedHashMap<String,Object>();booth.put("key",key);booth.put("name",text(row,"name",200,true));var ref=row.get("memoryId");if(ref==null||ref.isNull())booth.put("memoryId",null);else{String id=text(row,"memoryId",36,true);try{UUID.fromString(id);}catch(IllegalArgumentException e){throw invalid();}booth.put("memoryId",id);}booths.add(booth);}
   for(var item:items)if(!keys.contains(item.get("boothKey")))throw invalid();
  }else for(var item:items){String key=item.get("boothKey").toString();if(keys.add(key)){var booth=new LinkedHashMap<String,Object>();booth.put("key",key);booth.put("name",item.get("boothName"));booth.put("memoryId",null);booths.add(booth);}}
  out.put("booths",booths);var excluded=new ArrayList<String>();var excludedRows=p.get("excludedMemoryIds");var excludedSeen=new HashSet<String>();
  if(excludedRows!=null){if(!excludedRows.isArray()||excludedRows.size()>500)throw invalid();for(var row:excludedRows){if(!row.isString())throw invalid();String id=row.asString();try{UUID.fromString(id);}catch(IllegalArgumentException e){throw invalid();}if(!excludedSeen.add(id))throw invalid();excluded.add(id);}}
  out.put("excludedMemoryIds",excluded);return json.valueToTree(out);
 }
}
