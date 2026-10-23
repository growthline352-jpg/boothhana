package com.boothhana.release;

import com.boothhana.collection.graph.GraphService;
import static com.boothhana.collection.graph.GraphModels.*;
import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;

/** Real concurrent transactions against the explicit disposable localhost DB. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class CollectionGraphDecisionReplayIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p){
  p.add("spring.datasource.url",()->System.getenv("BOOTH_FULL_TEST_URL"));p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));
  p.add("app.collection.graph.enabled",()->true);p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");p.add("app.storage.public-url",()->"https://assets.example.test");
 }
 @Autowired JdbcTemplate db;@Autowired GraphService graph;@Autowired PlatformTransactionManager transactions;
 @Test void concurrentLostResponseReplayReturnsTheSameCommittedReceipt()throws Exception {
  assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");
  UUID product=UUID.randomUUID(),jobId=null;
  var release=new CountDownLatch(1);var held=new CountDownLatch(1);var executor=Executors.newFixedThreadPool(2);
  try {
   db.update("insert into collection_product(id,identity_key,data_json) values(?,?,'{}')",product,UUID.randomUUID().toString());
   var seeded=graph.seed(new Seed("CHARACTERS",product.toString(),Map.of(),true,UUID.randomUUID().toString()));
   jobId=(UUID)seeded.get("id");var job=graph.claim(jobId);UUID id=jobId;
   var audit=new Audit("gpt-6.1-sol","graph-4","graph-4",true,List.of("https://example.com/source"),Map.of(),List.of());
   @SuppressWarnings("unchecked") var extraction=(Map<String,Object>)graph.extract(id,new Extraction(UUID.fromString(job.get("leaseToken").toString()),UUID.randomUUID(),job.get("contextHash").toString(),Map.of(),audit));
   var decision=new Decision(UUID.fromString(job.get("leaseToken").toString()),UUID.fromString(extraction.get("id").toString()),extraction.get("resultHash").toString(),"REJECT","Test rejection without publication",audit);
   var first=executor.submit(()->new TransactionTemplate(transactions).execute(status->{
    db.queryForList("select id from collection_job where id=? for update",id);held.countDown();
    try {if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Test lock not released");}
    catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}
    return graph.decide(id,decision);
   }));
   assertThat(held.await(5,TimeUnit.SECONDS)).isTrue();
   var second=executor.submit(()->graph.decide(id,decision));
   // Observe the retry actually waiting behind the first transaction. A sleep
   // alone would not prove that its initial receipt lookup already happened.
   long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean waiting=false;
   while(System.nanoTime()<until){
    waiting=db.queryForObject("select exists(select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like 'select *,lease_until%for update%')",Boolean.class);
    if(waiting)break;Thread.sleep(20);
   }
   assertThat(waiting).isTrue();release.countDown();
   Object receipt=first.get(10,TimeUnit.SECONDS);assertThat(second.get(10,TimeUnit.SECONDS)).isEqualTo(receipt);
   assertThat(db.queryForObject("select count(*) from collection_verdict v join collection_extraction e on e.id=v.extraction_id where e.job_id=?",Integer.class,id)).isEqualTo(1);
   assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id)).isEqualTo("REJECTED");
  }finally{
   release.countDown();executor.shutdownNow();executor.awaitTermination(10,TimeUnit.SECONDS);
   if(jobId!=null){db.update("delete from collection_verdict where extraction_id in(select id from collection_extraction where job_id=?)",jobId);db.update("delete from collection_extraction where job_id=?",jobId);db.update("delete from collection_job where id=?",jobId);}
   db.update("delete from collection_product where id=?",product);
  }
 }
}
