import java.util.*;import java.util.concurrent.*;import java.sql.SQLException;
import com.boothhana.interests.NotificationService;
import org.springframework.jdbc.core.JdbcTemplate;import org.springframework.jdbc.datasource.*;

/** Local-only concurrent review. Fixture commit permits two connections to see it; finally removes exact fixture IDs. */
class ReviewPushConcurrency {
 static final CountDownLatch canceled=new CountDownLatch(1),disabled=new CountDownLatch(1);
 static void await(CountDownLatch gate){try{if(!gate.await(10,TimeUnit.SECONDS))throw new AssertionError("Review barrier timed out");}catch(InterruptedException e){throw new RuntimeException(e);}}
 static class PausedJdbc extends JdbcTemplate {
  final boolean transfer;
  PausedJdbc(DriverManagerDataSource ds,boolean transfer){super(ds);this.transfer=transfer;}
  @Override public int update(String sql,Object...args){int count=super.update(sql,args);
   if(transfer&&sql.startsWith("update subculture_push_delivery")){canceled.countDown();await(disabled);}
   if(!transfer&&sql.startsWith("update subculture_push_subscription")){disabled.countDown();await(canceled);}
   return count;
  }
 }
 static NotificationService service(JdbcTemplate db)throws Exception{var service=new NotificationService(db);for(String name:List.of("enabled","pushEnabled","publicKey")){var field=NotificationService.class.getDeclaredField(name);field.setAccessible(true);field.set(service,name.equals("publicKey")?"review-key":true);}return service;}
 static String run(DriverManagerDataSource ds,boolean transfer,long owner,NotificationService.Subscription input){var tx=new DataSourceTransactionManager(ds);var status=tx.getTransaction(null);try{var jdbc=new PausedJdbc(ds,transfer);jdbc.execute("set local statement_timeout='8s'");var service=service(jdbc);if(transfer)service.subscribe(owner,input);else service.unsubscribe(owner,input.endpoint());return "SUCCESS";}catch(Exception ex){for(Throwable t=ex;t!=null;t=t.getCause())if(t instanceof SQLException sql)return "SQLSTATE="+sql.getSQLState();return ex.getClass().getSimpleName();}finally{tx.rollback(status);}}
 public static void main(String[]args)throws Exception{
  var ds=new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:55439/boothhana_release_test","boothhana_release_runtime","isolated-interest-test");var db=new JdbcTemplate(ds);if(!"boothhana_release_test".equals(db.queryForObject("select current_database()",String.class)))throw new Error("Wrong database");
  UUID subscription=UUID.randomUUID(),fact=UUID.randomUUID(),notification=UUID.randomUUID();long first=0,second=0,creator=0;
  var pool=Executors.newFixedThreadPool(2);
  try{
   first=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] concurrency first') returning id",Long.class,UUID.randomUUID().toString());
   second=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] concurrency second') returning id",Long.class,UUID.randomUUID().toString());
   creator=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,'[TEST] concurrency maker','{}') returning id",Long.class,UUID.randomUUID().toString().replace("-","").repeat(2));
   byte[] key=new byte[65];key[0]=4;var encoder=Base64.getUrlEncoder().withoutPadding();var input=new NotificationService.Subscription("https://fcm.googleapis.com/fcm/send/"+subscription,encoder.encodeToString(key),encoder.encodeToString(new byte[16]));
   db.update("insert into subculture_push_subscription(id,user_id,endpoint,p256dh,auth) values(?,?,?,?,?)",subscription,first,input.endpoint(),input.p256dh(),input.auth());
   db.update("insert into subculture_news_fact(id,identity_key,kind,target_id,creator_id,baseline) values(?,?,'PRODUCT',?,?,false)",fact,fact.toString(),UUID.randomUUID().toString(),creator);
   db.update("insert into subculture_notification(id,user_id,fact_id,dedupe_key,title,href) values(?,?,?,?,'Review notification','/account/notifications')",notification,first,fact,fact.toString());
   db.update("insert into subculture_push_delivery(notification_id,subscription_id) values(?,?)",notification,subscription);
   long former=first,next=second;var a=pool.submit(()->run(ds,true,next,input));await(canceled);var b=pool.submit(()->run(ds,false,former,input));
   String transfer=a.get(15,TimeUnit.SECONDS),unsubscribe=b.get(15,TimeUnit.SECONDS);
   System.out.println("TRANSFER="+transfer);System.out.println("UNSUBSCRIBE="+unsubscribe);
   if(!transfer.equals("SQLSTATE=40P01")&&!unsubscribe.equals("SQLSTATE=40P01"))throw new AssertionError("No deadlock reproduced");
  }finally{
   pool.shutdownNow();pool.awaitTermination(20,TimeUnit.SECONDS);
   db.update("delete from subculture_push_delivery where notification_id=?",notification);db.update("delete from subculture_notification where id=?",notification);db.update("delete from subculture_news_fact where id=?",fact);db.update("delete from subculture_push_subscription where id=?",subscription);db.update("delete from subculture_exhibitor where id=?",creator);db.update("delete from app_user where id in (?,?)",first,second);
   System.out.println("FIXTURES_REMOVED=true; externalPushSent=false");
  }
 }
}
