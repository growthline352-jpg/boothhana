package com.boothhana.collection;
import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.time.*;
import static com.boothhana.collection.CollectionModels.*;
@Service @Transactional(readOnly=true)
public class CatalogDiscoveryService {
 private final JdbcTemplate db;private final CatalogPublicationService publications;
 public CatalogDiscoveryService(JdbcTemplate db,CatalogPublicationService publications){this.db=db;this.publications=publications;}
 static final String SUMMARY="select p.event_id,p.snapshot_json->'event' event_json,p.published_at,0 participant_count from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id ";
 public List<Map<String,Object>> compare(String ids){
  if(ids==null||!ids.matches("[1-9][0-9]{0,15}(,[1-9][0-9]{0,15})?"))throw ApiException.badRequest("행사 1~2개를 선택하세요.");
  var selected=Arrays.stream(ids.split(",")).map(Long::parseLong).distinct().toList();
  var rows=db.queryForList(SUMMARY+"where e.review_state<>'EXCLUDED' and p.event_id in ("+String.join(",",Collections.nCopies(selected.size(),"?"))+")",selected.toArray());
  var result=new ArrayList<>(publications.summaries(rows));result.sort(Comparator.comparingInt(r->selected.indexOf(((Number)r.get("id")).longValue())));
  Set<Long> seen=new HashSet<>();
  result.removeIf(item->{var group=(CatalogOperatingGroups.PublicGroup)item.get("operatingGroup");return !seen.add(group==null?((Number)item.get("id")).longValue():group.rootEventId());});
  for(var item:result){
   if(!(item.get("operatingGroup") instanceof CatalogOperatingGroups.PublicGroup group)){
    item.put("operatingPlaces",List.of(Map.of("eventId",item.get("id"),"event",item.get("event"))));
    continue;
   }
   EventData e=(EventData)item.get("event");var dates=group.members().stream().flatMap(m->m.occurrences().stream()).distinct().sorted(Comparator.comparing(Occurrence::startDate)).toList();
   // Keep all published operating days; each location stays identifiable in the group metadata.
   item.put("event",new EventData(group.name(),e.subcategory(),e.organizer(),e.edition(),e.region(),e.venueName(),e.address(),e.description(),e.admission(),e.subjects(),dates,e.sources(),e.banners(),e.warnings(),e.eventFormat(),e.discoveryLinks(),e.operationStatus(),e.visitorGuide(),e.districts()));
   var memberIds=group.members().stream().map(CatalogOperatingGroups.Member::eventId).toList();
   var members=publications.summaries(db.queryForList(SUMMARY+"where e.review_state<>'EXCLUDED' and p.event_id in ("+String.join(",",Collections.nCopies(memberIds.size(),"?"))+")",memberIds.toArray()));
   item.put("operatingPlaces",members.stream().map(member->{EventData v=(EventData)member.get("event");var place=new LinkedHashMap<String,Object>();place.put("eventId",member.get("id"));place.put("event",v);return place;}).toList());
  }
  return result;
 }
 public Map<String,Object> popups(String from,String to,String neighborhood){
  try{var a=LocalDate.parse(from);var b=LocalDate.parse(to);if(b.isBefore(a)||a.plusDays(31).isBefore(b))throw new IllegalArgumentException();}catch(RuntimeException e){throw ApiException.badRequest("31일 이내의 유효한 기간을 선택하세요.");}
  if(!Set.of("","SEONGSU","YEONNAM").contains(neighborhood))throw ApiException.badRequest("동네 선택 오류");
  var args=new ArrayList<Object>();String scope=CatalogTaxonomy.scopeSql("POPUP","p.snapshot_json->'event'",args);
  String where="e.review_state<>'EXCLUDED' and "+scope+" and p.snapshot_json->'event'->>'region'='SEOUL' and exists(select 1 from jsonb_array_elements(p.snapshot_json->'event'->'occurrences') d where d->>'endDate'>=? and d->>'startDate'<=?)";
  args.add(from);args.add(to);
  String join="left join catalog_event_place l on l.event_id=p.event_id and l.address=p.snapshot_json->'event'->>'address' left join catalog_operating_group_member m on m.event_id=p.event_id ";
  if(!neighborhood.isEmpty()){where+=" and l.neighborhood=?";args.add(neighborhood);}
  // Filter operating days/places before selecting one card per edition and applying the limit.
  String matched="select p.event_id,p.snapshot_json->'event' event_json,p.published_at,0 participant_count,row_number() over(partition by coalesce(m.root_event_id,p.event_id) order by case when p.event_id=m.root_event_id then 0 else 1 end,p.event_id) edition_row from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id "+join+"where "+where;
  var rows=db.queryForList("with matched as ("+matched+") select event_id,event_json,published_at,participant_count from matched where edition_row=1 order by (select min(d->>'startDate') from jsonb_array_elements(event_json->'occurrences') d),event_id limit 100",args.toArray());
  var items=publications.summaries(rows);var ids=rows.stream().map(r->r.get("event_id")).toList();
  var places=ids.isEmpty()?List.<Map<String,Object>>of():db.queryForList("select l.event_id,l.neighborhood,l.address,l.latitude,l.longitude,l.source_url,l.checked_on from catalog_event_place l join subculture_catalog_publication p on p.event_id=l.event_id join subculture_event_candidate e on e.id=l.event_id where e.review_state<>'EXCLUDED' and l.address=p.snapshot_json->'event'->>'address' and l.event_id in ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")",ids.toArray());
  long total=db.queryForObject("select count(distinct coalesce(m.root_event_id,p.event_id)) from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id "+join+"where "+where,Long.class,args.toArray());
  return Map.of("items",items,"places",places,"total",total,"limit",100);
 }
}
