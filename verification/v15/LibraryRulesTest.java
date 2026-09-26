package com.boothhana.library;
import java.util.*;import java.time.*;
import static com.boothhana.library.LibraryModels.*;
public class LibraryRulesTest {
 static int n;static void ok(boolean value){n++;if(!value)throw new AssertionError("condition "+n);}
 static void bad(Runnable fn){try{fn.run();throw new AssertionError("should reject");}catch(IllegalArgumentException e){n++;}}
 public static void main(String[] args){
  Target t=new Target("PRODUCT",1,3,2L);ok(LibraryRules.target(t).equals(t));bad(()->LibraryRules.target(new Target("EVENT",1,2,null)));bad(()->LibraryRules.target(new Target("PRODUCT",1,3,null)));bad(()->LibraryRules.target(new Target("PARTICIPANT",1,2,4L)));bad(()->LibraryRules.target(new Target("INTERNAL_NOTE",1,2,2L)));
  ok(LibraryRules.day("2026-09-18").equals("2026-09-18"));bad(()->LibraryRules.day("2026-02-30"));bad(()->LibraryRules.visitDay("2026-09-19",LocalDate.of(2026,9,18)));ok(LibraryRules.visitDay("2026-09-18",LocalDate.of(2026,9,18)).equals("2026-09-18"));
  ok(LibraryRules.url("javascript:alert(1)")==null);ok(LibraryRules.url("https://user:pass@example.com/a")==null);ok(LibraryRules.url("https://example.com/a")!=null);bad(()->LibraryRules.note("x".repeat(1001)));
  var memory=new Memory("달토끼 키링","[TEST] 행사","별빛 서클","초록 식물 키링",List.of("핸드메이드"));
  var current=new Current(memory,"SCHEDULED","","서울",List.of(Map.of("startDate","2026-09-17","endDate","2026-09-18"),Map.of("startDate","2026-09-20","endDate","2026-09-20")),List.of(),"EVENT_LISTED",null,"UNKNOWN",List.of(),"2026-09-18T00:00:00Z");
  var e=new Entry(UUID.randomUUID(),t,0,"2026-09-18T00:00:00Z","2026-09-18T00:00:00Z","2026-09-18","1관","소음 비교, 선물 후보",List.of("2026-09-18"),true,memory,current,null,false,null);
  ok(LibraryRules.matches("달토끼 선물",e));ok(LibraryRules.matches("식물",e));ok(!LibraryRules.matches("없는이름",e));ok(LibraryRules.operatingDay(current,"2026-09-18"));ok(!LibraryRules.operatingDay(current,"2026-09-19"));ok(LibraryRules.normalize("Ａ　Ｂ").equals("a b"));
  var hidden=new Entry(e.id(),t,0,e.savedAt(),e.updatedAt(),e.day(),e.hall(),e.note(),e.visitedDays(),false,null,null,null,false,null);
  ok(!LibraryRules.matches("달토끼",hidden));ok(LibraryRules.matches("선물",hidden));
  var mapper=new tools.jackson.databind.json.JsonMapper();var targets=new LibraryTargets(null,mapper);Map<String,Object> row=new HashMap<>();
  row.put("live_event",Map.of("name","[TEST] 행사","description","안내","subjects",List.of(),"occurrences",current.occurrences()));row.put("live_participant",Map.of("registrationName","[TEST] 서클","members",List.of(Map.of("name","공동작가","aliases",List.of("별칭"))),"locations",List.of(),"officialLinks",List.of("https://example.com/official","javascript:alert(1)")));
  row.put("live_product",Map.of("name","상품","summary","실제 설명","categories",List.of("키링"),"productUrl","https://example.com/item"));row.put("live_sales",Map.of("summary","판매 공지"));
  var resolved=targets.project(t,row);ok(resolved.available());ok(resolved.current().memory().tags().contains("별칭"));ok(resolved.current().links().stream().noneMatch(l->l.url().startsWith("javascript")));ok(resolved.current().memory().participantName().equals("[TEST] 서클"));
  row.remove("live_product");ok(!targets.project(t,row).available());ok(targets.project(new Target("PARTICIPANT",1,2,2L),row).available());row.remove("live_participant");ok(!targets.project(new Target("PARTICIPANT",1,2,2L),row).available());ok(targets.project(new Target("EVENT",1,1,null),row).available());row.remove("live_event");ok(!targets.project(new Target("EVENT",1,1,null),row).available());
  ok(!LibraryService.participantOn(List.of(Map.of("startDate","2026-09-18","endDate","2026-09-18")),"2026-09-20"));ok(LibraryService.participantOn(List.of(),"2026-09-20"));
  System.out.println("PASS "+n+" library rules and real public-projection conditions; JDBC/Jackson/framework are explicit stubs.");
 }
}
