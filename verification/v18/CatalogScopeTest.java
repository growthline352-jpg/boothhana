import com.boothhana.collection.*;
import static com.boothhana.collection.CollectionModels.*;
import java.util.*;
public class CatalogScopeTest {
 static int n;static void ok(boolean v,String s){if(!v)throw new AssertionError(s);n++;}
 static EventData event(String type,String region,String address,String place){return new EventData("fixture",type,"fixture","2026",region,place,address,"fixture","free",List.of(),List.of(new Occurrence("2026-10-10","2026-10-10",null,null)),List.of(new Source("https://example.com/event","OFFICIAL","ORIGINAL","fixture date and place")),List.of(),List.of());}
 public static void main(String[] args){
  var scope=new Scope("SEOUL_GYEONGGI","Asia/Seoul","2026-10-01","2026-10-31");
  for(var entry:CatalogTaxonomy.GROUPS.entrySet())for(String t:entry.getValue())for(String region:List.of("SEOUL","GYEONGGI")){
   var e=event(t,region,region.equals("SEOUL")?"서울특별시 강남구":"경기도 고양시",region.equals("SEOUL")?"코엑스":"킨텍스");
   ok(CollectionRules.event(e,scope).accepted(),t+region+CollectionRules.event(e,scope));
   var q=new CatalogBrowseQuery(0,20,entry.getKey(),"' OR 1=1 --",t,"2026-10-01","2026-10-31","DATE_ASC",region);
   ok(q.connected(),"connected");ok(q.whereArgs().contains(region),"bound region");ok(!q.whereSql().contains(q.q()),"bound query");
   ok(q.whereSql().chars().filter(c->c=='?').count()==q.whereArgs().size(),"where placeholders");
   ok((q.whereSql()+q.orderSql()+" limit ? offset ?").chars().filter(c->c=='?').count()==q.listArgs().size(),"full placeholders");
   for(var other:CatalogTaxonomy.GROUPS.entrySet())if(!other.getKey().equals(entry.getKey()))for(String ot:other.getValue())
    ok(q.whereArgs().contains(ot)==CatalogTaxonomy.browseTypes(entry.getKey()).contains(ot),"only declared category sharing");
  }
  for(String region:List.of("SEOUL","GYEONGGI","INCHEON","UNKNOWN"))ok(!CollectionRules.event(event("CULTURE",region,"인천광역시 연수구","송도컨벤시아"),scope).accepted(),"Incheon denied");
  ok(!CollectionRules.event(event("DOLL","GYEONGGI","서울특별시 강남구","코엑스"),scope).accepted(),"mismatch");
  ok(!CollectionRules.event(event("DOLL","GYEONGGI","경기도 고양시","킨텍스"),new Scope("SEOUL","Asia/Seoul","2026-10-01","2026-10-31")).accepted(),"legacy Seoul scope remains strict");
  for(String region:List.of("INCHEON","OTHER","ALL","' OR 1=1")){try{new CatalogBrowseQuery(0,20,"FESTIVAL","","","","","RECENT",region);throw new AssertionError("invalid region");}catch(IllegalArgumentException expected){n++;}}
  ok(!new CatalogModels.RightsInput(1,"APPROVED","proof","credit").offlineAllowed(),"legacy permission defaults denied");
  ok(new CatalogModels.RightsInput(1,"APPROVED","proof","credit",true).offlineAllowed(),"explicit permission wire");
  System.out.println("PASS "+n+" scope/query/permission assertions; actual pure Java, NOT PostgreSQL or Spring integration.");
 }
}
