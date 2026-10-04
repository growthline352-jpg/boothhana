package com.boothhana.collection;
import java.util.*;
/** v18 explicit wire taxonomy. Keeps old subculture IDs/tables, not names-based classification. */
public final class CatalogTaxonomy {
 private CatalogTaxonomy() {}
 public static final Map<String,List<String>> GROUPS=com.boothhana.interests.TaxonomyRegistry.FIELDS.stream()
  .collect(java.util.stream.Collectors.toUnmodifiableMap(f->f.code(),f->f.types().stream().map(t->t.code()).toList()));
 public static final Set<String> TYPES=Set.copyOf(GROUPS.values().stream().flatMap(Collection::stream).toList());
 public static final Set<String> REGIONS=Set.of("SEOUL","GYEONGGI");
 public static final Set<String> SCOPES=Set.of("SEOUL","GYEONGGI","SEOUL_GYEONGGI");
 public static String category(String type){return GROUPS.entrySet().stream().filter(x->x.getValue().contains(type)).map(Map.Entry::getKey).findFirst().orElse(null);}
 /** Discovery can share an event without changing its canonical category or identity. */
 public static List<String> browseTypes(String category){
  var types=new ArrayList<>(GROUPS.get(category));
  if("POPUP".equals(category))types.add("POPUP_STORE");
  if("SUBCULTURE".equals(category))types.addAll(GROUPS.get("POPUP"));
  return types;
 }
 public static String scopeSql(String category,String eventJson,List<Object> args){
  var types=category==null||category.isEmpty()?new ArrayList<>(TYPES):new ArrayList<>(GROUPS.get(category));
  if("POPUP".equals(category))types.add("POPUP_STORE");
  args.addAll(types);
  String direct=eventJson+"->>'subcategory' in ("+String.join(",",Collections.nCopies(types.size(),"?"))+")";
  if(!"SUBCULTURE".equals(category))return direct;
  var popupTypes=GROUPS.get("POPUP");args.addAll(popupTypes);
  var topics=List.of("CHARACTER_IP","ANIME_MANGA","GAME","VTUBER","VOCALOID","ILLUSTRATION");args.addAll(topics);
  return "("+direct+" or ("+eventJson+"->>'subcategory' in ("+String.join(",",Collections.nCopies(popupTypes.size(),"?"))+") and exists(select 1 from jsonb_array_elements_text(coalesce("+eventJson+"->'subjects','[]'::jsonb)) subject(value) where upper(trim(subject.value)) in ("+String.join(",",Collections.nCopies(topics.size(),"?"))+"))))";
 }
 public static String subtypeSql(String category,String subtype,String eventJson,List<Object> args){
  args.add(subtype);
  if("POPUP".equals(category)&&"POPUP_RETAIL".equals(subtype)){
   args.add("POPUP_STORE");return eventJson+"->>'subcategory' in (?,?)";
  }
  if("SUBCULTURE".equals(category)&&"POPUP_STORE".equals(subtype)){
   var popupTypes=GROUPS.get("POPUP");args.addAll(popupTypes);
   return eventJson+"->>'subcategory' in ("+String.join(",",Collections.nCopies(1+popupTypes.size(),"?"))+")";
  }
  return eventJson+"->>'subcategory'=?";
 }
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
