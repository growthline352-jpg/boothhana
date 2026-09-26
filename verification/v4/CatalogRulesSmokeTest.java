import com.boothhana.collection.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;
import java.util.*;

/** Actual production rules; no Spring/DB stubs in this executable. */
public class CatalogRulesSmokeTest {
    static int checks=0;
    static void ok(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
    static void fails(Runnable r,String label){boolean bad=false;try{r.run();}catch(RuntimeException e){bad=true;}ok(bad,label);}
    @SuppressWarnings("unchecked") static <T> T with(T r,String key,Object value){try{var parts=r.getClass().getRecordComponents();Class<?>[] types=new Class<?>[parts.length];Object[] args=new Object[parts.length];for(int i=0;i<parts.length;i++){types[i]=parts[i].getType();args[i]=parts[i].getName().equals(key)?value:parts[i].getAccessor().invoke(r);}return (T)r.getClass().getDeclaredConstructor(types).newInstance(args);}catch(Exception e){throw new IllegalStateException(e);}}
    static Source source(){return new Source("https://example.com/test","OFFICIAL","ORIGINAL","[TEST] fictional test evidence");}
    static Image image(){return new Image("BOOTH_CUT","https://example.com/a.png","https://example.com/test",null,"test");}
    static Location location(){return new Location("B1","ASSIGNED","hall",null,"2026-10-10","2026-10-11",null);}
    static Participant participant(){return new Participant("entry1","A + B","JOINT",List.of(new Member("A","ARTIST",List.of(),null),new Member("B","BRAND",List.of(),"https://example.com/B")),List.of(location()),List.of("subject"),List.of(),List.of(source()),List.of(image()),List.of());}
    static ProductData product(){return new ProductData("p1","test sticker","test",null,List.of("sticker"),List.of(),"GENERAL_CATALOG",new Price("3000","KRW","2026-09-16","base price"),"UNKNOWN","https://example.com/p1",List.of(source()),List.of(),List.of());}
    static Sales sales(){return new Sales("test summary","GENERAL_CATALOG",List.of("stickers"),List.of(),null,List.of(source()),List.of(),List.of(product()),List.of());}
    static Coverage coverage(){return new Coverage("COMPLETE",1,"REGISTERED_BOOTHS",List.of("https://example.com/test"),null,List.of());}
    static StageBatch batch(){return new StageBatch("4","aedebf86-1c2b-42af-bb59-b8e88c8a3835","7a06d5d5-6fad-4b90-a53f-1f28924f164f","PARTICIPANTS",1L,null,1L,"2026-09-16T01:00:00Z","2026-09-16T01:05:00Z",true,new StageResult("COMPLETE","test",List.of("test"),coverage(),List.of(participant()),null));}
    public static void main(String[] args){
        CatalogRules.participant(participant());ok(true,"valid participant");CatalogRules.sales(sales());ok(true,"valid sales");CatalogRules.stage(batch());ok(true,"valid stage");
        ok(participant().members().size()==2&&participant().registrationName().equals("A + B"),"joint booth not split");
        ok(CatalogRules.participantKey(participant()).equals(CatalogRules.participantKey(with(participant(),"locations",List.of(with(location(),"code","C9"))))),"booth move does not create new identity");
        ok(CatalogRules.participantKey(participant()).equals(CatalogRules.participantKey(with(participant(),"registrationName","new title"))),"source entry ID stable across rename");
        fails(()->CatalogRules.participant(with(participant(),"registrationName","")),"empty name");
        fails(()->CatalogRules.participant(with(participant(),"sources",List.of())),"missing evidence");
        fails(()->CatalogRules.participant(with(participant(),"sources",List.of(with(source(),"access","INACCESSIBLE")))),"inaccessible only");
        fails(()->CatalogRules.participant(with(participant(),"members",null)),"missing member list");
        fails(()->CatalogRules.participant(with(participant(),"kind","COMPANY_LEGAL_CONFIRMED")),"no inferred legal entity");
        fails(()->CatalogRules.participant(with(participant(),"locations",List.of(with(location(),"code",null)))),"assigned requires number");
        fails(()->CatalogRules.participant(with(participant(),"locations",List.of(with(location(),"status","UNASSIGNED")))),"unassigned cannot have guessed code");
        CatalogRules.participant(with(participant(),"locations",List.of(with(with(location(),"status","UNASSIGNED"),"code",null))));ok(true,"unassigned accepted");
        CatalogRules.participant(with(participant(),"locations",List.of()));ok(true,"no location allowed");
        fails(()->CatalogRules.participant(with(participant(),"locations",List.of(with(location(),"endDate","2026-10-09")))),"date inversion");
        fails(()->CatalogRules.participant(with(participant(),"locations",List.of(with(location(),"endDate",null)))),"date pair required");
        var event=CollectionRulesSmokeTest.event();CatalogRules.locationDates(participant(),event);ok(true,"inside actual dates");
        fails(()->CatalogRules.locationDates(with(participant(),"locations",List.of(new Location("B1","ASSIGNED",null,null,"2026-10-12","2026-10-12",null))),event),"closed day excluded");
        CatalogRules.coverage(new Coverage("PARTIAL",720,"REGISTERED_BOOTHS",List.of("https://example.com/list"),"https://example.com/page2",List.of("24 only")));ok(true,"partial retained");
        fails(()->CatalogRules.coverage(with(coverage(),"nextPageUrl","https://example.com/next")),"next page not complete");
        fails(()->CatalogRules.coverage(with(coverage(),"reportedTotal",-1)),"negative total");
        CatalogRules.coverage(with(coverage(),"totalUnit","BOOTH_CUTS"));ok(true,"booth cuts distinct unit");
        fails(()->CatalogRules.product(with(product(),"price",new Price("-1","KRW","2026-09-16",null))),"negative price");
        fails(()->CatalogRules.product(with(product(),"price",new Price("1e3","KRW","2026-09-16",null))),"exponential price");
        fails(()->CatalogRules.product(with(product(),"price",new Price("1","krw","2026-09-16",null))),"currency shape");
        fails(()->CatalogRules.product(with(product(),"price",new Price("1","KRW","2026-02-30",null))),"invalid price date");
        CatalogRules.product(with(product(),"price",null));ok(true,"unknown not free");
        CatalogRules.product(with(product(),"price",new Price("0","KRW","2026-09-16",null)));ok(true,"explicit free");
        ok(product().evidenceScope().equals("GENERAL_CATALOG")&&product().saleState().equals("UNKNOWN"),"catalog not event inventory");
        for(String scope:CatalogRules.SCOPES){CatalogRules.sales(with(sales(),"evidenceScope",scope));ok(true,"scope "+scope);}
        fails(()->CatalogRules.sales(with(sales(),"summary","")),"no invented summary");
        for(String url:List.of("http://127.0.0.1/x","https://169.254.169.254/x","file:///etc/passwd","javascript:alert(1)","https://a.local/x"))fails(()->CatalogRules.images(List.of(with(image(),"imageUrl",url))),"unsafe image");
        fails(()->CatalogRules.images(List.of(with(image(),"type","SVG_SCRIPT"))),"image kind invalid");
        fails(()->CatalogRules.stage(with(batch(),"webSearchObserved",false)),"no actual search audit");
        fails(()->CatalogRules.stage(with(batch(),"eventId",0L)),"missing parent");
        fails(()->CatalogRules.stage(with(batch(),"participantId",1L)),"participant stage cannot change parent type");
        fails(()->CatalogRules.stage(with(batch(),"runId","1-1-1-1-1")),"canonical UUID");
        fails(()->CatalogRules.stage(with(batch(),"result",with(batch().result(),"searchStatus","FAILED"))),"failed stage cannot carry data");
        fails(()->CatalogRules.stage(with(batch(),"result",with(batch().result(),"queries",List.of()))),"queries required");
        CatalogRules.edit(new EditInput(1,"REVIEWED","checked",Map.of("summary","ok")),Set.of("summary"));ok(true,"allowed correction");
        fails(()->CatalogRules.edit(new EditInput(1,"REVIEWED","checked",Map.of("eventId",99)),Set.of("summary")),"cannot edit parent ID");
        System.out.println("PASS: "+checks+" v4 catalogue rule checks. Actual Java compile/run; no database/network.");
    }
}
