import static com.boothhana.collection.CollectionModels.*;
import com.boothhana.collection.CollectionRules;
import java.util.List;
public class OperationStatusTest {
 static int count=0;static void ok(boolean result,String name){count++;if(!result)throw new AssertionError(name);System.out.println("PASS "+name);}
 static void bad(OperationStatus status,String name){boolean caught=false;try{CollectionRules.operationStatus(status);}catch(RuntimeException e){caught=true;}ok(caught,name);}
 static EventData event(OperationStatus status){return new EventData("[TEST] 행사","ONLY_EVENT","테스트 주최","2026","SEOUL","테스트 장소",null,"가상 테스트",null,List.of(),List.of(new Occurrence("2026-10-10","2026-10-10",null,null)),List.of(new Source("https://example.com/e","OFFICIAL","ORIGINAL","가상 문구")),List.of(),List.of(),"MULTI_BOOTH",List.of(),status);}
 public static void main(String[] args){
  OperationStatus unknown=new OperationStatus("UNKNOWN",null,null,null);CollectionRules.operationStatus(unknown);ok(true,"unknown needs no fabricated source");
  EventData legacy=new EventData("[TEST] legacy","DOLL",null,null,"SEOUL",null,null,"test",null,List.of(),List.of(new Occurrence("2026-10-10","2026-10-10",null,null)),List.of(new Source("https://example.com/e","OTHER","SEARCH_SNIPPET","test")),List.of(),List.of());
  ok(legacy.operationStatus().state().equals("UNKNOWN"),"legacy constructor defaults status");
  for(String state:List.of("SCHEDULED","CANCELED","POSTPONED","RESCHEDULED")){
   var op=new OperationStatus(state,"공식 가상 안내","https://example.com/notice","2026-09-17");CollectionRules.operationStatus(op);ok(true,"accept "+state);
   ok(CollectionRules.identity(event(op)).equals(CollectionRules.identity(event(unknown))),"status preserves identity "+state);
   ok(CollectionRules.event(event(op),new Scope("SEOUL","Asia/Seoul","2026-10-01","2026-10-31")).accepted(),"full event validates "+state);
  }
  bad(null,"null method input rejected");bad(new OperationStatus("OPEN",null,null,null),"unsupported state");
  bad(new OperationStatus("CANCELED",null,"https://example.com","2026-09-17"),"requires note");
  bad(new OperationStatus("CANCELED","  ","https://example.com","2026-09-17"),"blank note rejected");
  bad(new OperationStatus("CANCELED","note",null,"2026-09-17"),"requires source");
  bad(new OperationStatus("CANCELED","note","https://example.com",null),"requires check date");
  bad(new OperationStatus("POSTPONED","note","http://localhost/","2026-09-17"),"internal URL refused");
  bad(new OperationStatus("POSTPONED","note","javascript:alert(1)","2026-09-17"),"script URL refused");
  bad(new OperationStatus("SCHEDULED","note","https://example.com","2026-02-30"),"calendar date validation");
  bad(new OperationStatus("CANCELED","x".repeat(501),"https://example.com","2026-09-17"),"bounded note");
  ok(event(null).operationStatus().state().equals("UNKNOWN"),"legacy JSON constructor null fallback");
  System.out.println("PASS "+count+" v9 operation-state Java checks. No Spring/DB network.");
 }
}
