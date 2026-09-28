package com.boothhana.floorplan;

import org.junit.jupiter.api.Test;
import java.util.*;
import static com.boothhana.floorplan.FloorplanModels.*;
import static org.junit.jupiter.api.Assertions.*;

class FloorplanFacilityRulesTests {
 private static List<Point> box(double x,double y){return List.of(new Point(x,y),new Point(x+.1,y),new Point(x+.1,y+.1),new Point(x,y+.1));}

 @Test void facilitiesArePublishedButNeverCountedAsUnresolvedBooths(){
  var booth=new Shape("booth-a1","A-01",box(.1,.1),"READABLE",true,"BOOTH");
  var restroom=new Shape("facility-wc","화장실",box(.4,.4),"READABLE",true,"RESTROOM");
  var geometry=new Geometry("test",true,List.of(booth,restroom),List.of());
  var scope=new PlanScope("1관",null,List.of("2026-10-03"),"1관 배치도");
  var roster=List.of(new Roster(7,"참가자",List.of(new Place("A-01","1관",null,List.of("2026-10-03"),null))));

  var mapping=FloorplanRules.map(geometry,scope,roster,Map.of());

  assertEquals(1,mapping.matched());
  assertEquals(0,mapping.unresolved());
  assertEquals("FACILITY",mapping.shapes().get(1).status());
  assertEquals("RESTROOM",mapping.shapes().get(1).shape().mapKind());
  assertTrue(mapping.shapes().get(1).links().isEmpty());
 }

 @Test void uniqueCodeLinksWhenCollectedParticipantHasNoHall(){
  var booth=new Shape("booth-a1","A-01",box(.1,.1),"READABLE",true,"BOOTH");
  var geometry=new Geometry("test",true,List.of(booth),List.of());
  var scope=new PlanScope("1관",null,List.of("2026-10-03"),"1관 배치도");
  var roster=List.of(new Roster(7,"참가자",List.of(new Place("A-01",null,null,List.of("2026-10-03"),null))));

  var mapping=FloorplanRules.map(geometry,scope,roster,Map.of());

  assertEquals(1,mapping.matched());
  assertEquals("UNIQUE_CODE",mapping.shapes().getFirst().links().getFirst().method());
 }

 @Test void conflictingKnownHallNeverAutoLinks(){
  var booth=new Shape("booth-a1","A-01",box(.1,.1),"READABLE",true,"BOOTH");
  var geometry=new Geometry("test",true,List.of(booth),List.of());
  var scope=new PlanScope("1관",null,List.of("2026-10-03"),"1관 배치도");
  var roster=List.of(new Roster(7,"참가자",List.of(new Place("A-01","2관",null,List.of("2026-10-03"),null))));

  var mapping=FloorplanRules.map(geometry,scope,roster,Map.of());

  assertEquals(0,mapping.matched());
  assertEquals("UNMAPPED",mapping.shapes().getFirst().status());
 }
}
