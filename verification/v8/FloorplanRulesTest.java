import com.boothhana.floorplan.*;
import static com.boothhana.floorplan.FloorplanModels.*;
import java.util.*;import java.time.*;
public class FloorplanRulesTest {
 static int count;static void ok(boolean b,String s){if(!b)throw new AssertionError(s);count++;System.out.println("PASS "+s);}
 static void bad(Runnable r,String label){try{r.run();throw new AssertionError(label);}catch(IllegalArgumentException|java.time.DateTimeException e){count++;System.out.println("PASS reject "+label);}}
 static Shape shape(String id,String code,double x,double y){return new Shape(id,code,List.of(new Point(x,y),new Point(x+.1,y),new Point(x+.1,y+.1),new Point(x,y+.1)),"READABLE",true);}
 static Geometry geo(Shape...s){return new Geometry("test",true,List.of(s),List.of());}
 static Roster roster(long id,String code,String hall,String...days){return new Roster(id,"[TEST] booth "+id,List.of(new Place(code,hall,null,List.of(days),null)));}
 static PlanScope scope(String hall,String...dates){return new PlanScope(hall,null,List.of(dates),"[TEST] map");}
 public static void main(String[] args){
  var a=shape("a","A-03a",.1,.1);var b=shape("b","A-03b",.3,.1);var s=scope("1관","2026-10-10");
  ok(!FloorplanRules.key("A-03a").equals(FloorplanRules.key("A-03b")),"half booth suffix not erased");
  ok(FloorplanRules.key(" Ｂ１ ").equals("B1"),"NFKC whitespace");
  ok(!FloorplanRules.key("B01").equals(FloorplanRules.key("B1")),"leading zero not guessed");
  var rs=List.of(roster(1,"A-03a","1관","2026-10-10"),roster(2,"A-03b","1관","2026-10-10"));
  var m=FloorplanRules.map(geo(a,b),s,rs,Map.of());ok(m.matched()==2,"exact hall date code map");ok(m.shapes().get(0).links().get(0).participantId()==1,"half a links only a");
  ok(FloorplanRules.map(geo(a),s,List.of(roster(1,"A-03a","2관","2026-10-10")),Map.of()).matched()==0,"same code different hall");
  ok(FloorplanRules.map(geo(a),s,List.of(roster(1,"A-03a",null,"2026-10-10")),Map.of()).matched()==0,"missing hall not evidence");
  ok(FloorplanRules.map(geo(a),s,List.of(roster(1,"A-03a","1관","2026-10-11")),Map.of()).matched()==0,"other day not mapped");
  ok(FloorplanRules.map(geo(a),s,List.of(roster(1,"A-03a","1관")),Map.of()).matched()==0,"unknown roster date not guessed");
  m=FloorplanRules.map(geo(a),scope("1관","2026-10-10","2026-10-11"),List.of(roster(1,"A-03a","1관","2026-10-10"),roster(2,"A-03a","1관","2026-10-11")),Map.of());
  ok(m.matched()==1&&m.shapes().get(0).links().size()==2,"same code different day has dated links");
  m=FloorplanRules.map(geo(a),s,List.of(roster(1,"A-03a","1관","2026-10-10"),roster(2,"A-03a","1관","2026-10-10")),Map.of());ok(m.matched()==0&&m.shapes().get(0).status().equals("AMBIGUOUS"),"duplicate exact location needs review");
  m=FloorplanRules.map(geo(a,shape("aa","A-03a",.6,.6)),s,rs,Map.of());ok(m.matched()==0,"duplicate labels within a drawing uncertain");
  ok(FloorplanRules.map(geo(a,shape("b","A-03b",.12,.12)),s,rs,Map.of()).matched()==0,"substantially overlapping shapes blocked");
  var unclear=new Shape(a.id(),a.label(),a.points(),"UNCERTAIN",true);ok(FloorplanRules.map(geo(unclear),s,rs,Map.of()).matched()==0,"unclear label not automatically mapped");
  var clipped=new Shape(a.id(),a.label(),a.points(),"READABLE",false);ok(FloorplanRules.map(geo(clipped),s,rs,Map.of()).matched()==0,"boundary unconfirmed no auto map");
  m=FloorplanRules.map(geo(unclear),s,rs,Map.of("a",new ManualLink(2,List.of("2026-10-10"),"reviewed source")));ok(m.matched()==1&&m.shapes().get(0).links().get(0).method().equals("MANUAL"),"explicit reviewed correction supported");
  bad(()->FloorplanRules.map(geo(a),s,rs,Map.of("a",new ManualLink(100,List.of("2026-10-10"),"no"))),"foreign participant id");
  bad(()->FloorplanRules.map(geo(a),s,rs,Map.of("a",new ManualLink(1,List.of("2026-10-12"),"no"))),"manual scope day mismatch");
  bad(()->FloorplanRules.map(geo(a),s,rs,Map.of("a",new ManualLink(1,List.of(),"no"))),"manual date required for dated map");
  bad(()->FloorplanRules.map(geo(a),s,rs,Map.of("fake",new ManualLink(1,List.of("2026-10-10"),"no"))),"manual reference missing region");
  bad(()->FloorplanRules.geometry(geo(a,a)),"duplicate region ids");
  bad(()->FloorplanRules.geometry(geo(new Shape("a","B1",List.of(new Point(-.1,0),new Point(1,0),new Point(0,1)),"READABLE",true))),"negative coordinate");
  bad(()->FloorplanRules.geometry(geo(new Shape("a","B1",List.of(new Point(Double.NaN,0),new Point(1,0),new Point(0,1)),"READABLE",true))),"NaN coordinate");
  bad(()->FloorplanRules.geometry(geo(new Shape("a","B1",List.of(new Point(0,0),new Point(1,1),new Point(1,0),new Point(0,1)),"READABLE",true))),"crossing polygon");
  bad(()->FloorplanRules.geometry(geo(new Shape("a","B1",a.points(),null,true))),"null recognition");
  bad(()->FloorplanRules.scope(scope(null,"2026-10-10","2026-10-10")),"duplicate dates");
  bad(()->FloorplanRules.scope(scope(null,"2026-99-10")),"invalid date");
  ok(FloorplanRules.map(new Geometry("test",false,List.of(a),List.of()),s,rs,Map.of()).issues().size()>0,"partial extraction warning");
  var now=Instant.parse("2026-09-16T00:00:00Z");var today=LocalDate.parse("2026-09-16");
  ok(FloorplanRules.nextCheck(today,today.plusDays(5),today.plusDays(6),"NOT_FOUND",null,now).equals(now.plusSeconds(86400)),"imminent maps daily");
  ok(FloorplanRules.nextCheck(today,today.plusDays(30),today.plusDays(31),"NOT_FOUND",null,now).equals(now.plusSeconds(7*86400)),"distant maps weekly");
  ok(FloorplanRules.nextCheck(today,today.plusDays(30),today.plusDays(31),"ERROR",null,now).equals(now.plusSeconds(6*3600)),"failure separate from missing");
  ok(FloorplanRules.nextCheck(today,today.plusDays(30),today.plusDays(31),"ANNOUNCED",today.plusDays(2),now).isBefore(now.plusSeconds(7*86400)),"announced release earlier than weekly");
  byte[] png=new byte[24];png[18]=3;png[19]=(byte)232;png[22]=2;png[23]=(byte)188;ok(Arrays.equals(FloorplanImageInfo.size(png,"image/png"),new int[]{1000,700}),"server original dimension parser");
  bad(()->FloorplanImageInfo.size(new byte[4],"image/webp"),"truncated webp");
  bad(()->FloorplanImageInfo.size(new byte[24],"image/png"),"zero dimension");
  System.out.println("PASS "+count+" floorplan pure rule conditions. No real DB/LLM.");
 }
}
