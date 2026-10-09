package com.boothhana.release;
import com.boothhana.collection.*;
import com.boothhana.collection.graph.*;
import com.boothhana.interests.SubcultureInterestService;
import com.boothhana.api.ApiException;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.graph.GraphModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** SQL001..022 on the explicit disposable localhost DB only. Each test rolls back its fixtures. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
@Transactional
class CollectionGraphIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p){
  p.add("spring.datasource.url",()->System.getenv("BOOTH_FULL_TEST_URL"));p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));
  p.add("app.collection.graph.enabled",()->true);p.add("app.collector.token",()->"graph-isolated-test-token-1234567890");p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");p.add("app.storage.public-url",()->"https://assets.example.test");
 }
 @Autowired JdbcTemplate db;@Autowired GraphService graph;@Autowired JsonMapper json;@Autowired WebApplicationContext web;@Autowired SubcultureInterestService interests;
 @Autowired com.boothhana.interests.NotificationService notifications;
 @Autowired com.boothhana.interests.CreatorProducts creatorProducts;
 @Autowired com.boothhana.health.ReadinessService readiness;
 long event;EventData data;MockMvc http;String source="https://example.com/event";
 @BeforeEach void fixture(){assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");http=MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
  String key=UUID.randomUUID().toString().replace("-","").repeat(2),day=LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(8).toString();
  data=new EventData("[TEST] graph convention","ONLY_EVENT","Test organizer","2026","SEOUL","Test hall","서울특별시 종로구 테스트로 1","Official test event description","Free",List.of(),List.of(new Occurrence(day,day,"10:00","18:00")),List.of(new Source(source,"OFFICIAL","ORIGINAL","Exact test edition")),List.of(),List.of(),"MULTI_BOOTH",List.of());
  event=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json) values(?,?,?,'ONLY_EVENT',cast(? as date),cast(? as date),cast(? as jsonb),?,'[]') returning id",Long.class,key,key,data.name(),day,day,json.writeValueAsString(data),key);
  // Queue isolation only inside this rollback transaction; no production fixture mutation.
  db.update("update collection_job set available_at=now()+interval '7 days'");
 }
 @SuppressWarnings("unchecked") Map<String,Object> value(Object x){return json.readValue(json.writeValueAsString(x),Map.class);}
 Audit audit(){return new Audit("gpt-6.1-sol","graph-1","graph-1",true,List.of(source),Map.of(),List.of());}
 Map<String,Object> seed(String kind,String target){var queued=graph.seed(new Seed(kind,target,Map.of(),true,UUID.randomUUID().toString()));db.update("update collection_job set available_at=now() where id=?",queued.get("id"));return graph.claim();}
 UUID id(Map<String,Object> job){return (UUID)job.get("id");}UUID token(Map<String,Object> job){return (UUID)job.get("leaseToken");}
 Map<String,Object> extract(Map<String,Object> job,Object result){return value(graph.extract(id(job),new Extraction(token(job),UUID.randomUUID(),job.get("contextHash").toString(),value(result),audit())));}
 Object approve(Map<String,Object> job,Map<String,Object> result){return graph.decide(id(job),new Decision(token(job),UUID.fromString(result.get("id").toString()),result.get("resultHash").toString(),"APPROVE","Original source independently verified",audit()));}
 @Test void liveRefreshWaitsForActiveBaselineIncludingContinuationJobs(){
  var baseline=graph.seed(new Seed("EVENT",Long.toString(event),Map.of("page",1),true,"import"));
  var live=graph.seed(new Seed("EVENT",Long.toString(event),Map.of(),false,"live"));
  assertThat(live.get("id")).isEqualTo(baseline.get("id"));
  db.update("update collection_job set state='COMPLETE' where id=?",baseline.get("id"));
  assertThat(graph.seed(new Seed("EVENT",Long.toString(event),Map.of(),false,"live")).get("id")).isNotEqualTo(baseline.get("id"));
 }
 @Test void firstLegacyCreatorRefreshIsBaseline(){
  long maker=maker("Legacy author",source);
  long p=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash) values(?,?,'Legacy booth','{}',?) returning id",Long.class,event,"a".repeat(64),"b".repeat(64));
  db.update("insert into subculture_participant_member(participant_id,exhibitor_id) values(?,?)",p,maker);
  graph.refreshCreators(new Bootstrap(null,maker-1,1));
  assertThat(db.queryForObject("select baseline from collection_job where kind='CREATOR' and target_id=?",Boolean.class,Long.toString(maker))).isTrue();
 }
 @Test void withdrawnEventIsNotBootstrappedOrRepublishedByQueuedWork(){
  var job=seed("EVENT",Long.toString(event));var extracted=extract(job,data);
  db.update("update subculture_event_candidate set publication_withdrawn=true where id=?",event);
  assertThatThrownBy(()->approve(job,extracted)).isInstanceOf(ApiException.class);
  assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Integer.class,event)).isZero();
  assertThat(db.queryForObject("select publication_withdrawn from subculture_event_candidate where id=?",Boolean.class,event)).isTrue();
  UUID run=UUID.randomUUID();graph.bootstrap(new Bootstrap(run,0,200));
  assertThat(db.queryForObject("select count(*) from collection_migration where run_id=? and source_id=?",Integer.class,run,event)).isZero();
 }
 @Autowired com.boothhana.interests.InterestFeed interestFeed;
 @Test void expandedProductionTaxonomyIsCollectedPublishedAndDiscoverable(){
  db.update("update subculture_event_candidate set subcategory='ANIME_GAME_FESTIVAL',payload_json=jsonb_set(payload_json,'{subcategory}','\"ANIME_GAME_FESTIVAL\"'::jsonb) where id=?",event);
  UUID run=UUID.randomUUID();graph.bootstrap(new Bootstrap(run,event-1,1));
  assertThat(db.queryForObject("select count(*) from collection_migration where run_id=? and source_id=?",Integer.class,run,event)).isEqualTo(1);
  var job=graph.claim();assertThat(Long.parseLong(job.get("targetId").toString())).isEqualTo(event);
  var result=value(data);result.put("subcategory","ANIME_GAME_FESTIVAL");approve(job,extract(job,result));
  boolean found=false;
  for(int page=0;page<=1000;page++){
   var feed=interestFeed.home(null,null,null,null,page);
   if(((List<Map<String,Object>>)feed.get("events")).stream().anyMatch(row->((Number)row.get("id")).longValue()==event)){found=true;break;}
   if(!Boolean.TRUE.equals(feed.get("hasMore")))break;
  }
  assertThat(found).as("new production event type remains discoverable across feed pages").isTrue();
 }
 @Test void eventApprovalPublishesAndReplayDoesNotPublishTwice(){var job=seed("EVENT",Long.toString(event));var extracted=extract(job,data);assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Integer.class,event)).isZero();approve(job,extracted);var published=db.queryForObject("select published_at::text from subculture_catalog_publication where event_id=?",String.class,event);approve(job,extracted);assertThat(db.queryForObject("select published_at::text from subculture_catalog_publication where event_id=?",String.class,event)).isEqualTo(published);assertThat(db.queryForObject("select count(*) from collection_verdict",Integer.class)).isEqualTo(1);}
 long fan(){return db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] News') returning id",Long.class,UUID.randomUUID().toString());}
 @Test void graphReadinessChecksNewMigrations(){assertThat(readiness.check().issues()).isEmpty();}
 @Test void eventThemeSnapshotUsesPublicProjectionWhenPrivateBannerExists(){
  var banners=List.of(new Banner("https://example.com/cover.png",source,"UNKNOWN","Permission not confirmed",true));db.update("update subculture_event_candidate set payload_json=jsonb_set(payload_json,'{banners}',cast(? as jsonb)) where id=?",json.writeValueAsString(banners),event);
  approveJob(seed("EVENT",Long.toString(event)),value(data));db.update("update collection_job set available_at=now()+interval '7 days'");approveJob(seed("RELATIONS",Long.toString(event)),relations());
  assertThat(db.queryForObject("select l.target_snapshot_json=pub.snapshot_json->'event' from subculture_subject_link l join subculture_catalog_publication pub on pub.event_id=l.event_id where l.kind='EVENT' and l.event_id=?",Boolean.class,event)).isTrue();
 }
 @Test void notificationHttpRequiresSessionAndCsrf()throws Exception{http.perform(get("/api/me/subculture/notifications")).andExpect(status().isUnauthorized());long fan=fan();String subject=db.queryForObject("select kakao_subject from app_user where id=?",String.class,fan);http.perform(post("/api/me/subculture/notifications/read-all").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(subject).roles("FAN"))).andExpect(status().isForbidden());http.perform(get("/api/me/subculture/notifications").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(subject).roles("FAN"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));}
 @Test void movingPushDeviceCancelsFormerOwnersPendingDelivery(){
  var service=new com.boothhana.interests.NotificationService(db);org.springframework.test.util.ReflectionTestUtils.setField(service,"enabled",true);org.springframework.test.util.ReflectionTestUtils.setField(service,"pushEnabled",true);org.springframework.test.util.ReflectionTestUtils.setField(service,"publicKey","configured-for-test");
  byte[] key=new byte[65];key[0]=4;var encoder=Base64.getUrlEncoder().withoutPadding();var input=new com.boothhana.interests.NotificationService.Subscription("https://fcm.googleapis.com/fcm/send/"+UUID.randomUUID(),encoder.encodeToString(key),encoder.encodeToString(new byte[16]));long user=fan(),other=fan(),maker=maker("Identity Maker",source);follow(user,maker,null);service.subscribe(user,input);UUID product=productFixture(maker);resetBaselineFacts(product);new com.boothhana.interests.InterestNews(db).product(product,false);assertThat(db.queryForObject("select count(*) from subculture_push_delivery where state='PENDING'",Integer.class)).isEqualTo(1);service.subscribe(other,input);assertThat(db.queryForObject("select count(*) from subculture_push_delivery where state='PENDING'",Integer.class)).isZero();service.unsubscribe(user,input.endpoint());assertThat((List<?>)service.configuration(other).get("endpoints")).hasSize(1);service.unsubscribe(other,input.endpoint());assertThat((List<?>)service.configuration(other).get("endpoints")).isEmpty();
 }
 void follow(long user,Long maker,UUID subject){db.update("insert into subculture_interest(id,user_id,subject_id,exhibitor_id,identity_key) values(?,?,?,?,?)",UUID.randomUUID(),user,subject,maker,subject==null?"creator:"+maker:"subject:"+subject);}
 @Test void sameOwnerPushRegistrationPreservesPendingAndLeasedDelivery(){
  var service=new com.boothhana.interests.NotificationService(db);
  org.springframework.test.util.ReflectionTestUtils.setField(service,"enabled",true);org.springframework.test.util.ReflectionTestUtils.setField(service,"pushEnabled",true);org.springframework.test.util.ReflectionTestUtils.setField(service,"publicKey","configured-for-test");
  byte[] key=new byte[65];key[0]=4;var encoder=Base64.getUrlEncoder().withoutPadding();var input=new com.boothhana.interests.NotificationService.Subscription("https://fcm.googleapis.com/fcm/send/"+UUID.randomUUID(),encoder.encodeToString(key),encoder.encodeToString(new byte[16]));
  long user=fan(),maker=maker("Identity Maker",source);follow(user,maker,null);service.subscribe(user,input);
  UUID product=productFixture(maker);resetBaselineFacts(product);new com.boothhana.interests.InterestNews(db).product(product,false);
  UUID subscription=db.queryForObject("select id from subculture_push_subscription where endpoint=?",UUID.class,input.endpoint());
  db.update("update subculture_push_subscription set updated_at=now()-interval '1 day' where id=?",subscription);
  var before=db.queryForMap("select * from subculture_push_subscription where id=?",subscription);
  service.subscribe(user,input);
  assertThat(db.queryForObject("select state from subculture_push_delivery where subscription_id=?",String.class,subscription)).isEqualTo("PENDING");
  assertThat(db.queryForMap("select * from subculture_push_subscription where id=?",subscription)).isEqualTo(before);
  UUID lease=UUID.randomUUID();db.update("update subculture_push_delivery set state='SENDING',lease_token=?,lease_until=now()+interval '2 minutes' where subscription_id=?",lease,subscription);
  var delivery=db.queryForMap("select * from subculture_push_delivery where subscription_id=?",subscription);service.subscribe(user,input);
  assertThat(db.queryForMap("select * from subculture_push_delivery where subscription_id=?",subscription)).isEqualTo(delivery);
  // Changing the account still fences an in-flight delivery for the former owner.
  service.subscribe(fan(),input);
  assertThat(db.queryForObject("select state from subculture_push_delivery where subscription_id=?",String.class,subscription)).isEqualTo("CANCELED");
  assertThat(db.queryForMap("select lease_token,lease_until from subculture_push_delivery where subscription_id=?",subscription)).allSatisfy((k,v)->assertThat(v).isNull());
 }
 UUID productFixture(long maker){saveGoods(maker,List.of(option("Hero",null,null,List.of(new Source(source,"OFFICIAL","ORIGINAL","Hero option")),null)),List.of(source));return db.queryForObject("select id from collection_product where exhibitor_id=?",UUID.class,maker);}
 void resetBaselineFacts(UUID product){db.update("delete from subculture_news_fact where target_id=?",product.toString());}
 @Test void baselineSuppressesReplayAndNewFansDoNotGetHistoricalNews(){long maker=maker("Identity Maker",source),user=fan();follow(user,maker,null);UUID product=productFixture(maker);var news=new com.boothhana.interests.InterestNews(db);news.product(product,false);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(0);long newcomer=fan();follow(newcomer,maker,null);news.product(product,false);assertThat(notifications.inbox(newcomer,0).get("unread")).isEqualTo(0);}
 @Test void newProductIsDeduplicatedAndWithdrawalHidesInbox(){long maker=maker("Identity Maker",source),user=fan();follow(user,maker,null);UUID product=productFixture(maker);resetBaselineFacts(product);var news=new com.boothhana.interests.InterestNews(db);news.product(product,false);news.product(product,false);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(1);assertThat(notifications.inbox(fan(),0).get("unread")).isEqualTo(0);db.update("update collection_product set active=false where id=?",product);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(0);assertThatThrownBy(()->creatorProducts.detail(product)).isInstanceOf(ApiException.class);}
 @Test void characterAndCreatorNewsDeduplicatePerUserAndUnfollowHidesIt(){long maker=maker("Identity Maker",source),user=fan();UUID product=productFixture(maker);db.update("update collection_job set available_at=now()+interval '7 days'");approveJob(seed("CHARACTERS",product.toString()),characters("News Hero"));UUID character=db.queryForObject("select subject_id from collection_product_subject where product_id=?",UUID.class,product);follow(user,maker,null);follow(user,null,character);resetBaselineFacts(product);new com.boothhana.interests.InterestNews(db).product(product,false);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(1);db.update("delete from subculture_interest where user_id=?",user);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(0);}
 @Test void readIsOwnerScopedAndPastProductNeverNotifies(){long maker=maker("Identity Maker",source),user=fan();follow(user,maker,null);UUID product=productFixture(maker);resetBaselineFacts(product);new com.boothhana.interests.InterestNews(db).product(product,false);UUID notification=db.queryForObject("select id from subculture_notification where user_id=?",UUID.class,user);notifications.read(fan(),notification);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(1);notifications.read(user,notification);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(0);db.update("update collection_product set data_json=jsonb_set(data_json,'{evidenceScope}','\"PAST_REFERENCE\"') where id=?",product);assertThat((List<?>)notifications.inbox(user,0).get("items")).isEmpty();}
 @Test void personalCatalogNeverUsesSomeoneElsesCustomInterest(){long maker=maker("Identity Maker",source),user=fan();UUID product=productFixture(maker);follow(user,maker,null);assertThat((List<?>)creatorProducts.mine(user,null,0).get("items")).hasSize(1);assertThat((List<?>)creatorProducts.mine(fan(),null,0).get("items")).isEmpty();assertThat(value(creatorProducts.detail(product).get("data"))).doesNotContainKey("images");assertThatThrownBy(()->creatorProducts.mine(user,UUID.randomUUID(),0)).isInstanceOf(ApiException.class);}
 Map<String,Object> relations(){var assignment=characters("Theme Hero");return new LinkedHashMap<>(Map.of("subjects",List.of(Map.of("work",Map.of("name","Theme Game","sourceUrl",source,"medium","게임"),"character",Map.of("name","Theme Hero","sourceUrl",source,"medium","게임"),"evidenceUrl",source,"evidence","Official only-event theme")),"series",Map.of("status","CONFIRMED","name","Theme Convention","officialUrl",source,"edition","2026","evidenceUrl",source,"evidence","Annual edition"),"unresolved",List.of(),"sources",assignment.get("sources")));}
 @Test void eventThemeAndSeriesWorkWithoutBoothsAndCorrectedThemeRetracts(){approveJob(seed("EVENT",Long.toString(event)),value(data));db.update("update collection_job set available_at=now()+interval '7 days'");approveJob(seed("RELATIONS",Long.toString(event)),relations());assertThat(db.queryForObject("select count(*) from subculture_subject_link where kind='EVENT' and event_id=? and active",Integer.class,event)).isEqualTo(1);assertThat(db.queryForObject("select count(*) from event_series_member where event_id=? and series_id is not null",Integer.class,event)).isEqualTo(1);var correction=relations();correction.put("subjects",List.of());correction.put("series",Map.of("status","NONE"));approveJob(seed("RELATIONS",Long.toString(event)),correction);assertThat(db.queryForObject("select count(*) from subculture_subject_link where kind='EVENT' and event_id=? and active",Integer.class,event)).isZero();assertThat(db.queryForObject("select series_id from event_series_member where event_id=?",Long.class,event)).isNull();}
 @Test void eventThemeNewsUsesCurrentPublicSnapshot(){approveJob(seed("EVENT",Long.toString(event)),value(data));db.update("update collection_job set available_at=now()+interval '7 days'");approveJob(seed("RELATIONS",Long.toString(event)),relations());UUID character=db.queryForObject("select subject_id from subculture_subject_link where kind='EVENT' and event_id=?",UUID.class,event);long user=fan();follow(user,null,character);db.update("delete from subculture_news_fact where kind='EVENT' and target_id=?",Long.toString(event));new com.boothhana.interests.InterestNews(db).event(event,false);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(1);db.update("update subculture_catalog_publication set snapshot_json=jsonb_set(snapshot_json,'{event,name}','\"Changed event\"') where event_id=?",event);assertThat(notifications.inbox(user,0).get("unread")).isEqualTo(0);}
 @Test void staleRevisionCannotPublish(){var job=seed("EVENT",Long.toString(event));var extracted=extract(job,data);db.update("update subculture_event_candidate set revision=revision+1 where id=?",event);assertThat(value(approve(job,extracted)).get("verdict")).isEqualTo("STALE");assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Integer.class,event)).isZero();}
 @Test void expiredLeaseIsFencedAndExtractionResumes(){var job=seed("EVENT",Long.toString(event));extract(job,data);db.update("update collection_job set lease_until=now()-interval '1 minute' where id=?",id(job));var reclaimed=graph.claim();assertThat(reclaimed.get("extraction")).isNotNull();assertThat(reclaimed.get("leaseToken")).isNotEqualTo(token(job));assertThatThrownBy(()->graph.heartbeat(id(job),token(job))).isInstanceOf(ApiException.class);}
 @Test void unobservedSourceCannotBeApproved(){var job=seed("EVENT",Long.toString(event));var e=extract(job,data);var wrong=new Audit("gpt-6.1-sol","graph-1","graph-1",true,List.of("https://example.com/other"),Map.of(),List.of());assertThatThrownBy(()->graph.decide(id(job),new Decision(token(job),UUID.fromString(e.get("id").toString()),e.get("resultHash").toString(),"APPROVE","checked",wrong))).isInstanceOf(ApiException.class);}
 @Test void extractionIdentityCannotBeReusedForAnotherPayload(){var job=seed("EVENT",Long.toString(event));UUID eid=UUID.randomUUID();graph.extract(id(job),new Extraction(token(job),eid,job.get("contextHash").toString(),value(data),audit()));assertThatThrownBy(()->graph.extract(id(job),new Extraction(token(job),eid,job.get("contextHash").toString(),Map.of("different",true),audit()))).isInstanceOf(ApiException.class);}
 @Test void modelFallbackIsRejected(){var job=seed("EVENT",Long.toString(event));var other=new Audit("different-model","graph-1","graph-1",true,List.of(source),Map.of(),List.of());assertThatThrownBy(()->graph.extract(id(job),new Extraction(token(job),UUID.randomUUID(),job.get("contextHash").toString(),value(data),other))).isInstanceOf(ApiException.class);}
 @Test void bootstrapIsIdempotentAndPreservesIds(){UUID run=UUID.randomUUID();graph.bootstrap(new Bootstrap(run,event-1,1));graph.bootstrap(new Bootstrap(run,event-1,1));assertThat(db.queryForObject("select count(*) from collection_migration where run_id=? and source_id=?",Integer.class,run,event)).isEqualTo(1);assertThat(db.queryForObject("select id from subculture_event_candidate where id=?",Long.class,event)).isEqualTo(event);}
 @Test void independentCreatorDoesNotRequireAnEvent(){var member=new Member("[TEST] Independent","ARTIST",List.of(),source);long maker=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb)) returning id",Long.class,UUID.randomUUID().toString().replace("-","").repeat(2),member.name(),json.writeValueAsString(member));var job=seed("CREATOR",Long.toString(maker));var result=Map.of("profile",member,"sources",List.of(new Source(source,"OFFICIAL","ORIGINAL","Official creator profile")),"goods",List.of(),"coverage","COMPLETE");approve(job,extract(job,result));assertThat(interests.creator(maker).get("name")).isEqualTo(member.name());}
 @Test void participantAndSalesFlowReusesExistingCatalogIds(){
  var eventJob=seed("EVENT",Long.toString(event));approve(eventJob,extract(eventJob,data));
  db.update("update collection_job set available_at=now()+interval '7 days'");
  var member=new Member("[TEST] Maker","ARTIST",List.of(),source);var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Participant and sale official source"));
  var participant=new Participant(null,"[TEST] Maker","ARTIST",List.of(member),List.of(),List.of(),"Test creator",List.of(source),sources,List.of(),List.of());
  var coverage=new Coverage("COMPLETE",1,"REGISTERED_BOOTHS",List.of(source),null,List.of());
  var pj=seed("PARTICIPANTS",Long.toString(event));approve(pj,extract(pj,new StageResult("COMPLETE","One participant",List.of("test"),coverage,List.of(participant),null)));
  long pid=db.queryForObject("select id from subculture_participant where event_id=?",Long.class,event);
  db.update("update collection_job set available_at=now()+interval '7 days'");
  var product=new ProductData(null,"Test keyring","Character keyring",member.name(),List.of("keyring"),List.of("Candidate character"),"EVENT_SALE_CONFIRMED",null,"PLANNED",source,sources,List.of(),List.of());
  var sales=new Sales("Test sale","EVENT_SALE_CONFIRMED",List.of("keyring"),List.of(),"On site",sources,List.of(),List.of(product),List.of());
  var sj=seed("SALES",Long.toString(pid));approve(sj,extract(sj,new StageResult("COMPLETE","One product",List.of("test"),new Coverage("COMPLETE",1,"PRODUCTS",List.of(source),null,List.of()),List.of(),sales)));
  long legacy=db.queryForObject("select id from subculture_catalog_product where participant_id=?",Long.class,pid);UUID graphProduct=db.queryForObject("select id from collection_product where legacy_product_id=?",UUID.class,legacy);
  db.update("update collection_job set available_at=now()+interval '7 days'");var cj=seed("CHARACTERS",graphProduct.toString());
  var work=Map.of("name","Test Game","sourceUrl",source,"medium","게임");var character=Map.of("name","Test Hero","sourceUrl",source,"medium","게임");
  var assignment=Map.of("status","CONFIRMED","work",work,"character",character,"evidenceUrl",source,"evidence","Named on the product","basis","TEXT");
  approve(cj,extract(cj,Map.of("assignments",List.of(assignment),"unresolved",List.of(),"sources",sources)));
  assertThat(db.queryForObject("select target_id from subculture_subject_link where kind='PRODUCT' and target_id=?",Long.class,legacy)).isEqualTo(legacy);
  assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Integer.class,event)).isEqualTo(1);
  var link=db.queryForList("select * from subculture_subject_link where kind='PRODUCT' and target_id=?",legacy).getFirst();assertThat(interests.productLinkMatches(link,value(product))).isTrue();var changed=value(product);changed.put("name","A completely different character product");assertThat(interests.productLinkMatches(link,changed)).isFalse();
  db.update("update subculture_subject_link set active=false where id=?",link.get("id"));var recheck=seed("CHARACTERS",graphProduct.toString());approve(recheck,extract(recheck,Map.of("assignments",List.of(assignment),"unresolved",List.of(),"sources",sources)));assertThat(db.queryForObject("select active from subculture_subject_link where id=?",Boolean.class,link.get("id"))).isTrue();

 }
 @Test void partialPageKeepsContinuationInQueue(){
  var eventJob=seed("EVENT",Long.toString(event));approve(eventJob,extract(eventJob,data));db.update("update collection_job set available_at=now()+interval '7 days'");
  var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","First page"));var p=new Participant(null,"Test circle","CIRCLE",List.of(),List.of(),List.of(),"Test",List.of(),sources,List.of(),List.of());
  var job=seed("PARTICIPANTS",Long.toString(event));approve(job,extract(job,new StageResult("PARTIAL","More pages remain",List.of("test"),new Coverage("PARTIAL",2,"REGISTERED_BOOTHS",List.of(source),source+"?page=2",List.of()),List.of(p),null)));
  assertThat(db.queryForObject("select count(*) from collection_job where kind='PARTICIPANTS' and input_json->>'pageUrl'=?",Integer.class,source+"?page=2")).isEqualTo(1);
 }
 UUID standaloneProduct(){UUID id=UUID.randomUUID();db.update("insert into collection_product(id,identity_key,data_json) values(?,?,'{}')",id,UUID.randomUUID().toString());return id;}
 Map<String,Object> characters(String name){return Map.of("assignments",List.of(Map.of("status","CONFIRMED","work",Map.of("name","Test Game","sourceUrl",source,"medium","게임"),"character",Map.of("name",name,"sourceUrl",source,"medium","게임"),"evidenceUrl",source,"evidence","Named on this product","basis","TEXT")),"unresolved",List.of(),"sources",List.of(new Source(source,"OFFICIAL","ORIGINAL","Exact product")));}
 @Test void unresolvedAnalysisReturnsToEnrichmentWithReason(){var job=seed("CHARACTERS",standaloneProduct().toString());approve(job,extract(job,Map.of("assignments",List.of(),"unresolved",List.of("Two similarly named characters"),"sources",List.of(new Source(source,"OFFICIAL","ORIGINAL","Product")))));assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(job))).isEqualTo("WAITING");db.update("update collection_job set available_at=now() where id=?",id(job));var retry=graph.claim();assertThat(retry).doesNotContainKey("extraction");assertThat(retry.get("previousReview").toString()).contains("Two similarly named characters");}
 @Test void correctedAnalysisRetractsOldAttribution(){UUID product=standaloneProduct();var first=seed("CHARACTERS",product.toString());approve(first,extract(first,characters("First Hero")));var second=seed("CHARACTERS",product.toString());approve(second,extract(second,characters("Actual Hero")));assertThat(db.queryForList("select s.name from collection_product_subject l join subculture_subject s on s.id=l.subject_id where l.product_id=? and l.active",String.class,product)).containsExactly("Actual Hero");}
 @Test void hiddenSubjectCannotBeRecreatedWithAnotherId(){UUID product=standaloneProduct();var first=seed("CHARACTERS",product.toString());approve(first,extract(first,characters("Hidden Hero")));db.update("update subculture_subject set active=false,source_identity=null where name='Hidden Hero'");var second=seed("CHARACTERS",product.toString());var extracted=extract(second,characters("Hidden Hero"));assertThatThrownBy(()->approve(second,extracted)).isInstanceOf(ApiException.class).hasMessageContaining("비공개");}
 @Test void hidingCreatorDuringReviewCannotBeUndone(){var member=new Member("[TEST] Hidden Maker","ARTIST",List.of(),source);long maker=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb)) returning id",Long.class,UUID.randomUUID().toString().replace("-","").repeat(2),member.name(),json.writeValueAsString(member));var result=Map.of("profile",member,"sources",List.of(new Source(source,"OFFICIAL","ORIGINAL","Official creator profile")),"goods",List.of(),"coverage","COMPLETE");var first=seed("CREATOR",Long.toString(maker));approve(first,extract(first,result));var second=seed("CREATOR",Long.toString(maker));var extracted=extract(second,result);db.update("update collection_creator_publication set active=false,revision=revision+1 where exhibitor_id=?",maker);assertThat(value(approve(second,extracted)).get("verdict")).isEqualTo("STALE");assertThat(db.queryForObject("select active from collection_creator_publication where exhibitor_id=?",Boolean.class,maker)).isFalse();}
 @Test void partialCoverageWithoutNextPageIsNotComplete(){var member=new Member("[TEST] Partial Maker","ARTIST",List.of(),source);long maker=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb)) returning id",Long.class,UUID.randomUUID().toString().replace("-","").repeat(2),member.name(),json.writeValueAsString(member));var job=seed("CREATOR",Long.toString(maker));approve(job,extract(job,Map.of("profile",member,"sources",List.of(new Source(source,"OFFICIAL","ORIGINAL","Partial creator catalog")),"goods",List.of(),"coverage","PARTIAL")));assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(job))).isEqualTo("WAITING");}
 @Test void refreshGenerationsCoalesceWhileJobIsActive(){var a=graph.seed(new Seed("EVENT",Long.toString(event),Map.of(),false,"cycle-a"));var b=graph.seed(new Seed("EVENT",Long.toString(event),Map.of(),false,"cycle-b"));assertThat(b.get("id")).isEqualTo(a.get("id"));assertThat(db.queryForObject("select count(*) from collection_job where kind='EVENT' and target_id=?",Integer.class,Long.toString(event))).isEqualTo(1);}
 @Test void verifiedEmptyParticipantListCanComplete(){var first=seed("EVENT",Long.toString(event));approve(first,extract(first,data));db.update("update collection_job set available_at=now()+interval '7 days'");var job=seed("PARTICIPANTS",Long.toString(event));approve(job,extract(job,new StageResult("COMPLETE","Official list has no booths",List.of("test"),new Coverage("COMPLETE",0,"REGISTERED_BOOTHS",List.of(source),null,List.of()),List.of(),null)));assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(job))).isEqualTo("COMPLETE");}

 Audit audit(List<String> urls,List<String> hashes){return new Audit("gpt-6.1-sol","graph-1","graph-1",true,urls,Map.of(),hashes);}
 Object reviewed(Map<String,Object> job,Map<String,Object> result,Audit audit){var e=value(graph.extract(id(job),new Extraction(token(job),UUID.randomUUID(),textValue(job.get("contextHash")),result,audit)));return graph.decide(id(job),new Decision(token(job),UUID.fromString(textValue(e.get("id"))),textValue(e.get("resultHash")),"APPROVE","Both original sources and images verified",audit));}
 String textValue(Object x){return Objects.toString(x,"");}
 Map<String,Object> claimOnly(UUID id){db.update("update collection_job set available_at=now()+interval '7 days'");db.update("update collection_job set available_at=now() where id=?",id);return graph.claim();}
 UUID imageProduct(int count){UUID id=standaloneProduct();var images=new ArrayList<Map<String,Object>>();for(int i=0;i<count;i++)images.add(Map.of("imageUrl",source+"/image-"+i+".png","pageUrl",source));db.update("update collection_product set data_json=cast(? as jsonb) where id=?",json.writeValueAsString(Map.of("name","Test Game product","images",images)),id);return id;}
 Map<String,Object> covered(String hero,int offset,int count){var result=new LinkedHashMap<>(characters(hero));var coverage=new ArrayList<Map<String,Object>>();for(int i=offset;i<offset+count;i++)coverage.add(Map.of("index",i,"sha256",Integer.toHexString(i+1).repeat(64),"status","AVAILABLE"));result.put("imageCoverage",coverage);return result;}
 List<String> hashes(int offset,int count){var hashes=new ArrayList<String>();for(int i=offset;i<offset+count;i++)hashes.add(Integer.toHexString(i+1).repeat(64));return hashes;}
 UUID planImages(UUID product){var parent=graph.seed(new Seed("CHARACTERS",product.toString(),Map.of(),true,UUID.randomUUID().toString()));assertThat(claimOnly((UUID)parent.get("id"))).containsKey("skipped");return (UUID)parent.get("id");}
 Map<String,Object> imageJob(UUID parent,int offset){UUID child=db.queryForObject("select id from collection_job where input_json->>'analysisParent'=? and input_json->>'imageOffset'=?",UUID.class,parent.toString(),Integer.toString(offset));return claimOnly(child);}
 @Test void imageGroupsPublishOnlyAfterEveryGroupIsReviewed(){UUID product=imageProduct(5),parent=planImages(product);assertThat(db.queryForObject("select count(*) from collection_job where input_json->>'analysisParent'=?",Integer.class,parent.toString())).isEqualTo(2);
  var first=imageJob(parent,0);assertThat(value(reviewed(first,covered("First Image Hero",0,4),audit(List.of(source),hashes(0,4)))).get("pendingImageParts")).isEqualTo(true);assertThat(db.queryForObject("select count(*) from collection_product_subject where product_id=?",Integer.class,product)).isZero();
  assertThat(claimOnly(parent)).containsKey("skipped");assertThat(db.queryForObject("select count(*) from collection_image_part where parent_id=?",Integer.class,parent)).isEqualTo(1);
  var second=imageJob(parent,4);reviewed(second,covered("Fifth Image Hero",4,1),audit(List.of(source),hashes(4,1)));assertThat(db.queryForObject("select state from collection_job where id=?",String.class,parent)).isEqualTo("COMPLETE");assertThat(db.queryForObject("select count(*) from collection_product_subject where product_id=? and active",Integer.class,product)).isEqualTo(2);
 }
 @Test void rejectedImagePartTerminatesParentAndSiblings(){UUID product=imageProduct(5),parent=planImages(product);var first=imageJob(parent,0);var e=extract(first,covered("Wrong Target",0,4));graph.decide(id(first),new Decision(token(first),UUID.fromString(textValue(e.get("id"))),textValue(e.get("resultHash")),"REJECT","The image describes another product",audit()));assertThat(db.queryForObject("select state from collection_job where id=?",String.class,parent)).isEqualTo("REJECTED");assertThat(imageJob(parent,4)).containsKey("skipped");}
 @Test void changedProductCannotMixOldAndNewImageGroups(){UUID product=imageProduct(5),parent=planImages(product);reviewed(imageJob(parent,0),covered("Old Image Hero",0,4),audit(List.of(source),hashes(0,4)));db.update("update collection_product set revision=revision+1 where id=?",product);assertThat(imageJob(parent,4)).containsKey("skipped");assertThat(db.queryForObject("select count(*) from collection_product_subject where product_id=?",Integer.class,product)).isZero();}
 @Test void imageGroupCannotOmitOneAttachment(){UUID product=imageProduct(4);var job=seed("CHARACTERS",product.toString());assertThatThrownBy(()->reviewed(job,covered("Missing Image Hero",0,3),audit(List.of(source),hashes(0,3)))).isInstanceOf(ApiException.class).hasMessageContaining("누락");}
 @Test void invalidProductRegionIsRejected(){UUID product=imageProduct(1);var job=seed("CHARACTERS",product.toString());var result=covered("Wrong Crop",0,1);var assignment=new LinkedHashMap<>(value(((List<?>)result.get("assignments")).getFirst()));assignment.put("basis","IMAGE");assignment.put("imageHash",hashes(0,1).getFirst());assignment.put("imageRegion",Map.of("x",0.9,"y",0,"width",0.3,"height",1));result.put("assignments",List.of(assignment));assertThatThrownBy(()->reviewed(job,result,audit(List.of(source),hashes(0,1)))).isInstanceOf(ApiException.class).hasMessageContaining("영역 범위");}
 @Test void confirmedSourceAliasReusesCharacterId(){UUID product=standaloneProduct();var first=seed("CHARACTERS",product.toString());approve(first,extract(first,characters("Stable Hero")));UUID character=db.queryForObject("select id from subculture_subject where name='Stable Hero'",UUID.class);String alias=source+"/official-other-language";
  var result=characters("Stable Hero");var assignment=new LinkedHashMap<>(value(((List<?>)result.get("assignments")).getFirst()));var candidate=new LinkedHashMap<>(value(assignment.get("character")));candidate.put("id",character.toString());candidate.put("name","Another Language Hero");candidate.put("sourceUrl",alias);candidate.put("identityEvidence",List.of(Map.of("sourceUrl",source,"evidence","Official canonical character"),Map.of("sourceUrl",alias,"evidence","Official translated page identifies the same character")));assignment.put("character",candidate);result=new LinkedHashMap<>(result);result.put("assignments",List.of(assignment));reviewed(seed("CHARACTERS",product.toString()),result,audit(List.of(source,alias),List.of()));assertThat(db.queryForObject("select subject_id from collection_subject_identity where name='Another Language Hero'",UUID.class)).isEqualTo(character);assertThat(db.queryForObject("select count(*) from subculture_subject where id=?",Integer.class,character)).isEqualTo(1);assertThat(interests.subjects("Another Language Hero","CHARACTER",0)).extracting(r->r.get("id")).contains(character);
  candidate.remove("id");candidate.put("identityDecision","DISTINCT");assignment.put("character",candidate);result.put("assignments",List.of(assignment));reviewed(seed("CHARACTERS",product.toString()),result,audit(List.of(source,alias),List.of()));assertThat(db.queryForObject("select count(*) from collection_subject_identity where name='Another Language Hero'",Integer.class)).isZero();assertThat(db.queryForObject("select id from subculture_subject where name='Another Language Hero'",UUID.class)).isNotEqualTo(character);assertThat(db.queryForObject("select active from subculture_subject where id=?",Boolean.class,character)).isTrue();

 }
 @Test void sourceAliasWithoutBothProofsIsRejected(){UUID product=standaloneProduct();approveJob(seed("CHARACTERS",product.toString()),characters("Identity Hero"));UUID character=db.queryForObject("select id from subculture_subject where name='Identity Hero'",UUID.class);var result=new LinkedHashMap<>(characters("Identity Hero"));var assignment=new LinkedHashMap<>(value(((List<?>)result.get("assignments")).getFirst()));var candidate=new LinkedHashMap<>(value(assignment.get("character")));candidate.put("id",character.toString());candidate.put("sourceUrl",source+"/unproven");assignment.put("character",candidate);result.put("assignments",List.of(assignment));var job=seed("CHARACTERS",product.toString());assertThatThrownBy(()->reviewed(job,result,audit(List.of(source,source+"/unproven"),List.of()))).isInstanceOf(ApiException.class).hasMessageContaining("동일성 근거");}
 void approveJob(Map<String,Object> job,Map<String,Object> result){approve(job,extract(job,result));}
 long maker(String name,String url){var member=new Member(name,"ARTIST",List.of(),url);return db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb)) returning id",Long.class,UUID.randomUUID().toString().replace("-","").repeat(2),name,json.writeValueAsString(member));}
 Map<String,Object> makerResult(String name,String url){return new LinkedHashMap<>(Map.of("profile",new Member(name,"ARTIST",List.of(),url),"sources",List.of(new Source(url,"OFFICIAL","ORIGINAL","Official author profile")),"goods",List.of(),"coverage","COMPLETE"));}
 @Test void creatorIdentityCanBeLinkedAndUnlinkedWithoutRewritingIds(){String other=source+"/old-account";long canonical=maker("Same Artist",source),alias=maker("Same Artist",other);approveJob(seed("CREATOR",Long.toString(canonical)),makerResult("Same Artist",source));var result=makerResult("Same Artist",other);var proof=List.of(Map.of("sourceUrl",source,"evidence","The official artist confirms the previous account"),Map.of("sourceUrl",other,"evidence","Account migration points to the official new account"));result.put("identityDecision",Map.of("action","LINK","canonicalId",canonical,"evidence",proof));reviewed(seed("CREATOR",Long.toString(alias)),result,audit(List.of(source,other),List.of()));assertThat(interests.relatedCreatorIds(Set.of(alias))).containsExactlyInAnyOrder(alias,canonical);assertThat(interests.creatorCards(interests.creatorViews(List.of(alias,canonical)))).hasSize(1);assertThat(db.queryForObject("select count(*) from subculture_exhibitor where id in (?,?)",Integer.class,alias,canonical)).isEqualTo(2);
  result.put("identityDecision",Map.of("action","UNLINK","canonicalId",canonical,"evidence",proof));reviewed(seed("CREATOR",Long.toString(alias)),result,audit(List.of(source,other),List.of()));assertThat(interests.relatedCreatorIds(Set.of(alias))).containsExactly(alias);assertThat(db.queryForObject("select count(*) from collection_identity_history where kind='CREATOR' and target_id=?",Integer.class,Long.toString(alias))).isEqualTo(2);
 }
 @Test void creatorEventLeadQueuesSeparateDiscovery(){long id=maker("Event Author",source);var result=makerResult("Event Author",source);String day=data.occurrences().getFirst().startDate();result.put("eventLeads",List.of(Map.of("sourceUrl",source,"evidence","Official dated participation announcement","startDate",day,"endDate",day)));approveJob(seed("CREATOR",Long.toString(id)),result);assertThat(db.queryForObject("select count(*) from collection_job where kind='DISCOVERY' and input_json->>'leadUrl'=?",Integer.class,source)).isEqualTo(1);assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Integer.class,event)).isZero();}
 @Test void anotherArtistsProductCannotBeAttributedToThisCreator(){long id=maker("Catalog Owner",source);var result=makerResult("Catalog Owner",source);var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Joint sales sheet"));result.put("goods",List.of(new ProductData(null,"Other artists goods","Joint table product","Another Artist",List.of("keyring"),List.of(),"GENERAL_CATALOG",null,"UNKNOWN",source,sources,List.of(),List.of())));var job=seed("CREATOR",Long.toString(id));assertThatThrownBy(()->approveJob(job,result)).isInstanceOf(ApiException.class).hasMessageContaining("다른 작가");}
 @Test void malformedImageRangeIsRejectedBeforeQueueInsertion(){assertThatThrownBy(()->graph.seed(new Seed("CHARACTERS",UUID.randomUUID().toString(),Map.of("analysisParent",UUID.randomUUID().toString(),"imageOffset",0.5,"imageTotal",5,"productRevision",1),false,"test"))).isInstanceOf(ApiException.class).hasMessageContaining("정수");}
 @Test void encodedSourcePathCannotBeReplacedWithAnotherPage(){var job=seed("EVENT",Long.toString(event));var result=value(data);result.put("sources",List.of(new Source("https://example.com/a%2Fb","OFFICIAL","ORIGINAL","Exact encoded source page")));assertThatThrownBy(()->reviewed(job,result,audit(List.of("https://example.com/a/b"),List.of()))).isInstanceOf(ApiException.class).hasMessageContaining("직접");}
 @Test void malformedTargetNeverPoisonsClaimQueue(){assertThatThrownBy(()->graph.seed(new Seed("CHARACTERS","not-a-uuid",Map.of(),false,"test"))).isInstanceOf(ApiException.class);assertThatThrownBy(()->graph.seed(new Seed("EVENT","not-an-id",Map.of(),false,"test"))).isInstanceOf(ApiException.class);assertThat(db.queryForObject("select count(*) from collection_job where target_id in ('not-a-uuid','not-an-id')",Integer.class)).isZero();}
 @Test void imageClaimRequiresSameImageInBothCalls(){UUID product=UUID.randomUUID();db.update("insert into collection_product(id,identity_key,data_json) values(?,?,'{}')",product,UUID.randomUUID().toString());var job=seed("CHARACTERS",product.toString());var result=Map.of("sources",List.of(new Source(source,"OFFICIAL","ORIGINAL","Product")),"assignments",List.of(Map.of("basis","IMAGE","imageHash","a".repeat(64))));var e=extract(job,result);assertThatThrownBy(()->approve(job,e)).isInstanceOf(ApiException.class);}
 @Test void internalApiRequiresCollectorToken()throws Exception{http.perform(post("/api/internal/subculture/v6/claim").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());http.perform(get("/api/internal/subculture/v6/status").servletPath("/api/internal/subculture/v6/status").header("Authorization","Bearer graph-isolated-test-token-1234567890")).andExpect(status().isOk());}
 @Test void unavailableImageDoesNotBlockVerifiedTextOrEraseOtherLinks(){
  UUID product=imageProduct(1);var job=seed("CHARACTERS",product.toString());var result=new LinkedHashMap<>(characters("Text Hero"));
  result.put("imageCoverage",List.of(Map.of("index",0,"status","UNAVAILABLE")));result.put("unresolved",List.of("Remaining image could contain another character"));
  approve(job,extract(job,result));assertThat(db.queryForObject("select count(*) from collection_product_subject where product_id=? and active",Integer.class,product)).isEqualTo(1);
  assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(job))).isEqualTo("WAITING");
 }
 @Test void emptyOpenAuditCanBeDeferredButNeverApproved(){
  var job=seed("EVENT",Long.toString(event));var a=new Audit("gpt-6.1-sol","graph-3","graph-3",true,List.of(),Map.of(),List.of());UUID eid=UUID.randomUUID();
  var receipt=value(graph.extract(id(job),new Extraction(token(job),eid,job.get("contextHash").toString(),value(data),a)));
  assertThatThrownBy(()->graph.decide(id(job),new Decision(token(job),eid,receipt.get("resultHash").toString(),"APPROVE","No body",a))).isInstanceOf(ApiException.class);
 }
 @Test void independentlyFetchedOriginalIsAcceptedWithoutRedundantSearch(){
  var job=seed("EVENT",Long.toString(event));var a=new Audit("gpt-6.1-sol","graph-3","graph-3",false,List.of(source),Map.of(),List.of(),List.of(new SourceDocument(source,"a".repeat(64),Instant.now().toString())));
  reviewed(job,value(data),a);assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Integer.class,event)).isEqualTo(1);
 }
 @Test void claimedOriginalSnapshotRequiresContentHash(){
  var job=seed("EVENT",Long.toString(event));var a=new Audit("gpt-6.1-sol","graph-3","graph-3",false,List.of(source),Map.of(),List.of(),List.of(new SourceDocument(source,"",Instant.now().toString())));
  assertThatThrownBy(()->graph.extract(id(job),new Extraction(token(job),UUID.randomUUID(),job.get("contextHash").toString(),value(data),a))).isInstanceOf(ApiException.class).hasMessageContaining("스냅샷");
 }
 @Test void failedVisitedPageIsNotAnApprovedFactSource(){var job=seed("EVENT",Long.toString(event));var result=value(data);result.put("coverage",Map.of("visitedPages",List.of(source,"https://example.com/failed")));var e=extract(job,result);
  // Test source checking directly; EVENT payload does not include coverage.
  new GraphProjection(db,json,null,null,null,null,null).checkSources(result,List.of(source));
 }
 @Test void creatorCannotCollapseVerifiedOptionsIntoForm(){long id=maker("Options Author",source);var result=makerResult("Options Author",source);result.put("productCoverage",List.of(Map.of("sourceUrl",source,"optionNames",List.of("Hero A","Hero B"),"complete",true)));
  assertThatThrownBy(()->approveJob(seed("CREATOR",Long.toString(id)),result)).isInstanceOf(ApiException.class).hasMessageContaining("옵션");
 }
 @Test void discoveryApprovesOneEventAndSeparatelyQueuesUncertainEdition(){
  String day=data.occurrences().getFirst().startDate();var input=Map.<String,Object>of("scope",Map.of("region","SEOUL_GYEONGGI","timezone","Asia/Seoul","startDate",day,"endDate",day));
  graph.seed(new Seed("DISCOVERY","partial-test",input,true,"test"));var job=graph.claim();var first=value(data);var second=value(data);second.put("name","[TEST] Deferred event");second.put("edition","Deferred 2026");
  String deferredSource="https://example.com/deferred-edition";second.put("sources",List.of(new Source(deferredSource,"OFFICIAL","ORIGINAL","Unconfirmed edition")));
  var freshRef=new LinkedHashMap<String,Object>();freshRef.put("eventIndex",0);freshRef.put("existingEventId",null);freshRef.put("identityReason","Unconfirmed new edition");
  var result=Map.of("schemaVersion","1","searchStatus","COMPLETE","summary","Two event candidates","queries",List.of("test"),"events",List.of(second,first),
   "eventEvidence",List.of(Map.of("eventIndex",0,"sourceUrl",deferredSource),Map.of("eventIndex",1,"sourceUrl",source)),
   "unverifiedLeads",List.of(Map.of("sourceUrl","https://example.com/unverified-lead")),
   "existingEventRefs",List.of(freshRef,Map.of("eventIndex",1,"existingEventId",event,"identityReason","Same exact edition")));var e=extract(job,result);
  var decisions=List.of(new EventDecision(0,"ENRICH","Schedule conflict",audit()),new EventDecision(1,"APPROVE","Exact edition",audit()));
  graph.decide(id(job),new Decision(token(job),UUID.fromString(e.get("id").toString()),e.get("resultHash").toString(),"APPROVE","Independent decisions",audit(),decisions));
  assertThat(db.queryForObject("select count(*) from subculture_event_candidate where name='[TEST] Deferred event'",Integer.class)).isZero();
  assertThat(db.queryForObject("select count(*) from collection_job where kind='DISCOVERY' and input_json->'eventHint'->>'name'='[TEST] Deferred event'",Integer.class)).isEqualTo(1);
  assertThat(db.queryForObject("select count(*) from collection_job j join subculture_event_candidate e on e.id::text=j.target_id where j.kind='EVENT' and e.name=?",Integer.class,data.name())).isEqualTo(1);
  assertThat(db.queryForObject("select jsonb_array_length(audit_json->'eventDecisions') from collection_verdict where extraction_id=?",Integer.class,UUID.fromString(e.get("id").toString()))).isEqualTo(2);
  assertThat(db.queryForObject("select jsonb_array_length(result_json->'eventEvidence') from collection_extraction where id=?",Integer.class,UUID.fromString(e.get("id").toString()))).isEqualTo(2);
 }
 @Test void tablesDenyDirectBrowserRoles(){for(String table:List.of("collection_job","collection_extraction","collection_verdict","collection_product","collection_product_subject","collection_creator_publication","collection_migration","collection_image_part","collection_subject_identity","collection_creator_identity","collection_identity_history")){assertThat(db.queryForObject("select relrowsecurity from pg_class where oid=cast(? as regclass)",Boolean.class,table)).isTrue();assertThat(db.queryForObject("select has_table_privilege('anon',?,'SELECT') or has_table_privilege('authenticated',?,'SELECT')",Boolean.class,table,table)).isFalse();}}

 @Test void discoveryReceivesLegacyIdentityAndKeepsManualCorrections(){
  db.update("update subculture_event_candidate set payload_json=jsonb_set(payload_json,'{edition}','null'),overrides_json=cast(? as jsonb) where id=?",json.writeValueAsString(Map.of("name","[TEST] Canonical remembered title")),event);
  String day=data.occurrences().getFirst().startDate();
  graph.seed(new Seed("DISCOVERY","canonical-identity",Map.of("scope",Map.of("startDate",day,"endDate",day)),true,"test"));
  var job=graph.claim();var context=value(job.get("context"));
  var existing=(List<Map<String,Object>>)context.get("existingEvents");
  var known=existing.stream().filter(e->((Number)e.get("id")).longValue()==event).findFirst().orElseThrow();
  var canonical=value(known.get("data"));
  assertThat(canonical.get("name")).isEqualTo("[TEST] Canonical remembered title");
  assertThat(canonical.get("edition")).isNull();
  assertThat(canonical.get("organizer")).isEqualTo(data.organizer());
  db.update("update subculture_event_candidate set publication_withdrawn=true where id=?",event);
  assertThatThrownBy(()->extract(job,Map.of("schemaVersion","1","searchStatus","PARTIAL","summary","none","queries",List.of("test"),"events",List.of(),"sourceCoverage",List.of(Map.of("channel","ORGANIZER_OFFICIAL","status","PARTIAL","queries",List.of("test"),"checkedUrls",List.of(source),"notes","checked"))))).isInstanceOf(ApiException.class).hasMessageContaining("변경");
 }
 @Test void discoveryReusesIdAcrossEditionAndNameChangesWithoutLosingManualTitle(){
  db.update("update subculture_event_candidate set payload_json=jsonb_set(payload_json,'{edition}','null'),overrides_json=cast(? as jsonb) where id=?",json.writeValueAsString(Map.of("name","[TEST] Protected manual title")),event);
  String day=data.occurrences().getFirst().startDate();
  graph.seed(new Seed("DISCOVERY","reuse-id",Map.of("scope",Map.of("region","SEOUL_GYEONGGI","timezone","Asia/Seoul","startDate",day,"endDate",day)),true,"test"));var job=graph.claim();
  long before=db.queryForObject("select count(*) from subculture_event_candidate",Long.class);
  var candidate=value(data);candidate.put("name","[TEST] Latest translated official title");
  var result=Map.of("schemaVersion","1","searchStatus","COMPLETE","summary","Known event updated","queries",List.of("test"),"events",List.of(candidate),"existingEventRefs",List.of(Map.of("eventIndex",0,"existingEventId",event,"identityReason","Same official edition, organizer, venue and dates")));
  var e=extract(job,result);graph.decide(id(job),new Decision(token(job),UUID.fromString(e.get("id").toString()),e.get("resultHash").toString(),"APPROVE","Same existing event independently verified",audit(),List.of(new EventDecision(0,"APPROVE","Same edition",audit()))));
  assertThat(db.queryForObject("select count(*) from subculture_event_candidate",Long.class)).isEqualTo(before);
  assertThat(db.queryForObject("select payload_json->>'edition' from subculture_event_candidate where id=?",String.class,event)).isEqualTo("2026");
  assertThat(db.queryForObject("select name from subculture_event_candidate where id=?",String.class,event)).isEqualTo("[TEST] Protected manual title");
  assertThat(db.queryForObject("select count(*) from collection_job where kind='EVENT' and target_id=?",Integer.class,Long.toString(event))).isEqualTo(1);
 }
 @Test void discoveryCannotReuseIdOutsideCapturedCandidates(){
  var candidate=value(data);var context=Map.<String,Object>of("existingEvents",List.of(Map.of("id",event)));
  var result=Map.<String,Object>of("events",List.of(candidate),"existingEventRefs",List.of(Map.of("eventIndex",0,"existingEventId",event+1000000,"identityReason","Claimed identity")));
  assertThatThrownBy(()->GraphProjection.existingEventTargets(result,context)).isInstanceOf(ApiException.class).hasMessageContaining("문맥");
 }
 ProductData option(String name,String entry,String url,List<Source> sources,Identity identity){return new ProductData(entry,name,"Original product option","Identity Maker",List.of(),List.of(),"GENERAL_CATALOG",null,"UNKNOWN",url,sources,List.of(),List.of(),identity);}
 Map<String,Object> productWindow(int offset,int total){var result=makerResult("Identity Maker",source);var goods=new ArrayList<ProductData>();for(int i=offset;i<Math.min(total,offset+100);i++)goods.add(option("Option "+i,null,null,List.of(new Source(source,"OFFICIAL","ORIGINAL","Exact named option")),null));result.put("goods",goods);result.put("coverage",offset+goods.size()<total?"PARTIAL":"COMPLETE");result.put("pageBatch",Map.of("sourceUrl",source,"sourceHash","a".repeat(64),"offset",offset,"total",total,"labels",goods.stream().map(ProductData::name).toList()));return result;}
 Audit pageAudit(String digest){return new Audit("gpt-6.1-sol","graph-4","graph-4",false,List.of(source),Map.of(),List.of(),List.of(new SourceDocument(source,digest,Instant.now().toString())));}
 Map<String,Object> claimCreatorBatch(){db.update("update collection_job set available_at=now()+interval '7 days'");db.update("update collection_job set available_at=now() where kind='CREATOR' and jsonb_exists(input_json,'pageBatch')");return graph.claim();}
 long salesParticipant(){
  approveJob(seed("EVENT",Long.toString(event)),value(data));db.update("update collection_job set available_at=now()+interval '7 days'");
  var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Named participant"));
  var participant=new Participant(null,"Identity Maker","ARTIST",List.of(new Member("Identity Maker","ARTIST",List.of(),source)),List.of(),List.of(),"Creator",List.of(source),sources,List.of(),List.of());
  approveJob(seed("PARTICIPANTS",Long.toString(event)),value(new StageResult("COMPLETE","One participant",List.of("test"),new Coverage("COMPLETE",1,"REGISTERED_BOOTHS",List.of(source),null,List.of()),List.of(participant),null)));
  return db.queryForObject("select id from subculture_participant where event_id=?",Long.class,event);
 }
 Map<String,Object> salesWindow(int offset,int total){
  var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Named sales options"));var goods=new ArrayList<ProductData>();
  for(int i=offset;i<Math.min(total,offset+100);i++)goods.add(new ProductData(null,"Option "+i,"Original option","Identity Maker",List.of(),List.of(),"EVENT_SALE_CONFIRMED",null,"PLANNED",null,sources,List.of(),List.of()));
  String state=offset+goods.size()<total?"PARTIAL":"COMPLETE";
  var result=value(new StageResult(state,"Sales page",List.of("test"),new Coverage(state,total,"PRODUCTS",List.of(source),null,List.of()),List.of(),new Sales("Named products","EVENT_SALE_CONFIRMED",List.of(),List.of(),"On site",sources,List.of(),goods,List.of())));
  if(total>100)result.put("pageBatch",Map.of("sourceUrl",source,"sourceHash","a".repeat(64),"offset",offset,"total",total,"labels",goods.stream().map(ProductData::name).toList()));return result;
 }
 Map<String,Object> singleSale(String name){var result=salesWindow(0,1);var sale=value(result.get("sales"));var product=value(((List<?>)sale.get("products")).getFirst());product.put("name",name);product.put("summary","Separate collection observation");sale.put("products",List.of(product));result.put("sales",sale);return result;}
 void collectSales(long participant,Map<String,Object> result){db.update("update collection_job set available_at=now()+interval '7 days'");reviewed(seed("SALES",Long.toString(participant)),result,pageAudit("a".repeat(64)));}
 Map<String,Object> claimSalesWindow(long participant,int offset){db.update("update collection_job set available_at=now()+interval '7 days'");db.update("update collection_job set available_at=now() where kind='SALES' and target_id=? and state='PENDING' and input_json->'pageBatch'->>'offset'=?",Long.toString(participant),Integer.toString(offset));return graph.claim();}
 int publicSalesChecks(String state){return db.queryForObject("select count(*) from subculture_catalog_publication pub,jsonb_array_elements(pub.snapshot_json->'participants') person,jsonb_array_elements(person->'productRows') product where pub.event_id=? and product->'verification'->>'state'=?",Integer.class,event,state);}
 @Test void salesWindowsPreserveAllApprovedWindowsButNotUnseenHistory(){
  long participant=salesParticipant();collectSales(participant,singleSale("Old option"));
  db.update("update subculture_catalog_product set last_seen_stage_id=null where participant_id=?",participant);
  collectSales(participant,salesWindow(0,203));
  reviewed(claimSalesWindow(participant,100),salesWindow(100,203),pageAudit("a".repeat(64)));
  assertThat(publicSalesChecks("CONFIRMED_CURRENT")).isEqualTo(200);
  var last=claimSalesWindow(participant,200);reviewed(last,salesWindow(200,203),pageAudit("a".repeat(64)));
  assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(last))).isEqualTo("COMPLETE");
  assertThat(publicSalesChecks("CONFIRMED_CURRENT")).isEqualTo(203);assertThat(publicSalesChecks("NOT_RECONFIRMED")).isEqualTo(1);
  // An ordinary later collection must still mark unobserved historical rows as unconfirmed.
  collectSales(participant,singleSale("Option 0"));assertThat(publicSalesChecks("CONFIRMED_CURRENT")).isEqualTo(1);assertThat(publicSalesChecks("NOT_RECONFIRMED")).isEqualTo(203);
 }
 @Test void salesContinuationDoesNotReconfirmRowsOverwrittenByAnotherRun(){
  long participant=salesParticipant();collectSales(participant,salesWindow(0,103));collectSales(participant,singleSale("Option 0"));
  reviewed(claimSalesWindow(participant,100),salesWindow(100,103),pageAudit("a".repeat(64)));
  assertThat(publicSalesChecks("CONFIRMED_CURRENT")).isEqualTo(102);assertThat(publicSalesChecks("NOT_RECONFIRMED")).isEqualTo(1);
  assertThat(db.queryForObject("select payload_json->>'summary' from subculture_catalog_product where participant_id=? and name='Option 0'",String.class,participant)).isEqualTo("Separate collection observation");
 }
 @Test void singlePage103OptionsResumeWithoutInventingNextUrl(){long maker=maker("Identity Maker",source);reviewed(seed("CREATOR",Long.toString(maker)),productWindow(0,103),pageAudit("a".repeat(64)));var next=claimCreatorBatch();assertThat(value(next.get("input")).get("pageUrl")).isEqualTo(source);reviewed(next,productWindow(100,103),pageAudit("a".repeat(64)));assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,maker)).isEqualTo(103);assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(next))).isEqualTo("COMPLETE");}
 @Test void pageWindowRejectsRepetitionOfEarlierItems(){long maker=maker("Identity Maker",source);reviewed(seed("CREATOR",Long.toString(maker)),productWindow(0,103),pageAudit("a".repeat(64)));var next=claimCreatorBatch();var duplicate=productWindow(0,3);duplicate.put("pageBatch",Map.of("sourceUrl",source,"sourceHash","a".repeat(64),"offset",100,"total",103,"labels",List.of("Option 0","Option 1","Option 2")));assertThatThrownBy(()->reviewed(next,duplicate,pageAudit("a".repeat(64)))).isInstanceOf(ApiException.class).hasMessageContaining("반복");assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,maker)).isEqualTo(100);}
 @Test void changedSourceRestartsWindowInsteadOfMixingSnapshots(){long maker=maker("Identity Maker",source);reviewed(seed("CREATOR",Long.toString(maker)),productWindow(0,103),pageAudit("a".repeat(64)));var next=claimCreatorBatch();var result=productWindow(100,103);var a=pageAudit("a".repeat(64));var extraction=value(graph.extract(id(next),new Extraction(token(next),UUID.randomUUID(),next.get("contextHash").toString(),value(result),a)));graph.decide(id(next),new Decision(token(next),UUID.fromString(extraction.get("id").toString()),extraction.get("resultHash").toString(),"APPROVE","Source changed",pageAudit("b".repeat(64))));assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(next))).isEqualTo("STALE");assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,maker)).isEqualTo(100);assertThat(db.queryForObject("select count(*) from collection_job where kind='CREATOR' and state='PENDING' and input_json->>'pageUrl'=? and not(jsonb_exists(input_json,'pageBatch'))",Integer.class,source)).isEqualTo(1);}
 void saveGoods(long maker,List<ProductData> goods,List<String> opened){
  db.update("update collection_job set available_at=now()+interval '7 days'");
  var result=makerResult("Identity Maker",source);result.put("goods",goods);result.put("productCoverage",List.of(Map.of("sourceUrl",goods.getFirst().sources().getFirst().url(),"optionNames",goods.stream().map(ProductData::name).toList(),"complete",true)));
  // Every option in these fixtures shares this coverage source, except separate-form fixtures.
  if(goods.stream().anyMatch(p->p.sources().stream().noneMatch(s->s.url().equals(goods.getFirst().sources().getFirst().url()))))result.remove("productCoverage");
  reviewed(seed("CREATOR",Long.toString(maker)),result,audit(opened,List.of()));
 }
 @Test void blankIdsPreserveTwoCreatorOptionsAndNormalizeToNull(){
  long maker=maker("Identity Maker",source);var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Two named options"));
  saveGoods(maker,List.of(option("Hero A","",null,sources,null),option("Hero B","  ",null,sources,null)),List.of(source));
  assertThat(db.queryForList("select data_json->>'name' from collection_product where exhibitor_id=? order by data_json->>'name'",String.class,maker)).containsExactly("Hero A","Hero B");
  assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=? and data_json->>'sourceEntryId' is null",Integer.class,maker)).isEqualTo(2);
 }
 @Test void creatorSourceOrderAndRenamingPreserveStableIdAndAliases(){
  long maker=maker("Identity Maker",source);String detail=source+"/detail";var a=new Source(source,"OFFICIAL","ORIGINAL","Author option");var b=new Source(detail,"OFFICIAL","ORIGINAL","Product detail");var identity=new Identity("https://example.com","sku-42",null);
  saveGoods(maker,List.of(option("Old name","sku-42",null,List.of(a,b),identity)),List.of(source,detail));
  UUID original=db.queryForObject("select id from collection_product where exhibitor_id=?",UUID.class,maker);
  saveGoods(maker,List.of(option("New name","sku-42",null,List.of(b,a),identity)),List.of(source,detail));
  assertThat(db.queryForList("select id from collection_product where exhibitor_id=?",UUID.class,maker)).containsExactly(original);
  assertThat(db.queryForObject("select data_json->>'name' from collection_product where id=?",String.class,original)).isEqualTo("New name");
 }
 @Test void fixedProductUrlSurvivesRenameAndLaterSourceSubset(){
  long maker=maker("Identity Maker",source);String detail=source+"/detail";var a=new Source(source,"OFFICIAL","ORIGINAL","Author option");var b=new Source(detail,"OFFICIAL","ORIGINAL","Product detail");
  saveGoods(maker,List.of(option("Old name",null,detail,List.of(a,b),null)),List.of(source,detail));
  UUID original=db.queryForObject("select id from collection_product where exhibitor_id=?",UUID.class,maker);
  saveGoods(maker,List.of(option("New name",null,detail,List.of(b),null)),List.of(source,detail));
  saveGoods(maker,List.of(option("Old name",null,null,List.of(a),null)),List.of(source));
  assertThat(db.queryForList("select id from collection_product where exhibitor_id=?",UUID.class,maker)).containsExactly(original);
 }
 @Test void equalNamesOnDifferentFormsAreNotMerged(){
  long maker=maker("Identity Maker",source);String other=source+"/other-form";
  var a=option("Hero",null,null,List.of(new Source(source,"OFFICIAL","ORIGINAL","Form A")),null);var b=option("Hero",null,null,List.of(new Source(other,"OFFICIAL","ORIGINAL","Form B")),null);
  saveGoods(maker,List.of(a,b),List.of(source,other));
  assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,maker)).isEqualTo(2);
 }
 @Test void duplicateOptionIdentityRejectsEntireBatchBeforeProductsAreWritten(){
  long maker=maker("Identity Maker",source);var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Shared ID is not an option ID"));var identity=new Identity("https://example.com","form-id",null);
  assertThatThrownBy(()->saveGoods(maker,List.of(option("Hero A","form-id",null,sources,identity),option("Hero B","form-id",null,sources,identity)),List.of(source))).isInstanceOf(ApiException.class).hasMessageContaining("같은 상품 식별자");
  assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,maker)).isZero();
 }
 @Test void distinctExternalOptionIdsCanShareOneFormUrl(){
  long maker=maker("Identity Maker",source);var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Distinct external option IDs"));
  saveGoods(maker,List.of(option("Hero A","option-a",source,sources,new Identity("https://example.com","option-a",null)),option("Hero B","option-b",source,sources,new Identity("https://example.com","option-b",null))),List.of(source));
  assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,maker)).isEqualTo(2);
 }
 @Test void legacyCreatorProductIsAdoptedWithoutChangingUuid(){
  long maker=maker("Identity Maker",source);var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Legacy option"));var old=option("Hero B","",null,sources,null);UUID legacy=UUID.randomUUID();
  db.update("insert into collection_product(id,exhibitor_id,identity_key,data_json) values(?,?,?,cast(? as jsonb))",legacy,maker,CollectionRules.sha(maker+"\u001f"+source+"\u001f"),json.writeValueAsString(old));
  saveGoods(maker,List.of(option("Hero A",null,null,sources,null),option("Hero B",null,null,sources,null)),List.of(source));
  assertThat(db.queryForObject("select id from collection_product where exhibitor_id=? and data_json->>'name'='Hero B'",UUID.class,maker)).isEqualTo(legacy);
  assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,maker)).isEqualTo(2);
 }
 @Test void ambiguousExistingCreatorIdsAreNotSilentlyMerged(){
  long maker=maker("Identity Maker",source);var p=option("Hero",null,source,List.of(new Source(source,"OFFICIAL","ORIGINAL","Duplicate legacy rows")),null);
  for(int i=0;i<2;i++)db.update("insert into collection_product(id,exhibitor_id,identity_key,data_json) values(?,?,?,cast(? as jsonb))",UUID.randomUUID(),maker,UUID.randomUUID().toString(),json.writeValueAsString(p));
  assertThatThrownBy(()->saveGoods(maker,List.of(p),List.of(source))).isInstanceOf(ApiException.class).hasMessageContaining("기존 ID가 여러 개");
  assertThat(db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,maker)).isEqualTo(2);
 }
 Map<String,Object> emptyDiscovery(String status,String channelStatus,List<String> urls){return Map.of("schemaVersion","1","searchStatus",status,"summary","Verified official calendar","queries",List.of("Official calendar"),"events",List.of(),"sourceCoverage",List.of(Map.of("channel","ORGANIZER_OFFICIAL","status",channelStatus,"queries",List.of("Official calendar"),"checkedUrls",urls,"notes","No event in this date window")));}
 Map<String,Object> seedDiscovery(){String day=data.occurrences().getFirst().startDate();graph.seed(new Seed("DISCOVERY",UUID.randomUUID().toString(),Map.of("scope",Map.of("region","SEOUL_GYEONGGI","timezone","Asia/Seoul","startDate",day,"endDate",day)),true,"test"));return graph.claim();}
 @Test void verifiedEmptyDiscoveryCompletesAndStoresNoResults(){
  var job=seedDiscovery();approveJob(job,emptyDiscovery("COMPLETE","NO_RESULTS",List.of(source)));
  assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(job))).isEqualTo("COMPLETE");
  assertThat(db.queryForObject("select status from subculture_collection_run",String.class)).isEqualTo("NO_RESULTS");
  assertThat(db.queryForObject("select count(*) from subculture_collection_observation",Integer.class)).isZero();
 }
 @Test void incompleteEmptyDiscoveryStillWaitsForEnrichment(){
  var job=seedDiscovery();approveJob(job,emptyDiscovery("PARTIAL","PARTIAL",List.of(source,source+"/failed")));
  assertThat(db.queryForObject("select state from collection_job where id=?",String.class,id(job))).isEqualTo("WAITING");
 }
 @Test void emptyDiscoveryCannotClaimCompletionWithoutAllOriginalReads(){
  var projection=new GraphProjection(db,json,null,null,null,null,null);
  assertThatThrownBy(()->projection.checkSources(emptyDiscovery("COMPLETE","NO_RESULTS",List.of(source)),List.of())).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->projection.checkSources(emptyDiscovery("COMPLETE","NO_RESULTS",List.of(source,source+"/missing")),List.of(source))).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->projection.checkSources(emptyDiscovery("COMPLETE","INACCESSIBLE",List.of(source)),List.of(source))).isInstanceOf(ApiException.class);
 }
}
