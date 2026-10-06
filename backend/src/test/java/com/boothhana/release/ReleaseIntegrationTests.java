package com.boothhana.release;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.*;
import com.boothhana.domain.UserAccount;
import com.boothhana.domain.DomainEnums.PaymentMethod;
import com.boothhana.health.SchemaContract;
import com.boothhana.service.PlatformService;
import com.boothhana.support.*;
import com.boothhana.support.SupportModels.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;

/** REAL entire app + actual SQL001..030 already applied by prepare_test_db.py.
 * NEVER use production, SSH tunnels or a database containing real data.
 * OAuth provider/R2/real browsers/CLI are separate staging acceptance, not simulated success.
 * Class is skipped without opt-in; release_gate.py rejects a missing/skipped report. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class ReleaseIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p) {
  String url=System.getenv("BOOTH_FULL_TEST_URL");
  if(url==null||!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test"))throw new IllegalStateException("Isolated localhost test DB only");
  p.add("spring.datasource.url",()->url);
  p.add("spring.datasource.username",()->Objects.requireNonNull(System.getenv("BOOTH_FULL_TEST_USER")));
  p.add("spring.datasource.password",()->Objects.requireNonNull(System.getenv("BOOTH_FULL_TEST_PASSWORD")));
  p.add("spring.datasource.hikari.maximum-pool-size",()->2);
  p.add("spring.datasource.hikari.connection-timeout",()->5000);
  p.add("app.support.guest-enabled",()->false);p.add("app.support.attachments-enabled",()->false);
  p.add("app.support.rate-secret",()->"isolated-feedback-release-test-secret");
  p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");
 }
 @Autowired JdbcTemplate db;
 @Autowired PlatformService platform;
 @Autowired PlatformTransactionManager transactionManager;
 @Autowired WebApplicationContext context;
 @Autowired SupportOperations support;
 @Autowired SupportService supportService;
 @Autowired SupportRateLimiter supportLimiter;
 @Autowired OwnershipCatalogService ownership;
 @Autowired com.boothhana.collection.CatalogService catalog;
 @Autowired com.boothhana.collection.CatalogPublicationService publications;
 @Autowired tools.jackson.databind.json.JsonMapper json;
 @LocalServerPort int port;
 UserAccount owner,other;long eventId,boothId,productId;String subject;MockMvc http;
 @BeforeEach void fixture() {
  String name=db.queryForObject("select current_database()",String.class);
  assertThat(name).isEqualTo("boothhana_release_test");
  assertThat(db.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user",Boolean.class)).isFalse();
  subject="v14-"+UUID.randomUUID();owner=createUser(subject);other=createUser("v14-"+UUID.randomUUID());
  eventId=db.queryForObject("insert into event(name,start_at,end_at,venue,status) values('[TEST] release',now(),now()+interval '2 days','TEST','PUBLISHED') returning id",Long.class);
  long baseBooth=db.queryForObject("insert into booth(owner_user_id,name) values(?,'[TEST] booth') returning id",Long.class,owner.id);
  boothId=db.queryForObject("insert into event_booth(event_id,booth_id,booth_number,status,is_public) values(?,?,'B1','APPROVED',true) returning id",Long.class,eventId,baseBooth);
  long baseProduct=db.queryForObject("insert into product(booth_id,name) values(?,'[TEST] goods') returning id",Long.class,baseBooth);
  productId=db.queryForObject("insert into event_product(event_booth_id,product_id,price,stock_mode,stock_quantity) values(?,?,3000,'FINITE',10) returning id",Long.class,boothId,baseProduct);
  http=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
 }
 UserAccount createUser(String subject){UserAccount u=new UserAccount();u.id=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST]') returning id",Long.class,subject);u.kakaoSubject=subject;u.displayName="[TEST]";return u;}
 @Test void anonymousFeedbackIsPrivateIdempotentAndRequiresCsrf() throws Exception {
  var id=UUID.randomUUID();var input=new GuestCreate(new Create(id,"INQUIRY","FEATURE_REQUEST","캘린더 제안","일정 보기 기능이 필요합니다.",List.of(),null,Map.of("pagePath","/discover"),null),"a".repeat(43),"");
  String body=json.writeValueAsString(input);
  http.perform(post("/api/public/support/feedback").contentType("application/json").content(body)).andExpect(status().isForbidden());
  for(int i=0;i<2;i++)http.perform(post("/api/public/support/feedback").with(csrf()).with(request->{request.setRemoteAddr("2001:db8::"+id.toString().substring(0,4)+":"+id.toString().substring(4,8));return request;}).contentType("application/json").content(body))
   .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id.toString())).andExpect(jsonPath("$.number").exists())
   .andExpect(jsonPath("$.messages").doesNotExist()).andExpect(jsonPath("$.clientContext").doesNotExist()).andExpect(jsonPath("$.accessKey").doesNotExist());
  assertThat(db.queryForObject("select count(*) from support_ticket where id=? and requester_id is null and category='FEATURE_REQUEST'",Long.class,id)).isEqualTo(1);
  assertThat(db.queryForObject("select count(*) from support_message where ticket_id=?",Long.class,id)).isEqualTo(1);
  http.perform(get("/api/me/support/tickets/"+id)).andExpect(status().isUnauthorized());
  // Even if legacy guest account support is enabled later, feedback has no read/reply channel.
  var guestEnabledService=new SupportService(db,json,supportService.targetResolver(),supportLimiter,true,"isolated-feedback-release-test-secret");
  var feedbackAccess=new GuestAccess(id,input.accessKey());
  assertThatThrownBy(()->guestEnabledService.guestRead(feedbackAccess,"127.0.0.1")).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->guestEnabledService.guestReply(new GuestMessage(feedbackAccess,new Message(UUID.randomUUID(),0,"추가 의견입니다.",List.of(),false)),"127.0.0.1")).isInstanceOf(ApiException.class);
  var accountId=UUID.randomUUID();var account=new GuestCreate(new Create(accountId,"INQUIRY","ACCOUNT","로그인 문의","로그인에 문제가 있습니다.",List.of(),null,Map.of(),null),"b".repeat(43),"");
  new TransactionTemplate(transactionManager).execute(status->guestEnabledService.guestCreate(account,"127.0.0.1"));
  assertThat(guestEnabledService.guestRead(new GuestAccess(accountId,account.accessKey()),"127.0.0.1")).containsEntry("category","ACCOUNT");
  assertThat(db.queryForObject("select count(*) from support_message where ticket_id=?",Long.class,id)).isEqualTo(1);
  http.perform(get("/api/admin/support/tickets?kind=INQUIRY&category=FEATURE_REQUEST").with(user(subject).roles("ADMIN")))
   .andExpect(status().isOk()).andExpect(jsonPath("$.items[?(@.id == '"+id+"')]").isNotEmpty());
 }
 @Test void memberFeatureRequestUsesExistingReplyHistory() throws Exception {
  var id=UUID.randomUUID();support.create(new Create(id,"INQUIRY","FEATURE_REQUEST","회원 개선 의견","선택한 날짜의 일정이 필요합니다.",List.of(),null,Map.of("pagePath","/discover"),null),new Principal(owner.id,false,false));
  support.message(id,new Message(UUID.randomUUID(),0,"개선 계획에 반영했습니다.",List.of(),false),new Principal(other.id,true,false));
  http.perform(get("/api/me/support/tickets/"+id).with(user(subject).roles("FAN")))
   .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ANSWERED")).andExpect(jsonPath("$.messages.length()").value(2));
  http.perform(get("/api/me/support/tickets/"+id).with(user(other.kakaoSubject).roles("FAN"))).andExpect(status().isNotFound());
 }
 List<LineInput> lines(){return List.of(new LineInput(productId,2));}
 int stock(){return db.queryForObject("select stock_quantity from event_product where id=?",Integer.class,productId);}
 long count(String table){if(!Set.of("reservation","pos_sale").contains(table))throw new IllegalArgumentException();return db.queryForObject("select count(*) from "+table+" where event_booth_id=?",Long.class,boothId);}
 long receipts(){return db.queryForObject("select count(*) from trade_request where user_id=?",Long.class,owner.id);}
 @Test void schemaAndLeastPrivilegeRole() {
  db.queryForList(SchemaContract.probeSql());assertThat(SchemaContract.TABLES).hasSize(60).containsKeys("itinerary_share","personal_itinerary","purchase_plan");
  for(String table:SchemaContract.TABLES.keySet()) {
   assertThat(db.queryForObject("select relrowsecurity from pg_class where oid=to_regclass(?)",Boolean.class,"public."+table)).as(table).isTrue();
   assertThat(db.queryForObject("select has_table_privilege('anon',?,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',?,'SELECT,INSERT,UPDATE')",Boolean.class,"public."+table,"public."+table)).as(table+" anon").isFalse();
   assertThat(db.queryForObject("select has_table_privilege('authenticated',?,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',?,'SELECT,INSERT,UPDATE')",Boolean.class,"public."+table,"public."+table)).as(table+" authenticated").isFalse();
  }
 }
 @Test void memberProfileUpdatePersistsAndUploadConstraintAllowsProfile() throws Exception {
  String definition=db.queryForObject("select pg_get_constraintdef(oid) from pg_constraint where conrelid='image_upload'::regclass and conname='image_upload_target_check'",String.class);
  assertThat(definition).contains("profile");
  http.perform(patch("/api/me/profile").with(user(subject).roles("FAN")).contentType("application/json").content("{\"displayName\":\"새 닉네임\"}"))
    .andExpect(status().isForbidden());
  http.perform(patch("/api/me/profile").with(user(subject).roles("FAN")).with(csrf()).contentType("application/json").content("{\"displayName\":\"새 닉네임\",\"profileImageKey\":null,\"removeImage\":false}"))
    .andExpect(result -> assertThat(result.getResponse().getStatus()).as(result.getResponse().getContentAsString()).isEqualTo(200))
    .andExpect(jsonPath("$.displayName").value("새 닉네임"));
  assertThat(db.queryForObject("select custom_display_name from app_user where id=?",Boolean.class,owner.id)).isTrue();
  http.perform(get("/api/me").with(user(subject).roles("FAN")))
    .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("새 닉네임"));
 }
 @Test void reservationReplayUsesOneRecordAndDebit(){var input=new ReservationInput(boothId,lines(),UUID.randomUUID());long id=platform.createReservation(owner,input).id();assertThat(platform.createReservation(owner,input).id()).isEqualTo(id);assertThat(stock()).isEqualTo(8);assertThat(count("reservation")).isEqualTo(1);assertThat(receipts()).isEqualTo(1);}
 @Test void posReplayUsesOneRecordAndDebit(){var input=new PosInput(boothId,PaymentMethod.CASH,lines(),UUID.randomUUID());long id=platform.createPos(owner,input).id();assertThat(platform.createPos(owner,input).id()).isEqualTo(id);assertThat(stock()).isEqualTo(8);assertThat(count("pos_sale")).isEqualTo(1);assertThat(receipts()).isEqualTo(1);}
 @Test void changedBodySameIdConflicts(){UUID id=UUID.randomUUID();platform.createReservation(owner,new ReservationInput(boothId,lines(),id));assertThatThrownBy(()->platform.createReservation(owner,new ReservationInput(boothId,List.of(new LineInput(productId,1)),id))).isInstanceOf(ApiException.class);assertThat(stock()).isEqualTo(8);assertThat(count("reservation")).isEqualTo(1);}
 @Test void newIntentNewIdIsAllowed(){platform.createPos(owner,new PosInput(boothId,PaymentMethod.CASH,lines(),UUID.randomUUID()));platform.createPos(owner,new PosInput(boothId,PaymentMethod.CASH,lines(),UUID.randomUUID()));assertThat(stock()).isEqualTo(6);assertThat(count("pos_sale")).isEqualTo(2);}
 @Test void failedOuterCommitRollsBackJdbcReceiptJpaStockAndRows(){UUID id=UUID.randomUUID();assertThatThrownBy(()->new TransactionTemplate(transactionManager).execute(tx->{platform.createReservation(owner,new ReservationInput(boothId,lines(),id));throw new IllegalStateException("[TEST] controlled rollback");})).isInstanceOf(IllegalStateException.class);assertThat(stock()).isEqualTo(10);assertThat(count("reservation")).isZero();assertThat(receipts()).isZero();platform.createReservation(owner,new ReservationInput(boothId,lines(),id));assertThat(stock()).isEqualTo(8);}
 @Test void concurrentSameRequestCommitsOnce()throws Exception{UUID id=UUID.randomUUID();CountDownLatch start=new CountDownLatch(1);try(var pool=Executors.newFixedThreadPool(2)){Callable<Long> task=()->{start.await();return platform.createPos(owner,new PosInput(boothId,PaymentMethod.CASH,lines(),id)).id();};Future<Long>a=pool.submit(task),b=pool.submit(task);start.countDown();assertThat(a.get(20,TimeUnit.SECONDS)).isEqualTo(b.get(20,TimeUnit.SECONDS));}assertThat(stock()).isEqualTo(8);assertThat(count("pos_sale")).isEqualTo(1);assertThat(receipts()).isEqualTo(1);}
 @Test void canceledReservationReplayDoesNotReserveAgain(){var input=new ReservationInput(boothId,lines(),UUID.randomUUID());var a=platform.createReservation(owner,input);platform.cancelReservation(owner,a.id());assertThat(stock()).isEqualTo(10);assertThat(platform.createReservation(owner,input).status().name()).isEqualTo("CANCELED");assertThat(stock()).isEqualTo(10);}
 @Test void receiptIsOwnerScoped(){UUID id=UUID.randomUUID();platform.createReservation(owner,new ReservationInput(boothId,lines(),id));assertThat(platform.reservationReceipt(other,id)).containsExactlyInAnyOrderEntriesOf(Map.of("found",false));assertThat(platform.reservationReceipt(owner,id).get("found")).isEqualTo(true);}
 @Test void realHttpAuthenticationAndCsrfBoundary()throws Exception{var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();for(String path:List.of("/api/admin/support/tickets","/api/me/reservations")){var response=client.send(HttpRequest.newBuilder(URI.create("http://localhost:"+port+path)).timeout(Duration.ofSeconds(10)).GET().build(),HttpResponse.BodyHandlers.ofString());assertThat(response.statusCode()).isEqualTo(401);}http.perform(post("/api/me/reservations").with(user(subject).roles("FAN","CREATOR")).contentType("application/json").content("{}")).andExpect(status().isForbidden());}
 @Test void canonicalHttpInputRequiresRequestIdAndReplays()throws Exception{String old=json.writeValueAsString(Map.of("eventBoothId",boothId,"items",lines()));http.perform(post("/api/me/reservations").with(user(subject).roles("FAN","CREATOR")).with(csrf()).contentType("application/json").content(old)).andExpect(status().isBadRequest());String body=json.writeValueAsString(new ReservationInput(boothId,lines(),UUID.randomUUID()));for(int i=0;i<2;i++)http.perform(post("/api/me/reservations").with(user(subject).roles("FAN","CREATOR")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk());assertThat(count("reservation")).isEqualTo(1);assertThat(stock()).isEqualTo(8);}
 @Test void supportAdmissionIsOutsideBusinessTransaction(){UUID id=UUID.randomUUID();var p=new Principal(owner.id,false,false);var c=new Create(id,"INQUIRY","SERVICE","[TEST] 문의","확인 부탁드립니다",List.of(),null,Map.of(),null);assertThat(support.create(c,p).get("id")).isEqualTo(id.toString());assertThatThrownBy(()->new TransactionTemplate(transactionManager).execute(tx->support.create(c,p))).isInstanceOf(RuntimeException.class);}
 @Test void supportConcurrentRequestsFitSmallPool()throws Exception{var p=new Principal(owner.id,false,false);try(var pool=Executors.newFixedThreadPool(6)){List<Future<?>> all=new ArrayList<>();for(int i=0;i<6;i++){all.add(pool.submit(()->support.create(new Create(UUID.randomUUID(),"INQUIRY","SERVICE","[TEST]","동시 접수",List.of(),null,Map.of(),null),p)));}for(Future<?> x:all)x.get(30,TimeUnit.SECONDS);}assertThat(db.queryForObject("select count(*) from support_ticket where requester_id=?",Long.class,owner.id)).isEqualTo(6);}
 @Test void readyUsesEntireSchemaThroughRealServer()throws Exception{var result=HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/public/health/ready")).timeout(Duration.ofSeconds(10)).GET().build(),HttpResponse.BodyHandlers.ofString());assertThat(result.statusCode()).isEqualTo(200);assertThat(result.body()).contains("READY").doesNotContain("trade_request");}
 @Test void v24TypedColumnContractMatchesRealPostgres() {
  assertThat(SchemaContract.columnIssues(db.queryForList(SchemaContract.columnProbeSql())))
   .as("SQL001..030 column types, lengths and nullability").isEmpty();
 }
 long catalogEvent(String label) {
  var data=new com.boothhana.collection.CollectionModels.EventData(label,"ONLY_EVENT","테스트 단체","1회","SEOUL","서울 전시장","서울특별시 마포구","원래 소개","무료",List.of(),List.of(new com.boothhana.collection.CollectionModels.Occurrence("2026-10-03","2026-10-03","10:00","17:00")),List.of(new com.boothhana.collection.CollectionModels.Source("https://example.com/event","OFFICIAL","ORIGINAL","행사 안내")),List.of(),List.of());
  String encoded=json.writeValueAsString(data),key=SupportRules.digest(UUID.randomUUID().toString());
  long id=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,venue_name,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state,reviewed_payload_json) values(?,?,?,'ONLY_EVENT','서울 전시장','2026-10-03','2026-10-03',cast(? as jsonb),?,'[]','REVIEWED',cast(? as jsonb)) returning id",Long.class,key,key,label,encoded,key,encoded);
  publications.publish(id,new com.boothhana.collection.CatalogModels.PublishInput(1));return id;
 }
 @Test void informationRequestsNeedAdminReviewAndVisitorGuideNeedsRepublication() throws Exception {
  long normal=catalogEvent("[TEST] ordinary "+UUID.randomUUID()),requested=catalogEvent("[TEST] requested "+UUID.randomUUID());
  var ticket=new TicketInfo("general","일반권","2026-10-03","8000","KRW","2026-10-01",null,null,"https://example.com/ticket","PUBLISHED",null,"https://example.com/ticket","2026-10-02");
  var guide=new VisitorGuide(List.of(ticket),List.of(),List.of(),List.of(),List.of());
  catalog.editEvent(requested,new EditInput(1,"REVIEWED","Current edition source verified",Map.of("visitorGuide",guide)));
  http.perform(get("/api/public/catalog/events/"+requested)).andExpect(status().isOk()).andExpect(jsonPath("$.event.visitorGuide").doesNotExist());
  publications.publish(requested,new PublishInput(2));
  http.perform(get("/api/public/catalog/events/"+requested)).andExpect(status().isOk()).andExpect(jsonPath("$.event.visitorGuide.tickets[0].priceAmount").value("8000"));
  var request=UUID.randomUUID();support.create(new Create(request,"INQUIRY","FEATURE_REQUEST","정보 수집 요청","해당 행사의 인형 판매 안내를 확인해 주세요.",List.of(),null,Map.of("needType","PRODUCT","eventId",Long.toString(requested)),null),new Principal(owner.id,false,false));
  var pipeline=UUID.randomUUID();
  db.update("insert into subculture_pipeline_run(id,week_key,scope_json,state) values(?,cast(? as date),cast(? as jsonb),'RUNNING')",pipeline,"2026-10-02",json.writeValueAsString(new Scope("SEOUL_GYEONGGI","Asia/Seoul","2026-10-03","2026-10-03")));
  var before=catalog.eventTargets(pipeline.toString(),200).stream().filter(r->Objects.equals(r.get("id"),requested)).findFirst().orElseThrow();
  assertThat(before.get("informationRequested")).isEqualTo(false);
  db.update("update support_ticket set status='IN_PROGRESS' where id=?",request);
  var after=catalog.eventTargets(pipeline.toString(),200);
  var accepted=after.stream().filter(r->Objects.equals(r.get("id"),requested)).findFirst().orElseThrow();
  assertThat(accepted.get("informationRequested")).isEqualTo(true);
  assertThat(after.indexOf(accepted)).isLessThan(after.indexOf(after.stream().filter(r->Objects.equals(r.get("id"),normal)).findFirst().orElseThrow()));
  assertThat(accepted).doesNotContainKeys("body","requesterId","searchQuery");
  db.update("update subculture_pipeline_run set state='SUCCESS',finished_at=now() where id=?",pipeline);
 }
 @Test @org.springframework.transaction.annotation.Transactional
 void enrichmentPaginationAndAssetSyncReachBeyond200Events() {
  long seed=catalogEvent("[TEST] pagination "+UUID.randomUUID());
  long after=db.queryForObject("select max(id) from subculture_event_candidate",Long.class);
  var banner=new Banner("https://example.com/current.jpg","https://example.com/event","UNKNOWN",null,true);
  // Seed source-owned banner data; admin edits deliberately cannot change this field.
  String banners=json.writeValueAsString(List.of(banner));
  db.update("update subculture_event_candidate set payload_json=jsonb_set(payload_json,'{banners}',cast(? as jsonb)),reviewed_payload_json=jsonb_set(reviewed_payload_json,'{banners}',cast(? as jsonb)) where id=?",banners,banners,seed);
  String prefix=UUID.randomUUID().toString();
  db.update("""
    insert into subculture_event_candidate(identity_key,match_key,name,subcategory,venue_name,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state,reviewed_payload_json)
    select ?||i,?||i,e.name||i,e.subcategory,e.venue_name,e.starts_on,e.ends_on,e.payload_json,e.payload_hash,'[]','REVIEWED',e.reviewed_payload_json
    from subculture_event_candidate e cross join generate_series(1,205) i where e.id=?
    """,prefix,prefix,seed);
  var pipeline=UUID.randomUUID();
  db.update("insert into subculture_pipeline_run(id,week_key,scope_json,state) values(?,cast(? as date),cast(? as jsonb),'RUNNING')",pipeline,"2026-10-02",json.writeValueAsString(new Scope("SEOUL_GYEONGGI","Asia/Seoul","2026-10-03","2026-10-03")));
  var first=catalog.enrichmentTargets(pipeline.toString(),200,after);assertThat(first).hasSize(200);
  long cursor=(Long)first.getLast().get("id");
  var second=catalog.enrichmentTargets(pipeline.toString(),200,cursor);assertThat(second).hasSize(5);
  assertThat(second).allSatisfy(row->assertThat((Long)row.get("id")).isGreaterThan(cursor));
  assertThat(catalog.enrichmentTargets(pipeline.toString(),200,(Long)second.getLast().get("id"))).isEmpty();
  assertThatThrownBy(()->catalog.enrichmentTargets(pipeline.toString(),200,-1)).isInstanceOf(ApiException.class);
  catalog.syncEventAssets(pipeline.toString());
  long last=(Long)second.getLast().get("id");
  assertThat(db.queryForObject("select count(*) from subculture_catalog_asset where event_id=? and type='BANNER' and rights_state='APPROVED'",Long.class,last)).isEqualTo(1);
  db.update("update subculture_pipeline_run set state='SUCCESS',finished_at=now() where id=?",pipeline);
 }
 @Test void correctedSubcultureTypesAreReviewedAndPublishedInTheirOwnField() throws Exception {
  String label="[TEST] Q4 classification "+UUID.randomUUID();
  for(String type:List.of("SUBCULTURE_MUSIC","ANIME_GAME_FESTIVAL","ART_BOOK","BOARD_GAME","CHARACTER_ART","ILLUSTRATION")) {
   long id=catalogEvent(label+" "+type);
   catalog.editEvent(id,new EditInput(1,"REVIEWED","Official Q4 classification",Map.of("subcategory",type)));
   // An edit alone must not change the published point-in-time view.
   http.perform(get("/api/public/catalog/events").param("category","SUBCULTURE").param("subcategory",type).param("q",label))
    .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
   publications.publish(id,new PublishInput(2));
   http.perform(get("/api/public/catalog/events").param("category","SUBCULTURE").param("subcategory",type).param("q",label))
    .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(id)).andExpect(jsonPath("$.items[0].event.subcategory").value(type));
   assertThat(json.writeValueAsString(publications.detail(id))).contains("원래 소개");
  }
  long music=catalogEvent(label+" general music");
  catalog.editEvent(music,new EditInput(1,"REVIEWED","General music remains a festival",Map.of("subcategory","MUSIC")));
  publications.publish(music,new PublishInput(2));
  http.perform(get("/api/public/catalog/events").param("category","FESTIVAL").param("q",label))
   .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].id").value(music));
  http.perform(get("/api/public/catalog/events").param("category","EXHIBITION").param("q",label))
   .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
 }
 UUID claimOrganizer(long event) {
  UUID id=UUID.randomUUID();support.create(new Create(id,"CLAIM","ORGANIZER","테스트 주최 단체","공식 계정 소유 확인 요청",List.of("https://example.com/official"),new Target("CATALOG","EVENT",event,event,null,null,null,null),Map.of(),null),new Principal(owner.id,false,false));return id;
 }
 @Test void verifiedOrganizerLifecyclePreservesOverridesAndRevokesAccess(){
  long id=catalogEvent("[TEST] 인증 행사");UUID claim=claimOrganizer(id);var admin=new Principal(other.id,true,false);
  assertThatThrownBy(()->support.decide(claim,new ClaimDecision(0,"APPROVE","검증","승인",null,"단체","https://example.com"),new Principal(owner.id,true,false))).isInstanceOf(ApiException.class);
  support.decide(claim,new ClaimDecision(0,"APPROVE","공식 계정 소유 확인","주최자 연결 완료",null,"단체","https://example.com"),admin);
  assertThat((List<?>)ownership.publicInfo(id).get("organizers")).hasSize(1);
  assertThatThrownBy(()->ownership.editable("EVENT",id,0,other.id)).isInstanceOf(ApiException.class);
  ownership.edit("EVENT",id,0,new OwnershipCatalogService.OwnerEdit(1,Map.of("description","주최자 수정"),"최신 안내"),owner.id);
  assertThat(json.writeValueAsString(publications.detail(id))).contains("주최자 수정");
  db.update("update subculture_event_candidate set payload_json=jsonb_set(payload_json,'{description}','\"재수집 원본\"') where id=?",id);
  assertThat(json.writeValueAsString(catalog.eventDetail(id).get("event"))).contains("주최자 수정");
  assertThatThrownBy(()->ownership.edit("EVENT",id,0,new OwnershipCatalogService.OwnerEdit(1,Map.of("description","오래된 수정"),"사유"),owner.id)).isInstanceOf(ApiException.class);
  ownership.revokeEvent(id,owner.id,new Revoke(0,"담당 관계 종료"),admin);
  assertThat((List<?>)ownership.publicInfo(id).get("organizers")).isEmpty();
  assertThatThrownBy(()->ownership.editable("EVENT",id,0,owner.id)).isInstanceOf(ApiException.class);
 }
 @Test void seriesLinkIsVersionedPublicOnlyAndDoesNotTransferOwnership(){
  long a=catalogEvent("[TEST] 1회"),b=catalogEvent("[TEST] 2회");var admin=new Principal(other.id,true,false);
  var first=ownership.linkSeries(a,new OwnershipCatalogService.SeriesInput(0,null,"[TEST] 시리즈","https://example.com/series","1회","https://example.com/1","공식 회차 확인"),admin);
  long series=((Number)first.get("seriesId")).longValue();
  ownership.linkSeries(b,new OwnershipCatalogService.SeriesInput(0,series,null,null,"2회","https://example.com/2","공식 회차 확인"),admin);
  assertThat(((Number)ownership.history(a,0).get("total")).longValue()).isEqualTo(1);
  assertThat((List<?>)ownership.publicInfo(b).get("organizers")).isEmpty();
  assertThatThrownBy(()->ownership.linkSeries(a,new OwnershipCatalogService.SeriesInput(0,null,null,null,"","https://example.com/1","해제"),admin)).isInstanceOf(ApiException.class);
  publications.unpublish(b);assertThat(((Number)ownership.history(a,0).get("total")).longValue()).isZero();
  ownership.linkSeries(a,new OwnershipCatalogService.SeriesInput(1,null,null,null,"","https://example.com/1","잘못된 연결 해제"),admin);
  assertThat(ownership.seriesLink(a,admin).get("seriesId")).isNull();
 }
 ProductData ownerTestProduct(String name) {
  return new ProductData(null,name,"수집 상품 설명",null,List.of(),List.of(),"EVENT_SALE_CONFIRMED",null,"ON_SALE",null,
   List.of(new Source("https://example.com/products","OFFICIAL","ORIGINAL","행사 판매 안내")),List.of(),List.of());
 }
 Sales ownerTestSales(List<ProductData> products) {
  return new Sales("행사 판매 안내","EVENT_SALE_CONFIRMED",List.of(),List.of(),"현장 판매",products.getFirst().sources(),List.of(),products,List.of());
 }
 long insertOwnerTestProduct(long participant,ProductData product) {
  return db.queryForObject("insert into subculture_catalog_product(participant_id,identity_key,name,payload_json) values(?,?,?,cast(? as jsonb)) returning id",Long.class,
   participant,com.boothhana.collection.CatalogRules.productKey(product),product.name(),json.writeValueAsString(product));
 }
 @Test void verifiedBoothProductEditPreservesPendingCollectionAndIdentityThroughRepublication() {
  long event=catalogEvent("[TEST] 부스 인증 행사");var admin=new Principal(other.id,true,false);
  var member=new Member("[TEST] 작가 "+UUID.randomUUID(),"ARTIST",List.of(),"https://example.com/artist");
  var booth=new Participant(null,member.name(),"ARTIST",List.of(member),List.of(),List.of(),"부스 소개",List.of(member.profileUrl()),
   List.of(new Source("https://example.com/roster","OFFICIAL","ORIGINAL","공식 참가 명단")),List.of(),List.of());
  String boothJson=json.writeValueAsString(booth),key=SupportRules.digest(UUID.randomUUID().toString());
  long participant=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state,reviewed_payload_json) values(?,?,?,cast(? as jsonb),?,'REVIEWED',cast(? as jsonb)) returning id",Long.class,event,key,booth.registrationName(),boothJson,key,boothJson);
  long exhibitor=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb)) returning id",Long.class,key,member.name(),json.writeValueAsString(member));
  db.update("insert into subculture_participant_member(participant_id,exhibitor_id) values(?,?)",participant,exhibitor);
  var original=ownerTestProduct("원래 상품명");long product=insertOwnerTestProduct(participant,original);
  String initial=json.writeValueAsString(ownerTestSales(List.of(original)));
  db.update("insert into subculture_sales(participant_id,payload_json,payload_hash,review_state,reviewed_payload_json) values(?,cast(? as jsonb),?,'REVIEWED',cast(? as jsonb))",participant,initial,key,initial);
  publications.publish(event,new PublishInput(1));
  UUID claim=UUID.randomUUID();
  support.create(new Create(claim,"CLAIM","OWNERSHIP","작가 인증","공식 계정 소유 확인",List.of(member.profileUrl()),new Target("CATALOG","PARTICIPANT",event,participant,null,null,null,null),Map.of(),exhibitor),new Principal(owner.id,false,false));
  support.decide(claim,new ClaimDecision(0,"APPROVE","공식 계정 확인","승인",null,null,member.profileUrl()),admin);
  assertThat((List<?>)ownership.publicInfo(event).get("exhibitors")).hasSize(1);

  // Emulate a newer collected snapshot awaiting review, with a separate existing admin override.
  var pending=ownerTestProduct("아직 미공개 새 상품");long pendingId=insertOwnerTestProduct(participant,pending);
  String collected=json.writeValueAsString(ownerTestSales(List.of(original,pending)));
  db.update("update subculture_sales set payload_json=cast(? as jsonb),review_state='PENDING',overrides_json=cast(? as jsonb),revision=revision+1 where participant_id=?",collected,json.writeValueAsString(Map.of("summary","관리자 판매 안내")),participant);
  var edit=new OwnershipCatalogService.ProductEdit(2,"작가가 바꾼 상품명","작가 상품 설명","5000","KRW","SOLD_OUT","상품 안내 수정");
  assertThatThrownBy(()->ownership.editProduct(event,participant,product,edit,other.id)).isInstanceOf(ApiException.class);
  ownership.editProduct(event,participant,product,edit,owner.id);
  assertThatThrownBy(()->ownership.editProduct(event,participant,product,edit,owner.id)).isInstanceOf(ApiException.class);
  var current=catalog.participant(participant).sales();
  assertThat(current.data().products()).containsExactly(original,pending);
  assertThat(current.overrides()).containsExactlyEntriesOf(Map.of("summary","관리자 판매 안내"));
  assertThat(current.productRows()).extracting(ProductRow::id).containsExactly(product,pendingId);
  assertThat(current.productRows().getFirst().data().name()).isEqualTo("작가가 바꾼 상품명");
  String publicBeforeReview=json.writeValueAsString(publications.detail(event));
  assertThat(publicBeforeReview).contains("작가가 바꾼 상품명").doesNotContain("아직 미공개 새 상품","관리자 판매 안내");
  catalog.editSales(participant,new EditInput(current.revision(),"REVIEWED","새 수집 상품 검토",Map.of()));
  publications.publish(event,new PublishInput(1));
  var items=(List<?>)ownership.products(event,participant,owner.id).get("items");
  assertThat(items).hasSize(2);
  var first=(Map<?,?>)items.getFirst();
  assertThat(((Number)first.get("id")).longValue()).isEqualTo(product);
  assertThat(((Map<?,?>)first.get("data")).get("name")).isEqualTo("작가가 바꾼 상품명");
  assertThat(json.writeValueAsString(items)).contains("아직 미공개 새 상품");
  support.revoke(exhibitor,owner.id,new Revoke(0,"담당 관계 종료"),admin);
  assertThat((List<?>)ownership.publicInfo(event).get("exhibitors")).isEmpty();
  long revision=catalog.participant(participant).sales().revision();
  assertThatThrownBy(()->ownership.editProduct(event,participant,product,new OwnershipCatalogService.ProductEdit(revision,"회수 후 수정","설명",null,null,"ON_SALE","실패해야 함"),owner.id)).isInstanceOf(ApiException.class);
 }
}
