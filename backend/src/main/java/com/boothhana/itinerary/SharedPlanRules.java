package com.boothhana.itinerary;

import com.boothhana.api.ApiException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;

/** Whitelist the shared snapshot; unknown/private account fields never cross this boundary. */
final class SharedPlanRules {
 private SharedPlanRules() {}
 static ApiException invalid(){return ApiException.badRequest("공유할 일정 내용을 확인해 주세요.");}
 static Map<String,Object> orderedPair(String first,Object a,String second,Object b){var result=new LinkedHashMap<String,Object>();result.put(first,a);result.put(second,b);return result;}
 static String text(JsonNode node,String key,int max,boolean required){
  var value=node.get(key);if(value==null||!value.isString())throw invalid();
  String s=value.asString();if(s.length()>max||(required&&s.isBlank())||s.indexOf('\0')>=0)throw invalid();return s;
 }
 static String day(JsonNode node,String key){String s=text(node,key,10,true);try{if(!s.matches("\\d{4}-\\d{2}-\\d{2}")||!LocalDate.parse(s).toString().equals(s))throw invalid();}catch(DateTimeException e){throw invalid();}return s;}
 static String time(JsonNode node,String key){String s=text(node,key,5,true);if(!s.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"))throw invalid();return s;}
 static String time(JsonNode node,String key,boolean flexible){if(flexible&&node.path(key).isString()&&node.path(key).asString().isEmpty())return "";return time(node,key);}
 static Map<String,Object> outing(JsonNode n,boolean privatePlan){
  if(n==null||!n.isObject())throw invalid();var r=new LinkedHashMap<String,Object>();
  r.put("placeId",text(n,"placeId",100,true));r.put("kind",choice(n,"kind",Set.of("event","popup","exhibition","festival","subculture","cafe","food","walk","custom")));
  r.put("area",text(n,"area",100,false));String description=text(n,"description",3000,false),booking=text(n,"booking",500,false);r.put("description",privatePlan?description:"");r.put("booking",privatePlan?booking:"");
  var tags=n.get("tags");if(tags==null||!tags.isArray()||tags.size()>30)throw invalid();var labels=new ArrayList<String>();for(var tag:tags){if(!tag.isString()||tag.asString().length()>100||tag.asString().indexOf('\0')>=0)throw invalid();labels.add(tag.asString());}r.put("tags",privatePlan?labels:List.of());
  var cost=n.get("cost");if(cost==null||!cost.isNull()&&(!cost.isNumber()||!Double.isFinite(cost.asDouble())||cost.asDouble()<0||cost.asDouble()>10000000))throw invalid();r.put("cost",privatePlan&&!cost.isNull()?cost.asDouble():null);
  var indoor=n.get("indoor");if(indoor==null||!indoor.isNull()&&!indoor.isBoolean())throw invalid();r.put("indoor",indoor.isNull()?null:indoor.asBoolean());
  r.put("source",choice(n,"source",Set.of("sample","catalog","custom")));var travel=n.get("travel");if(travel==null||!travel.isNull()&&(!travel.isIntegralNumber()||!travel.canConvertToInt()||travel.asInt()<0||travel.asInt()>360))throw invalid();r.put("travel",travel.isNull()?null:travel.asInt());
  if(!n.path("done").isBoolean())throw invalid();r.put("fixed",time(n,"fixed",true));r.put("done",privatePlan&&n.path("done").asBoolean());
  if(n.has("sourceUrl"))r.put("sourceUrl",url(n,"sourceUrl"));if(n.has("admission"))r.put("admission",text(n,"admission",500,false));if(n.has("state"))r.put("state",text(n,"state",32,false));return r;
 }
 static String choice(JsonNode node,String key,Set<String> choices){String s=text(node,key,24,true);if(!choices.contains(s))throw invalid();return s;}
 static String url(JsonNode node,String key){String s=text(node,key,2048,false);if(s.isEmpty())return s;
  if(s.matches("/discover/[1-9][0-9]*(?:\\?day=\\d{4}-\\d{2}-\\d{2})?"))return s;
  try{URI u=URI.create(s);if(!"https".equals(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||s.contains("\\"))throw invalid();}catch(IllegalArgumentException e){throw invalid();}return s;
 }
 static List<String> strings(JsonNode node,String key){var values=node.get(key);if(values==null||!values.isArray()||values.size()>10)throw invalid();var result=new ArrayList<String>();for(var v:values){if(!v.isString()||v.asString().isBlank()||v.asString().length()>100||v.asString().indexOf('\0')>=0)throw invalid();result.add(v.asString());}return result;}
 static Map<String,Object> snapshot(JsonNode p,boolean includeNotes,JsonMapper json){return snapshot(p,includeNotes,json,false);}
 static Map<String,Object> snapshot(JsonNode p,boolean includeNotes,JsonMapper json,boolean privatePlan){
  if(p==null||!p.isObject()||json.writeValueAsString(p).getBytes(StandardCharsets.UTF_8).length>60000||!p.path("version").isIntegralNumber()||!p.path("version").canConvertToInt()||p.path("version").asInt()!=1)throw invalid();
  boolean flexible=p.has("planner");if(flexible&&!"OUTINGS".equals(text(p,"planner",16,true)))throw invalid();
  var result=new LinkedHashMap<String,Object>();if(flexible)result.put("planner","OUTINGS");result.put("version",1);result.put("id",text(p,"id",128,true));result.put("title",text(p,"title",120,false));
  result.put("purpose",choice(p,"purpose",Set.of("EVENT","DATE")));result.put("day",day(p,"day"));result.put("start",time(p,"start",flexible));result.put("end",time(p,"end",flexible));
  result.put("area",text(p,"area",32,false));result.put("style",text(p,"style",32,true));result.put("updatedAt",Instant.now().toString());
  if(p.has("interests")){var interests=p.get("interests");if(!interests.isObject())throw invalid();result.put("interests",orderedPair("topics",strings(interests,"topics"),"subjects",strings(interests,"subjects")));}
  var stops=p.get("stops");if(stops==null||!stops.isArray()||(stops.isEmpty()&&!(flexible&&privatePlan))||stops.size()>(flexible?30:20))throw invalid();var seen=new HashSet<String>();var rows=new ArrayList<Map<String,Object>>();
  for(var s:stops){if(!s.isObject())throw invalid();var row=new LinkedHashMap<String,Object>();String id=text(s,"id",128,true);if(!seen.add(id))throw invalid();row.put("id",id);
   row.put("kind",choice(s,"kind",Set.of("EVENT","FOOD","CAFE","PLACE")));row.put("name",text(s,"name",200,true));row.put("address",text(s,"address",flexible?500:400,false));row.put("start",time(s,"start",flexible));
   var duration=s.get("duration");if(duration==null||!duration.isIntegralNumber()||!duration.canConvertToInt()||duration.asLong()<(flexible?5:15)||duration.asLong()>720)throw invalid();row.put("duration",duration.asInt());
   if(!s.path("locked").isBoolean())throw invalid();row.put("locked",s.get("locked").asBoolean());
   String note=text(s,"note",2000,false);row.put("note",includeNotes?note:"");row.put("url",url(s,"url"));row.put("source",choice(s,"source",Set.of("CATALOG","OSM","KAKAO","MANUAL")));
   var point=s.get("point");if(point==null)throw invalid();if(point.isNull())row.put("point",null);else{if(!point.isObject()||!point.path("lat").isNumber()||!point.path("lng").isNumber())throw invalid();double lat=point.get("lat").asDouble(),lng=point.get("lng").asDouble();if(!Double.isFinite(lat)||!Double.isFinite(lng)||lat<33||lat>39||lng<124||lng>132)throw invalid();row.put("point",orderedPair("lat",lat,"lng",lng));}
   if(s.has("eventId")){var eid=s.get("eventId");if(!eid.isIntegralNumber()||!eid.canConvertToLong()||eid.asLong()<1||eid.asLong()>9007199254740991L)throw invalid();row.put("eventId",eid.asLong());}
   if(s.has("image")){String image=text(s,"image",2048,false);row.put("image",image.matches("/assets/brand/outings/sample-(?:popup|exhibition|festival)\\.jpg")?image:url(s,"image"));}
   if(s.has("outing")){if(!flexible)throw invalid();row.put("outing",outing(s.get("outing"),privatePlan));}
   for(String field:List.of("venueName","openingHours"))if(s.has(field))row.put(field,text(s,field,400,false));
   if(s.has("occurrences")){var occurrences=s.get("occurrences");if(!occurrences.isArray()||occurrences.size()>100)throw invalid();var dates=new ArrayList<Map<String,Object>>();
    for(var o:occurrences){if(!o.isObject())throw invalid();String from=day(o,"startDate"),to=day(o,"endDate");if(from.compareTo(to)>0)throw invalid();var date=new LinkedHashMap<String,Object>();date.put("startDate",from);date.put("endDate",to);
     for(String key:List.of("startTime","endTime")){var value=o.get(key);if(value!=null&&!value.isNull()){String t=text(o,key,8,true);if(!t.matches("(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?"))throw invalid();date.put(key,t);}else date.put(key,null);}dates.add(date);
    }row.put("occurrences",dates);
   }rows.add(row);
  }result.put("stops",rows);return result;
 }
}
