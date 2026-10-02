package com.boothhana.release;

import com.boothhana.api.ApiException;
import com.boothhana.collection.*;
import com.boothhana.support.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** SQL001..024 on a fresh isolated localhost database; no mocks or production data. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@Transactional
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class CreatorRegistrationIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p) {
  String url=System.getenv("BOOTH_FULL_TEST_URL");
  if(url==null||!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test"))throw new IllegalStateException("Isolated localhost test DB only");
  p.add("spring.datasource.url",()->url);p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));
  p.add("app.support.guest-enabled",()->false);p.add("app.support.attachments-enabled",()->false);
  p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");
 }
 @Autowired CreatorCatalogBooths direct;@Autowired com.boothhana.service.ApplicationWorkflowService applications;@Autowired com.boothhana.repository.UserAccountRepository users;
 @Autowired JdbcTemplate db;@Autowired JsonMapper json;@Autowired CatalogOperatingGroups groups;
 @Autowired CatalogPublicationService publications;@Autowired CatalogService catalog;@Autowired EventComments comments;
 @Autowired OwnershipCatalogService ownership;@Autowired SupportService support;@Autowired ExhibitorClaimsService claims;@Autowired WebApplicationContext web;
 long owner,admin;String subject,label,today,firstDay,secondDay;MockMvc http;
 @BeforeEach void fixture() {
  assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");
  assertThat(db.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user",Boolean.class)).isFalse();
  subject="ops-"+UUID.randomUUID();label="[TEST] "+subject;
  owner=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Organizer') returning id",Long.class,subject);
  admin=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Admin') returning id",Long.class,subject+"-admin");
  LocalDate now=LocalDate.now(ZoneId.of("Asia/Seoul"));today=now.toString();firstDay=now.plusDays(10).toString();secondDay=now.plusDays(11).toString();
  http=MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();
 }
 EventData data(String name,String category,String day) {
  return new EventData(name,category,"[TEST] Organizer","2026","SEOUL","[TEST] Hall","서울","원래 소개","공식 안내 확인",List.of(),
   List.of(new Occurrence(day,day,null,null)),List.of(new Source("https://example.com/official","OFFICIAL","ORIGINAL","공식 행사 안내")),List.of(),List.of());
 }
 long event(String suffix,String category,String day) {
  EventData data=data(label+" "+suffix,category,day);String encoded=json.writeValueAsString(data),key=UUID.randomUUID().toString().replace("-","").repeat(2);
  long id=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state,reviewed_payload_json) values(?,?,?,?,cast(? as date),cast(? as date),cast(? as jsonb),?,'[]','REVIEWED',cast(? as jsonb)) returning id",Long.class,key,key,data.name(),category,day,day,encoded,key,encoded);
  publications.publish(id,new PublishInput(1));return id;
 }

 long base(long user,String name){return db.queryForObject("insert into booth(owner_user_id,name,description) values(?,?,?) returning id",Long.class,user,name,"기본 소개");}
 CreatorCatalogBooths.Input input(long base,String name){return new CreatorCatalogBooths.Input(base,name,"이번 행사 소개",List.of("보컬로이드"),"A01",firstDay,firstDay);}
 long participant(Map<String,Object> result){return ((Number)result.get("participantId")).longValue();}
 long revision(long p){return db.queryForObject("select revision from subculture_sales where participant_id=?",Long.class,p);}
 long[] collected(long event){
  String key=CollectionRules.sha(UUID.randomUUID().toString());var member=new Member(label+" collected","ARTIST",List.of(),"https://example.com/artist");
  var p=new Participant(null,member.name(),"ARTIST",List.of(member),List.of(),List.of(),"수집 소개",List.of(member.profileUrl()),List.of(new Source("https://example.com/roster","OFFICIAL","ORIGINAL","공식 명단")),List.of(),List.of());String encoded=json.writeValueAsString(p);
  long pid=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state,reviewed_payload_json) values(?,?,?,cast(? as jsonb),?,'REVIEWED',cast(? as jsonb)) returning id",Long.class,event,key,p.registrationName(),encoded,key,encoded);
  long eid=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb)) returning id",Long.class,key,member.name(),json.writeValueAsString(member));
  db.update("insert into subculture_participant_member(participant_id,exhibitor_id) values(?,?)",pid,eid);publications.publish(event,new PublishInput(1));return new long[]{pid,eid};
 }
 UUID request(long event,long[] p){UUID id=UUID.randomUUID();support.create(new SupportModels.Create(id,"CLAIM","OWNERSHIP","연결 요청","본인 부스 계정 소유 확인",List.of("https://example.com/artist"),new SupportModels.Target("CATALOG","PARTICIPANT",event,p[0],null,null,null,null),Map.of(),p[1]),new SupportModels.Principal(owner,false,false));return id;}
 void approve(UUID id){claims.decide(id,new SupportModels.ClaimDecision(0,"APPROVE","공식 계정 확인","연결 완료",null,null,"https://example.com/artist"),new SupportModels.Principal(admin,true,false));}
 @Test void directRegistrationPublishesOnlyOwnBoothWithoutGrantAndEnforcesAccountLimit(){
  long e=event("one","ONLY_EVENT",firstDay),b=base(owner,label+" base"),second=base(owner,label+" other"),other=base(admin,label+" admin");
  long[] prior=collected(e);String before=db.queryForObject("select snapshot_json->'event' from subculture_catalog_publication where event_id=?",String.class,e);
  db.update("update subculture_event_candidate set payload_json=jsonb_set(payload_json,'{description}',to_jsonb(?::text)),revision=revision+1 where id=?","미검토 수집",e);
  long p=participant(direct.create(e,owner,input(b,label+" direct")));
  assertThat(db.queryForObject("select snapshot_json->'event' from subculture_catalog_publication where event_id=?",String.class,e)).isEqualTo(before);
  assertThat(json.writeValueAsString(publications.detail(e))).contains(label+" direct","수집 소개").doesNotContain("미검토 수집");
  assertThat(json.writeValueAsString(ownership.publicInfo(e).get("directParticipantIds"))).contains(Long.toString(p));
  assertThat((List<?>)ownership.publicInfo(e).get("exhibitors")).isEmpty();
  assertThat(db.queryForObject("select count(*) from exhibitor_manager where user_id=?",Long.class,owner)).isZero();
  assertThat(direct.availability(e,owner).get("canRegister")).isEqualTo(false);
  assertThatThrownBy(()->direct.create(e,owner,input(second,"Second"))).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->direct.update(e,p,admin,new CreatorCatalogBooths.Update(1,input(b,"hijack")))).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->request(e,prior)).isInstanceOf(ApiException.class);
  assertThat(direct.create(e,admin,input(other,label+" different account"))).containsKey("participantId");
 }
 @Test void claimApprovalRemainsRequiredAndCannotConflictWithDirectRegistration(){
  long e=event("claims","ONLY_EVENT",firstDay),b=base(owner,label+" base");long[] p=collected(e);UUID claim=request(e,p);
  assertThat(db.queryForObject("select count(*) from exhibitor_manager where user_id=?",Long.class,owner)).isZero();
  direct.create(e,owner,input(b,label+" direct"));assertThatThrownBy(()->approve(claim)).isInstanceOf(ApiException.class);
  assertThat(db.queryForObject("select status from support_ticket where id=?",String.class,claim)).isEqualTo("OPEN");
 }
 @Test void approvedCollectedBoothBlocksNewBaseBoothInSameEvent(){
  long e=event("claimed","ONLY_EVENT",firstDay),b=base(owner,label+" base");long[] p=collected(e);approve(request(e,p));
  assertThatThrownBy(()->direct.create(e,owner,input(b,label+" new"))).isInstanceOf(ApiException.class);
  assertThat(direct.availability(e,owner).get("canRegister")).isEqualTo(false);
 }
 @Test @SuppressWarnings("unchecked") void directProductsKeepIdentityEditsAndPublicStateThroughRepublication(){
  long e=event("goods","ONLY_EVENT",firstDay),b=base(owner,label+" base"),p=participant(direct.create(e,owner,input(b,label+" direct")));
  var added=direct.addProduct(e,p,owner,new CreatorCatalogBooths.ProductInput(revision(p),"First product","소개","5000","KRW","PLANNED"));
  long product=((Number)((Map<String,Object>)((List<?>)added.get("items")).getFirst()).get("id")).longValue();
  ownership.editProduct(e,p,product,new OwnershipCatalogService.ProductEdit(revision(p),"Edited product","새 설명","7000","KRW","ON_SALE","가격 수정"),owner);
  direct.addProduct(e,p,owner,new CreatorCatalogBooths.ProductInput(revision(p),"Second product","",null,null,"PLANNED"));
  direct.update(e,p,owner,new CreatorCatalogBooths.Update(1,input(b,label+" renamed")));publications.publish(e,new PublishInput(1));
  var result=ownership.products(e,p,owner);assertThat((List<?>)result.get("items")).hasSize(2);assertThat(json.writeValueAsString(result)).contains("Edited product","7000","Second product");assertThat(result.get("directRegistration")).isEqualTo(true);
  assertThatThrownBy(()->direct.update(e,p,owner,new CreatorCatalogBooths.Update(1,input(b,"stale")))).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->direct.addProduct(e,p,admin,new CreatorCatalogBooths.ProductInput(revision(p),"unauthorized","",null,null,"PLANNED"))).isInstanceOf(ApiException.class);
 }
 @Test void groupedEventLimitSurvivesDifferentBaseAndPreventsConflictingMerge(){
  long a=event("group A","ONLY_EVENT",firstDay),b=event("group B","ONLY_EVENT",firstDay),c=event("group C","ONLY_EVENT",firstDay),base=base(owner,label+" group base");
  groups.save(a,new CatalogOperatingGroups.Input(-1,label+" group","https://example.com/event",today,List.of(a,b)),admin);
  direct.create(a,owner,input(base,label+" first"));
  assertThatThrownBy(()->direct.create(b,owner,input(base,label+" duplicate"))).isInstanceOf(ApiException.class);
  direct.create(c,owner,input(base,label+" independent"));
  assertThatThrownBy(()->groups.save(a,new CatalogOperatingGroups.Input(0,label+" group","https://example.com/event",today,List.of(a,b,c)),admin)).isInstanceOf(ApiException.class);
 }
 @Test void endedUnpublishedAndOutOfPeriodRegistrationsAreRejected(){
  long b=base(owner,label+" base"),e=event("closed","ONLY_EVENT",LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(1).toString());
  assertThatThrownBy(()->direct.create(e,owner,input(b,"ended"))).isInstanceOf(ApiException.class);
  long upcoming=event("upcoming","ONLY_EVENT",secondDay);assertThatThrownBy(()->direct.create(upcoming,owner,input(b,"wrong dates"))).isInstanceOf(ApiException.class);
  publications.unpublish(upcoming);assertThatThrownBy(()->direct.create(upcoming,owner,input(b,"hidden"))).isInstanceOf(ApiException.class);
  assertThat(db.queryForObject("select count(*) from catalog_creator_booth where user_id=?",Long.class,owner)).isZero();
 }
 @Test void platformRegistrationIsImmediateAndCannotUseAnotherBaseToRegisterTwice(){
  long b=base(owner,label+" platform"),second=base(owner,label+" second"),e=db.queryForObject("insert into event(name,venue,start_at,end_at,status) values(?,'[TEST]',now(),now()+interval '10 days','PUBLISHED') returning id",Long.class,label);
  var result=applications.apply(users.findById(owner).orElseThrow(),new com.boothhana.api.ApiModels.ApplicationInput(e,b));assertThat(result.status()).isEqualTo(com.boothhana.domain.DomainEnums.ApplicationStatus.APPROVED);
  assertThat(db.queryForObject("select is_public from event_booth where id=?",Boolean.class,result.id())).isTrue();
  assertThatThrownBy(()->applications.apply(users.findById(owner).orElseThrow(),new com.boothhana.api.ApiModels.ApplicationInput(e,second))).isInstanceOf(ApiException.class);
 }
 @Test void registrationHttpRequiresLoginCsrfAndOwnedBase() throws Exception {
  long e=event("http","ONLY_EVENT",firstDay),b=base(owner,label+" http");String path="/api/creator/catalog/events/"+e+"/booths",body=json.writeValueAsString(input(b,label+" booth"));
  http.perform(post(path).with(csrf()).contentType("application/json").content(body)).andExpect(status().isUnauthorized());
  http.perform(post(path).with(user(subject).roles("CREATOR")).contentType("application/json").content(body)).andExpect(status().isForbidden());
  http.perform(post(path).with(user(subject+"-admin").roles("CREATOR")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isNotFound());
  http.perform(post(path).with(user(subject).roles("CREATOR")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.participantId").isNumber());
 }
 @Test @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
 void concurrentDifferentBaseRegistrationsCommitExactlyOne() throws Exception {
  long e=event("race","ONLY_EVENT",firstDay),a=base(owner,label+" A"),b=base(owner,label+" B");var ready=new java.util.concurrent.CountDownLatch(2);var go=new java.util.concurrent.CountDownLatch(1);
  try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)){
   var results=new ArrayList<java.util.concurrent.Future<Boolean>>();for(long base:List.of(a,b))results.add(pool.submit(()->{ready.countDown();go.await();try{direct.create(e,owner,input(base,label+" booth "+base));return true;}catch(ApiException conflict){assertThat(conflict.status.value()).isEqualTo(409);return false;}}));
   assertThat(ready.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();go.countDown();int succeeded=0;for(var result:results)if(result.get(15,java.util.concurrent.TimeUnit.SECONDS))succeeded++;assertThat(succeeded).isEqualTo(1);
  }
  assertThat(db.queryForObject("select count(*) from catalog_creator_booth where event_id=? and user_id=?",Long.class,e,owner)).isEqualTo(1);
 }
}
