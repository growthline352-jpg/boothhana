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
  var rows=db.queryForList("select p.snapshot_json from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id where e.id=? and e.review_state<>'EXCLUDED' and coalesce(p.snapshot_json->'event'->'operationStatus'->>'state','UNKNOWN') not in ('CANCELED','POSTPONED') and exists(select 1 from jsonb_array_elements(p.snapshot_json->'event'->'occurrences') d where d->>'endDate'>=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'))",event);
  if(rows.isEmpty())return;
  for(var r:db.queryForList("select distinct l.subject_id from subculture_subject_link l join subculture_subject s on s.id=l.subject_id left join subculture_subject w on w.id=s.work_id join subculture_catalog_publication pub on pub.event_id=l.event_id where l.event_id=? and l.active and s.active and (w.id is null or w.active) and "+NotificationFacts.EVENT_LINK,event))emit("EVENT",Long.toString(event),(UUID)r.get("subject_id"),null,"관심 대상과 관련된 행사가 확인됐어요",baseline);
  // Membership must still occur in the public snapshot, not just the private collector inbox.
  for(var r:db.queryForList("select distinct pm.exhibitor_id from subculture_participant p join subculture_participant_member pm on pm.participant_id=p.id join subculture_exhibitor e on e.id=pm.exhibitor_id join subculture_catalog_publication pub on pub.event_id=p.event_id where p.event_id=? and p.review_state<>'EXCLUDED' and not exists(select 1 from collection_creator_publication c where c.exhibitor_id=e.id and not c.active) and exists(select 1 from jsonb_array_elements(pub.snapshot_json->'participants') x,jsonb_array_elements(x->'participant'->'members') m where x->>'id'=p.id::text and m->>'name'=e.profile_json->>'name' and m->>'profileUrl' is not distinct from e.profile_json->>'profileUrl')",event))emit("EVENT",Long.toString(event),null,((Number)r.get("exhibitor_id")).longValue(),"관심 작가의 행사 참가가 확인됐어요",baseline);
 }
 private void emit(String kind,String target,UUID subject,Long creator,String title,boolean baseline){
  String key=kind+":"+target+":"+(subject==null?"creator:"+creator:"subject:"+subject);UUID fact=UUID.randomUUID();
  if(db.update("insert into subculture_news_fact(id,identity_key,kind,target_id,subject_id,creator_id,baseline) values(?,?,?,?,?,?,?) on conflict(identity_key) do nothing",fact,key,kind,target,subject,creator,baseline)==0||baseline)return;
  var users=db.queryForList("select distinct i.user_id from subculture_interest i join subculture_news_fact f on f.id=? where "+NotificationFacts.MATCHES,Long.class,fact);
  for(long user:users){UUID id=UUID.randomUUID();if(db.update("insert into subculture_notification(id,user_id,fact_id,dedupe_key,title,href) values(?,?,?,?,?,?) on conflict(user_id,dedupe_key) do nothing",id,user,fact,kind+":"+target,title,kind.equals("EVENT")?"/discover/"+target:"/subculture/products/"+target)>0)
   db.update("insert into subculture_push_delivery(notification_id,subscription_id) select ?,id from subculture_push_subscription where user_id=? and active on conflict do nothing",id,user);
  }
 }
}
