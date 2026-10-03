package com.boothhana.collection;
import java.util.*;
/** Stable display groups; the underlying administrative districts remain intact. */
public final class CatalogAreas {
 private CatalogAreas(){}
 public static final Map<String,List<String>> GROUPS;
 public static final Set<String> DISTRICTS;
 static {
  var map=new LinkedHashMap<String,List<String>>();
  map.put("GANGNAM_SEOCHO",List.of("강남구","서초구"));map.put("SONGPA_GANGDONG",List.of("송파구","강동구"));
  map.put("NORTHWEST",List.of("마포구","서대문구","은평구"));map.put("CENTRAL",List.of("종로구","중구","용산구"));
  map.put("SEONGDONG_GWANGJIN",List.of("성동구","광진구"));map.put("GANGSEO_YANGCHEON",List.of("강서구","양천구"));
  map.put("SOUTHWEST",List.of("영등포구","구로구","금천구"));map.put("DONGJAK_GWANAK",List.of("동작구","관악구"));
  map.put("NORTHEAST",List.of("동대문구","성북구","중랑구","강북구","도봉구","노원구"));
  GROUPS=Collections.unmodifiableMap(map);DISTRICTS=Set.copyOf(map.values().stream().flatMap(List::stream).toList());
 }
 public static List<String> selected(String areas){
  if(areas==null||areas.isBlank())return List.of();
  var codes=Arrays.asList(areas.split(",",-1));
  if(codes.size()>9||codes.stream().anyMatch(c->!GROUPS.containsKey(c))||new HashSet<>(codes).size()!=codes.size())throw new IllegalArgumentException("서울 세부 지역을 확인해 주세요.");
  return codes.stream().flatMap(c->GROUPS.get(c).stream()).toList();
 }
 public static void validate(String region,List<String> districts){
  if(districts.size()>25||new HashSet<>(districts).size()!=districts.size()||districts.stream().anyMatch(d->!DISTRICTS.contains(d))||!districts.isEmpty()&&!"SEOUL".equals(region))throw new IllegalArgumentException("서울 구 정보와 개최 지역을 확인해 주세요.");
 }
 public static String filterSql(String event,List<String> districts,List<Object> args){
  if(districts.isEmpty())return "true";
  args.addAll(districts);args.addAll(districts);
  String marks=String.join(",",Collections.nCopies(districts.size(),"?"));
  // Explicit reviewed multi-venue districts take precedence; legacy addresses remain searchable.
  return "("+event+"->>'region'='SEOUL' and (exists(select 1 from jsonb_array_elements_text(coalesce(nullif("+event+"->'districts','null'::jsonb),'[]'::jsonb)) ds(value) where ds.value in ("+marks+")) or (jsonb_array_length(coalesce(nullif("+event+"->'districts','null'::jsonb),'[]'::jsonb))=0 and exists(select 1 from unnest(array["+marks+"]::text[]) ds(value) where coalesce("+event+"->>'address','') ~ ('(^|[[:space:]])'||ds.value||'([[:space:]]|$)')))))";
 }
}
