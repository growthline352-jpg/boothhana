import com.boothhana.collection.CatalogBrowseQuery;
import java.util.*;
public class BrowseRulesTest {
 static int checks;
 static void ok(boolean condition,String message){if(!condition)throw new AssertionError(message);checks++;System.out.println("PASS "+message);}
 static CatalogBrowseQuery query(String category,String text,String subtype,String from,String to,String sort){return new CatalogBrowseQuery(0,20,category,text,subtype,from,to,sort);}
 static void rejects(Runnable action,String message){boolean rejected=false;try{action.run();}catch(IllegalArgumentException e){rejected=true;}ok(rejected,message);}
 static long marks(String text){return text.chars().filter(c->c=='?').count();}
 public static void main(String[] args){
  ok(query(null,null,null,null,null,null).connected(),"old query defaults to subculture");
  for(String category:List.of("EXHIBITION","FESTIVAL"))ok(query(category,"","","","","").connected() && !query(category,"","","","","").whereArgs().contains("DOLL"),category+" is connected with isolated subtype parameters");
  rejects(()->query("ALL","","","","",""),"unknown category rejected");
  rejects(()->query("SUBCULTURE","","DOLL OR 1=1","","",""),"unknown subtype rejected");
  rejects(()->query("FESTIVAL","","DOLL","","",""),"wrong-category subtype rejected");
  rejects(()->query("SUBCULTURE","x".repeat(101),"","","",""),"search length bounded");
  rejects(()->query("SUBCULTURE","","","","","p.id; drop table event"),"sort SQL injection rejected");
  for(String value:List.of("2026-02-29","2026-13-01","2026-1-1","2026-10-10 OR true"))rejects(()->query("SUBCULTURE","","",value,"",""),"invalid from rejected "+value);
  rejects(()->query("SUBCULTURE","","","2026-10-10","2026-09-01",""),"reversed range rejected");
  rejects(()->new CatalogBrowseQuery(-1,20,"SUBCULTURE","","","","",""),"negative page rejected");
  rejects(()->new CatalogBrowseQuery(100001,20,"SUBCULTURE","","","","",""),"oversized page rejected");
  rejects(()->new CatalogBrowseQuery(0,101,"SUBCULTURE","","","","",""),"oversized limit rejected");
  for(String subtype:List.of("","DOLL"))for(String text:List.of("","O'Reilly 100%_"))for(String from:List.of("","2026-10-10"))for(String to:List.of("","2026-10-13"))for(String sort:List.of("DATE_ASC","RECENT")){
   var q=query("SUBCULTURE",text,subtype,from,to,sort);
   ok(marks(q.whereSql())==q.whereArgs().size(),"where placeholders match "+subtype+"/"+from+"/"+sort);
   ok(marks(q.whereSql()+q.orderSql()+" limit ? offset ?")==q.listArgs().size(),"list placeholders match "+text+"/"+to+"/"+sort);
  }
  var q=query("SUBCULTURE","x' OR 1=1 --","DOLL","2026-10-12","2026-10-12","DATE_ASC");
  ok(!q.whereSql().contains(q.q())&&q.whereArgs().contains(q.q()),"query text bound rather than interpolated");
  ok(q.whereSql().contains("strpos")&&!q.whereSql().contains(" ilike "),"percent and underscore treated literally");
  ok(q.whereSql().contains("exists(select 1")&&q.whereSql().contains("d->>'endDate'>=?")&&q.whereSql().contains("d->>'startDate'<=?"),"a single occurrence must overlap, gaps are not filled");
  ok(q.whereSql().contains("p.snapshot_json")&&!q.whereSql().contains("e.payload_json"),"only published snapshot searched, not pending revisions");
  ok(q.whereSql().contains("e.review_state<>'EXCLUDED'"),"excluded events remain hidden");
  ok(query("SUBCULTURE","","","2028-02-29","","").from().equals("2028-02-29"),"valid leap day accepted");
  System.out.println("PASS: "+checks+" public browse rules checks. Pure Java, no JDBC database.");
 }
}
