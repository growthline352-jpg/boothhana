package com.boothhana.interests;
import com.boothhana.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.net.URI;
import java.util.*;

@Service @Transactional(readOnly=true)
public class NotificationService {
 private final JdbcTemplate db;
 @Value("${app.collection.graph.enabled:false}") private boolean enabled;
 @Value("${app.notifications.push.enabled:false}") private boolean pushEnabled;
 @Value("${app.notifications.push.public-key:}") private String publicKey;
 public NotificationService(JdbcTemplate db){this.db=db;}
 public Map<String,Object> configuration(long owner){return Map.of("enabled",enabled&&pushEnabled&&!publicKey.isBlank(),"publicKey",pushEnabled?publicKey:"","endpoints",enabled?db.queryForList("select endpoint from subculture_push_subscription where user_id=? and active",String.class,owner):List.of());}
 // Current visibility is rechecked for inbox and delivery, including publication withdrawal.
 static final String VISIBLE="exists(select 1 from subculture_news_fact f join subculture_news_fact anchor on anchor.id=n.fact_id and anchor.kind=f.kind and anchor.target_id=f.target_id where not f.baseline and "+NotificationFacts.SUBJECT_ACTIVE+" and "+NotificationFacts.CURRENT+" and exists(select 1 from subculture_interest i where i.user_id=n.user_id and "+NotificationFacts.MATCHES+"))";
 public Map<String,Object> inbox(long owner,int page){if(page<0||page>1000)throw ApiException.badRequest("페이지 오류");if(!enabled)return Map.of("items",List.of(),"hasMore",false,"unread",0);
  var rows=db.queryForList("select n.id,n.title,n.href,n.created_at as \"createdAt\",n.read_at as \"readAt\" from subculture_notification n where n.user_id=? and "+VISIBLE+" order by n.created_at desc,n.id limit 31 offset ?",owner,page*30);
  return Map.of("items",rows.stream().limit(30).toList(),"hasMore",rows.size()>30,"unread",db.queryForObject("select count(*) from subculture_notification n where n.user_id=? and n.read_at is null and "+VISIBLE,Integer.class,owner));
 }
 @Transactional public void read(long owner,UUID id){if(enabled)db.update("update subculture_notification set read_at=coalesce(read_at,now()) where user_id=? and id=?",owner,id);}
 @Transactional public void readAll(long owner){if(enabled)db.update("update subculture_notification set read_at=now() where user_id=? and read_at is null",owner);}
 public record Subscription(String endpoint,String p256dh,String auth){}
 static void endpoint(String value){
  try{URI uri=URI.create(value);String host=uri.getHost();if(value.length()>4096||!"https".equals(uri.getScheme())||uri.getUserInfo()!=null||uri.getFragment()!=null||uri.getPort()!=-1&&uri.getPort()!=443||host==null||!(host.equals("fcm.googleapis.com")||host.equals("updates.push.services.mozilla.com")||host.equals("web.push.apple.com")))throw new IllegalArgumentException();}
  catch(RuntimeException ex){throw ApiException.badRequest("지원하는 브라우저 푸시 주소가 아닙니다.");}
 }
 @Transactional public void subscribe(long owner,Subscription input){if(!enabled||!pushEnabled||publicKey.isBlank())throw ApiException.badRequest("웹 푸시가 아직 설정되지 않았습니다.");if(input==null)throw ApiException.badRequest("구독 정보가 필요합니다.");endpoint(input.endpoint());
  try{byte[] key=Base64.getUrlDecoder().decode(input.p256dh()),auth=Base64.getUrlDecoder().decode(input.auth());if(key.length!=65||key[0]!=4||auth.length!=16)throw new IllegalArgumentException();}catch(RuntimeException ex){throw ApiException.badRequest("브라우저 구독 키 형식 오류");}
  lockEndpoint(input.endpoint());
  db.update("update subculture_push_delivery set state='CANCELED',lease_token=null,lease_until=null where subscription_id in(select id from subculture_push_subscription where endpoint=? and user_id<>?) and state in ('PENDING','SENDING')",input.endpoint(),owner);
  db.update("insert into subculture_push_subscription(id,user_id,endpoint,p256dh,auth) values(?,?,?,?,?) on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,active=true,updated_at=now() where (subculture_push_subscription.user_id,subculture_push_subscription.p256dh,subculture_push_subscription.auth,subculture_push_subscription.active) is distinct from (excluded.user_id,excluded.p256dh,excluded.auth,true)",UUID.randomUUID(),owner,input.endpoint(),input.p256dh(),input.auth());
 }
 @Transactional public void unsubscribe(long owner,String endpoint){
  if(!enabled)return;
  lockEndpoint(endpoint);
  // Both subscription mutations lock the endpoint first, then deliveries, then the subscription.
  db.update("update subculture_push_delivery set state='CANCELED',lease_token=null,lease_until=null where subscription_id in(select id from subculture_push_subscription where user_id=? and endpoint=?) and state in ('PENDING','SENDING')",owner,endpoint);
  db.update("update subculture_push_subscription set active=false,updated_at=now() where user_id=? and endpoint=?",owner,endpoint);
 }
 private void lockEndpoint(String endpoint){db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","push:"+endpoint);}
}
