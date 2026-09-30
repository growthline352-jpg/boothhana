package com.boothhana.collection;
import java.util.*;
/** v18 explicit wire taxonomy. Keeps old subculture IDs/tables, not names-based classification. */
public final class CatalogTaxonomy {
 private CatalogTaxonomy() {}
 public static final Map<String,List<String>> GROUPS=Map.of(
  "SUBCULTURE",List.of("COMIC_DOUJIN","DOLL","ONLY_EVENT","BIRTHDAY_CAFE","STATIONERY_GOODS","SUBCULTURE_MUSIC"),
  "EXHIBITION",List.of("WINE","WEDDING","LIFESTYLE","DESIGN","BUSINESS"),
  "FESTIVAL",List.of("WALK","LIGHT","MUSIC","FOOD","CULTURE"));
 public static final Set<String> TYPES=Set.copyOf(GROUPS.values().stream().flatMap(Collection::stream).toList());
 public static final Set<String> REGIONS=Set.of("SEOUL","GYEONGGI");
 public static final Set<String> SCOPES=Set.of("SEOUL","GYEONGGI","SEOUL_GYEONGGI");
 public static String category(String type){return GROUPS.entrySet().stream().filter(x->x.getValue().contains(type)).map(Map.Entry::getKey).findFirst().orElse(null);}
 public static boolean addressMatches(String region,String address){
  if(address==null||address.isBlank())return true;String a=address.strip();
  return "SEOUL".equals(region)?a.startsWith("서울특별시")||a.startsWith("서울 "):
    "GYEONGGI".equals(region)&&(a.startsWith("경기도")||a.startsWith("경기 "));
 }
 public static boolean placeMatches(String region,String place){
  String p=CollectionRules.normalize(place);
  if(p.contains("인천")||p.contains("송도컨벤시아")||p.contains("songdoconvensia"))return false;
  return "GYEONGGI".equals(region)||!(p.contains("킨텍스")||p.contains("kintex")||p.contains("수원메쎄")||p.contains("수원컨벤션")||p.contains("suwonmesse"));
 }
}
