package com.boothhana.interests;
import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogPublicationService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.boothhana.interests.SubcultureInterestService.*;
@Service @Transactional(readOnly=true)
public class InterestFeed {
 private final JdbcTemplate db;private final SubcultureInterestService interests;private final CatalogPublicationService publications;
 public InterestFeed(JdbcTemplate db,SubcultureInterestService interests,CatalogPublicationService publications){this.db=db;this.interests=interests;this.publications=publications;}
 public Map<String,Object> home(Long owner,UUID interestId,UUID subjectId,Long creatorId,int page){
  if(page<0||page>1000||subjectId!=null&&creatorId!=null)throw ApiException.badRequest("조회 조건을 확인해 주세요.");
  Set<UUID> subjectIds=new LinkedHashSet<>();Set<Long> creatorIds=new LinkedHashSet<>();boolean personal=false;
  if(subjectId!=null){interests.subject(subjectId);subjectIds.add(subjectId);personal=true;}
  else if(creatorId!=null){interests.creator(creatorId);creatorIds.add(creatorId);personal=true;}
  else if(owner!=null){var rows=interests.settings(owner).entries();if(interestId!=null&&!rows.stream().anyMatch(e->e.id().equals(interestId)))throw ApiException.notFound("관심 항목을 찾지 못했습니다.");for(var e:rows){if(interestId!=null&&!e.id().equals(interestId))continue;personal=true;if(e.subjectId()!=null)subjectIds.add(e.subjectId());if(e.exhibitorId()!=null)creatorIds.add(e.exhibitorId());}}
  creatorIds.addAll(interests.relatedCreatorIds(creatorIds));
  if(!subjectIds.isEmpty()){
   String marks=String.join(",",Collections.nCopies(subjectIds.size(),"?"));var ids=db.queryForList("select s.id from subculture_subject s left join subculture_subject w on w.id=s.work_id where s.active and (s.work_id is null or w.active) and (s.id in ("+marks+") or s.work_id in ("+marks+"))",UUID.class,concat(subjectIds,subjectIds));subjectIds=new LinkedHashSet<>(ids);
  }
  List<Map<String,Object>> links=subjectIds.isEmpty()?List.of():db.queryForList("select * from subculture_subject_link where active and subject_id in ("+String.join(",",Collections.nCopies(subjectIds.size(),"?"))+")",subjectIds.toArray());
  Set<Long> candidateEvents=new LinkedHashSet<>();for(var link:links)if(link.get("event_id")!=null)candidateEvents.add(number(link.get("event_id")));
  if(!creatorIds.isEmpty())candidateEvents.addAll(db.queryForList("select distinct p.event_id from subculture_participant p join subculture_participant_member pm on pm.participant_id=p.id where p.review_state<>'EXCLUDED' and pm.exhibitor_id in ("+String.join(",",Collections.nCopies(creatorIds.size(),"?"))+")",Long.class,creatorIds.toArray()));
  Set<Long> displayCreators=new LinkedHashSet<>(creatorIds);for(var link:links)if("CREATOR".equals(link.get("kind")))displayCreators.add(number(link.get("target_id")));
  // Validate every followed creator before applying the display limit.
  List<Map<String,Object>> matchedArtistRows=interests.creatorViews(displayCreators.stream().toList());
  List<Map<String,Object>> artistRows=interests.creatorCards(matchedArtistRows).stream().limit(20).toList();
  boolean unlinked=personal&&candidateEvents.isEmpty()&&artistRows.isEmpty();
  boolean general=!personal||unlinked;
  List<Object> args=new ArrayList<>();args.add(LocalDate.now(ZoneId.of("Asia/Seoul")).toString());
  String restrict="";if(!general){if(candidateEvents.isEmpty())restrict=" and false";else{restrict=" and pub.event_id in ("+String.join(",",Collections.nCopies(candidateEvents.size(),"?"))+")";args.addAll(candidateEvents);}}
  args.add(9);args.add(page*8);
  var ids=db.queryForList("""
   select pub.event_id from subculture_catalog_publication pub join subculture_event_candidate e on e.id=pub.event_id
   where e.review_state<>'EXCLUDED' and pub.snapshot_json->'event'->>'subcategory' in (%s)
   and coalesce(pub.snapshot_json->'event'->'operationStatus'->>'state','UNKNOWN') not in ('CANCELED','POSTPONED')
   and exists(select 1 from jsonb_array_elements(pub.snapshot_json->'event'->'occurrences') d where d->>'endDate'>=?)
   """.formatted(SubcultureScope.SQL)+restrict+" order by (select min(d->>'startDate') from jsonb_array_elements(pub.snapshot_json->'event'->'occurrences') d),pub.event_id limit ? offset ?",Long.class,args.toArray());
  List<Map<String,Object>> eventRows=new ArrayList<>(),productRows=new ArrayList<>();
  var details=publications.findPublicDetails(ids.stream().limit(8).toList());
  for(long id:ids.stream().limit(8).toList()){
   var event=details.get(id);if(event==null)continue;var evidence=links.stream().filter(l->number(l.get("event_id"))==id).toList();
   var reasons=new LinkedHashSet<String>();for(var l:evidence)if("EVENT".equals(l.get("kind"))&&interests.productLinkMatches(l,obj(event.get("event"))))reasons.add("작품·캐릭터 관련 행사");
   for(var participant:maps(event.get("participants"))){long pid=number(participant.get("id"));var person=obj(participant.get("participant"));
    var members=maps(person.get("members"));var matchedCreators=matchedArtistRows.stream().filter(c->creatorIds.contains(number(c.get("id")))&&members.stream().anyMatch(m->sameMember(c,m))).toList();
    if(!matchedCreators.isEmpty())reasons.add("관심 작가 참가 확인");
    if(participant.get("sales")==null||personal&&unlinked)continue;
    for(var row:maps(participant.get("productRows"))){long productId=number(row.get("id"));if(productId<1)continue;var product=obj(row.get("data"));
     boolean related=evidence.stream().anyMatch(l->"PRODUCT".equals(l.get("kind"))&&number(l.get("target_id"))==productId&&number(l.get("participant_id"))==pid&&interests.productLinkMatches(l,product));
     // Joint participation does not attribute every booth product to every member.
     boolean byCreator=matchedCreators.stream().anyMatch(c->Objects.equals(c.get("name"),product.get("memberName")));
     if(!general&&!related&&!byCreator)continue;
     if(!Set.of("EVENT_LISTED","EVENT_SALE_CONFIRMED").contains(Objects.toString(product.get("evidenceScope"),"")))continue;
     String status=saleLabel(product,obj(row.get("verification")));
     if(!general)reasons.add(status);
     var item=new LinkedHashMap<String,Object>();item.put("eventId",id);item.put("eventName",obj(event.get("event")).get("name"));item.put("participantId",pid);item.put("participantName",person.get("registrationName"));item.put("id",productId);item.put("data",product);item.put("verification",row.get("verification"));item.put("status",status);item.put("images",maps(event.get("assets")).stream().filter(a->number(a.get("productId"))==productId&&number(a.get("participantId"))==pid).toList());for(String field:List.of("imageUrl","imageSourceUrl","imageCredit"))item.put(field,row.get(field));if(productRows.size()<24)productRows.add(item);
    }
   }
   if(general||!reasons.isEmpty()){var summary=new LinkedHashMap<String,Object>();summary.put("id",id);summary.put("event",event.get("event"));summary.put("banner",event.get("banner"));summary.put("reasons",reasons);eventRows.add(summary);}
  }
  if(!personal&&page==0)artistRows=interests.creatorCards(interests.creators("",0)).stream().limit(8).toList();
  return Map.of("personalized",personal&&!unlinked,"unlinked",unlinked,"events",eventRows,"goods",productRows,"creators",artistRows,"page",page,"hasMore",ids.size()>8);
 }
 static String saleLabel(Map<String,Object> product,Map<String,Object> check){if("CANCELED".equals(product.get("saleState")))return "판매 취소";if("SOLD_OUT".equals(product.get("saleState")))return "품절 안내";if("NOT_RECONFIRMED".equals(check.get("state")))return "판매 정보 재확인 필요";return "EVENT_SALE_CONFIRMED".equals(product.get("evidenceScope"))&&"CONFIRMED_CURRENT".equals(check.get("state"))?"관심 굿즈 판매 확인":"관련 판매 정보 · 확인 필요";}
 private static Object[] concat(Collection<?> a,Collection<?> b){List<Object> all=new ArrayList<>(a);all.addAll(b);return all.toArray();}
}
