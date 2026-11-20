package com.boothhana.interests;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.Encoding;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;import java.net.http.*;import java.time.Duration;import java.security.Security;import java.util.*;

@Component @EnableScheduling
@ConditionalOnProperty(name={"app.notifications.push.enabled","app.collection.graph.enabled"},havingValue="true")
public class WebPushDispatcher {
 static final class Encryption extends PushService {
  Encryption(String publicKey,String privateKey,String subject)throws Exception{super(publicKey,privateKey,subject);}
  nl.martijndwars.webpush.HttpRequest encrypted(Notification n)throws Exception{return prepareRequest(n,Encoding.AES128GCM);}
 }
 private final JdbcTemplate db;private final JsonMapper json;private final Encryption service;
 private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
 public WebPushDispatcher(JdbcTemplate db,JsonMapper json,@Value("${app.notifications.push.public-key}") String publicKey,@Value("${app.notifications.push.private-key}") String privateKey,@Value("${app.notifications.push.subject}") String subject)throws Exception {this.db=db;this.json=json;Security.addProvider(new BouncyCastleProvider());service=new Encryption(publicKey,privateKey,subject);}
 @Scheduled(fixedDelayString="${app.notifications.push.interval-ms:15000}") public void dispatch(){for(int i=0;i<20;i++)if(!one())break;}
 boolean one(){UUID token=UUID.randomUUID();
  var jobs=db.queryForList("with picked as(select notification_id,subscription_id from subculture_push_delivery where state in ('PENDING','SENDING') and available_at<=now() and (lease_until is null or lease_until<now()) order by available_at for update skip locked limit 1) update subculture_push_delivery d set state='SENDING',attempts=attempts+1,lease_token=?,lease_until=now()+interval '2 minutes' from picked p where d.notification_id=p.notification_id and d.subscription_id=p.subscription_id returning d.*",token);
  if(jobs.isEmpty())return false;var job=jobs.getFirst();Object notification=job.get("notification_id"),subscription=job.get("subscription_id");
  var rows=db.queryForList("select s.endpoint,s.p256dh,s.auth,s.updated_at from subculture_push_subscription s join subculture_notification n on n.user_id=s.user_id where s.id=? and n.id=? and s.active and n.read_at is null and "+NotificationService.VISIBLE+" and exists(select 1 from subculture_push_delivery d where d.subscription_id=s.id and d.notification_id=n.id and d.state='SENDING' and d.lease_token=?)",subscription,notification,token);
  if(rows.isEmpty()){finish(notification,subscription,token,"CANCELED",0,0);return true;}
  int code=0;try{var row=rows.getFirst();String endpoint=row.get("endpoint").toString();NotificationService.endpoint(endpoint);
   for(var address:InetAddress.getAllByName(URI.create(endpoint).getHost()))if(address.isAnyLocalAddress()||address.isLoopbackAddress()||address.isLinkLocalAddress()||address.isSiteLocalAddress()||address.isMulticastAddress())throw new IllegalArgumentException("Non-public push service");
   // Generic content prevents interest names leaking on a shared device's lock screen.
   var payload=json.writeValueAsString(Map.of("title","부스하나 관심 소식","body","새로 확인된 소식이 있어요.","url","/account/notifications","tag",notification.toString()));
   var prepared=service.encrypted(new Notification(endpoint,row.get("p256dh").toString(),row.get("auth").toString(),payload));
   var request=HttpRequest.newBuilder(URI.create(endpoint)).timeout(Duration.ofSeconds(20));prepared.getHeaders().forEach(request::header);
   code=http.send(request.POST(HttpRequest.BodyPublishers.ofByteArray(prepared.getBody())).build(),HttpResponse.BodyHandlers.discarding()).statusCode();
  }catch(InterruptedException ex){Thread.currentThread().interrupt();}catch(Exception ignored){/* Record bounded status, never endpoint/key/payload in logs. */}
  int attempts=((Number)job.get("attempts")).intValue();String state=code>=200&&code<300?"SENT":code==404||code==410?"CANCELED":attempts>=8?"FAILED":"PENDING";
  if(code==404||code==410)db.update("update subculture_push_subscription set active=false where id=? and updated_at=? and exists(select 1 from subculture_push_delivery where subscription_id=? and notification_id=? and lease_token=?)",subscription,rows.getFirst().get("updated_at"),subscription,notification,token);
  finish(notification,subscription,token,state,code,Math.min(3600,30*(1<<Math.min(attempts,7))));return true;
 }
 private void finish(Object notification,Object subscription,UUID token,String state,int code,int delay){db.update("update subculture_push_delivery set state=?,last_status=?,lease_token=null,lease_until=null,available_at=now()+(?*interval '1 second') where notification_id=? and subscription_id=? and lease_token=?",state,code,delay,notification,subscription,token);}
}
