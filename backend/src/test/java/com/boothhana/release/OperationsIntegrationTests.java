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

/** SQL001..022 on a fresh isolated localhost database; no mocks or production data. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@Transactional
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class OperationsIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p) {
  String url=System.getenv("BOOTH_FULL_TEST_URL");
  if(url==null||!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test"))throw new IllegalStateException("Isolated localhost test DB only");
  p.add("spring.datasource.url",()->url);p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));
  p.add("app.support.guest-enabled",()->false);p.add("app.support.attachments-enabled",()->false);
  p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");
 }
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
 CatalogOperatingGroups.Input input(long revision,String name,Long... ids) {return new CatalogOperatingGroups.Input(revision,name,"https://example.com/official",today,List.of(ids));}
 CatalogBrowseQuery query(int page,int size,String category,String search,String from,String to) {return new CatalogBrowseQuery(page,size,category,search,"",from,to,"DATE_ASC");}
 long id(Map<String,Object> value){return ((Number)value.get("id")).longValue();}
 String snapshot(long id){return db.queryForObject("select snapshot_json::text from subculture_catalog_publication where event_id=?",String.class,id);}
 void saveEvent(long user,long id){db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,saved_json,note) values(?,?,?,'EVENT',?,'{}','[TEST] private note')",UUID.randomUUID(),user,id,id);}
 void claimRoot(long id) {
  UUID ticket=UUID.randomUUID();
  support.create(new SupportModels.Create(ticket,"CLAIM","ORGANIZER","[TEST] Organizer","공식 계정 소유 확인 요청",List.of("https://example.com/official"),new SupportModels.Target("CATALOG","EVENT",id,id,null,null,null,null),Map.of(),null),new SupportModels.Principal(owner,false,false));
  claims.decide(ticket,new SupportModels.ClaimDecision(0,"APPROVE","공식 계정 소유 확인","주최자 연결 완료",null,"[TEST] Organizer","https://example.com/official"),new SupportModels.Principal(admin,true,false));
 }
 @Test @SuppressWarnings("unchecked") void operatingGroupPreservesSourceIdsSavesCommentsAndOwnership() {
  long a=event("east","ONLY_EVENT",firstDay),b=event("west","ONLY_EVENT",firstDay);claimRoot(a);
  saveEvent(owner,a);saveEvent(owner,b);saveEvent(admin,b);
  for(long id:List.of(a,b))db.update("insert into event_comment(id,event_id,user_id,body) values(?,?,?,'[TEST] venue comment')",UUID.randomUUID(),id,owner);
  String aBefore=snapshot(a),bBefore=snapshot(b);
  var savedRows=db.queryForList("select id,event_id,target_id,note from memory_item where user_id in (?,?) order by id",owner,admin);
  groups.save(a,input(-1,label+" combined",a,b),admin);
  assertThat(db.queryForObject("select actor_id from subculture_catalog_review_history where target_type='operating_group' and target_id=? order by id desc limit 1",Long.class,a)).isEqualTo(admin);
  assertThat(snapshot(a)).isEqualTo(aBefore);assertThat(snapshot(b)).isEqualTo(bBefore);
  assertThat(db.queryForList("select id,event_id,target_id,note from memory_item where user_id in (?,?) order by id",owner,admin)).isEqualTo(savedRows);
  assertThat(groups.publicGroups(List.of(a)).get(a).members()).extracting(CatalogOperatingGroups.Member::eventId).containsExactly(a,b);
  assertThat((List<?>)ownership.publicInfo(a).get("organizers")).hasSize(1);
  assertThat((List<?>)ownership.publicInfo(b).get("organizers")).isEmpty();
  assertThatThrownBy(()->ownership.editable("EVENT",b,0,owner)).isInstanceOf(ApiException.class);
  var visibleComments=comments.list(b,0);
  assertThat(((Number)visibleComments.get("total")).longValue()).isEqualTo(2);
  assertThat((List<Map<String,Object>>)visibleComments.get("items")).extracting(row->((Number)row.get("eventId")).longValue()).containsExactlyInAnyOrder(a,b);
  var ranked=publications.popular(12,"SUBCULTURE").stream().filter(row->id(row)==a).findFirst().orElseThrow();
  assertThat(((Number)ranked.get("saveCount")).longValue()).isEqualTo(2);
  groups.remove(a,0,admin);
  assertThat(((Number)comments.list(a,0).get("total")).longValue()).isEqualTo(1);
  assertThat(snapshot(a)).isEqualTo(aBefore);assertThat(snapshot(b)).isEqualTo(bBefore);
 }
 @Test void operatingGroupRejectsStaleChangesDuplicateMembershipAndCrossCategory() {
  long a=event("A","ONLY_EVENT",firstDay),b=event("B","ONLY_EVENT",secondDay),c=event("C","ONLY_EVENT",secondDay),festival=event("festival","MUSIC",firstDay);
  assertThat(groups.save(a,input(-1,label+" edition",a,b),admin).get("revision")).isEqualTo(0L);
  assertThat(groups.save(a,input(0,label+" renamed",a,b),admin).get("revision")).isEqualTo(1L);
  assertThatThrownBy(()->groups.save(a,input(0,label+" stale",a,b),admin)).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->groups.save(c,input(-1,label+" conflict",c,b),admin)).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->groups.save(c,input(-1,label+" cross category",c,festival),admin)).isInstanceOf(ApiException.class);
  assertThat(groups.admin(b).get("rootEventId")).isEqualTo(a);assertThat(groups.admin(a).get("name")).isEqualTo(label+" renamed");
  publications.unpublish(c);
  assertThatThrownBy(()->groups.save(a,input(1,label+" hidden member",a,c),admin)).isInstanceOf(ApiException.class);
 }
 @Test void operatingGroupPaginationCountsEditionsAndScopesMatchingDays() {
  long a=event("first","ONLY_EVENT",firstDay),b=event("second","ONLY_EVENT",secondDay),c=event("standalone","ONLY_EVENT",secondDay);
  event("festival","MUSIC",firstDay);String title="Unique-group-"+UUID.randomUUID();groups.save(a,input(-1,title,a,b),admin);
  var first=publications.groupedList(query(0,1,"SUBCULTURE",label,"",""));
  var second=publications.groupedList(query(1,1,"SUBCULTURE",label,"",""));
  assertThat(first.total()).isEqualTo(2);assertThat(second.total()).isEqualTo(2);
  assertThat(List.of(id(first.items().getFirst()),id(second.items().getFirst()))).containsExactlyInAnyOrder(a,c);
  assertThat(publications.list(query(0,20,"SUBCULTURE",label,"","")).total()).isEqualTo(3);
  var matchingDay=publications.groupedList(query(0,20,"SUBCULTURE",label+" second",secondDay,secondDay));
  assertThat(matchingDay.total()).isEqualTo(1);assertThat(id(matchingDay.items().getFirst())).isEqualTo(b);
  assertThat(((EventData)matchingDay.items().getFirst().get("event")).occurrences()).extracting(Occurrence::startDate).containsExactly(secondDay);
  assertThat(publications.groupedList(query(0,20,"FESTIVAL",label,"","")).total()).isEqualTo(1);
  assertThat(publications.groupedList(query(0,20,"EXHIBITION",label,"","")).total()).isZero();
  assertThat(publications.groupedList(query(0,20,"SUBCULTURE",title,"","")).total()).isEqualTo(1);
  assertThat(publications.list(query(0,20,"SUBCULTURE",title,"","")).items()).extracting(row->id(row)).containsExactly(a,b);
 }
 @Test void operatingGroupWithdrawnMembersAreAbsentAndFixedLegacyLinksCannotChange() {
  long a=event("public","ONLY_EVENT",firstDay),b=event("hidden","ONLY_EVENT",secondDay);
  groups.save(a,input(-1,label+" edition",a,b),admin);publications.unpublish(b);
  assertThat(groups.publicGroups(List.of(a))).isEmpty();assertThat(publications.detail(a)).doesNotContainKey("operatingGroup");
  assertThat(publications.groupedList(query(0,20,"SUBCULTURE",label,"","")).total()).isEqualTo(1);
  publications.publish(b,new PublishInput(1));db.update("update subculture_event_candidate set review_state='EXCLUDED' where id=?",b);
  assertThat(groups.publicGroups(List.of(a))).isEmpty();
  db.update("update subculture_event_candidate set review_state='REVIEWED' where id=?",b);
  db.update("update catalog_operating_group set fixed_members=true where root_event_id=?",a);
  assertThatThrownBy(()->groups.remove(a,0,admin)).isInstanceOf(ApiException.class);
  long c=event("replacement","ONLY_EVENT",secondDay);
  assertThatThrownBy(()->groups.save(a,input(0,label+" replaced",a,c),admin)).isInstanceOf(ApiException.class);
  assertThat(groups.admin(a).get("eventIds")).isEqualTo(List.of(a,b));
 }
 @Test void groupedEventCannotRepublishIntoAnotherCategory() {
  long a=event("root","ONLY_EVENT",firstDay),b=event("member","ONLY_EVENT",secondDay);
  groups.save(a,input(-1,label+" edition",a,b),admin);String before=snapshot(b);
  db.update("update subculture_event_candidate set reviewed_payload_json=cast(? as jsonb) where id=?",json.writeValueAsString(data(label+" festival","MUSIC",secondDay)),b);
  assertThatThrownBy(()->publications.publish(b,new PublishInput(1))).isInstanceOf(ApiException.class);
  assertThat(snapshot(b)).isEqualTo(before);
 }
 @Test @SuppressWarnings("unchecked") void editorialSalesProvenanceRemainsInPublishedSnapshotDuringPendingEdits() {
  long e=event("editorial","ONLY_EVENT",firstDay);
  Participant booth=new Participant(null,label+" booth","ARTIST",List.of(new Member(label+" maker","ARTIST",List.of(),"https://example.com/maker")),List.of(),List.of(),"부스 소개",List.of(),List.of(),List.of(),List.of());
  Sales sales=new Sales("행사장에서만 선입금 수령 가능합니다.","EVENT_SALE_CONFIRMED",List.of(),List.of(),"현장 수령",List.of(),List.of(),List.of(),List.of());
  String key=UUID.randomUUID().toString().replace("-","").repeat(2);
  long p=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state,reviewed_payload_json) values(?,?,?,cast(? as jsonb),?,'REVIEWED',cast(? as jsonb)) returning id",Long.class,e,key,booth.registrationName(),json.writeValueAsString(booth),key,json.writeValueAsString(booth));
  db.update("insert into subculture_sales(participant_id,payload_json,payload_hash,review_state,reviewed_payload_json,overrides_json) values(?,cast(? as jsonb),?,'REVIEWED',cast(? as jsonb),cast(? as jsonb))",p,json.writeValueAsString(sales),key,json.writeValueAsString(sales),json.writeValueAsString(Map.of("summary",sales.summary())));
  publications.publish(e,new PublishInput(1));String before=snapshot(e);
  var row=((List<Map<String,Object>>)publications.detail(e).get("participants")).getFirst();
  assertThat(row.get("salesSummaryOrigin")).isEqualTo("EDITORIAL");
  db.update("update subculture_sales set review_state='PENDING',overrides_json=cast(? as jsonb) where participant_id=?",json.writeValueAsString(Map.of("summary","UNPUBLISHED_PENDING_SENTINEL")),p);
  var visible=publications.detail(e);assertThat(json.writeValueAsString(visible)).contains(sales.summary()).doesNotContain("UNPUBLISHED_PENDING_SENTINEL");
  assertThat(((List<Map<String,Object>>)visible.get("participants")).getFirst().get("salesSummaryOrigin")).isEqualTo("EDITORIAL");
  assertThat(snapshot(e)).isEqualTo(before);
  db.update("update subculture_sales set review_state='REVIEWED',overrides_json='{}' where participant_id=?",p);
  publications.publish(e,new PublishInput(1));
  assertThat(((List<Map<String,Object>>)publications.detail(e).get("participants")).getFirst().get("salesSummaryOrigin")).isEqualTo("COLLECTED");
 }
 @Test @SuppressWarnings("unchecked") void legacySalesProvenanceMigrationFreezesOnlySupportedEditorialValues()throws Exception {
  long e=event("legacy provenance","ONLY_EVENT",firstDay);
  var original=json.readValue(snapshot(e),Map.class);
  List<Map<String,Object>> legacy=new ArrayList<>(),expected=new ArrayList<>();
  for(int n=0;n<7;n++) {
   String key=UUID.randomUUID().toString().replace("-","").repeat(2);
   long p=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state) values(?,?,?,'{}',?,'REVIEWED') returning id",Long.class,e,key,label+" booth "+n,key);
   String summary="PUBLISHED_SUMMARY_"+n;
   Map<String,Object> booth=new LinkedHashMap<>();booth.put("id",p);booth.put("participant",Map.of("registrationName",label+" booth "+n));booth.put("sales",n==5?null:Map.of("summary",summary));if(n==4)booth.put("salesSummaryOrigin","COLLECTED");
   legacy.add(booth);Map<String,Object> wanted=new LinkedHashMap<>(booth);
   if(n!=5&&n!=4)wanted.put("salesSummaryOrigin",n<2?"EDITORIAL":"COLLECTED");expected.add(wanted);
   if(n!=5)db.update("insert into subculture_sales(participant_id,payload_json,payload_hash,review_state,overrides_json) values(?,'{}',?,'PENDING',cast(? as jsonb))",p,key,json.writeValueAsString(Map.of("summary",n==0||n==4?summary:"PENDING_PRIVATE_"+n)));
   if(n==1||n==3||n==6)db.update("insert into subculture_catalog_review_history(target_type,target_id,before_json,after_json,created_at) values('sales',?,'{}',cast(? as jsonb),cast(? as timestamptz))",p,json.writeValueAsString(Map.of("overrides",Map.of("summary",summary))),n==6?"2026-10-02T12:00:00Z":"2026-09-30T12:00:00Z");
   if(n==3)db.update("insert into subculture_catalog_review_history(target_type,target_id,before_json,after_json,created_at) values('sales',?,'{}',cast(? as jsonb),'2026-10-01T11:00:00Z')",p,json.writeValueAsString(Map.of("overrides",Map.of(),"clearOverrides",List.of("summary"))));
  }
  original.put("participants",legacy);
  db.update("update subculture_catalog_publication set snapshot_json=cast(? as jsonb),published_at='2026-10-01T12:00:00Z' where event_id=?",json.writeValueAsString(original),e);
  var metadata=db.queryForMap("select published_at,event_revision from subculture_catalog_publication where event_id=?",e);
  String migration=java.nio.file.Files.readString(java.nio.file.Path.of("../database/022_catalog_operating_groups.sql"));
  int start=migration.indexOf("with backfilled as ("),end=migration.indexOf("do $$",start);
  assertThat(start).isGreaterThan(0);assertThat(end).isGreaterThan(start);
  String backfill=migration.substring(start,end);db.execute(backfill);
  var expectedSnapshot=new LinkedHashMap<String,Object>(original);expectedSnapshot.put("participants",expected);
  assertThat(json.readValue(snapshot(e),Map.class)).isEqualTo(json.readValue(json.writeValueAsString(expectedSnapshot),Map.class));
  assertThat(db.queryForMap("select published_at,event_revision from subculture_catalog_publication where event_id=?",e)).isEqualTo(metadata);
  String once=snapshot(e);
  db.update("update subculture_sales set overrides_json='{\"summary\":\"NEW_PENDING_PRIVATE\"}' where participant_id in (select id from subculture_participant where event_id=?)",e);
  db.execute(backfill);
  assertThat(snapshot(e)).isEqualTo(once);
  assertThat(json.writeValueAsString(publications.detail(e))).doesNotContain("NEW_PENDING_PRIVATE","PENDING_PRIVATE");
  assertThat(((List<Map<String,Object>>)publications.detail(e).get("participants")).getFirst().get("salesSummaryOrigin")).isEqualTo("EDITORIAL");
 }
 @Test void adminFiltersUseEffectiveTitlesLiteralSearchAndPendingPublicChanges() {
  long a=event("original","ONLY_EVENT",firstDay);event("100XX","ONLY_EVENT",firstDay);event("100%_ festival","MUSIC",firstDay);
  db.update("update subculture_event_candidate set overrides_json=cast(? as jsonb) where id=?",json.writeValueAsString(Map.of("name",label+" 100%_ edited")),a);
  var literal=new CatalogAdminQuery(label+" 100%_","SUBCULTURE","","PUBLISHED");
  assertThat(catalog.events(0,20,literal).items()).extracting(row->id(row)).containsExactly(a);
  assertThat(catalog.events(0,20,new CatalogAdminQuery(label+" original","SUBCULTURE","","")).total()).isZero();
  assertThat(catalog.events(0,20,new CatalogAdminQuery(label+" 100%_","SUBCULTURE","","PENDING")).total()).isZero();
  String key=UUID.randomUUID().toString().replace("-","").repeat(2);
  db.update("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state) values(?,?,'[TEST] pending','{}',?,'PENDING')",a,key,key);
  var pending=catalog.events(0,20,new CatalogAdminQuery(label+" 100%_","SUBCULTURE","","PENDING"));
  assertThat(pending.total()).isEqualTo(1);assertThat(pending.items().getFirst().get("hasPendingChanges")).isEqualTo(true);
  publications.unpublish(a);
  assertThat(catalog.events(0,20,new CatalogAdminQuery(label+" 100%_","SUBCULTURE","","PENDING")).total()).isZero();
  assertThat(catalog.events(0,20,new CatalogAdminQuery(label+" 100%_","SUBCULTURE","","UNPUBLISHED")).total()).isEqualTo(1);
 }
 @Test void operatingGroupAdminRoutesRequireAdminCsrfAndTablesStayPrivate()throws Exception {
  long a=event("A","ONLY_EVENT",firstDay),b=event("B","ONLY_EVENT",secondDay);String route="/api/admin/subculture/v4/events/"+a+"/operating-group";
  http.perform(get(route)).andExpect(status().isUnauthorized());
  http.perform(get(route).with(user(subject).roles("FAN"))).andExpect(status().isForbidden());
  http.perform(put(route).with(user(subject+"-admin").roles("ADMIN")).contentType("application/json").content(json.writeValueAsString(input(-1,label,a,b)))).andExpect(status().isForbidden());
  http.perform(put(route).with(user(subject+"-admin").roles("ADMIN")).with(csrf()).contentType("application/json").content(json.writeValueAsString(input(-1,label,a,b)))).andExpect(status().isOk()).andExpect(jsonPath("$.rootEventId").value(a));
  http.perform(delete(route+"?revision=0").with(user(subject+"-admin").roles("ADMIN")).with(csrf())).andExpect(status().isNoContent());
  assertThat(groups.admin(a).get("revision")).isEqualTo(-1);
  for(String table:List.of("catalog_operating_group","catalog_operating_group_member")){
   assertThat(db.queryForObject("select relrowsecurity from pg_class where oid=cast(? as regclass)",Boolean.class,table)).isTrue();
   assertThat(db.queryForObject("select has_table_privilege('anon',?,'SELECT') or has_table_privilege('authenticated',?,'SELECT')",Boolean.class,table,table)).isFalse();
  }
 }
}
