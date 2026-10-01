package com.boothhana.release;

import com.boothhana.api.ApiException;
import com.boothhana.library.*;
import com.boothhana.library.LibraryModels.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Actual Spring/HTTP/PostgreSQL contract. SQL001..016 must be applied to an EMPTY dedicated
 * localhost boothhana_release_test cluster by prepare_test_db.py. No DROP/TRUNCATE here.
 * Skips without opt-in; the v16 gate treats a skipped/missing suite as FAILURE. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class LibraryIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p){String url=System.getenv("BOOTH_FULL_TEST_URL");if(url==null||!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test"))throw new IllegalStateException("Isolated test DB only");
  p.add("spring.datasource.url",()->url);p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));p.add("spring.datasource.hikari.maximum-pool-size",()->3);
  p.add("app.support.guest-enabled",()->false);p.add("app.support.attachments-enabled",()->false);p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");p.add("app.storage.public-url",()->"https://assets.example.test");}
 @Autowired JdbcTemplate db;@Autowired LibraryService service;@Autowired LibraryTargets targets;@Autowired JsonMapper json;@Autowired WebApplicationContext web;
 long user,other,event,participant,product;String subject,otherSubject,day;MockMvc http;Map<String,Object> snapshot;
 @BeforeEach void fixture(){assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");assertThat(db.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user",Boolean.class)).isFalse();
  http=MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();subject="memory-"+UUID.randomUUID();otherSubject="memory-other-"+UUID.randomUUID();
  user=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Memory A') returning id",Long.class,subject);other=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Memory B') returning id",Long.class,otherSubject);
  String key=UUID.randomUUID().toString().replace("-","").repeat(2);day=LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(1).toString();
  event=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state) values(?,?,'[TEST] memory event','ONLY_EVENT',cast(? as date),cast(? as date),'{}',?,'[]','REVIEWED') returning id",Long.class,key,key,day,day,key);
  participant=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state) values(?,?,'[TEST] Leaf studio','{}',?,'REVIEWED') returning id",Long.class,event,key,key);
  product=db.queryForObject("insert into subculture_catalog_product(participant_id,identity_key,name,payload_json) values(?,?,'[TEST] Leaf keyring','{}') returning id",Long.class,participant,key);
  db.update("insert into subculture_sales(participant_id,payload_json,payload_hash,review_state) values(?,'{}',?,'REVIEWED')",participant,key);
  Map<String,Object> e=new LinkedHashMap<>();e.put("name","[TEST] memory event");e.put("description","행사 소개");e.put("subjects",List.of("식물"));e.put("venueName","서울 테스트 장소");e.put("occurrences",List.of(Map.of("startDate",day,"endDate",day)));e.put("sources",List.of(Map.of("kind","OFFICIAL","url","https://example.com/event")));
  var p=Map.of("registrationName","[TEST] Leaf studio","members",List.of(),"subjects",List.of("식물"),"officialLinks",List.of("https://example.com/maker"),"locations",List.of(Map.of("code","B1","hall","1관","startDate",day,"endDate",day)));
  var good=Map.of("name","[TEST] Leaf keyring","summary","초록 식물 키링","categories",List.of("키링"),"productUrl","https://example.com/product","saleState","PLANNED","evidenceScope","EVENT_LISTED");
  snapshot=new LinkedHashMap<>();snapshot.put("event",e);snapshot.put("participants",List.of(Map.of("id",participant,"participant",p,"sales",Map.of("summary","초록 식물 소품","categories",List.of("키링")),"productRows",List.of(Map.of("id",product,"data",good)))));snapshot.put("publishedAt",Instant.now().toString());publish();
 }
 void publish(){db.update("insert into subculture_catalog_publication(event_id,snapshot_json,event_revision) values(?,cast(? as jsonb),1) on conflict(event_id) do update set snapshot_json=excluded.snapshot_json,published_at=now()",event,json.writeValueAsString(snapshot));}
 Save input(){return new Save(new Target("PRODUCT",event,product,participant),day,"1관");}
 @Test void duplicateSaveHasOneIdentityAndOriginalMemo(){var first=service.save(user,input());var edited=service.edit(user,first.item().id(),new Edit(first.item().revision(),"개인 선물 메모",day,"1관"));var replay=service.save(user,input());assertThat(replay.created()).isFalse();assertThat(replay.item().id()).isEqualTo(edited.id());assertThat(replay.item().note()).isEqualTo("개인 선물 메모");assertThat(service.index(user)).hasSize(1);}
 @Test void productCarriesBoothAndEventWithoutExtraRows(){var row=service.save(user,input()).item();assertThat(row.target().participantId()).isEqualTo(participant);assertThat(row.saved().eventName()).isEqualTo("[TEST] memory event");assertThat(row.saved().participantName()).contains("Leaf studio");assertThat(service.index(user)).hasSize(1);}
 @Test void otherUserCannotReadEditOrDeleteMemory(){var e=service.save(user,input()).item();assertThatThrownBy(()->service.detail(other,e.id())).isInstanceOf(ApiException.class);assertThatThrownBy(()->service.edit(other,e.id(),new Edit(0,"stolen",day,""))).isInstanceOf(ApiException.class);service.delete(other,e.id(),0);assertThat(service.detail(user,e.id())).isNotNull();assertThat(service.list(other,"",null,"",false,0,24).total()).isZero();}
 @Test void importRejectsChangedLoginBeforeWriting(){assertThatThrownBy(()->service.importItem(other,new Import(input(),"계정 변경 중 개인 메모",user))).isInstanceOf(ApiException.class);assertThat(service.index(other)).isEmpty();}
 @Test void importNeverOverwritesRemoteNote(){var e=service.save(user,input()).item();service.edit(user,e.id(),new Edit(0,"서버 메모",day,"1관"));var result=service.importItem(user,new Import(input(),"공용 기기 메모",user));assertThat(result.result()).isEqualTo("NOTE_CONFLICT");assertThat(result.item().note()).isEqualTo("서버 메모");}
 @Test void revisionConflictPreservesFirstWriter(){var e=service.save(user,input()).item();service.edit(user,e.id(),new Edit(0,"first",day,""));assertThatThrownBy(()->service.edit(user,e.id(),new Edit(0,"second",day,""))).isInstanceOf(ApiException.class);assertThat(service.detail(user,e.id()).note()).isEqualTo("first");}
 @Test void withdrawalHidesSnapshotButKeepsUserNote(){var e=service.save(user,input()).item();service.edit(user,e.id(),new Edit(0,"나만의 생각",day,""));db.update("update subculture_event_candidate set review_state='EXCLUDED' where id=?",event);var hidden=service.detail(user,e.id());assertThat(hidden.available()).isFalse();assertThat(hidden.saved()).isNull();assertThat(hidden.current()).isNull();assertThat(hidden.image()).isNull();assertThat(hidden.note()).isEqualTo("나만의 생각");assertThat(service.list(user,"Leaf",null,"",false,0,24).total()).isZero();assertThat(service.list(user,"나만의",null,"",false,0,24).total()).isEqualTo(1);}
 @Test void hiddenSalesHidesProductButNotBooth(){var e=service.save(user,input()).item();var booth=new Target("PARTICIPANT",event,participant,participant);db.update("update subculture_sales set review_state='EXCLUDED' where participant_id=?",participant);assertThat(service.detail(user,e.id()).available()).isFalse();assertThat(targets.resolve(booth).available()).isTrue();}
 @Test void visitIsExplicitDateScopedAndSharedByProducts(){var a=service.save(user,input()).item();var b=service.save(user,new Save(new Target("PARTICIPANT",event,participant,participant),day,"")).item();assertThat(a.visitedDays()).isEmpty();service.activity(user,a.id(),"OPEN");assertThat(service.detail(user,b.id()).visitedDays()).isEmpty();service.visit(user,a.id(),new Visit(day,true));service.visit(user,a.id(),new Visit(day,true));assertThat(service.detail(user,b.id()).visitedDays()).containsExactly(day);assertThatThrownBy(()->service.visit(user,b.id(),new Visit(LocalDate.now().plusDays(5).toString(),true))).isInstanceOf(ApiException.class);}
 @Test void deletePreservesSiblingVisitThenRemovesLastContext(){var a=service.save(user,input()).item();var b=service.save(user,new Save(new Target("PARTICIPANT",event,participant,participant),day,"")).item();service.visit(user,a.id(),new Visit(day,true));service.delete(user,a.id(),0);assertThat(service.detail(user,b.id()).visitedDays()).containsExactly(day);service.delete(user,b.id(),0);assertThat(db.queryForObject("select count(*) from memory_visit where user_id=?",Long.class,user)).isZero();}
 @Test void parallelReplaysCreateOneMemory()throws Exception{var pool=Executors.newFixedThreadPool(2);try{var calls=pool.invokeAll(List.<Callable<UUID>>of(()->service.save(user,input()).item().id(),()->service.save(user,input()).item().id()));assertThat(calls.get(0).get()).isEqualTo(calls.get(1).get());assertThat(service.index(user)).hasSize(1);}finally{pool.shutdownNow();}}
 @Test void wrongProductParentIsRejected(){assertThatThrownBy(()->service.save(user,new Save(new Target("PRODUCT",event,product,participant+99999),day,""))).isInstanceOf(ApiException.class);}
 @Test void httpRequiresSessionCsrfAndOwner()throws Exception{var e=service.save(user,input()).item();http.perform(get("/api/me/library/items")).andExpect(status().isUnauthorized());http.perform(put("/api/me/library/items").with(user(subject).roles("FAN")).contentType("application/json").content(json.writeValueAsString(input()))).andExpect(status().isForbidden());http.perform(get("/api/me/library/items/"+e.id()).with(user(otherSubject).roles("FAN"))).andExpect(status().isNotFound());http.perform(get("/api/me/library/items/"+e.id()).with(user(subject).roles("FAN"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));}
 @Test void publicResolveNeverReturnsPrivateMemo()throws Exception{var e=service.save(user,input()).item();service.edit(user,e.id(),new Edit(0,"PRIVATE_SENTINEL",day,""));var body=http.perform(post("/api/public/library/resolve").with(csrf()).contentType("application/json").content(json.writeValueAsString(new Resolve(List.of(input().target()))))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();assertThat(body).doesNotContain("PRIVATE_SENTINEL");}
 @Test void memoryRlsAndApiRolesRemainClosed(){for(String table:List.of("memory_item","memory_visit")){assertThat(db.queryForObject("select relrowsecurity from pg_class where oid=cast(? as regclass)",Boolean.class,table)).isTrue();assertThat(db.queryForObject("select has_table_privilege('anon',?,'SELECT') or has_table_privilege('authenticated',?,'SELECT')",Boolean.class,table,table)).isFalse();}}
 // v16: real PostgreSQL/HTTP regression targets. These do not use the scripted JDBC checker.
 @SuppressWarnings("unchecked") void productVerification(String state,String seenAt){
  var participants=new ArrayList<Map<String,Object>>((List<Map<String,Object>>)snapshot.get("participants"));
  var first=new LinkedHashMap<>(participants.getFirst());var rows=new ArrayList<Map<String,Object>>((List<Map<String,Object>>)first.get("productRows"));
  var row=new LinkedHashMap<>(rows.getFirst());if(state==null)row.remove("verification");else row.put("verification",Map.of("state",state,"lastSeenAt",seenAt));rows.set(0,row);first.put("productRows",rows);participants.set(0,first);snapshot.put("participants",participants);publish();
 }
 @Test void batchVerificationUsesApprovedSnapshotAcrossSaveListDetail(){
  productVerification("NOT_RECONFIRMED","2026-09-01T00:00:00Z");var item=service.save(user,input()).item();
  assertThat(item.current().verification().state()).isEqualTo("NOT_RECONFIRMED");assertThat(service.list(user,"",null,"",false,0,24).items().getFirst().current().verification().lastSeenAt()).isEqualTo("2026-09-01T00:00:00Z");
  productVerification("CONFIRMED_CURRENT","2026-09-18T00:00:00Z");assertThat(service.detail(user,item.id()).current().verification().state()).isEqualTo("CONFIRMED_CURRENT");
  productVerification(null,"");assertThat(targets.resolve(input().target()).current().verification().state()).isEqualTo("LEGACY");
 }
 @Test void batchPreservesOrderAndChecksParentAndVisibility(){
  var valid=input().target();var wrong=new Target("PRODUCT",event,product,participant+999999);var absent=new Target("EVENT",event+999999,event+999999,null);
  var values=service.resolve(List.of(valid,wrong,absent,valid));assertThat(values).hasSize(4);assertThat(values.get(0).available()).isTrue();assertThat(values.get(1).current()).isNull();assertThat(values.get(2).available()).isFalse();assertThat(values.get(3).target()).isEqualTo(valid);
  db.update("update subculture_sales set review_state='EXCLUDED' where participant_id=?",participant);assertThat(service.resolve(List.of(valid)).getFirst().current()).isNull();
 }
 @Test void publicBatchAccepts200AndRejects201ViaHttp()throws Exception{
  var body=new Resolve(Collections.nCopies(200,input().target()));var response=http.perform(post("/api/public/library/resolve").with(csrf()).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString();
  assertThat(json.readValue(response,List.class)).hasSize(200);
  http.perform(post("/api/public/library/resolve").with(csrf()).contentType("application/json").content(json.writeValueAsString(new Resolve(Collections.nCopies(201,input().target()))))).andExpect(status().isBadRequest());
 }
 @Test void batchedImageRequiresCurrentRightsAndCurrentPublicProduct(){
  String key=UUID.randomUUID().toString().replace("-","").repeat(2);
  long asset=db.queryForObject("insert into subculture_catalog_asset(event_id,participant_id,product_id,identity_key,type,image_url,page_url,rights_state,storage_state,object_key) values(?,?,?,?,'PRODUCT','https://example.com/image','https://example.com/page','APPROVED','STORED','verified/product/test.png') returning id",Long.class,event,participant,product,key);
  assertThat(targets.resolve(input().target()).image()).isNotNull();db.update("update subculture_catalog_asset set rights_state='REJECTED' where id=?",asset);assertThat(targets.resolve(input().target()).image()).isNull();
  db.update("update subculture_catalog_asset set rights_state='APPROVED' where id=?",asset);db.update("update subculture_participant set review_state='EXCLUDED' where id=?",participant);var hidden=targets.resolve(input().target());assertThat(hidden.available()).isFalse();assertThat(hidden.image()).isNull();
 }
 @Test void explicitlyRevokedBannerDoesNotFallbackInBatch(){
  long first=db.queryForObject("insert into subculture_catalog_asset(event_id,identity_key,type,image_url,page_url,rights_state,storage_state,object_key) values(?,?,'BANNER','https://example.com/1','https://example.com/page','APPROVED','STORED','verified/banner/one.png') returning id",Long.class,event,UUID.randomUUID().toString().replace("-","").repeat(2));
  long second=db.queryForObject("insert into subculture_catalog_asset(event_id,identity_key,type,image_url,page_url,rights_state,storage_state,object_key) values(?,?,'BANNER','https://example.com/2','https://example.com/page','APPROVED','STORED','verified/banner/two.png') returning id",Long.class,event,UUID.randomUUID().toString().replace("-","").repeat(2));
  var t=new Target("EVENT",event,event,null);assertThat(targets.resolve(t).image().id()).isEqualTo(first);
  db.update("insert into subculture_catalog_presentation(event_id,banner_asset_id) values(?,?)",event,second);assertThat(targets.resolve(t).image().id()).isEqualTo(second);
  db.update("update subculture_catalog_asset set rights_state='REJECTED' where id=?",second);assertThat(targets.resolve(t).image()).isNull();
 }

 // v18: actual SQL016/catalogue contract. Never claimed passed without the full-schema gate.
 @Test @SuppressWarnings("unchecked") void v18CategoryAndRegionQueriesAreIsolated(){
  var publications=web.getBean(com.boothhana.collection.CatalogPublicationService.class);
  var e=new LinkedHashMap<>((Map<String,Object>)snapshot.get("event"));String unique="v18-fixture-"+event;e.put("name",unique);e.put("region","GYEONGGI");e.put("venueName","킨텍스");e.put("address","경기도 고양시");
  for(var pair:Map.of("SUBCULTURE","DOLL","EXHIBITION","DESIGN","FESTIVAL","CULTURE").entrySet()){
   e.put("subcategory",pair.getValue());snapshot.put("event",e);db.update("update subculture_event_candidate set subcategory=? where id=?",pair.getValue(),event);publish();
   for(String category:List.of("SUBCULTURE","EXHIBITION","FESTIVAL")){
    var q=new com.boothhana.collection.CatalogBrowseQuery(0,20,category,unique,"","","","RECENT","GYEONGGI");
    assertThat(publications.list(q).total()).isEqualTo(category.equals(pair.getKey())?1:0);
   }
   assertThat(publications.list(new com.boothhana.collection.CatalogBrowseQuery(0,20,pair.getKey(),unique,"","","","RECENT","SEOUL")).total()).isZero();
  }
 }
 @Test void v18OfflinePermissionIsExplicitAndRevocable(){
  var media=web.getBean(com.boothhana.collection.CatalogMediaService.class);
  long id=db.queryForObject("insert into subculture_catalog_asset(event_id,identity_key,type,image_url,page_url,rights_state,storage_state,object_key) values(?,?,'BANNER','https://example.com/a','https://example.com/p','APPROVED','STORED','verified/test/a.png') returning id",Long.class,event,UUID.randomUUID().toString().replace("-","").repeat(2));
  var first=media.detail(id);assertThat(first.offlineAllowed()).isFalse();
  var approved=media.rights(id,new com.boothhana.collection.CatalogModels.RightsInput(first.revision(),"APPROVED","fixture permission proof","fixture credit",true));assertThat(approved.offlineAllowed()).isTrue();
  var revoked=media.rights(id,new com.boothhana.collection.CatalogModels.RightsInput(approved.revision(),"REJECTED","fixture withdrawn","fixture credit",true));assertThat(revoked.offlineAllowed()).isFalse();
  assertThatThrownBy(()->media.rights(id,new com.boothhana.collection.CatalogModels.RightsInput(approved.revision(),"APPROVED","old proof","credit",true))).isInstanceOf(ApiException.class);
 }
 @Test void v18ReadinessIncludesOfflinePermissionColumn(){assertThat(com.boothhana.health.SchemaContract.TABLES.get("subculture_catalog_asset")).contains("offline_allowed");assertThat(db.queryForObject("select count(*) from information_schema.columns where table_schema='public' and table_name='subculture_catalog_asset' and column_name='offline_allowed'",Integer.class)).isEqualTo(1);}
 @Test @SuppressWarnings("unchecked") void popularCatalogCountsOnlyMemberEventSavesAndHidesWithdrawnEvents(){
  var e=new LinkedHashMap<>((Map<String,Object>)snapshot.get("event"));String future=LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(2).toString();
  e.put("region","SEOUL");e.put("subcategory","ONLY_EVENT");e.put("occurrences",List.of(Map.of("startDate",future,"endDate",future)));snapshot.put("event",e);publish();
  for(long owner:List.of(user,other))db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,saved_json) values(?,?,?,'EVENT',?,'{}'::jsonb)",UUID.randomUUID(),owner,event,event);
  db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,participant_id,saved_json) values(?,?,?,'PARTICIPANT',?,?,'{}'::jsonb)",UUID.randomUUID(),user,event,participant,participant);
  var publications=web.getBean(com.boothhana.collection.CatalogPublicationService.class);
  var shown=publications.popular(12).stream().filter(row->((Number)row.get("id")).longValue()==event).findFirst().orElseThrow();
  assertThat(((Number)shown.get("saveCount")).longValue()).isEqualTo(2);assertThat(shown).doesNotContainKeys("user_id","saved_json","note");
  assertThat(publications.popular(12,"SUBCULTURE")).anyMatch(row->((Number)row.get("id")).longValue()==event);
  assertThat(publications.popular(12,"EXHIBITION")).noneMatch(row->((Number)row.get("id")).longValue()==event);
  db.update("update subculture_event_candidate set review_state='EXCLUDED' where id=?",event);
  assertThat(publications.popular(12)).noneMatch(row->((Number)row.get("id")).longValue()==event);
 }
 @Test @org.springframework.transaction.annotation.Transactional @SuppressWarnings("unchecked")
 void popularEditionDeduplicatesMembersBeforeLimitAndKeepsRemainingDay(){
  var e=new LinkedHashMap<>((Map<String,Object>)snapshot.get("event"));
  String past=LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(1).toString(),future=LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(1).toString();
  while(db.queryForObject("select nextval(pg_get_serial_sequence('subculture_event_candidate','id'))",Long.class)<=7) { /* Reserve the two fixed edition IDs without sequence administration privileges. */ }
  String ownKey=UUID.randomUUID().toString().replace("-","").repeat(2);
  event=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state) values(?,?,'[TEST] popularity competitor','ONLY_EVENT',cast(? as date),cast(? as date),'{}',?,'[]','REVIEWED') returning id",Long.class,ownKey,ownKey,future,future,ownKey);
  e.put("region","SEOUL");e.put("subcategory","ONLY_EVENT");snapshot.put("participants",List.of());
  for(long id:List.of(1L,7L)){
   String name=id==1?"제35회 디. 페스타 (토요일)":"제35회 디. 페스타 (일요일)",date=id==1?past:future,key=UUID.randomUUID().toString().replace("-","").repeat(2);
   db.update("insert into subculture_event_candidate(id,identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state) values(?,?,?,?,'ONLY_EVENT',cast(? as date),cast(? as date),'{}',?,'[]','REVIEWED') on conflict(id) do update set name=excluded.name,review_state='REVIEWED'",id,key,key,name,date,date,key);
   e.put("name",name);e.put("occurrences",List.of(Map.of("startDate",date,"endDate",date)));snapshot.put("event",new LinkedHashMap<>(e));
   db.update("insert into subculture_catalog_publication(event_id,snapshot_json,event_revision) values(?,cast(? as jsonb),1) on conflict(event_id) do update set snapshot_json=excluded.snapshot_json,published_at=now()",id,json.writeValueAsString(snapshot));
   db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,saved_json) values(?,?,?,'EVENT',?,'{}'::jsonb)",UUID.randomUUID(),user,id,id);
  }
  db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,saved_json) values(?,?,7,'EVENT',7,'{}'::jsonb)",UUID.randomUUID(),other);
  var publications=web.getBean(com.boothhana.collection.CatalogPublicationService.class);
  var grouped=publications.popular(12,"SUBCULTURE");
  var edition=grouped.stream().filter(row->((Number)row.get("id")).longValue()==1).findFirst().orElseThrow();
  assertThat(((Number)edition.get("saveCount")).longValue()).isEqualTo(2);
  var data=(com.boothhana.collection.CollectionModels.EventData)edition.get("event");
  assertThat(data.name()).isEqualTo("제35회 디. 페스타");assertThat(data.occurrences()).hasSize(2);
  assertThat(grouped).noneMatch(row->((Number)row.get("id")).longValue()==7);
  e.put("name","[TEST] three members");e.put("occurrences",List.of(Map.of("startDate",future,"endDate",future)));snapshot.put("event",e);publish();
  long third=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Memory C') returning id",Long.class,"popular-"+UUID.randomUUID());
  for(long owner:List.of(user,other,third))db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,saved_json) values(?,?,?,'EVENT',?,'{}'::jsonb)",UUID.randomUUID(),owner,event,event);
  assertThat(((Number)publications.popular(1,"SUBCULTURE").getFirst().get("id")).longValue()).isEqualTo(event);
  db.update("update subculture_catalog_publication set snapshot_json=jsonb_set(snapshot_json,'{event,name}',to_jsonb('Different edition'::text)) where event_id=7");
  assertThat(publications.popular(12)).noneMatch(row->((Number)row.get("id")).longValue()==1);
  assertThat(publications.popular(12)).anyMatch(row->((Number)row.get("id")).longValue()==7);
  db.update("update subculture_event_candidate set review_state='EXCLUDED' where id=7");
  assertThat(publications.popular(12)).noneMatch(row->Set.of(1L,7L).contains(((Number)row.get("id")).longValue()));
 }
 // v21: actual JDBC joins + saved projection. Not executed without the isolated test DB.
 @Test void v21HiddenSalesRedactsSavedBoothHistoryAndSearch(){
  var booth=new Target("PARTICIPANT",event,participant,participant);
  var saved=service.save(user,new Save(booth,day,"1관")).item();
  service.edit(user,saved.id(),new Edit(saved.revision(),"MY_PRIVATE_NOTE",day,"1관"));
  String raw=db.queryForObject("select saved_json::text from memory_item where user_id=? and id=?",String.class,user,saved.id());
  assertThat(service.detail(user,saved.id()).saved().summary()).isEqualTo("초록 식물 소품");
  db.update("update subculture_sales set review_state='EXCLUDED' where participant_id=?",participant);
  var hidden=service.detail(user,saved.id());
  assertThat(hidden.available()).isTrue();assertThat(hidden.saved().summary()).isEmpty();
  assertThat(hidden.saved().tags()).doesNotContain("키링").contains("식물");
  assertThat(hidden.note()).isEqualTo("MY_PRIVATE_NOTE");assertThat(hidden.day()).isEqualTo(day);assertThat(hidden.changed()).isTrue();
  assertThat(service.list(user,"초록 식물 소품",null,"",false,0,24).total()).isZero();
  assertThat(service.list(user,"키링",null,"",false,0,24).total()).isZero();
  assertThat(service.list(user,"MY_PRIVATE_NOTE",null,"",false,0,24).total()).isEqualTo(1);
  assertThat(db.queryForObject("select saved_json::text from memory_item where user_id=? and id=?",String.class,user,saved.id())).isEqualTo(raw);
 }

}
