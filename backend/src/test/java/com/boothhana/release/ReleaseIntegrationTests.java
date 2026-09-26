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

/** REAL entire app + actual SQL001..016 already applied by prepare_test_db.py.
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
  p.add("app.r2.account-id",()->"");p.add("app.r2.access-key",()->"");p.add("app.r2.secret-key",()->"");p.add("app.r2.bucket",()->"");
 }
 @Autowired JdbcTemplate db;
 @Autowired PlatformService platform;
 @Autowired PlatformTransactionManager transactionManager;
 @Autowired WebApplicationContext context;
 @Autowired SupportOperations support;
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
 List<LineInput> lines(){return List.of(new LineInput(productId,2));}
 int stock(){return db.queryForObject("select stock_quantity from event_product where id=?",Integer.class,productId);}
 long count(String table){if(!Set.of("reservation","pos_sale").contains(table))throw new IllegalArgumentException();return db.queryForObject("select count(*) from "+table+" where event_booth_id=?",Long.class,boothId);}
 long receipts(){return db.queryForObject("select count(*) from trade_request where user_id=?",Long.class,owner.id);}
 @Test void schemaAndLeastPrivilegeRole() {
  db.queryForList(SchemaContract.probeSql());assertThat(SchemaContract.TABLES).hasSize(43);
  for(String table:SchemaContract.TABLES.keySet()) {
   assertThat(db.queryForObject("select relrowsecurity from pg_class where oid=to_regclass(?)",Boolean.class,"public."+table)).as(table).isTrue();
   assertThat(db.queryForObject("select has_table_privilege('anon',?,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',?,'SELECT,INSERT,UPDATE')",Boolean.class,"public."+table,"public."+table)).as(table+" anon").isFalse();
   assertThat(db.queryForObject("select has_table_privilege('authenticated',?,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',?,'SELECT,INSERT,UPDATE')",Boolean.class,"public."+table,"public."+table)).as(table+" authenticated").isFalse();
  }
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
   .as("SQL001..016 column types, lengths and nullability").isEmpty();
 }
}
