package com.boothhana.release;
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
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@Transactional
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class PersonalPlansIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->System.getenv("BOOTH_FULL_TEST_URL"));p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");}
 @Autowired JdbcTemplate db;@Autowired JsonMapper json;@Autowired WebApplicationContext web;
 MockMvc http;String subject,other;long owner,otherOwner;UUID id,memory;
 @BeforeEach void fixture(){assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");subject="plan-"+UUID.randomUUID();other=subject+"-other";owner=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Plans') returning id",Long.class,subject);otherOwner=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Other') returning id",Long.class,other);id=UUID.randomUUID();memory=UUID.randomUUID();db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,participant_id,saved_json) values(?,?,90001,'PARTICIPANT',90002,90002,'{}'::jsonb)",memory,owner);http=MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();}
 Map<String,Object> plan(){return new LinkedHashMap<>(Map.ofEntries(Map.entry("version",1),Map.entry("id",id.toString()),Map.entry("title","[TEST] My day"),Map.entry("purpose","EVENT"),Map.entry("day","2026-10-09"),Map.entry("start","10:00"),Map.entry("end","19:00"),Map.entry("area","SEONGSU"),Map.entry("style","VIEW"),Map.entry("updatedAt","2026-10-06T01:00:00Z"),Map.entry("stops",List.of(new LinkedHashMap<>(Map.ofEntries(Map.entry("id",UUID.randomUUID().toString()),Map.entry("kind","PLACE"),Map.entry("name","[TEST] Cafe"),Map.entry("address","서울 성동구"),Map.entry("start","11:00"),Map.entry("duration",60),Map.entry("locked",false),Map.entry("note","[TEST] Private note"),Map.entry("url",""),Map.entry("source","MANUAL"),Map.entry("point",Map.of("lat",37.55,"lng",127.05))))))));}
 String body(Object plan,long revision,long user){return json.writeValueAsString(Map.of("plan",plan,"revision",revision,"expectedUserId",user));}
 void save(Object plan,long revision)throws Exception{http.perform(put("/api/me/itineraries/"+id).with(user(subject)).with(csrf()).contentType("application/json").content(body(plan,revision,owner))).andExpect(status().isOk());}
 @Test void savesAcrossRequestsWithPrivateNotesAndNoStore()throws Exception{var p=plan();save(p,0);http.perform(get("/api/me/itineraries").with(user(subject))).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$[0].plan.stops[0].note").value("[TEST] Private note")).andExpect(jsonPath("$[0].revision").value(1));}
 @Test void anonymousAndMissingCsrfCannotWrite()throws Exception{var body=body(plan(),0,owner);http.perform(get("/api/me/itineraries")).andExpect(status().isUnauthorized());http.perform(put("/api/me/itineraries/"+id).with(user(subject)).contentType("application/json").content(body)).andExpect(status().isForbidden());}
 @Test void differentAccountCannotReadDeleteOrOverwriteOriginal()throws Exception{var p=plan();save(p,0);http.perform(get("/api/me/itineraries").with(user(other))).andExpect(jsonPath("$.length()").value(0));http.perform(delete("/api/me/itineraries/"+id).with(user(other)).with(csrf()).param("revision","1").param("expectedUserId",Long.toString(otherOwner))).andExpect(status().isNoContent());http.perform(put("/api/me/itineraries/"+id).with(user(other)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isConflict());assertThat(db.queryForObject("select count(*) from personal_itinerary where user_id=? and not deleted",Long.class,owner)).isEqualTo(1);}
 @Test void staleDeviceAndStaleDeleteNeverOverwriteLatest()throws Exception{var p=plan();save(p,0);p.put("title","[TEST] Latest");save(p,1);p.put("title","[TEST] Old device");http.perform(put("/api/me/itineraries/"+id).with(user(subject)).with(csrf()).contentType("application/json").content(body(p,1,owner))).andExpect(status().isConflict());http.perform(delete("/api/me/itineraries/"+id).with(user(subject)).with(csrf()).param("revision","1").param("expectedUserId",Long.toString(owner))).andExpect(status().isConflict());http.perform(get("/api/me/itineraries").with(user(subject))).andExpect(jsonPath("$[0].plan.title").value("[TEST] Latest"));}
 @Test void identicalRetryIsIdempotentAndDeletedPlansCannotResurrect()throws Exception{var p=plan();save(p,0);save(p,0);assertThat(db.queryForObject("select revision from personal_itinerary where user_id=? and id=?",Long.class,owner,id)).isEqualTo(1);http.perform(delete("/api/me/itineraries/"+id).with(user(subject)).with(csrf()).param("revision","1").param("expectedUserId",Long.toString(owner))).andExpect(status().isNoContent());http.perform(put("/api/me/itineraries/"+id).with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isNotFound());assertThat(db.queryForObject("select plan_json::text from personal_itinerary where user_id=? and id=?",String.class,owner,id)).isEqualTo("{}");}
 @Test void catalogEventItineraryIdenticalRetriesKeepRevisionAndRejectDifferentStaleData()throws Exception {
  var p=plan();
  @SuppressWarnings("unchecked") var stops=(List<Map<String,Object>>)p.get("stops");
  var stop=stops.getFirst();stop.put("kind","EVENT");stop.put("source","CATALOG");stop.put("url","/discover/90001");stop.put("eventId",90001);
  for(long revision:new long[]{0,0,1}){
   http.perform(put("/api/me/itineraries/"+id).with(user(subject)).with(csrf()).contentType("application/json").content(body(p,revision,owner)))
    .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1)).andExpect(jsonPath("$.plan.stops[0].eventId").value(90001));
  }
  p.put("title","[TEST] Changed itinerary");
  http.perform(put("/api/me/itineraries/"+id).with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isConflict());
  assertThat(db.queryForObject("select revision from personal_itinerary where user_id=? and id=?",Long.class,owner,id)).isEqualTo(1);
  assertThat(db.queryForObject("select plan_json->>'title' from personal_itinerary where user_id=? and id=?",String.class,owner,id)).isEqualTo("[TEST] My day");
  save(p,1);save(p,1);
  assertThat(db.queryForObject("select revision from personal_itinerary where user_id=? and id=?",Long.class,owner,id)).isEqualTo(2);
 }
 Map<String,Object> purchases(){return new LinkedHashMap<>(Map.of("eventId",90001,"eventName","[TEST] Event","budget",50000,"items",List.of(new LinkedHashMap<>(Map.ofEntries(Map.entry("id",UUID.randomUUID().toString()),Map.entry("boothKey","saved:90002"),Map.entry("boothName","[TEST] Booth"),Map.entry("memoryId",memory.toString()),Map.entry("name","[TEST] Item"),Map.entry("quantity",2),Map.entry("unitBudget",10000),Map.entry("purchased",false),Map.entry("prepaid",true),Map.entry("received",false),Map.entry("note","[TEST] Pickup"))))));}
 @Test void purchasePlanRetainsBudgetProgressAndPrivateOwnership()throws Exception{http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(purchases(),0,owner))).andExpect(status().isOk()).andExpect(jsonPath("$.plan.items[0].prepaid").value(true));http.perform(get("/api/me/purchase-plans").with(user(other))).andExpect(jsonPath("$.length()").value(0));http.perform(get("/api/me/purchase-plans").with(user(subject))).andExpect(jsonPath("$[0].plan.budget").value(50000));}
 @Test void purchaseIdenticalRetriesKeepRevisionAndRejectDifferentStaleMoney()throws Exception {
  var p=purchases();
  for(long revision:new long[]{0,0,1}){
   http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,revision,owner)))
    .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1)).andExpect(jsonPath("$.plan.budget").value(50000)).andExpect(jsonPath("$.plan.items[0].unitBudget").value(10000));
  }
  p.put("budget",60000);
  http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isConflict());
  assertThat(db.queryForObject("select revision from purchase_plan where user_id=? and event_id=90001",Long.class,owner)).isEqualTo(1);
  assertThat(db.queryForObject("select (plan_json->>'budget')::int from purchase_plan where user_id=? and event_id=90001",Integer.class,owner)).isEqualTo(50000);
  for(int attempt=0;attempt<2;attempt++){
   http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,1,owner)))
    .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2));
  }
 }
 @Test void purchasePlanRejectsAnotherAccountsMemory()throws Exception{http.perform(put("/api/me/purchase-plans/90001").with(user(other)).with(csrf()).contentType("application/json").content(body(purchases(),0,otherOwner))).andExpect(status().isBadRequest());assertThat(db.queryForObject("select count(*) from purchase_plan where user_id=?",Long.class,otherOwner)).isZero();}
 @Test void invalidMoneyAndReceiptAreRejected()throws Exception{var p=purchases();p.put("budget",-1);http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isBadRequest());p=purchases();@SuppressWarnings("unchecked") var rows=(List<Map<String,Object>>)p.get("items");rows.getFirst().put("prepaid",false);rows.getFirst().put("received",true);http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isBadRequest());}
 @Test void deletedMemoryDoesNotEraseAnExistingPrivatePurchasePlan()throws Exception{var p=purchases();http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isOk());db.update("delete from memory_item where id=?",memory);p.put("budget",60000);http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,1,owner))).andExpect(status().isOk());}
 @Test void oversizedChunkedBodiesAreRejectedBeforeParsing()throws Exception{http.perform(put("/api/me/itineraries/"+id).with(user(subject)).with(csrf()).contentType("application/json").content(" ".repeat(131073))).andExpect(status().isPayloadTooLarge());}
 @Test void boothOrderCanBeStoredWithoutAFakePurchaseItem()throws Exception{var p=purchases();p.put("items",List.of());p.put("booths",List.of(Map.of("key","saved:90002","name","[TEST] Booth","memoryId",memory.toString())));http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isOk()).andExpect(jsonPath("$.plan.items.length()").value(0)).andExpect(jsonPath("$.plan.booths[0].memoryId").value(memory.toString()));db.update("delete from memory_item where id=?",memory);p.put("budget",60000);http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,1,owner))).andExpect(status().isOk());}
 @Test void boothReferencesCannotUseAnotherAccountsSavedBooth()throws Exception{UUID foreign=UUID.randomUUID();db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,participant_id,saved_json) values(?,?,90001,'PARTICIPANT',90003,90003,'{}'::jsonb)",foreign,otherOwner);var p=purchases();p.put("items",List.of());p.put("booths",List.of(Map.of("key","saved:90003","name","[TEST] Foreign","memoryId",foreign.toString())));http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isBadRequest());}
 @Test void removedProductReferencesMustBelongToTheOwnerAndEvent()throws Exception{var p=purchases();p.put("items",List.of());p.put("excludedMemoryIds",List.of(UUID.randomUUID().toString()));http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isBadRequest());UUID product=UUID.randomUUID();db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,participant_id,saved_json) values(?,?,90001,'PRODUCT',90004,90002,'{}'::jsonb)",product,owner);p.put("excludedMemoryIds",List.of(product.toString()));http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isOk()).andExpect(jsonPath("$.plan.excludedMemoryIds[0]").value(product.toString()));}

 @Test void purchaseDeletionReleasesCapacityAndRejectsStaleResurrection()throws Exception {
  var p=purchases();
  http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isOk());
  for(int i=0;i<99;i++)db.update("insert into purchase_plan(user_id,event_id,plan_json) values(?,?,cast(? as jsonb))",owner,91000+i,json.writeValueAsString(Map.of("eventId",91000+i)));
  UUID m=UUID.randomUUID();db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,saved_json) values(?,?,90005,'EVENT',90005,'{}'::jsonb)",m,owner);
  var next=new LinkedHashMap<>(p);next.put("eventId",90005);next.put("items",List.of());
  http.perform(put("/api/me/purchase-plans/90005").with(user(subject)).with(csrf()).contentType("application/json").content(body(next,0,owner))).andExpect(status().isConflict());
  http.perform(delete("/api/me/purchase-plans/90001").with(user(other)).with(csrf()).param("revision","1").param("expectedUserId",Long.toString(owner))).andExpect(status().isConflict());
  http.perform(delete("/api/me/purchase-plans/90001").with(user(subject)).param("revision","1").param("expectedUserId",Long.toString(owner))).andExpect(status().isForbidden());
  http.perform(delete("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).param("revision","99").param("expectedUserId",Long.toString(owner))).andExpect(status().isConflict());
  http.perform(delete("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).param("revision","1").param("expectedUserId",Long.toString(owner))).andExpect(status().isNoContent()).andExpect(header().string("Cache-Control","no-store"));
  http.perform(get("/api/me/purchase-plans/90001").with(user(subject))).andExpect(status().isOk()).andExpect(jsonPath("$.record").doesNotExist()).andExpect(jsonPath("$.revision").value(2));
  http.perform(get("/api/me/purchase-plans/90001").with(user(other))).andExpect(jsonPath("$.revision").value(0));
  http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,1,owner))).andExpect(status().isNotFound());
  http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isNotFound());
  http.perform(put("/api/me/purchase-plans/90005").with(user(subject)).with(csrf()).contentType("application/json").content(body(next,0,owner))).andExpect(status().isOk());
  http.perform(delete("/api/me/purchase-plans/90005").with(user(subject)).with(csrf()).param("revision","1").param("expectedUserId",Long.toString(owner))).andExpect(status().isNoContent());
  http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,2,owner))).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(3));
 }
 @Test void compactPurchaseNear60kStoresWithJsonbFormattingHeadroom()throws Exception {
  var p=new LinkedHashMap<String,Object>();p.put("eventId",90001);p.put("eventName","Event");p.put("budget",null);
  var items=new ArrayList<Map<String,Object>>();var booths=new ArrayList<Map<String,Object>>();var excluded=new ArrayList<String>();
  for(int i=0;i<500;i++){
   var booth=new LinkedHashMap<String,Object>();booth.put("key","b"+i);booth.put("name","B");booth.put("memoryId",null);booths.add(booth);
   UUID ref=UUID.randomUUID();excluded.add(ref.toString());
   db.update("insert into memory_item(id,user_id,event_id,target_type,target_id,participant_id,saved_json) values(?,?,90001,'PRODUCT',?,90002,'{}'::jsonb)",ref,owner,92000+i);
  }
  for(int i=0;i<98;i++){
   var item=new LinkedHashMap<String,Object>();item.put("id",UUID.randomUUID().toString());item.put("boothKey","b"+i);item.put("boothName","B");item.put("name","I");item.put("note",i==0?"x".repeat(120):"");item.put("memoryId",null);item.put("quantity",1);item.put("unitBudget",null);item.put("purchased",false);item.put("prepaid",false);item.put("received",false);items.add(item);
  }
  p.put("items",items);p.put("booths",booths);p.put("excludedMemoryIds",excluded);
  assertThat(json.writeValueAsString(p).getBytes(java.nio.charset.StandardCharsets.UTF_8).length).isLessThanOrEqualTo(60000);
  assertThat(db.queryForObject("select octet_length(cast(? as jsonb)::text)",Integer.class,json.writeValueAsString(p))).isGreaterThan(65536);
  http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,0,owner))).andExpect(status().isOk());
  items.getFirst().put("note","x".repeat(1000));
  http.perform(put("/api/me/purchase-plans/90001").with(user(subject)).with(csrf()).contentType("application/json").content(body(p,1,owner))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("구매 메모가 너무 길어요. 물건이나 메모를 줄인 뒤 저장해 주세요."));
  assertThat(db.queryForObject("select revision from purchase_plan where user_id=? and event_id=90001",Long.class,owner)).isEqualTo(1);
 }
}
