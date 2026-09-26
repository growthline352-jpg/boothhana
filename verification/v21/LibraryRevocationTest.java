package com.boothhana.library;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
import static com.boothhana.library.LibraryModels.*;
/** Actual LibraryService/Targets with the existing explicit JDBC/JSON test boundaries.
 * No real PostgreSQL/Jackson/transaction or HTTP authorization test. */
public final class LibraryRevocationTest {
 static final String SECRET="WITHDRAWN_SALES_FIXTURE";
 static class DB extends LibraryServiceTest.DB {
  boolean salesVisible=true;
  @Override Map<String,Object> live(long event,String type,long id,Long participant){
   var row=super.live(event,type,id,participant);
   row.put("live_sales",salesVisible?map("summary",SECRET,"categories",List.of("SALES_TAG_FIXTURE")):null);
   return row;
  }
 }
 static Map<String,Object> map(Object... values){return LibraryServiceTest.map(values);}
 static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
 static int passed,failed;
 static void check(String name,Runnable action){try{action.run();passed++;System.out.println("PASS "+name);}catch(Throwable error){failed++;System.out.println("FAIL "+name+": "+error);}}
 record Fixture(DB db,JsonMapper json,LibraryService service,Entry entry) {}
 static Fixture fixture(){DB db=new DB();JsonMapper json=new JsonMapper();var service=new LibraryService(db,json,new LibraryTargets(db,json));
  var initial=service.save(1,new Save(new Target("PARTICIPANT",10,20,20L),"2026-09-02","1관")).item();
  var item=service.edit(1,initial.id(),new Edit(0,"MY_PRIVATE_NOTE","2026-09-02","1관"));return new Fixture(db,json,service,item);
 }
 public static void main(String[]args){
  check("booth stays available but historical withdrawn summary is hidden",()->{var f=fixture();f.db.salesVisible=false;var current=f.service.detail(1,f.entry.id());require(current.available(),"booth should remain public");require(current.saved().summary().isEmpty(),"withdrawn summary exposed");require(current.current().memory().summary().isEmpty(),"live summary exposed");});
  check("historical withdrawn sales tags are not returned",()->{var f=fixture();f.db.salesVisible=false;var current=f.service.detail(1,f.entry.id());require(!current.saved().tags().contains("SALES_TAG_FIXTURE"),"withdrawn tag exposed");require(current.saved().tags().contains("선물"),"public booth tag lost");});
  check("list search cannot match withdrawn saved sales summary",()->{var f=fixture();f.db.salesVisible=false;require(f.service.list(1,SECRET,null,"",false,0,24).total()==0,"search leaked old summary");});
  check("list search cannot match withdrawn saved sales tags",()->{var f=fixture();f.db.salesVisible=false;require(f.service.list(1,"SALES_TAG_FIXTURE",null,"",false,0,24).total()==0,"search leaked old tags");});
  check("note, plan, public booth identity and raw owner history are not deleted",()->{var f=fixture();String raw=f.db.items.get(f.entry.id()).get("saved_json").toString();f.db.salesVisible=false;var current=f.service.detail(1,f.entry.id());require(current.note().equals("MY_PRIVATE_NOTE"),"private note changed");require(current.day().equals("2026-09-02")&&current.hall().equals("1관"),"plan changed");require(current.saved().participantName().equals("테스트 공방"),"booth identity lost");require(raw.equals(f.db.items.get(f.entry.id()).get("saved_json")),"DB history mutated");require(current.changed(),"change indicator lost");require(f.service.list(1,"MY_PRIVATE_NOTE",null,"",false,0,24).total()==1,"private note search broken");});
  check("still-public saved sales history and full-withdrawal behavior are preserved",()->{var f=fixture();require(f.service.detail(1,f.entry.id()).saved().summary().equals(SECRET),"public history disappeared");f.db.visible=false;var hidden=f.service.detail(1,f.entry.id());require(!hidden.available()&&hidden.saved()==null&&hidden.current()==null&&hidden.image()==null,"full withdrawal broken");});
  System.out.println("RESULT tests="+(passed+failed)+" passed="+passed+" failed="+failed+"; explicit JDBC/JSON doubles, no real DB");
  if(failed!=0)System.exit(1);
 }
}
