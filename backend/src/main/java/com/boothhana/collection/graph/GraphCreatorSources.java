package com.boothhana.collection.graph;

import com.boothhana.collection.CollectionRules;
import com.boothhana.interests.InterestRules;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.util.*;
import static com.boothhana.collection.graph.GraphProjection.*;
import static com.boothhana.collection.graph.GraphService.*;

/** Reuse published booth provenance and the reviewed creator JSON; no ID migration. */
final class GraphCreatorSources {
 static List<Map<String,Object>> provenance(JdbcTemplate db,JsonMapper json,long id){
  return db.queryForList("""
   select jsonb_build_object('eventId',ev.id,'participantId',part.id,'eventName',pub.snapshot_json->'event'->>'name','endsOn',ev.ends_on,
    'registrationName',person->'participant'->'registrationName','member',member,
    'officialLinks',person->'participant'->'officialLinks','sources',person->'participant'->'sources',
    'eventSources',pub.snapshot_json->'event'->'sources') data
   from subculture_participant_member pm join subculture_participant part on part.id=pm.participant_id
   join subculture_event_candidate ev on ev.id=part.event_id
   join subculture_catalog_publication pub on pub.event_id=part.event_id
   cross join lateral jsonb_array_elements(coalesce(pub.snapshot_json->'participants','[]'::jsonb)) person
   cross join lateral jsonb_array_elements(coalesce(person->'participant'->'members','[]'::jsonb)) member
   where pm.exhibitor_id=? and part.review_state<>'EXCLUDED' and ev.review_state<>'EXCLUDED' and not ev.publication_withdrawn and ev.subcategory in (%s)
    and person->>'id'=part.id::text and member->>'name' is not distinct from (select profile_json->>'name' from subculture_exhibitor where id=?)
    and member->>'profileUrl' is not distinct from (select profile_json->>'profileUrl' from subculture_exhibitor where id=?)
   order by pub.published_at desc,part.id limit 50
   """.formatted(com.boothhana.interests.SubcultureScope.SQL),id,id,id).stream().map(row->{@SuppressWarnings("unchecked") Map<String,Object> value=json.readValue(row.get("data").toString(),Map.class);return value;}).toList();
 }
 static List<Map<String,Object>> participantCreators(JdbcTemplate db,JsonMapper json,long participant){
  return db.queryForList("select e.id,coalesce(cp.data_json,e.profile_json) data from subculture_participant_member pm join subculture_exhibitor e on e.id=pm.exhibitor_id left join collection_creator_publication cp on cp.exhibitor_id=e.id where pm.participant_id=? and coalesce(cp.active,true) order by e.id",participant)
   .stream().map(row->{@SuppressWarnings("unchecked") Map<String,Object> value=json.readValue(row.get("data").toString(),Map.class);var copy=new LinkedHashMap<>(value);copy.put("id",row.get("id"));return (Map<String,Object>)copy;}).toList();
 }
 static String accountUrl(String value){
  CollectionRules.url(value);URI u=URI.create(value);String host=u.getHost().toLowerCase(),path=Objects.toString(u.getPath(),"").replaceAll("/+$","");
  require(u.getScheme().equals("https")&&u.getRawQuery()==null&&u.getRawFragment()==null&&(u.getPort()==-1||u.getPort()==443),"SNS 프로필 URL 형식 오류");
  if(Set.of("x.com","www.x.com","twitter.com","www.twitter.com").contains(host)){
   require(path.matches("/[A-Za-z0-9_]{1,15}")&&!Set.of("home","explore","search","intent","settings","i").contains(path.substring(1).toLowerCase()),"X 프로필 URL 형식 오류");host="x.com";path=path.toLowerCase();
  }else if(host.equals("bsky.app"))require(path.matches("/profile/((?:[A-Za-z0-9-]+\\.)+[A-Za-z0-9-]+|did:plc:[a-z0-9]+)"),"Bluesky 프로필 URL 형식 오류");
  else if(Set.of("instagram.com","www.instagram.com").contains(host)){require(path.matches("/[A-Za-z0-9_.]{1,30}")&&!Set.of("p","reel","reels","explore","accounts","direct").contains(path.substring(1).toLowerCase()),"인스타그램 프로필 URL 형식 오류");host="www.instagram.com";path=path.toLowerCase();}
  else if(host.equals("postype.com")||host.equals("www.postype.com"))require(path.matches("/@[A-Za-z0-9_.-]+(?:/profile)?"),"포스타입 프로필 URL 형식 오류");
  else if(host.endsWith(".postype.com"))require(path.isEmpty(),"포스타입 프로필 URL 형식 오류");
  else require(false,"지원하지 않는 SNS 프로필입니다.");
  return "https://"+host+path;
 }
 static List<Map<String,Object>> merge(Map<String,Object> context,Object incoming){
  var previous=maps(map(map(context.get("publication")).get("data")).get("socialAccounts"));
  var accounts=new LinkedHashMap<String,Map<String,Object>>();for(var old:previous)accounts.put(accountUrl(text(old.get("profileUrl"))),old);
  var anchors=new HashSet<String>();String original=text(map(map(context.get("creator")).get("data")).get("profileUrl"));if(!original.isBlank())anchors.add(normalizedUrl(original));
  for(var p:maps(context.get("creatorProvenance")))for(var source:maps(p.get("sources")))if("ORIGINAL".equals(source.get("access")))anchors.add(normalizedUrl(text(source.get("url"))));
  var supplied=maps(incoming);require(supplied.size()<=20,"SNS 계정 수 초과");var seen=new HashSet<String>();
  for(var account:supplied){String url=accountUrl(text(account.get("profileUrl")));require(seen.add(url),"SNS 계정 중복");
   var evidence=maps(account.get("identityEvidence"));require(!evidence.isEmpty()&&evidence.size()<=10,"SNS 계정 동일성 근거가 필요합니다.");var sources=new HashSet<String>();
   for(var proof:evidence){InterestRules.text(text(proof.get("evidence")),1000,true);sources.add(normalizedUrl(text(proof.get("sourceUrl"))));}
   require(sources.stream().anyMatch(s->{try{return accountUrl(s).equals(url);}catch(RuntimeException ignored){return false;}}),"SNS 계정 원문 근거가 필요합니다.");
   require(sources.stream().anyMatch(anchors::contains),"기존 작가 또는 공식 부스와의 연결 근거가 필요합니다.");
   Object providerId=account.get("accountId");if(providerId!=null)require(providerId instanceof String&&text(providerId).length()<=200&&!text(providerId).isBlank(),"SNS 계정 ID 오류");
   String action=Objects.toString(account.get("action"),"KEEP");require(Set.of("KEEP","UNLINK").contains(action),"SNS 계정 판정 오류");var old=accounts.get(url);
   if(action.equals("UNLINK")){require(old!=null,"등록되지 않은 SNS 계정을 해제할 수 없습니다.");var inactive=new LinkedHashMap<>(old);inactive.put("active",false);inactive.put("unlinkEvidence",evidence);accounts.put(url,inactive);continue;}
   if(old!=null&&old.get("accountId")!=null){require(providerId==null||old.get("accountId").equals(providerId),"SNS 계정의 소유자 ID가 변경됐습니다.");providerId=old.get("accountId");}
   var checked=new LinkedHashMap<String,Object>();checked.put("profileUrl",url);checked.put("identityEvidence",evidence);checked.put("accountId",providerId);checked.put("active",true);checked.put("historyComplete",old!=null&&Boolean.TRUE.equals(old.get("historyComplete")));if(old!=null)for(String key:List.of("latestPostId","scanHeadPostId","scanCycle"))if(old.containsKey(key))checked.put(key,old.get(key));accounts.put(url,checked);
  }
  require(accounts.size()<=20,"SNS 계정 수 초과");return List.copyOf(accounts.values());
 }
 static String feedUrl(String profile){return profile+"?bh_feed=1";}
 static boolean salePost(String url){
  URI u=URI.create(url);String host=Objects.toString(u.getHost(),"").toLowerCase(),path=Objects.toString(u.getPath(),"");
  return Set.of("x.com","www.x.com","twitter.com","www.twitter.com").contains(host)&&path.matches("/[A-Za-z0-9_]{1,15}/status/[0-9]{1,25}")||host.equals("bsky.app")&&path.matches("/profile/[^/]+/post/[A-Za-z0-9]+")||(host.equals("postype.com")||host.endsWith(".postype.com"))&&path.matches(".*/post/[0-9]+/?");
 }
 static String sourceAccount(String url){try{var u=URI.create(url);String host=Objects.toString(u.getHost(),"").toLowerCase(),path=Objects.toString(u.getPath(),"");if(Set.of("x.com","www.x.com","twitter.com","www.twitter.com").contains(host)&&path.matches("/[A-Za-z0-9_]{1,15}(?:/status/[0-9]{1,25})?/?"))return accountUrl("https://"+host+"/"+path.split("/")[1]);if(host.equals("bsky.app")&&path.matches("/profile/[^/]+(?:/post/[A-Za-z0-9]+)?/?"))return accountUrl("https://"+host+"/profile/"+path.split("/")[2]);if((host.equals("postype.com")||host.equals("www.postype.com"))&&path.matches("/@[A-Za-z0-9_.-]+(?:/post/[0-9]+|/profile)?/?"))return accountUrl("https://"+host+"/"+path.split("/")[1]);if(host.endsWith(".postype.com")&&!host.equals("www.postype.com"))return accountUrl("https://"+host);return null;}catch(RuntimeException ignored){return null;}}
 static String pageAccount(String page){var u=URI.create(page);return accountUrl("https://"+u.getHost()+u.getRawPath());}
 static List<Map<String,Object>> checkpoint(List<Map<String,Object>> accounts,Map<String,Object> input,Map<String,Object> result){
  var receipt=map(result.get("socialPageReceipt"));if(receipt.isEmpty())return accounts;
  require(Boolean.TRUE.equals(input.get("socialPage"))&&Objects.equals(input.get("pageUrl"),receipt.get("sourceUrl")),"SNS 페이지 근거 오류");
  String profile=pageAccount(text(input.get("pageUrl"))),cycle=text(input.get("socialCycle"));require(!cycle.isBlank()&&profile.equals(accountUrl(text(receipt.get("profileUrl")))),"SNS 페이지 대상 오류");
  boolean complete=!Boolean.FALSE.equals(result.get("socialPageComplete"));require(complete?Objects.equals(result.get("nextPageUrl"),receipt.get("nextPageUrl")):text(result.get("nextPageUrl")).isBlank(),"SNS 후속 페이지 근거 오류");String head=text(receipt.get("headPostId"));require(head.isBlank()||head.matches("[A-Za-z0-9]{1,100}"),"SNS 게시글 ID 오류");
  String next=text(receipt.get("nextPageUrl"));if(!next.isBlank()){CollectionRules.url(next);require(profile.equals(pageAccount(next))&&Objects.toString(URI.create(next).getRawQuery(),"").matches("bh_feed=1&bh_cursor=[^&]+"),"SNS 커서가 다른 계정으로 변경됐습니다.");}
  require(accounts.stream().anyMatch(a->profile.equals(a.get("profileUrl"))&&Objects.equals(a.get("accountId"),receipt.get("accountId"))),"검토된 SNS 소유자와 다릅니다.");
  return accounts.stream().map(a->{var copy=new LinkedHashMap<>(a);if(profile.equals(a.get("profileUrl"))){
   if(!cycle.equals(copy.get("scanCycle"))){copy.put("scanCycle",cycle);copy.remove("scanHeadPostId");}
   if(!head.isBlank()&&!copy.containsKey("scanHeadPostId"))copy.put("scanHeadPostId",head);
   if(complete&&"COMPLETE".equals(result.get("coverage"))&&text(result.get("nextPageUrl")).isBlank()){copy.put("historyComplete",true);if(copy.containsKey("scanHeadPostId"))copy.put("latestPostId",copy.get("scanHeadPostId"));copy.remove("scanHeadPostId");copy.remove("scanCycle");}
  }return (Map<String,Object>)copy;}).toList();
 }
}
