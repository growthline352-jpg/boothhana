package com.boothhana.library;
import java.util.*;import org.springframework.jdbc.core.JdbcTemplate;import tools.jackson.databind.json.JsonMapper;import com.boothhana.api.ApiException;import static com.boothhana.library.LibraryModels.*;
/** Real services and projection; an explicit in-memory JDBC dispatcher (not SQL/Postgres/transactions). */
public class LibraryServiceTest{
 static int n;static void ok(boolean x){if(!x)throw new AssertionError("condition "+(n+1));n++;}static void rejects(Runnable r){try{r.run();throw new AssertionError("expected refusal");}catch(ApiException good){n++;}}
 static Map<String,Object> map(Object...a){Map<String,Object> r=new LinkedHashMap<>();for(int i=0;i<a.length;i+=2)r.put(a[i].toString(),a[i+1]);return r;}
 static class DB extends JdbcTemplate{
  Map<UUID,Map<String,Object>> items=new LinkedHashMap<>();Set<String> visits=new HashSet<>();boolean visible=true,productVisible=true;String title="식물 키링";
  Map<String,Object> live(long event,String type,long id,Long participant){return map("live_event",visible&&event==10?map("name","테스트 행사","description","소개","subjects",List.of("식물"),"occurrences",List.of(map("startDate","2026-09-01","endDate","2026-09-03")),"sources",List.of()):null,"live_participant",visible&&Objects.equals(participant,20L)?map("registrationName","테스트 공방","subjects",List.of("선물"),"locations",List.of(map("startDate","2026-09-01","endDate","2026-09-03","code","B1")),"members",List.of()):null,"live_sales",map("summary","작은 식물 소품","categories",List.of("키링")),"live_product",productVisible&&id==30&&Objects.equals(participant,20L)?map("name",title,"summary","잎 모양","subjects",List.of("초록")):null,"live_published","2026-08-31T00:00:00Z");}
  List<Map<String,Object>> owned(Object owner){return items.values().stream().filter(x->x.get("user_id").equals(owner)).toList();}
  Map<String,Object> projected(Map<String,Object> x){Map<String,Object> r=new LinkedHashMap<>(x);r.putAll(live((Long)x.get("event_id"),x.get("target_type").toString(),(Long)x.get("target_id"),(Long)x.get("participant_id")));return r;}
  public List<Map<String,Object>> queryForList(String sql,Object...a){
   if(sql.contains("pg_advisory_xact_lock"))return List.of();if(sql.contains("from (values")){List<Map<String,Object>> rows=new ArrayList<>();for(int i=0;i<a.length;i+=5){var r=live(((Number)a[i+1]).longValue(),(String)a[i+2],((Number)a[i+3]).longValue(),(Long)a[i+4]);r.put("request_index",a[i]);rows.add(r);}return rows;}if(sql.contains("from subculture_catalog_asset"))return List.of();
   if(sql.startsWith("select event_id,participant_id,visited_day"))return visits.stream().filter(v->v.startsWith(a[0]+":" )).sorted().map(v->{var p=v.split(":");return map("event_id",Long.valueOf(p[1]),"participant_id",Long.valueOf(p[2]),"visited_day",p[3]);}).toList();
   if(sql.startsWith("select id,participant_id from memory_item"))return owned(a[0]).stream().filter(x->x.get("event_id").equals(a[1])&&x.get("target_type").equals(a[2])&&x.get("target_id").equals(a[3])).map(x->map("id",x.get("id"),"participant_id",x.get("participant_id"))).toList();
   if(sql.startsWith("select m.*")){return owned(a[0]).stream().filter(x->!sql.contains("m.id=?")||x.get("id").equals(a[1])).map(this::projected).toList();}
   if(sql.startsWith("select id,event_id"))return owned(a[0]);if(sql.startsWith("select * from memory_item"))return owned(a[0]).stream().filter(x->x.get("id").equals(a[1])).toList();
   throw new AssertionError("unhandled JDBC read: "+sql);
  }
  @SuppressWarnings("unchecked")public <T>T queryForObject(String sql,Class<T> type,Object...a){if(sql.startsWith("select count(*) from memory_item"))return (T)Long.valueOf(owned(a[0]).stream().filter(x->a.length==1||x.get("event_id").equals(a[1])&&Objects.equals(x.get("participant_id")==null?0L:x.get("participant_id"),a[2])).count());throw new AssertionError(sql);}
  public int update(String sql,Object...a){
   if(sql.contains("insert into memory_item")){items.put((UUID)a[0],map("id",a[0],"user_id",a[1],"event_id",a[2],"target_type",a[3],"target_id",a[4],"participant_id",a[5],"saved_json",a[6],"planned_day",a[7],"hall",a[8],"note",a[9],"revision",0L,"saved_at","2026-09-01T00:00:00Z","updated_at","2026-09-01T00:00:00Z","last_opened_at",null));return 1;}
   if(sql.startsWith("update memory_item set note")){var r=items.get((UUID)a[4]);if(r==null||!r.get("user_id").equals(a[3]))return 0;r.put("note",a[0]);r.put("planned_day",a[1]);r.put("hall",a[2]);r.put("revision",(Long)r.get("revision")+1);return 1;}
   if(sql.startsWith("delete from memory_item")){var r=items.get((UUID)a[1]);if(r!=null&&r.get("user_id").equals(a[0]))items.remove(a[1]);return 1;}
   if(sql.startsWith("insert into memory_visit")){visits.add(a[0]+":"+a[1]+":"+a[2]+":"+a[3]);return 1;}
   if(sql.startsWith("delete from memory_visit")){visits.removeIf(v->a.length==3?v.startsWith(a[0]+":"+a[1]+":"+a[2]+":"):v.equals(a[0]+":"+a[1]+":"+a[2]+":"+a[3]));return 1;}
   if(sql.startsWith("update memory_item set last_opened_at")||sql.startsWith("update memory_item set outbound_count"))return 1;
   throw new AssertionError("unhandled JDBC update: "+sql);
  }
 }
 public static void main(String[]args){DB db=new DB();JsonMapper json=new JsonMapper();var targets=new LibraryTargets(db,json);var service=new LibraryService(db,json,targets);Target product=new Target("PRODUCT",10,30,20L);Save save=new Save(product,"2026-09-02","1관");
  var first=service.save(1,save);ok(first.created());ok(db.items.size()==1);ok(first.item().saved().title().equals("식물 키링"));ok(first.item().visitedDays().isEmpty());
  var note=service.edit(1,first.item().id(),new Edit(0,"소음 아닌 색상 비교","2026-09-02","1관"));ok(note.revision()==1);ok(service.save(1,save).item().note().equals(note.note()));ok(db.items.size()==1);
  rejects(()->service.detail(2,first.item().id()));rejects(()->service.edit(1,first.item().id(),new Edit(0,"stale","","")));
  var conflict=service.importItem(1,new Import(save,"기기의 다른 메모",1));ok(conflict.result().equals("NOTE_CONFLICT"));ok(conflict.item().note().equals(note.note()));rejects(()->service.importItem(2,new Import(save,"개인 메모",1)));ok(db.items.size()==1);
  rejects(()->service.save(1,new Save(new Target("PRODUCT",10,30,99L),"","")));ok(service.importItem(1,new Import(new Save(product,"2026-09-03","1관"),note.note(),1)).result().equals("CONTEXT_CONFLICT"));ok(db.items.size()==1);rejects(()->service.save(1,new Save(new Target("EVENT",10,10,null),"2026-09-10","")));
  var booth=service.save(1,new Save(new Target("PARTICIPANT",10,20,20L),"",""));ok(booth.created());ok(db.items.size()==2);
  service.visit(1,first.item().id(),new Visit("2026-09-02",true));ok(service.detail(1,booth.item().id()).visitedDays().equals(List.of("2026-09-02")));service.visit(1,first.item().id(),new Visit("2026-09-02",true));ok(db.visits.size()==1);rejects(()->service.visit(1,first.item().id(),new Visit("2099-01-01",true)));
  db.title="잎 모양 키링 정정";ok(service.detail(1,first.item().id()).changed());ok(service.list(1,"식물",null,"PRODUCT",false,0,24).total()==1);ok(service.list(1,"잎 모양",null,"PRODUCT",false,0,24).total()==1);
  db.visible=false;var unavailable=service.detail(1,first.item().id());ok(!unavailable.available());ok(unavailable.saved()==null&&unavailable.current()==null&&unavailable.image()==null);ok(unavailable.note().equals(note.note()));ok(service.list(1,"식물",null,"",false,0,24).total()==0);ok(service.list(1,"색상 비교",null,"",false,0,24).total()==1);service.visit(1,first.item().id(),new Visit("2026-09-02",false));ok(db.visits.isEmpty());rejects(()->service.visit(1,first.item().id(),new Visit("2026-09-02",true)));
  db.visible=true;service.visit(1,first.item().id(),new Visit("2026-09-02",true));service.delete(1,first.item().id(),1);ok(db.items.size()==1&&db.visits.size()==1);service.delete(1,booth.item().id(),0);ok(db.items.isEmpty()&&db.visits.isEmpty());service.delete(1,booth.item().id(),0);ok(db.items.isEmpty());
  System.out.println("PASS "+n+" real LibraryService/Targets flows with in-memory JDBC/JSON boundaries. NOT real SQL/transactions/RLS.");
 }
}
