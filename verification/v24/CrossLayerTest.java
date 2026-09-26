import com.boothhana.floorplan.*;
import com.boothhana.floorplan.FloorplanModels.*;
import com.boothhana.health.*;
import com.boothhana.collection.CollectionRules;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import java.nio.file.*;
public class CrossLayerTest {
 interface Case{void run()throws Exception;}
 static int passed,failed;
 static void test(String name,Case c){try{c.run();passed++;System.out.println("PASS "+name);}catch(Throwable e){failed++;System.out.println("FAIL "+name+": "+e.getClass().getSimpleName());}}
 static void check(boolean x){if(!x)throw new AssertionError();}
 static String scope(String hall,String zone,List<String> dates,long asset)throws Exception{
  var service=new FloorplanService(null,null,null,null,"");var method=FloorplanService.class.getDeclaredMethod("scopeKey",long.class,PlanScope.class);method.setAccessible(true);return (String)method.invoke(service,asset,new PlanScope(hall,zone,dates,"Map"));
 }
 static class DB extends JdbcTemplate {
  List<Map<String,Object>> columns;
  DB(List<Map<String,Object>> c){columns=c;}
  @Override public List<Map<String,Object>> queryForList(String q,Object...args){
   if(q.contains("information_schema.columns"))return columns;
   if(q.contains("from pg_class"))return SchemaContract.TABLES.keySet().stream().map(t->Map.<String,Object>of("relname",t,"relrowsecurity",true,"server_grants",true,"server_policy",true,"api_grants",false)).toList();
   return List.of();
  }
 }
 static List<Map<String,Object>> fixture(Path file)throws Exception {
  var rows=new ArrayList<Map<String,Object>>();
  for(String line:Files.readAllLines(file)){
   String[] v=line.split("\\t");var row=new HashMap<String,Object>();row.put("table_name",v[0]);row.put("column_name",v[1]);row.put("udt_name",v[2]);row.put("character_maximum_length",v[3].equals("0")?null:Integer.valueOf(v[3]));row.put("is_nullable",v[4].equals("1")?"NO":"YES");rows.add(row);
  }return rows;
 }
 static Map<String,Object> row(List<Map<String,Object>> x,String table,String col){return x.stream().filter(r->r.get("table_name").equals(table)&&r.get("column_name").equals(col)).findFirst().orElseThrow();}
 public static void main(String[] args)throws Exception{
  var dates=List.of("2026-10-01");Path input=Path.of(args[0]);
  test("different_hall_zone_delimiters_never_alias",()->check(!scope("A|B","C",dates,1).equals(scope("A","B|C",dates,1))));
  test("normalized_fullwidth_delimiter_never_aliases",()->check(!scope("A｜B","C",dates,1).equals(scope("A","B|C",dates,1))));
  test("literal_escape_sequence_stays_distinct",()->check(!scope("A%7CB","C",dates,1).equals(scope("A|B","C",dates,1))));
  test("ordinary_historic_scope_hash_is_preserved",()->check(scope("Hall A","zone1",dates,1).equals(CollectionRules.sha("HALLA|ZONE1|2026-10-01"))));
  test("date_order_is_canonical",()->check(scope("A","B",List.of("2026-10-02","2026-10-01"),1).equals(scope("A","B",List.of("2026-10-01","2026-10-02"),1))));
  test("unknown_hall_remains_asset_bound",()->check(!scope(null,"B",dates,1).equals(scope(null,"B",dates,2))));
  test("matching_column_metadata_is_ready",()->check(new ReadinessService(new DB(fixture(input))).check().ready()));
  test("same_named_wrong_revision_type_is_not_ready",()->{var rows=fixture(input);row(rows,"memory_item","revision").put("udt_name","text");check(!new ReadinessService(new DB(rows)).check().ready());});
  test("hash_column_wrong_length_is_not_ready",()->{var rows=fixture(input);row(rows,"subculture_floorplan_version","sha256").put("character_maximum_length",32);check(!new ReadinessService(new DB(rows)).check().ready());});
  test("permission_nullability_drift_is_not_ready",()->{var rows=fixture(input);row(rows,"subculture_catalog_asset","offline_allowed").put("is_nullable","YES");check(!new ReadinessService(new DB(rows)).check().ready());});
  System.out.println("RESULT passed="+passed+" failed="+failed+" (real Java sources; JDBC metadata is a fixture)");
  if(failed>0)System.exit(1);
 }
}
