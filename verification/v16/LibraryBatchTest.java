package com.boothhana.library;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import com.boothhana.api.ApiException;
import static com.boothhana.library.LibraryModels.*;
/** Real projection/service methods. The JDBC boundary below does NOT execute SQL or RLS. */
public class LibraryBatchTest {
 static int n;static void ok(boolean condition){if(!condition)throw new AssertionError("condition "+(n+1));n++;}
 static Map<String,Object> map(Object...a){Map<String,Object> r=new LinkedHashMap<>();for(int i=0;i<a.length;i+=2)r.put(a[i].toString(),a[i+1]);return r;}
 static class DB extends JdbcTemplate {
  int calls;String sql;Object[] args;boolean hidden,images=true,reverse;String verification="NOT_RECONFIRMED";
  public List<Map<String,Object>> queryForList(String sql,Object...args){calls++;this.sql=sql;this.args=args;
   List<Map<String,Object>> result=new ArrayList<>();for(int i=0;i<args.length;i+=5){long id=((Number)args[i+3]).longValue();var r=map("request_index",args[i],"live_event",hidden?null:map("name","[TEST] event","occurrences",List.of(map("startDate","2026-10-01","endDate","2026-10-05"))),"live_participant",map("registrationName","[TEST] booth","locations",List.of()),"live_sales",map("summary","판매 소개"),"live_product",map("name","[TEST] 상품"+id,"saleState","CANCELED","warnings",List.of("중요 공지")),"live_published","2026-09-18T00:00:00Z","live_verification",verification==null?null:map("state",verification,"lastSeenAt","2026-09-01T00:00:00Z"),"image_id",images?100L+id:null,"image_key","verified/product/sample"+id+".png","image_page","https://example.com/source","image_credit","source");result.add(r);}if(reverse)Collections.reverse(result);return result;
  }
 }
 static Target product(int n){return new Target("PRODUCT",10,n,20L);}
 static class MemberDB extends LibraryServiceTest.DB {int calls;public List<Map<String,Object>> queryForList(String sql,Object...a){calls++;return super.queryForList(sql,a);}}
 public static void main(String[]args){DB db=new DB();JsonMapper json=new JsonMapper();LibraryTargets target=new LibraryTargets(db,json);target.publicUrl("https://assets.example.test");LibraryService svc=new LibraryService(db,json,target);
  for(int count:List.of(1,24,30,200)){db.calls=0;List<Target> in=new ArrayList<>();for(int i=1;i<=count;i++)in.add(product(i));var out=svc.resolve(in);ok(db.calls==1);ok(out.size()==count);ok(db.args.length==count*5);ok(out.getFirst().current().verification().state().equals("NOT_RECONFIRMED"));ok(out.getFirst().current().verification().lastSeenAt().equals("2026-09-01T00:00:00Z"));ok(out.getFirst().image()!=null);}
  ok(db.sql.contains("product.value->'verification'"));ok(db.sql.contains("ss.review_state<>'EXCLUDED'"));ok(db.sql.contains("ec.review_state<>'EXCLUDED'"));ok(db.sql.contains("a.rights_state='APPROVED'"));ok(db.sql.contains("a.storage_state='STORED'"));ok(db.sql.contains("a.participant_id=m.participant_id"));ok(db.sql.contains("subculture_catalog_presentation"));
  db.reverse=true;var duplicates=svc.resolve(List.of(product(3),product(1),product(3)));ok(duplicates.get(0).target().id()==3);ok(duplicates.get(1).target().id()==1);ok(duplicates.get(2).target().id()==3);ok(duplicates.get(1).current().memory().title().endsWith("1"));db.reverse=false;ok(db.args.length==10);
  var repeated=svc.resolve(Collections.nCopies(200,product(3)));ok(repeated.size()==200);ok(db.args.length==5);
  for(String state:List.of("CONFIRMED_CURRENT","NOT_RECONFIRMED","LEGACY")){db.verification=state;var value=target.resolve(product(1)).current();ok(value.verification().state().equals(state));ok(value.saleState().equals("CANCELED"));ok(value.warnings().contains("중요 공지"));}
  db.verification="UNRECOGNIZED";ok(target.resolve(product(1)).current().verification().state().equals("LEGACY"));db.verification=null;ok(target.resolve(product(1)).current().verification().lastSeenAt()==null);
  var event=target.resolve(new Target("EVENT",10,10,null));ok(event.current().verification()==null);var booth=target.resolve(new Target("PARTICIPANT",10,20,20L));ok(booth.current().verification()==null);
  db.hidden=true;var unavailable=target.resolve(product(1));ok(!unavailable.available());ok(unavailable.current()==null);ok(unavailable.image()==null);db.hidden=false;db.images=false;ok(target.resolve(product(1)).image()==null);
  try{svc.resolve(Collections.nCopies(201,product(1)));throw new AssertionError("should reject >200");}catch(ApiException expected){n++;}
  try{svc.resolve(List.of(new Target("PRODUCT",10,3,null)));throw new AssertionError("should reject parent");}catch(ApiException expected){n++;}
  MemberDB memberDb=new MemberDB();var mt=new LibraryTargets(memberDb,json);var ms=new LibraryService(memberDb,json,mt);ms.save(1,new Save(product(30),"2026-09-02",""));ms.save(1,new Save(new Target("PARTICIPANT",10,20,20L),"",""));memberDb.calls=0;var page=ms.list(1,"",null,"",false,0,24);ok(page.total()==2);ok(memberDb.calls==3);ok(page.items().size()==2);ok(page.items().getFirst().target().eventId()==10);
  System.out.println("PASS "+n+" library projection/batch conditions: 200 public targets=1 JDBC call, member page=3. Scripted JDBC counts, NOT database latency/SQL/RLS execution.");
 }
}
