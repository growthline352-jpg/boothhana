package com.boothhana.interests;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;

/** Called inside the graph verdict transaction, so publication and inbox either both commit or neither do. */
public final class InterestNews {
 private final JdbcTemplate db;
 public InterestNews(JdbcTemplate db){this.db=db;}
 public void product(UUID product,boolean baseline){
  var rows=db.queryForList("select p.exhibitor_id,p.data_json->>'name' as name,p.data_json->>'evidenceScope' as scope from collection_product p join collection_creator_publication c on c.exhibitor_id=p.exhibitor_id and c.active where p.id=? and p.active and p.verdict_id is not null",product);
  if(rows.isEmpty())return;var p=rows.getFirst();boolean suppress=baseline||"PAST_REFERENCE".equals(p.get("scope"));
  emit("PRODUCT",product.toString(),null,((Number)p.get("exhibitor_id")).longValue(),"관심 작가의 상품 정보가 확인됐어요",suppress);
  for(var r:db.queryForList("select s.id from collection_product_subject ps join subculture_subject s on s.id=ps.subject_id join subculture_subject w on w.id=s.work_id where ps.product_id=? and ps.active and s.active and w.active",product))emit("PRODUCT",product.toString(),(UUID)r.get("id"),null,"관심 캐릭터의 상품 정보가 확인됐어요",suppress);
 }
 public void event(long event,boolean baseline){
  // A verdict may touch one product in a large event. Record the current event
  // facts in one round trip, including baseline and already-known facts, rather
  // than holding the publication transaction through one INSERT per creator.
  var facts=new ArrayList<>(db.queryForList("""
   with visible as (
    select p.event_id,p.snapshot_json from subculture_catalog_publication p
    join subculture_event_candidate e on e.id=p.event_id
    where e.id=? and e.review_state<>'EXCLUDED'
     and coalesce(p.snapshot_json->'event'->'operationStatus'->>'state','UNKNOWN') not in ('CANCELED','POSTPONED')
     and exists(select 1 from jsonb_array_elements(p.snapshot_json->'event'->'occurrences') d
                where d->>'endDate'>=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'))
   ), candidates as (
    select distinct l.subject_id,null::bigint creator_id from subculture_subject_link l
    join subculture_subject s on s.id=l.subject_id left join subculture_subject w on w.id=s.work_id
    join visible pub on pub.event_id=l.event_id
    where l.active and s.active and (w.id is null or w.active) and
   """+NotificationFacts.EVENT_LINK+"""
    union all
    select distinct null::uuid subject_id,pm.exhibitor_id creator_id from subculture_participant p
    join subculture_participant_member pm on pm.participant_id=p.id
    join subculture_exhibitor e on e.id=pm.exhibitor_id join visible pub on pub.event_id=p.event_id
    where p.review_state<>'EXCLUDED'
     and not exists(select 1 from collection_creator_publication c where c.exhibitor_id=e.id and not c.active)
     and exists(select 1 from jsonb_array_elements(pub.snapshot_json->'participants') x,
                             jsonb_array_elements(x->'participant'->'members') m
                where x->>'id'=p.id::text and m->>'name'=e.profile_json->>'name'
                 and m->>'profileUrl' is not distinct from e.profile_json->>'profileUrl')
   )
   insert into subculture_news_fact(id,identity_key,kind,target_id,subject_id,creator_id,baseline)
   select gen_random_uuid(),'EVENT:'||cast(? as text)||':'||
          case when subject_id is not null then 'subject:'||subject_id else 'creator:'||creator_id end,
          'EVENT',?,subject_id,creator_id,? from candidates
   on conflict(identity_key) do nothing returning id,subject_id
   """,event,Long.toString(event),Long.toString(event),baseline));
  if(baseline)return;
  // Preserve subject-before-creator notification selection for a shared fan.
  facts.sort(Comparator.comparing(fact->fact.get("subject_id")==null));
  for(var fact:facts)notifyFact((UUID)fact.get("id"),"EVENT",Long.toString(event),
      fact.get("subject_id")==null?"관심 작가의 행사 참가가 확인됐어요":"관심 대상과 관련된 행사가 확인됐어요");
 }
 private void emit(String kind,String target,UUID subject,Long creator,String title,boolean baseline){
  String key=kind+":"+target+":"+(subject==null?"creator:"+creator:"subject:"+subject);UUID fact=UUID.randomUUID();
  if(db.update("insert into subculture_news_fact(id,identity_key,kind,target_id,subject_id,creator_id,baseline) values(?,?,?,?,?,?,?) on conflict(identity_key) do nothing",fact,key,kind,target,subject,creator,baseline)==0||baseline)return;
  notifyFact(fact,kind,target,title);
 }
 private void notifyFact(UUID fact,String kind,String target,String title){
  var users=db.queryForList("select distinct i.user_id from subculture_interest i join subculture_news_fact f on f.id=? where "+NotificationFacts.MATCHES,Long.class,fact);
  for(long user:users){UUID id=UUID.randomUUID();if(db.update("insert into subculture_notification(id,user_id,fact_id,dedupe_key,title,href) values(?,?,?,?,?,?) on conflict(user_id,dedupe_key) do nothing",id,user,fact,kind+":"+target,title,kind.equals("EVENT")?"/discover/"+target:"/subculture/products/"+target)>0)
   db.update("insert into subculture_push_delivery(notification_id,subscription_id) select ?,id from subculture_push_subscription where user_id=? and active on conflict do nothing",id,user);
  }
 }
}
