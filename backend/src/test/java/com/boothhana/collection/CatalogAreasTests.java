package com.boothhana.collection;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class CatalogAreasTests {
 @Test void groupedDistrictsAreCompleteAndSqlParameterized(){
  assertEquals(25,CatalogAreas.DISTRICTS.size());assertEquals(25,CatalogAreas.GROUPS.values().stream().mapToInt(List::size).sum());
  var q=new CatalogBrowseQuery(0,20,"SUBCULTURE","","","","","DATE_ASC","SEOUL","NORTHWEST,CENTRAL");
  assertTrue(q.whereSql().contains("jsonb_array_elements_text"));assertFalse(q.whereSql().contains("마포구"));
  assertEquals(new CatalogBrowseQuery(0,20,"SUBCULTURE","","","","","DATE_ASC","SEOUL").whereArgs().size()+12,q.whereArgs().size()); // region + 6 districts in explicit/fallback alternatives
  assertThrows(IllegalArgumentException.class,()->new CatalogBrowseQuery(0,20,"SUBCULTURE","","","","","RECENT","GYEONGGI","CENTRAL"));
  assertThrows(IllegalArgumentException.class,()->CatalogAreas.selected("CENTRAL,CENTRAL"));
  assertThrows(IllegalArgumentException.class,()->CatalogAreas.selected("CENTRAL');drop table"));
 }
 @Test void unknownLocationsAndMultiVenueFactsRemainRepresentable(){
  assertDoesNotThrow(()->CatalogAreas.validate("SEOUL",List.of()));
  assertDoesNotThrow(()->CatalogAreas.validate("SEOUL",List.of("중구","종로구")));
  assertThrows(IllegalArgumentException.class,()->CatalogAreas.validate("GYEONGGI",List.of("중구")));
 }
}
