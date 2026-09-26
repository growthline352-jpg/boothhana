import static com.boothhana.collection.CollectionModels.*;
import com.boothhana.collection.CollectionRules;
import java.util.*;

public class CollectionRulesSmokeTest {
    static int checks=0;
    static Scope scope=new Scope("SEOUL","Asia/Seoul","2026-10-01","2026-10-31");
    static EventData event() {
        return new EventData("[TEST] 샘플 온리전","ONLY_EVENT","테스트 주최","2026 1회","SEOUL","테스트 카페","서울특별시 마포구 테스트 주소",
            "[TEST] 검증용 행사. 실재하지 않습니다.",null,List.of("테스트 작품"),
            List.of(new Occurrence("2026-10-10","2026-10-11",null,null),new Occurrence("2026-10-13","2026-10-13","12:00","19:00")),
            List.of(new Source("https://example.com/sample-event","OTHER","SEARCH_SNIPPET","[TEST] 10/10~11, 10/13 서울에서 개최한다는 가상 문구.")),
            List.of(new Banner("https://example.com/sample-poster.png","https://example.com/sample-event","UNKNOWN",null,null)),List.of("[TEST] 실제 행사가 아닌 오프라인 테스트 자료"));
    }
    @SuppressWarnings("unchecked") static <T> T with(T record,String name,Object value) {
        try {
            var components=record.getClass().getRecordComponents();var types=new Class<?>[components.length];var args=new Object[components.length];
            for(int i=0;i<components.length;i++) { types[i]=components[i].getType(); args[i]=components[i].getName().equals(name)?value:components[i].getAccessor().invoke(record); }
            return (T)record.getClass().getDeclaredConstructor(types).newInstance(args);
        } catch(Exception ex) { throw new RuntimeException(ex); }
    }
    static void ok(boolean condition,String label) { checks++;if(!condition) throw new AssertionError(label); }
    static void bad(EventData e,String label) { ok(!CollectionRules.event(e,scope).accepted(),label); }
    static void throwsError(Runnable action,String label) { boolean thrown=false;try{action.run();}catch(RuntimeException expected){thrown=true;}ok(thrown,label); }
    static Batch batch() {
        return new Batch("1","e7d0b4ef-cacf-4231-b75c-dea4a1b9ba5a","2026-09-16T01:00:00Z","2026-09-16T01:05:00Z","CLI",true,scope,
            new SearchResult("1","COMPLETE","test",List.of("test query"),List.of(event())));
    }
    public static void main(String[] args) {
        ok(CollectionRules.event(event(),scope).accepted(),"valid");CollectionRules.batch(batch());ok(true,"valid batch");
        ok(CollectionRules.identity(event()).equals("9e587dea541c8a866b6c72f0cffdcaa48ecb6c3f6b409bed10815a0a8561fd84"),"Python/Java identity parity");
        bad(with(event(),"region","OTHER"),"outside");bad(with(event(),"region",null),"unknown region");
        bad(with(event(),"venueName","킨텍스"),"kintex");bad(with(event(),"venueName","수원메쎄"),"suwon");bad(with(event(),"address","경기도 고양시"),"outside address");
        bad(with(event(),"name",""),"empty name");bad(with(event(),"name","x".repeat(256)),"long name");bad(with(event(),"subcategory","FESTIVAL"),"wrong type");
        bad(with(event(),"sources",List.of()),"missing sources");bad(with(event(),"occurrences",List.of()),"missing dates");
        bad(with(event(),"sources",List.of(new Source("https://example.com/","OTHER","INACCESSIBLE","test"))),"inaccessible only");
        bad(with(event(),"sources",List.of(new Source("https://example.com/","OTHER","ORIGINAL",""))),"no evidence");
        bad(with(event(),"occurrences",List.of(new Occurrence("2026-02-30","2026-10-01",null,null))),"invalid calendar");
        bad(with(event(),"occurrences",List.of(new Occurrence("2026-10-10","2026-10-01",null,null))),"reversed");
        bad(with(event(),"occurrences",List.of(new Occurrence("2027-10-10","2027-10-11",null,null))),"outside dates");
        bad(with(event(),"occurrences",List.of(new Occurrence("2026-10-10","2026-10-10","19:00","12:00"))),"reversed time");
        bad(with(event(),"occurrences",List.of(new Occurrence("2026-10-10","2026-10-10","25:00",null))),"invalid time");
        bad(with(event(),"occurrences",List.of(new Occurrence("2026-10-10","2026-10-11",null,null),new Occurrence("2026-10-11","2026-10-12",null,null))),"overlapping dates");
        ok(CollectionRules.event(with(event(),"banners",List.of()),scope).accepted(),"no banner still accepted");
        ok(CollectionRules.event(with(event(),"venueName",null),scope).accepted(),"venue unknown review candidate");
        ok(CollectionRules.event(event(),scope).warnings().stream().anyMatch(w->w.contains("원문 직접 확인")),"snippet warning");
        for(String url:List.of("javascript:alert(1)","file:///etc/passwd","http://localhost/x","https://127.0.0.1/","http://169.254.169.254/latest","https://u:p@example.com","https://example.com:9000/","https://[::1]/","https://a.local/","https://2130706433/","https://example.com/\n")) throwsError(()->CollectionRules.url(url),url);
        CollectionRules.url("https://example.com/a?b=1");ok(true,"public link");
        ok(!CollectionRules.identity(event()).equals(CollectionRules.identity(with(event(),"organizer","다른 주최"))),"different organizers");
        ok(CollectionRules.identity(event()).equals(CollectionRules.identity(with(event(),"name"," [TEST] 샘플   온리전 "))),"normalized title");
        ok(!CollectionRules.identity(event()).equals(CollectionRules.identity(with(event(),"occurrences",List.of(new Occurrence("2026-10-14","2026-10-14",null,null))))),"changed day no auto merge");
        throwsError(()->CollectionRules.batch(with(batch(),"webSearchObserved",false)),"no search audit");
        throwsError(()->CollectionRules.batch(with(batch(),"runId","1-1-1-1-1")),"noncanonical run id");
        throwsError(()->CollectionRules.batch(with(batch(),"scope",new Scope("SEOUL","UTC","2026-10-01","2026-10-31"))),"timezone");
        throwsError(()->CollectionRules.batch(with(batch(),"scope",new Scope("SEOUL","Asia/Seoul","2026-10-31","2026-10-01"))),"scope reversed");
        throwsError(()->CollectionRules.batch(with(batch(),"result",with(batch().result(),"queries",List.of()))),"query absent");
        throwsError(()->CollectionRules.batch(with(batch(),"result",with(batch().result(),"searchStatus","FAILED"))),"failed must have zero events");
        CollectionRules.batch(with(batch(),"result",with(batch().result(),"events",List.of())));ok(true,"normal zero result");
        CollectionRules.batch(with(with(batch(),"executionMode","MANUAL_IMPORT"),"webSearchObserved",false));ok(true,"manual clearly labeled");
        System.out.println("PASS: "+checks+" collection Java checks, including Python/Java identity parity. No Spring/DB/network execution.");
    }
}
