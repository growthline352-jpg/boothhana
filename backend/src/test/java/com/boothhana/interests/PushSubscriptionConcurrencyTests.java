package com.boothhana.interests;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Two real connections need committed fixtures. Exact fixture IDs are removed after each local-only test. */
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class PushSubscriptionConcurrencyTests {
 private DriverManagerDataSource source;
 private JdbcTemplate db;
 private long oldOwner,newOwner,creator;
 private final UUID subscription=UUID.randomUUID(),fact=UUID.randomUUID(),notice=UUID.randomUUID();
 private NotificationService.Subscription input;

 @BeforeEach void fixture(){
  source=new DriverManagerDataSource(System.getenv("BOOTH_FULL_TEST_URL"),System.getenv("BOOTH_FULL_TEST_USER"),System.getenv("BOOTH_FULL_TEST_PASSWORD"));
  db=new JdbcTemplate(source);
  assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");
  oldOwner=user();newOwner=user();
  creator=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,'[TEST] push concurrency','{}') returning id",Long.class,UUID.randomUUID().toString().replace("-","").repeat(2));
  byte[] key=new byte[65];key[0]=4;var encoder=Base64.getUrlEncoder().withoutPadding();
  input=new NotificationService.Subscription("https://fcm.googleapis.com/fcm/send/"+subscription,encoder.encodeToString(key),encoder.encodeToString(new byte[16]));
  db.update("insert into subculture_push_subscription(id,user_id,endpoint,p256dh,auth) values(?,?,?,?,?)",subscription,oldOwner,input.endpoint(),input.p256dh(),input.auth());
  db.update("insert into subculture_news_fact(id,identity_key,kind,target_id,creator_id,baseline) values(?,?,'PRODUCT',?,?,false)",fact,fact.toString(),UUID.randomUUID().toString(),creator);
  db.update("insert into subculture_notification(id,user_id,fact_id,dedupe_key,title,href) values(?,?,?,?,'Test','/account/notifications')",notice,oldOwner,fact,fact.toString());
  db.update("insert into subculture_push_delivery(notification_id,subscription_id) values(?,?)",notice,subscription);
 }
 private long user(){return db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] push concurrency') returning id",Long.class,UUID.randomUUID().toString());}
 @AfterEach void cleanup(){
  if(db==null)return;
  db.update("delete from subculture_push_delivery where notification_id=?",notice);
  db.update("delete from subculture_notification where id=?",notice);
  db.update("delete from subculture_news_fact where id=?",fact);
  db.update("delete from subculture_push_subscription where id=?",subscription);
  db.update("delete from subculture_exhibitor where id=?",creator);
  db.update("delete from app_user where id in (?,?)",oldOwner,newOwner);
 }
 private NotificationService service(JdbcTemplate jdbc){
  var service=new NotificationService(jdbc);
  ReflectionTestUtils.setField(service,"enabled",true);ReflectionTestUtils.setField(service,"pushEnabled",true);ReflectionTestUtils.setField(service,"publicKey","test-key");
  return service;
 }
 private static void await(CountDownLatch gate){
  try{assertThat(gate.await(10,TimeUnit.SECONDS)).as("concurrent request reached barrier").isTrue();}
  catch(InterruptedException e){Thread.currentThread().interrupt();throw new AssertionError(e);}
 }
 private void mutate(boolean transfer,JdbcTemplate jdbc,CompletableFuture<Integer> pid){
  new TransactionTemplate(new DataSourceTransactionManager(source)).executeWithoutResult(status->{
   jdbc.execute("set local statement_timeout='8s'");
   pid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));
   if(transfer)service(jdbc).subscribe(newOwner,input);else service(jdbc).unsubscribe(oldOwner,input.endpoint());
  });
 }
 private void awaitDatabaseLock(int pid)throws InterruptedException{
  long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
  do{
   if(Boolean.TRUE.equals(db.queryForObject("select coalesce((select wait_event_type='Lock' from pg_stat_activity where pid=?),false)",Boolean.class,pid)))return;
   Thread.sleep(20);
  }while(System.nanoTime()<deadline);
  fail("The second request did not overlap the first database transaction");
 }

 @ParameterizedTest @CsvSource({"true,PENDING","false,PENDING","true,SENDING","false,SENDING"})
 void transferAndUnsubscribeBothCompleteWithoutDisablingNewOwner(boolean transferFirst,String deliveryState)throws Exception{
  if(deliveryState.equals("SENDING"))db.update("update subculture_push_delivery set state='SENDING',lease_token=?,lease_until=now()+interval '2 minutes' where notification_id=?",UUID.randomUUID(),notice);
  var firstWrite=new CountDownLatch(1);var release=new CountDownLatch(1);
  // Pause after the first row mutation, while its transaction still owns its locks.
  var paused=new JdbcTemplate(source){
   private boolean held;
   @Override public int update(String sql,Object...args){
    int count=super.update(sql,args);
    if(!held&&(sql.startsWith("update subculture_push_")||sql.startsWith("insert into subculture_push_subscription"))){held=true;firstWrite.countDown();await(release);}
    return count;
   }
  };
  var pool=Executors.newFixedThreadPool(2);
  try{
   var first=pool.submit(()->mutate(transferFirst,paused,new CompletableFuture<>()));await(firstWrite);
   var secondPid=new CompletableFuture<Integer>();var second=pool.submit(()->mutate(!transferFirst,new JdbcTemplate(source),secondPid));
   awaitDatabaseLock(secondPid.get(5,TimeUnit.SECONDS));release.countDown();
   first.get(12,TimeUnit.SECONDS);second.get(12,TimeUnit.SECONDS);
   assertThat(db.queryForMap("select user_id,active from subculture_push_subscription where id=?",subscription)).containsEntry("user_id",newOwner).containsEntry("active",true);
   assertThat(db.queryForMap("select state,lease_token,lease_until from subculture_push_delivery where notification_id=?",notice)).containsEntry("state","CANCELED").containsEntry("lease_token",null).containsEntry("lease_until",null);
  }finally{release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(20,TimeUnit.SECONDS)).isTrue();}
 }
}
