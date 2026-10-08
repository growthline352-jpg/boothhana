package com.boothhana.release;

import com.boothhana.api.ApiException;
import com.boothhana.library.*;
import com.boothhana.interests.*;
import com.boothhana.interests.InterestModels.*;
import com.boothhana.interests.InterestModels.Entry;
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
class SubcultureInterestIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p){String url=System.getenv("BOOTH_FULL_TEST_URL");if(url==null||!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test"))throw new IllegalStateException("Isolated test DB only");
  p.add("spring.datasource.url",()->url);p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));p.add("spring.datasource.hikari.maximum-pool-size",()->3);
  p.add("app.support.guest-enabled",()->false);p.add("app.support.attachments-enabled",()->false);p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");p.add("app.storage.public-url",()->"https://assets.example.test");}
 @Autowired JdbcTemplate db;@Autowired LibraryService service;@Autowired LibraryTargets targets;@Autowired JsonMapper json;@Autowired WebApplicationContext web;
 long user,other,event,participant,product;String subject,otherSubject,day;MockMvc http;Map<String,Object> snapshot;
 @BeforeEach void fixture(){assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");assertThat(db.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user",Boolean.class)).isFalse();
  http=MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();subject="memory-"+UUID.randomUUID();otherSubject="memory-other-"+UUID.randomUUID();
  user=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Memory A') returning id",Long.class,subject);other=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Memory B') returning id",Long.class,otherSubject);
  String key=UUID.randomUUID().toString().replace("-","").repeat(2);day=LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(3).toString();
  event=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state) values(?,?,'[TEST] memory event','ONLY_EVENT',cast(? as date),cast(? as date),'{}',?,'[]','REVIEWED') returning id",Long.class,key,key,day,day,key);
  participant=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash,review_state) values(?,?,'[TEST] Leaf studio','{}',?,'REVIEWED') returning id",Long.class,event,key,key);
  product=db.queryForObject("insert into subculture_catalog_product(participant_id,identity_key,name,payload_json) values(?,?,'[TEST] Leaf keyring','{}') returning id",Long.class,participant,key);
  db.update("insert into subculture_sales(participant_id,payload_json,payload_hash,review_state) values(?,'{}',?,'REVIEWED')",participant,key);
  Map<String,Object> e=new LinkedHashMap<>();e.put("subcategory","ONLY_EVENT");e.put("region","서울");e.put("name","[TEST] memory event");e.put("description","행사 소개");e.put("subjects",List.of("식물"));e.put("venueName","서울 테스트 장소");e.put("occurrences",List.of(Map.of("startDate",day,"endDate",day)));e.put("sources",List.of(Map.of("kind","OFFICIAL","url","https://example.com/event")));
  var p=Map.of("registrationName","[TEST] Leaf studio","members",List.of(),"subjects",List.of("식물"),"officialLinks",List.of("https://example.com/maker"),"locations",List.of(Map.of("code","B1","hall","1관","startDate",day,"endDate",day)));
  var good=Map.of("name","[TEST] Leaf keyring","summary","초록 식물 키링","categories",List.of("키링"),"productUrl","https://example.com/product","saleState","PLANNED","evidenceScope","EVENT_LISTED");
  snapshot=new LinkedHashMap<>();snapshot.put("event",e);snapshot.put("participants",List.of(Map.of("id",participant,"participant",p,"sales",Map.of("summary","초록 식물 소품","categories",List.of("키링")),"productRows",List.of(Map.of("id",product,"data",good)))));snapshot.put("publishedAt",Instant.now().toString());publish();
 }
 @Autowired SubcultureInterestService interests; @Autowired InterestFeed feed;
 UUID workId,characterId,siblingId;
 void catalog(){workId=UUID.randomUUID();characterId=UUID.randomUUID();siblingId=UUID.randomUUID();interests.reviewSubject(user,workId,new SubjectInput(0,"WORK","[TEST] Same Work",null,"게임",List.of(),"https://example.com/work",true));for(UUID id:List.of(characterId,siblingId))interests.reviewSubject(user,id,new SubjectInput(0,"CHARACTER",id.equals(characterId)?"[TEST] Character":"[TEST] Sibling",workId,"",List.of(),"https://example.com/character",true));}
 Entry following(UUID id){return new Entry(UUID.randomUUID(),id,null,"","","",null);}
 void link(UUID id){interests.reviewLink(user,UUID.randomUUID(),new LinkInput(0,id,"PRODUCT",product,event,participant,"https://example.com/sales","Explicit character on sale sheet",true));}
 void publish(){db.update("insert into subculture_catalog_publication(event_id,snapshot_json,event_revision) values(?,cast(? as jsonb),1) on conflict(event_id) do update set snapshot_json=excluded.snapshot_json,published_at=now()",event,json.writeValueAsString(snapshot));}
 Save input(){return new Save(new Target("PRODUCT",event,product,participant),day,"1관");}

 @Autowired com.boothhana.collection.CatalogPublicationService publications;
 @Test void batchedDetailsKeepPerEventLiveVisibility(){
  long first=event,firstParticipant=participant;fixture();long second=event;
  var ids=List.of(first,second);
  assertThat(publications.findPublicDetails(ids)).containsKeys(first,second);
  db.update("update subculture_participant set review_state='EXCLUDED' where id=?",firstParticipant);
  var values=publications.findPublicDetails(ids);
  assertThat((List<?>)values.get(first).get("participants")).isEmpty();
  assertThat((List<?>)values.get(second).get("participants")).hasSize(1);
  db.update("update subculture_event_candidate set review_state='EXCLUDED' where id=?",first);
  assertThat(publications.findPublicDetails(ids)).containsOnlyKeys(second);
 }
 @Test void privateSettingsRequireSessionCsrfAndAreIsolated()throws Exception{catalog();interests.save(user,new Settings(0,List.of(following(characterId))));assertThat(interests.settings(other).entries()).isEmpty();http.perform(get("/api/me/subculture/interests")).andExpect(status().isUnauthorized());http.perform(put("/api/me/subculture/interests").with(user(subject).roles("FAN")).contentType("application/json").content("{\"revision\":1,\"entries\":[]}")).andExpect(status().isForbidden());http.perform(get("/api/me/subculture/interests").with(user(subject).roles("FAN"))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));}
 @Test void conflictingSaveDoesNotLoseExistingInterests(){catalog();interests.save(user,new Settings(0,List.of(following(characterId))));assertThatThrownBy(()->interests.save(user,new Settings(0,List.of()))).isInstanceOf(ApiException.class);assertThat(interests.settings(user).entries()).hasSize(1);}
 @Test void worksIncludeChildrenButCharactersNeverIncludeSiblings(){catalog();link(siblingId);assertThat((List<?>)feed.home(null,null,workId,null,0).get("goods")).hasSize(1);assertThat((List<?>)feed.home(null,null,characterId,null,0).get("goods")).isEmpty();}
 @Test void privateCustomInputDoesNotAutoMatchCatalog(){catalog();link(characterId);Entry custom=new Entry(UUID.randomUUID(),null,null,"[TEST] Character","[TEST] Same Work","게임",workId);interests.save(user,new Settings(0,List.of(custom)));var home=feed.home(user,null,null,null,0);assertThat(home.get("unlinked")).isEqualTo(true);assertThat(home.get("personalized")).isEqualTo(false);}
 @Test void differentWorkSameCharacterNameIsNotDeduplicated(){var a=new Entry(UUID.randomUUID(),null,null,"Miku","Work A","게임",null);var b=new Entry(UUID.randomUUID(),null,null,"Miku","Work B","게임",null);interests.save(user,new Settings(0,List.of(a,b)));assertThat(interests.settings(user).entries()).hasSize(2);var duplicate=new Entry(UUID.randomUUID(),null,null," M I K U ","Work A","게임",null);assertThatThrownBy(()->interests.save(user,new Settings(1,List.of(a,duplicate)))).isInstanceOf(ApiException.class);assertThat(interests.settings(user).entries()).hasSize(2);}
 @Test void hiddenSalesAndWithdrawnEventsCannotLeakIntoPersonalizedFeed(){catalog();link(characterId);assertThat((List<?>)feed.home(null,null,characterId,null,0).get("goods")).hasSize(1);db.update("update subculture_sales set review_state='EXCLUDED' where participant_id=?",participant);assertThat((List<?>)feed.home(null,null,characterId,null,0).get("goods")).isEmpty();assertThat((List<?>)feed.home(null,null,characterId,null,0).get("events")).isEmpty();db.update("delete from subculture_catalog_publication where event_id=?",event);assertThat((List<?>)feed.home(null,null,characterId,null,0).get("events")).isEmpty();}
 @Test void archivedWorkHidesItsCharactersAndLinks(){catalog();link(characterId);interests.reviewSubject(user,workId,new SubjectInput(0,"WORK","[TEST] Same Work",null,"게임",List.of(),"https://example.com/work",false));assertThatThrownBy(()->interests.subject(characterId)).isInstanceOf(ApiException.class);}
 @Test void noArtworkToEventInference(){catalog();long artist=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?, 'Maker', '{\"name\":\"Maker\",\"profileUrl\":\"https://example.com/maker\"}') returning id",Long.class,UUID.randomUUID().toString().replace("-","").repeat(2));db.update("insert into subculture_participant_member(participant_id,exhibitor_id) values(?,?)",participant,artist);var first=new LinkedHashMap<>((Map<String,Object>)((List<?>)snapshot.get("participants")).getFirst());var person=new LinkedHashMap<>((Map<String,Object>)first.get("participant"));person.put("members",List.of(Map.of("name","Maker","profileUrl","https://example.com/maker")));first.put("participant",person);snapshot.put("participants",List.of(first));publish();interests.reviewLink(user,UUID.randomUUID(),new LinkInput(0,characterId,"CREATOR",artist,null,null,"https://example.com/art","Character artwork only",true));var home=feed.home(null,null,characterId,null,0);assertThat((List<?>)home.get("creators")).hasSize(1);assertThat((List<?>)home.get("events")).isEmpty();assertThat((List<?>)home.get("goods")).isEmpty();}
 @Test void reviewedLinksRejectWrongProductParent(){catalog();assertThatThrownBy(()->interests.reviewLink(user,UUID.randomUUID(),new LinkInput(0,characterId,"PRODUCT",product,event,participant+1,"https://example.com/sale","wrong parent",true))).isInstanceOf(ApiException.class);}
 @Test void adminMutationCannotBeCalledByFan()throws Exception{http.perform(put("/api/admin/subculture/subjects/"+UUID.randomUUID()).with(user(subject).roles("FAN")).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());}
 @Test void newTablesAreNotBrowserAccessible(){for(String table:List.of("subculture_subject","subculture_subject_link","subculture_interest","subculture_interest_settings")){assertThat(db.queryForObject("select relrowsecurity from pg_class where oid=cast(? as regclass)",Boolean.class,table)).isTrue();assertThat(db.queryForObject("select has_table_privilege('anon',?,'SELECT') or has_table_privilege('authenticated',?,'SELECT')",Boolean.class,table,table)).isFalse();}}
}
