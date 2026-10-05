package com.boothhana.release;
import com.boothhana.api.ApiException;
import com.boothhana.itinerary.ItineraryShares;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
@org.springframework.transaction.annotation.Transactional
class ItinerarySharingIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->System.getenv("BOOTH_FULL_TEST_URL"));p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));p.add("spring.datasource.hikari.maximum-pool-size",()->3);p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");}
 @Autowired JdbcTemplate db;@Autowired JsonMapper json;@Autowired WebApplicationContext web;
 MockMvc http;UUID id;String secret,body;
 @BeforeEach void fixture(){assertEquals("boothhana_release_test",db.queryForObject("select current_database()",String.class));assertFalse(db.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user",Boolean.class));http=MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();id=UUID.randomUUID();secret=UUID.randomUUID().toString().replace("-","")+"abcdefghijk";body="""
 {"requestId":"%s","managementKey":"%s","includeNotes":false,"plan":{"version":1,"id":"local-plan","title":"[TEST] shared itinerary","purpose":"DATE","day":"2026-10-09","start":"12:00","end":"19:00","area":"SEONGSU","style":"CONTENT","updatedAt":"2026-10-05T00:00:00Z","stops":[{"id":"stop-a","kind":"PLACE","name":"[TEST] cafe","address":"서울 성동구","point":null,"start":"13:00","duration":60,"locked":false,"note":"private reservation number","url":"https://example.test/place","source":"MANUAL"}]}}
 """.formatted(id,secret);}
 String create()throws Exception{return json.readTree(http.perform(post("/api/public/itinerary/shares").with(csrf().asHeader()).contentType("application/json").content(body)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("token").asString();}
 @Test void guestCreatesReadableNoIndexSnapshotAndRetriesWithoutDuplicates()throws Exception{
  String token=create();assertEquals(token,create());assertEquals(1,db.queryForObject("select count(*) from itinerary_share where id=?",Integer.class,id));
  var content=http.perform(get("/api/public/itinerary/shares/"+token)).andExpect(status().isOk()).andExpect(header().string("X-Robots-Tag","noindex, nofollow")).andExpect(header().string("Referrer-Policy","no-referrer")).andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString();
  assertFalse(content.contains(secret));assertFalse(content.contains("management"));assertFalse(content.contains("private reservation"));
  http.perform(post("/api/public/itinerary/shares").contentType("application/json").content(body)).andExpect(status().isForbidden());
 }
 @Test void onlyManagementCapabilityCanRevokeAndRevocationErasesSnapshot()throws Exception{
  String token=create();http.perform(post("/api/public/itinerary/shares/"+id+"/revoke").with(csrf().asHeader()).contentType("application/json").content("{\"managementKey\":\""+"x".repeat(43)+"\"}")).andExpect(status().isNotFound());
  http.perform(get("/api/public/itinerary/shares/"+token)).andExpect(status().isOk());revoke();revoke();http.perform(get("/api/public/itinerary/shares/"+token)).andExpect(status().isNotFound());assertEquals("{}",db.queryForObject("select snapshot_json::text from itinerary_share where id=?",String.class,id));
 }
 void revoke()throws Exception{http.perform(post("/api/public/itinerary/shares/"+id+"/revoke").with(csrf().asHeader()).contentType("application/json").content("{\"managementKey\":\""+secret+"\"}")).andExpect(status().isNoContent());}
 @Test void pendingCancellationPreventsLateCreateAndWrongSecretsCannotRecover()throws Exception{
  revoke();http.perform(post("/api/public/itinerary/shares").with(csrf().asHeader()).contentType("application/json").content(body)).andExpect(status().isNotFound());
  http.perform(post("/api/public/itinerary/shares").with(csrf().asHeader()).contentType("application/json").content(body.replace(secret,"x".repeat(43)))).andExpect(status().isForbidden());
 }
 @Test void expiryAndChangedRetryDoNotExposeOrReplaceSnapshot()throws Exception{
  String token=create();http.perform(post("/api/public/itinerary/shares").with(csrf().asHeader()).contentType("application/json").content(body.replace("[TEST] shared itinerary","changed"))).andExpect(status().isConflict());
  db.update("update itinerary_share set expires_at=now()-interval '1 minute' where id=?",id);http.perform(get("/api/public/itinerary/shares/"+token)).andExpect(status().isNotFound());
 }
}
