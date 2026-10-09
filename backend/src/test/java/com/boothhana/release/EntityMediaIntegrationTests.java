package com.boothhana.release;

import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogPublicationService;
import com.boothhana.collection.graph.EntityMediaService;
import com.boothhana.interests.SubcultureInterestService;
import com.boothhana.upload.VerifiedImageStorage;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;
import java.io.ByteArrayInputStream;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import static com.boothhana.collection.graph.EntityMediaModels.*;
import static com.boothhana.collection.graph.GraphModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real PostgreSQL target visibility, immutable review and HTTP authentication; only storage is a bounded test port. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
@Transactional
class EntityMediaIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p){
  p.add("spring.datasource.url",()->System.getenv("BOOTH_FULL_TEST_URL"));p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));
  p.add("app.collection.graph.enabled",()->true);p.add("app.collector.token",()->"media-isolated-test-token-1234567890");p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");p.add("app.storage.public-url",()->"https://assets.example.test");
 }
 @Autowired JdbcTemplate db;@Autowired JsonMapper json;@Autowired WebApplicationContext web;
 @Autowired SubcultureInterestService interests;@Autowired CatalogPublicationService publications;
 EntityMediaService media;RecordingStorage storage;MockMvc http;long owner;UUID work,character;
 String source="https://example.com/official-character",page="https://example.com/licensed-image",usage="https://example.com/license";
 byte[] bytes=Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X2kAAAAASUVORK5CYII=");String digest;
 static final class RecordingStorage implements VerifiedImageStorage {
  int puts;byte[] saved;String storedKey;
  public void put(String key,String type,byte[] bytes,String sha){puts++;saved=bytes.clone();storedKey=key;}
  public void verify(String key,String type,long size,String sha){assertThat(key).isEqualTo(storedKey);assertThat(saved).hasSize((int)size);}
 }
 @BeforeEach void fixture() throws Exception{
  assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");assertThat(db.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user",Boolean.class)).isFalse();
  http=MockMvcBuilders.webAppContextSetup(web).apply(springSecurity()).build();storage=new RecordingStorage();media=new EntityMediaService(db,json,storage,"https://assets.example.test");ReflectionTestUtils.setField(media,"enabled",true);
  digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));owner=db.queryForObject("insert into app_user(kakao_subject,display_name) values(?,'[TEST] Media') returning id",Long.class,UUID.randomUUID().toString());
  work=UUID.randomUUID();character=UUID.randomUUID();db.update("insert into subculture_subject(id,kind,name,medium,source_url,reviewed_by) values(?,'WORK','[TEST] Media work','게임',?,?)",work,source,owner);
  db.update("insert into subculture_subject(id,kind,name,work_id,medium,source_url,reviewed_by) values(?,'CHARACTER','[TEST] Media character',?,'게임',?,?)",character,work,source,owner);
 }
 Audit audit(boolean review){return audit(review,"a".repeat(64));}
 Audit audit(boolean review,String pageHash){return new Audit("gpt-6.1-sol",review?"entity-media-review-1":"entity-media-extract-1","graph-4",true,List.of(source,page,usage),Map.of(),List.of(digest),List.of(new SourceDocument(source,"b".repeat(64),Instant.now().toString()),new SourceDocument(page,pageHash,Instant.now().toString()),new SourceDocument(usage,"c".repeat(64),Instant.now().toString())));}
 ExtractionInput extraction(String kind,String id,String permission){var context=media.context(kind,id);return new ExtractionInput(UUID.randomUUID(),kind,id,context.get("targetHash").toString(),new Candidate("https://example.com/image.png",page,digest,"Official representative image","Original author", "Official profile and licensed image identify the exact target",permission,"Explicit license permits public reproduction with attribution",usage),audit(false));}
 UUID id(Map<String,Object> row){return (UUID)row.get("id");}
 ReviewInput review(Map<String,Object> row,String verdict,Audit audit){return new ReviewInput(((Number)row.get("revision")).longValue(),(UUID)row.get("extractionId"),row.get("resultHash").toString(),verdict,"Independent source, target, visual and permission verification",audit);}
 Map<String,Object> approved(String kind,String target){var result=media.extract(extraction(kind,target,"PERMITTED"));return media.review(id(result),review(result,"APPROVE",audit(true)));}
 Map<String,Object> stored(String kind,String target) throws Exception{var result=approved(kind,target);return media.content(id(result),((Number)result.get("revision")).longValue(),"image/png",digest,bytes.length,new ByteArrayInputStream(bytes));}
 @Test void immutableExtractionAndResponseLossRetryPreserveTheSameImage()throws Exception{
  var input=extraction("SUBJECT",character.toString(),"PERMITTED");var extracted=media.extract(input);assertThat(media.extract(input).get("id")).isEqualTo(extracted.get("id"));
  var decision=review(extracted,"APPROVE",audit(true));var approved=media.review(id(extracted),decision);assertThat(media.review(id(extracted),decision).get("revision")).isEqualTo(approved.get("revision"));
  var complete=media.content(id(extracted),1,"image/png",digest,bytes.length,new ByteArrayInputStream(bytes));assertThat(complete.get("storageState")).isEqualTo("STORED");
  assertThat(media.content(id(extracted),1,"image/png",digest,bytes.length,new ByteArrayInputStream(bytes)).get("revision")).isEqualTo(complete.get("revision"));assertThat(storage.puts).isEqualTo(1);
  assertThat(interests.subject(character).get("imageUrl")).isEqualTo(complete.get("storedUrl"));assertThat(interests.subject(character).get("imageSourceUrl")).isEqualTo(page);
 }
 @Test void unknownOrForbiddenPermissionCannotBeApprovedOrUploaded(){
  for(String status:List.of("UNKNOWN","FORBIDDEN")){var extracted=media.extract(extraction("SUBJECT",character.toString(),status));assertThatThrownBy(()->media.review(id(extracted),review(extracted,"APPROVE",audit(true)))).isInstanceOf(ApiException.class);
   assertThatThrownBy(()->media.content(id(extracted),0,"image/png",digest,bytes.length,new ByteArrayInputStream(bytes))).isInstanceOf(ApiException.class);}
  assertThat(storage.puts).isZero();assertThat(media.publicImages("SUBJECT",List.of(character.toString()))).isEmpty();
 }
 @Test void unverifiedOrChangedSourcesAndSameExtractionPromptAreRejected(){
  var extracted=media.extract(extraction("SUBJECT",character.toString(),"PERMITTED"));assertThatThrownBy(()->media.review(id(extracted),review(extracted,"APPROVE",audit(true,"d".repeat(64))))).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->media.review(id(extracted),review(extracted,"APPROVE",audit(false)))).isInstanceOf(ApiException.class);
  var missing=new Audit("gpt-6.1-sol","entity-media-review-1","graph-4",true,List.of(source,page,usage),Map.of(),List.of(digest),List.of(new SourceDocument(source,"b".repeat(64),Instant.now().toString())));
  assertThatThrownBy(()->media.review(id(extracted),review(extracted,"APPROVE",missing))).isInstanceOf(ApiException.class);
 }
 @Test void changedOriginalDocumentsCanBeReExtractedWithoutReusingAnOldAudit(){
  var input=extraction("SUBJECT",character.toString(),"PERMITTED");var first=media.extract(input);var changed=new ExtractionInput(UUID.randomUUID(),input.kind(),input.targetId(),input.targetHash(),input.candidate(),audit(false,"d".repeat(64)));var fresh=media.extract(changed);
  assertThat(fresh.get("id")).isNotEqualTo(first.get("id"));assertThat(media.review(id(fresh),review(fresh,"APPROVE",audit(true,"d".repeat(64)))).get("rightsState")).isEqualTo("APPROVED");
 }
 @Test void wrongBytesOrDifferentImageHashNeverReachStorage()throws Exception{
  var approved=approved("SUBJECT",character.toString());byte[] bad=bytes.clone();bad[bad.length-1]^=1;
  assertThatThrownBy(()->media.content(id(approved),1,"image/png",digest,bad.length,new ByteArrayInputStream(bad))).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->media.content(id(approved),1,"image/png","d".repeat(64),bytes.length,new ByteArrayInputStream(bytes))).isInstanceOf(ApiException.class);assertThat(storage.puts).isZero();
 }
 @Test void differentTargetReferenceAndStaleRevisionCannotReuseAReview(){
  var input=extraction("SUBJECT",character.toString(),"PERMITTED");var extracted=media.extract(input);var other=new ExtractionInput(input.extractionId(),"SUBJECT",work.toString(),media.context("SUBJECT",work.toString()).get("targetHash").toString(),input.candidate(),input.audit());
  assertThatThrownBy(()->media.extract(other)).isInstanceOf(ApiException.class);
  db.update("update subculture_subject set name='[TEST] Corrected character',revision=revision+1 where id=?",character);assertThatThrownBy(()->media.review(id(extracted),review(extracted,"APPROVE",audit(true)))).isInstanceOf(ApiException.class);
 }
 @Test void withdrawnTargetsParentWorksAndManualCorrectionsHideOldImages()throws Exception{
  var complete=stored("SUBJECT",character.toString());assertThat(media.publicImages("SUBJECT",List.of(character.toString()))).hasSize(1);
  db.update("update subculture_subject set active=false where id=?",work);assertThat(media.publicImages("SUBJECT",List.of(character.toString()))).isEmpty();
  db.update("update subculture_subject set active=true where id=?",work);db.update("update subculture_subject set source_url='https://example.com/corrected',revision=revision+1 where id=?",character);assertThat(media.publicImages("SUBJECT",List.of(character.toString()))).isEmpty();
  assertThatThrownBy(()->media.content(id(complete),1,"image/png",digest,bytes.length,new ByteArrayInputStream(bytes))).isInstanceOf(ApiException.class);
 }
 @Test void olderValidAndManualSelectionsArePreservedAndRightsRevocationHidesThem()throws Exception{
  var first=stored("SUBJECT",character.toString());var input=extraction("SUBJECT",character.toString(),"PERMITTED");var modified=new Candidate("https://example.com/other.png",page,digest,"Second valid image","Other author",input.candidate().identityEvidence(),"PERMITTED",input.candidate().usageEvidence(),usage);
  var second=media.extract(new ExtractionInput(UUID.randomUUID(),input.kind(),input.targetId(),input.targetHash(),modified,input.audit()));second=media.review(id(second),review(second,"APPROVE",audit(true)));second=media.content(id(second),1,"image/png",digest,bytes.length,new ByteArrayInputStream(bytes));
  assertThat(media.publicImages("SUBJECT",List.of(character.toString())).get(character.toString()).get("imageUrl")).isEqualTo(first.get("storedUrl"));
  db.update("update subculture_entity_media set reviewed_by=? where id=?",owner,id(first));assertThat(media.publicImages("SUBJECT",List.of(character.toString())).get(character.toString()).get("imageUrl")).isEqualTo(first.get("storedUrl"));
  db.update("update subculture_entity_media set rights_state='REJECTED' where target_id=?",character.toString());assertThat(media.publicImages("SUBJECT",List.of(character.toString()))).isEmpty();
 }
 @SuppressWarnings("unchecked") Map<String,Object> legacyCatalog(){
  String key=UUID.randomUUID().toString().replace("-","").repeat(2);long event=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json) values(?,?, '[TEST] Media event','ONLY_EVENT',current_date,current_date,'{}',?,'[]') returning id",Long.class,key,key,key);
  var profile=new LinkedHashMap<String,Object>();profile.put("name","[TEST] Legacy media author");profile.put("profileUrl",null);
  long creator=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb)) returning id",Long.class,key,profile.get("name"),json.writeValueAsString(profile));
  long participant=db.queryForObject("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash) values(?,?,'[TEST] Media booth','{}',?) returning id",Long.class,event,key,key);
  db.update("insert into subculture_participant_member(participant_id,exhibitor_id) values(?,?)",participant,creator);
  var data=Map.of("name","[TEST] Media goods","summary","Actual single product","sources",List.of(Map.of("url",source)),"images",List.of());
  long legacy=db.queryForObject("insert into subculture_catalog_product(participant_id,identity_key,name,payload_json) values(?,?,'[TEST] Media goods',cast(? as jsonb)) returning id",Long.class,participant,key,json.writeValueAsString(data));
  db.update("insert into subculture_sales(participant_id,payload_json,payload_hash) values(?,'{}',?)",participant,key);
  var person=Map.of("id",participant,"participant",Map.of("members",List.of(profile),"registrationName","[TEST] Media booth","sources",List.of(Map.of("url",source)),"officialLinks",List.of(source)),"sales",Map.of("summary","Actual catalog"),"productIds",Map.of(Long.toString(legacy),legacy),"productRows",List.of(Map.of("id",legacy,"data",data)));
  db.update("insert into subculture_catalog_publication(event_id,snapshot_json,event_revision) values(?,cast(? as jsonb),1)",event,json.writeValueAsString(Map.of("id",event,"event",Map.of("name","[TEST] Media event","subcategory","ONLY_EVENT"),"participants",List.of(person))));
  UUID product=UUID.randomUUID();db.update("insert into collection_product(id,legacy_product_id,exhibitor_id,identity_key,data_json) values(?,?,?,?,cast(? as jsonb))",product,legacy,creator,key,json.writeValueAsString(data));return Map.of("event",event,"creator",creator,"participant",participant,"legacy",legacy,"product",product);
 }
 @Test void legacyAuthorsWithoutProfilesCanUseTheExactPublishedParticipantProvenance()throws Exception{
  var catalog=legacyCatalog();String creator=catalog.get("creator").toString();var context=media.context("CREATOR",creator);
  assertThat((List<?>)((Map<?,?>)context.get("target")).get("provenance")).hasSize(1);var complete=stored("CREATOR",creator);
  assertThat(interests.creator(((Number)catalog.get("creator")).longValue()).get("imageUrl")).isEqualTo(complete.get("storedUrl"));
  db.update("update subculture_participant set review_state='EXCLUDED' where id=?",catalog.get("participant"));assertThat(media.publicImages("CREATOR",List.of(creator))).isEmpty();
 }
 @SuppressWarnings("unchecked") @Test void uuidProductMediaReachesLegacyPublicGoodsAndNeverFollowsChangedOrWithdrawnProducts()throws Exception{
  var catalog=legacyCatalog();String product=catalog.get("product").toString();var complete=stored("PRODUCT",product);
  var detail=publications.detail(((Number)catalog.get("event")).longValue());var person=(Map<String,Object>)((List<?>)detail.get("participants")).getFirst();var publicProduct=(Map<String,Object>)((List<?>)person.get("productRows")).getFirst();assertThat(publicProduct.get("imageUrl")).isEqualTo(complete.get("storedUrl"));
  db.update("update collection_product set data_json=jsonb_set(data_json,'{name}','\"[TEST] Different goods\"') where id=?",catalog.get("product"));assertThat(media.publicImages("PRODUCT",List.of(product))).isEmpty();
  db.update("update subculture_event_candidate set publication_withdrawn=true where id=?",catalog.get("event"));assertThatThrownBy(()->media.context("PRODUCT",product)).isInstanceOf(ApiException.class);
 }
 @Test void apiUsesCollectorAuthenticationAndAllowsBoundedImageBodies()throws Exception{
  var approved=approved("SUBJECT",character.toString());http.perform(get("/api/internal/subculture/v6/media/context").param("kind","SUBJECT").param("targetId",character.toString())).andExpect(status().isUnauthorized());
  // Accepted binary path reaches byte verification, instead of the generic JSON-only collector rejection.
  http.perform(post("/api/internal/subculture/v6/media/"+id(approved)+"/content").header("Authorization","Bearer media-isolated-test-token-1234567890").header("X-Asset-Revision",1).header("X-Image-SHA256",digest).header("X-Image-Size",bytes.length).contentType("image/png").content(new byte[]{1,2,3})).andExpect(status().isBadRequest());
 }
 @Test void mediaTableIsProtectedByActualRlsAndBrowserRolesHaveNoGrants(){assertThat(db.queryForObject("select relrowsecurity from pg_class where oid='subculture_entity_media'::regclass",Boolean.class)).isTrue();assertThat(db.queryForObject("select has_table_privilege('anon','subculture_entity_media','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','subculture_entity_media','SELECT,INSERT,UPDATE,DELETE')",Boolean.class)).isFalse();}
}
