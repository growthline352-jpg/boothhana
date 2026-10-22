package com.boothhana.itinerary;
import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class OutingPlanRulesTests {
 static final JsonMapper JSON=JsonMapper.builder().build();
 static final String PLAN="""
 {"version":1,"planner":"OUTINGS","id":"a","title":"함께 보낼 하루","purpose":"DATE","day":"2026-10-24","start":"","end":"","area":"","style":"CONTENT","updatedAt":"2026-10-23T00:00:00Z","stops":[{"id":"stop","kind":"CAFE","name":"카페","address":"서울","point":null,"start":"","duration":5,"locked":false,"note":"private note","url":"","image":"/assets/brand/outings/sample-popup.jpg","source":"MANUAL","outing":{"placeId":"place","kind":"cafe","area":"성수","description":"private description","tags":["개인 태그"],"cost":14000,"indoor":true,"booking":"private booking","source":"custom","travel":25,"fixed":"","done":true,"accountEmail":"secret@test"}}]}
 """;
 @Test @SuppressWarnings("unchecked") void privateSavePreservesUndecidedTimesAndOutingFields(){
  var result=SharedPlanRules.snapshot(JSON.readTree(PLAN),true,JSON,true);var stop=((List<Map<String,Object>>)result.get("stops")).getFirst();var details=(Map<String,Object>)stop.get("outing");
  assertEquals("",result.get("start"));assertEquals("",stop.get("start"));assertEquals(25,details.get("travel"));assertEquals(true,details.get("done"));assertEquals(14000d,details.get("cost"));assertFalse(details.containsKey("accountEmail"));assertEquals("/assets/brand/outings/sample-popup.jpg",stop.get("image"));
 }
 @Test void sharedSnapshotsNeverIncludePrivateOutingMetadataEvenWhenNotesAreIncluded(){
  for(boolean notes:List.of(false,true)){var body=JSON.writeValueAsString(SharedPlanRules.snapshot(JSON.readTree(PLAN),notes,JSON));assertFalse(body.contains("private description"));assertFalse(body.contains("private booking"));assertFalse(body.contains("secret@test"));assertFalse(body.contains("14000"));assertTrue(body.contains("\"done\":false"));assertEquals(notes,body.contains("private note"));}
 }
 @Test void rejectsMalformedExtensionsAndDoesNotRelaxLegacyTimeRules(){
  for(String invalid:List.of(PLAN.replace("\"travel\":25","\"travel\":-1"),PLAN.replace("\"cost\":14000","\"cost\":-2"),PLAN.replace("\"done\":true","\"done\":\"yes\""),PLAN.replace("\"kind\":\"cafe\"","\"kind\":\"unknown\""),PLAN.replace("\"planner\":\"OUTINGS\",","")))assertThrows(ApiException.class,()->SharedPlanRules.snapshot(JSON.readTree(invalid),true,JSON,true));
 }
 @Test @SuppressWarnings("unchecked") void supportsThirtyStopsWithoutLosingTheLastPlace(){
  Map<String,Object> plan=JSON.readValue(PLAN,Map.class);var source=((List<Map<String,Object>>)plan.get("stops")).getFirst();var stops=new ArrayList<Map<String,Object>>();for(int i=0;i<30;i++){var stop=new LinkedHashMap<>(source);stop.put("id","stop-"+i);stops.add(stop);}plan.put("stops",stops);
  assertEquals(30,((List<?>)SharedPlanRules.snapshot(JSON.valueToTree(plan),true,JSON,true).get("stops")).size());stops.add(new LinkedHashMap<>(source));assertThrows(ApiException.class,()->SharedPlanRules.snapshot(JSON.valueToTree(plan),true,JSON,true));
 }
}
