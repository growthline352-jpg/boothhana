package com.boothhana.itinerary;
import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class SharedPlanRulesTests {
 static final JsonMapper JSON=JsonMapper.builder().build();
 static final String PLAN="""
 {"version":1,"id":"a","title":"긴토키 카페 방문","purpose":"EVENT","day":"2026-10-09","start":"12:00","end":"18:00","area":"HONGDAE","style":"FAN","updatedAt":"2026-10-05T00:00:00Z","accountEmail":"secret@test","stops":[{"id":"b","kind":"EVENT","name":"카페","address":"서울 마포구","point":{"lat":37.55,"lng":126.92},"eventId":239,"start":"13:00","duration":60,"locked":true,"note":"개인 예약번호","url":"/discover/239?day=2026-10-09","source":"CATALOG"}]}
 """;
 @Test @SuppressWarnings("unchecked") void defaultSnapshotStripsNotesAndUnknownAccountFields(){var p=SharedPlanRules.snapshot(JSON.readTree(PLAN),false,JSON);assertFalse(p.containsKey("accountEmail"));assertEquals("",((List<Map<String,Object>>)p.get("stops")).getFirst().get("note"));assertTrue(SharedPlanRules.snapshot(JSON.readTree(PLAN),true,JSON).toString().contains("개인 예약번호"));}
 @Test void rejectsInvalidDatesCoordinatesLinksTypesAndOversizedFields(){
  for(String bad:List.of(PLAN.replace("2026-10-09","2026-02-30"),PLAN.replace("37.55","0"),PLAN.replace("/discover/239?day=2026-10-09","javascript:alert(1)"),PLAN.replace("/discover/239?day=2026-10-09","https://name:pass@example.test"),PLAN.replace("\"duration\":60","\"duration\":60.5"),PLAN.replace("긴토키 카페 방문","x".repeat(121)),PLAN.replace("\"kind\":\"EVENT\"","\"kind\":\"UNKNOWN\"")))assertThrows(ApiException.class,()->SharedPlanRules.snapshot(JSON.readTree(bad),false,JSON));
 }
 @Test void publicTokenCannotBeUsedAsAManagementSecret(){assertThrows(ApiException.class,()->ItineraryShares.keyHash("v".repeat(22)));String secret="s".repeat(43);assertEquals(64,ItineraryShares.keyHash(secret).length());assertFalse(ItineraryShares.keyHash(secret).contains(secret));}
 @Test void rejectsEmptyAndDuplicateStopsAndDoesNotHideBadNotes(){for(String bad:List.of(PLAN.replace("\"stops\":[", "\"stops\":[null,"),PLAN.replace("개인 예약번호","a".repeat(2001))))assertThrows(ApiException.class,()->SharedPlanRules.snapshot(JSON.readTree(bad),false,JSON));}
}
