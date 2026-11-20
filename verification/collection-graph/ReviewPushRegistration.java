import java.util.*;
import com.boothhana.interests.NotificationService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;

/** Review-only, disposable localhost DB fixture. Always rolls back. */
class ReviewPushRegistration {
 static void set(Object target,String name,Object value)throws Exception {var field=target.getClass().getDeclaredField(name);field.setAccessible(true);field.set(target,value);}
 public static void main(String[] args)throws Exception {
  var ds=new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:55439/boothhana_release_test","boothhana_release_runtime","isolated-interest-test");
  var db=new JdbcTemplate(ds);if(!"boothhana_release_test".equals(db.queryForObject("select current_database()",String.class)))throw new Error("Wrong database");
  var tx=new DataSourceTransactionManager(ds);var status=tx.getTransaction(null);
  try {
   var service=new NotificationService(db);set(service,"enabled",true);set(service,"pushEnabled",true);set(service,"publicKey","configured-for-test");
   long user=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] push review') returning id",Long.class,UUID.randomUUID().toString());
   long creator=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,'[TEST] push maker','{}') returning id",Long.class,UUID.randomUUID().toString().replace("-","").repeat(2));
   byte[] key=new byte[65];key[0]=4;var encoder=Base64.getUrlEncoder().withoutPadding();
   var subscription=new NotificationService.Subscription("https://fcm.googleapis.com/fcm/send/"+UUID.randomUUID(),encoder.encodeToString(key),encoder.encodeToString(new byte[16]));
   service.subscribe(user,subscription);
   UUID fact=UUID.randomUUID(),notice=UUID.randomUUID();String target=UUID.randomUUID().toString();
   db.update("insert into subculture_news_fact(id,identity_key,kind,target_id,creator_id,baseline) values(?,?,'PRODUCT',?,?,false)",fact,"PRODUCT:"+target+":creator:"+creator,target,creator);
   db.update("insert into subculture_notification(id,user_id,fact_id,dedupe_key,title,href) values(?,?,?,?,?,?)",notice,user,fact,"PRODUCT:"+target,"Test news","/subculture/products/"+target);
   db.update("insert into subculture_push_delivery(notification_id,subscription_id) select ?,id from subculture_push_subscription where user_id=? and active",notice,user);
   System.out.println("BEFORE_SAME_OWNER_REGISTER="+db.queryForObject("select state from subculture_push_delivery where notification_id=?",String.class,notice));
   service.subscribe(user,subscription);
   String after=db.queryForObject("select state from subculture_push_delivery where notification_id=?",String.class,notice);
   System.out.println("AFTER_SAME_OWNER_REGISTER="+after);
   System.out.println("SUBSCRIPTION_STILL_ACTIVE="+db.queryForObject("select active from subculture_push_subscription where user_id=? and endpoint=?",Boolean.class,user,subscription.endpoint()));
   if(!"CANCELED".equals(after))throw new AssertionError("Review reproduction no longer reproduces");
  }finally {tx.rollback(status);System.out.println("ROLLED_BACK=true");}
 }
}
