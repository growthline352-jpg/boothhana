package com.boothhana.release;

import com.boothhana.api.ApiException;
import com.boothhana.collection.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties="app.collection.auto-approve=true")
@Transactional
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
class AutomaticCollectionIntegrationTests {
 @DynamicPropertySource static void settings(DynamicPropertyRegistry p) {
  String url=System.getenv("BOOTH_FULL_TEST_URL");
  if(url==null||!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test"))throw new IllegalStateException("Isolated localhost test DB only");
  p.add("spring.datasource.url",()->url);p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));
  p.add("spring.datasource.hikari.maximum-pool-size",()->2);p.add("spring.datasource.hikari.connection-timeout",()->5000);
  p.add("app.support.guest-enabled",()->false);p.add("app.support.attachments-enabled",()->false);
  p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");p.add("app.support.private-bucket",()->"");
 }
 @Autowired JdbcTemplate db;@Autowired JsonMapper json;@Autowired CatalogService catalog;
 @Autowired CatalogAutoApproval approvals;@Autowired CatalogPublicationService publications;@Autowired CatalogObservationService observations;@Autowired CollectionService intake;
 long eventId;
 @BeforeEach void fixture() {
  assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");
  assertThat(db.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user",Boolean.class)).isFalse();
  String day=LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(3).toString(),key=UUID.randomUUID().toString().replace("-","").repeat(2);
  var event=new EventData("[TEST] "+key,"ONLY_EVENT","[TEST] Organizer","2026","SEOUL","[TEST] Hall","서울 마포구","원래 소개","공식 안내 확인",List.of(),List.of(new Occurrence(day,day,null,null)),List.of(new Source("https://example.com/official","OFFICIAL","ORIGINAL","공식 안내")),List.of(),List.of());
  String encoded=json.writeValueAsString(event);
  eventId=db.queryForObject("insert into subculture_event_candidate(identity_key,match_key,name,subcategory,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state,reviewed_payload_json) values(?,?,?,?,cast(? as date),cast(? as date),cast(? as jsonb),?,'[]','REVIEWED',cast(? as jsonb)) returning id",Long.class,key,key,event.name(),event.subcategory(),day,day,encoded,key,encoded);
  publications.publish(eventId,new PublishInput(1));
 }
 @Test void verifiedSourceChangeAppliesPublishesAndRejectsStaleReplay() {
  var input=new CatalogObservationService.ObservationInput(1,"a".repeat(64),"CONFIRMED",List.of("https://example.com/official"),Map.of("address","서울 성동구 성수동"),Map.of("address","CONFIRMED"),Map.of("address","공식 장소 변경 안내"));
  observations.observe(eventId,input);
  assertThat(catalog.event(eventId).address()).isEqualTo("서울 성동구 성수동");
  assertThat(db.queryForObject("select snapshot_json->'event'->>'address' from subculture_catalog_publication where event_id=?",String.class,eventId)).isEqualTo("서울 성동구 성수동");
  assertThat(db.queryForObject("select state from catalog_event_observation where event_id=?",String.class,eventId)).isEqualTo("APPLIED");
  assertThat(db.queryForObject("select count(*) from catalog_event_observation where event_id=? and state='PENDING'",Long.class,eventId)).isZero();
  assertThatThrownBy(()->observations.observe(eventId,input)).isInstanceOf(ApiException.class);
 }
 @Test void explicitWithdrawalSurvivesQueuedApprovalAndNewObservationUntilManualPublish() {
  db.update("update subculture_event_candidate set review_state='PENDING' where id=?",eventId);
  assertThat(approvals.pending(200,0)).contains(eventId); // A worker may already have fetched this ID.
  publications.unpublish(eventId);
  assertThat(approvals.pending(200,0)).doesNotContain(eventId);
  assertThat(approvals.approve(eventId).get("withdrawn")).isEqualTo(true);
  assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Long.class,eventId)).isZero();
  assertThat(db.queryForObject("select revision from subculture_event_candidate where id=?",Long.class,eventId)).isEqualTo(1);
  observations.observe(eventId,new CatalogObservationService.ObservationInput(1,"6".repeat(64),"CONFIRMED",List.of("https://example.com/official"),Map.of("admission","무료"),Map.of("admission","CONFIRMED"),Map.of("admission","새 공식 무료 입장 안내")));
  assertThat(db.queryForObject("select payload_json->>'admission' from subculture_event_candidate where id=?",String.class,eventId)).isEqualTo("무료");
  assertThat(db.queryForObject("select publication_withdrawn from subculture_event_candidate where id=?",Boolean.class,eventId)).isTrue();
  assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Long.class,eventId)).isZero();
  publications.publish(eventId,new PublishInput(2));
  assertThat(db.queryForObject("select publication_withdrawn from subculture_event_candidate where id=?",Boolean.class,eventId)).isFalse();
  assertThat(db.queryForObject("select snapshot_json->'event'->>'admission' from subculture_catalog_publication where event_id=?",String.class,eventId)).isEqualTo("무료");
  assertThat(approvals.approve(eventId).get("published")).isEqualTo(true);
 }
 Batch batch(EventData event) {
  String stamp=java.time.Instant.now().toString(),day=event.occurrences().getFirst().startDate();
  return new Batch("1",UUID.randomUUID().toString(),stamp,stamp,"MANUAL_IMPORT",false,new Scope("SEOUL_GYEONGGI","Asia/Seoul",day,day),new SearchResult("1","COMPLETE","격리 테스트 원문",List.of("격리 테스트 공식 안내"),List.of(event)));
 }
 @Test void unchangedAndChangedIngestDoNotReleaseExplicitWithdrawal() {
  EventData event=catalog.event(eventId);
  long collected=intake.ingest(batch(event)).candidates().getFirst().id();
  publications.unpublish(collected);
  assertThat(intake.ingest(batch(event)).unchanged()).isEqualTo(1);
  Map<String,Object> newer=json.readValue(json.writeValueAsString(event),Map.class);newer.put("admission","공식 무료 입장");
  assertThat(intake.ingest(batch(json.readValue(json.writeValueAsString(newer),EventData.class))).changed()).isEqualTo(1);
  assertThat(db.queryForObject("select publication_withdrawn from subculture_event_candidate where id=?",Boolean.class,collected)).isTrue();
  assertThat(db.queryForObject("select payload_json->>'admission' from subculture_event_candidate where id=?",String.class,collected)).isEqualTo("공식 무료 입장");
  assertThat(db.queryForObject("select count(*) from subculture_catalog_publication where event_id=?",Long.class,collected)).isZero();
  assertThat(approvals.pending(200,0)).doesNotContain(collected);
 }
 @Test void observationMatchingManualOverrideStillUpdatesRawAndRemovingOverrideKeepsLatestFact() {
  String original=catalog.event(eventId).admission();
  catalog.editEvent(eventId,new EditInput(1,"REVIEWED","수동 무료 입장 정정",Map.of("admission","무료")));
  var input=new CatalogObservationService.ObservationInput(2,"7".repeat(64),"CONFIRMED",List.of("https://example.com/official"),Map.of("admission","무료"),Map.of("admission","CONFIRMED"),Map.of("admission","공식 무료 입장 안내"));
  assertThat(observations.observe(eventId,input).get("changedFields")).isEqualTo(Set.of("admission"));
  assertThat(db.queryForObject("select payload_json->>'admission' from subculture_event_candidate where id=?",String.class,eventId)).isEqualTo("무료");
  assertThat(db.queryForObject("select overrides_json->>'admission' from subculture_event_candidate where id=?",String.class,eventId)).isEqualTo("무료");
  assertThat(db.queryForObject("select changes_json->'admission'->>'before' from catalog_event_observation where event_id=?",String.class,eventId)).isEqualTo(original);
  assertThat(db.queryForObject("select state from catalog_event_observation where event_id=?",String.class,eventId)).isEqualTo("APPLIED");
  assertThat(db.queryForObject("select details_json->>'eventRevision' from catalog_source_check where event_id=?",String.class,eventId)).isEqualTo("3");
  assertThatThrownBy(()->observations.observe(eventId,input)).isInstanceOf(ApiException.class);
  catalog.editEvent(eventId,new EditInput(3,"REVIEWED","최신 수집값 사용",Map.of(),List.of("admission")));
  publications.publish(eventId,new PublishInput(4));
  assertThat(catalog.event(eventId).admission()).isEqualTo("무료");
  assertThat(db.queryForObject("select snapshot_json->'event'->>'admission' from subculture_catalog_publication where event_id=?",String.class,eventId)).isEqualTo("무료");
  var unchanged=new CatalogObservationService.ObservationInput(4,"8".repeat(64),"CONFIRMED",List.of("https://example.com/official"),Map.of("admission","무료"),Map.of("admission","CONFIRMED"),Map.of("admission","동일 공식 안내"));
  assertThat((Set<?>)observations.observe(eventId,unchanged).get("changedFields")).isEmpty();
  assertThat(db.queryForObject("select revision from subculture_event_candidate where id=?",Long.class,eventId)).isEqualTo(4);
  assertThat(db.queryForObject("select count(*) from catalog_event_observation where event_id=?",Long.class,eventId)).isEqualTo(1);
 }
 @Test void imageRepairExposesLatestSourceDigestEvenWhenFactsAndPublicationRevisionStayUnchanged() {
  // The shared isolated DB may contain more than one page of earlier fixtures.
  var initial=catalog.imageRepairTargets(1,eventId-1).getFirst();
  assertThat(initial.get("id")).isEqualTo(eventId);
  assertThat(initial).containsKey("sourceDigest");assertThat(initial.get("sourceDigest")).isNull();
  for(String status:List.of("CONFIRMED","ACCESS_FAILED")) {
   String digest=(status.equals("CONFIRMED")?"9":"0").repeat(64);
   observations.observe(eventId,new CatalogObservationService.ObservationInput(1,digest,status,List.of("https://example.com/official"),Map.of(),Map.of(),Map.of()));
   var target=catalog.imageRepairTargets(1,eventId-1).getFirst();
   assertThat(target.get("id")).isEqualTo(eventId);
   assertThat(target.get("sourceDigest")).isEqualTo(digest);
   assertThat(target.get("revision")).isEqualTo(initial.get("revision"));
   assertThat(target.get("event")).isEqualTo(initial.get("event"));
   assertThat(db.queryForObject("select revision from subculture_event_candidate where id=?",Long.class,eventId)).isEqualTo(1);
  }
 }
 @Test void exhaustedUnchangedSourceIsExcludedUntilFactsChange() {
  observations.observe(eventId,new CatalogObservationService.ObservationInput(1,"b".repeat(64),"ACCESS_FAILED",List.of("https://example.com/official"),Map.of(),Map.of(),Map.of()));
  db.update("update catalog_source_check set next_check_at=now()-interval '1 day' where event_id=?",eventId);
  assertThat(observations.due(100,0).stream().map(row->row.get("id"))).contains(eventId);
  var methods=List.of("SOURCE_DETAILS","ORGANIZER_SEARCH","VENUE_SEARCH");
  var completed=Map.of("SOURCE_DETAILS","SUCCESS","ORGANIZER_SEARCH","SUCCESS","VENUE_SEARCH","SUCCESS");
  assertThatThrownBy(()->observations.sourceExhausted(eventId,new CatalogObservationService.ExhaustedInput(1,List.of("SOURCE_DETAILS"),completed))).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->observations.sourceExhausted(eventId,new CatalogObservationService.ExhaustedInput(1,methods,Map.of("SOURCE_DETAILS","PARTIAL","ORGANIZER_SEARCH","PARTIAL","VENUE_SEARCH","PARTIAL")))).isInstanceOf(ApiException.class);
  db.update("update catalog_source_check set details_json=details_json || '{\"repairResolution\":\"EXHAUSTED\"}'::jsonb where event_id=?",eventId);
  assertThat(observations.due(100,0).stream().map(row->row.get("id"))).contains(eventId);
  assertThat(observations.sourceExhausted(eventId,new CatalogObservationService.ExhaustedInput(1,methods,completed)).get("exhausted")).isEqualTo(true);
  assertThat(observations.due(100,0).stream().map(row->row.get("id"))).doesNotContain(eventId);
  catalog.editEvent(eventId,new EditInput(1,"REVIEWED","새 원문 확인",Map.of("description","새 공지 내용")));
  assertThat(observations.due(100,0).stream().map(row->row.get("id"))).contains(eventId);
 }

 @Test void automaticObservationPreservesManualOverridesAndUpdatesCollectedFacts() {
  catalog.editEvent(eventId,new EditInput(1,"REVIEWED","수동 정정",Map.of("address","서울 성동구 성수동")));
  observations.observe(eventId,new CatalogObservationService.ObservationInput(2,"c".repeat(64),"CONFIRMED",List.of("https://example.com/official"),Map.of("address","서울 송파구 잠실동","admission","무료"),Map.of("address","CONFIRMED","admission","CONFIRMED"),Map.of("address","공식 주소","admission","공식 무료 안내")));
  assertThat(catalog.event(eventId).address()).isEqualTo("서울 성동구 성수동");
  assertThat(catalog.event(eventId).admission()).isEqualTo("무료");
  assertThat(db.queryForObject("select overrides_json->>'address' from subculture_event_candidate where id=?",String.class,eventId)).isEqualTo("서울 성동구 성수동");
  assertThat(db.queryForObject("select jsonb_exists(overrides_json,'admission') from subculture_event_candidate where id=?",Boolean.class,eventId)).isFalse();
  assertThat(db.queryForObject("select payload_json->>'address' from subculture_event_candidate where id=?",String.class,eventId)).isEqualTo("서울 송파구 잠실동");
  assertThat(db.queryForObject("select snapshot_json->'event'->>'address' from subculture_catalog_publication where event_id=?",String.class,eventId)).isEqualTo("서울 성동구 성수동");
  long revision=db.queryForObject("select revision from subculture_event_candidate where id=?",Long.class,eventId);
  observations.observe(eventId,new CatalogObservationService.ObservationInput(revision,"d".repeat(64),"CONFIRMED",List.of("https://example.com/official"),Map.of("admission","사전 예약"),Map.of("admission","CONFIRMED"),Map.of("admission","새 공식 안내")));
  assertThat(catalog.event(eventId).admission()).isEqualTo("사전 예약");
 }
 @Test void automaticObservationValidatesFinalStateWithManualRegionAndAddress() {
  catalog.editEvent(eventId,new EditInput(1,"REVIEWED","지역·주소 수동 정정",Map.of("region","GYEONGGI","address","경기도 성남시 분당구")));
  observations.observe(eventId,new CatalogObservationService.ObservationInput(2,"e".repeat(64),"CONFIRMED",List.of("https://example.com/official"),Map.of("address","서울 송파구 잠실동","admission","무료"),Map.of("address","CONFIRMED","admission","CONFIRMED"),Map.of("address","원문 주소","admission","무료 입장 안내")));
  assertThat(catalog.event(eventId).region()).isEqualTo("GYEONGGI");
  assertThat(catalog.event(eventId).address()).isEqualTo("경기도 성남시 분당구");
  assertThat(db.queryForObject("select payload_json->>'address' from subculture_event_candidate where id=?",String.class,eventId)).isEqualTo("서울 송파구 잠실동");
  assertThat(db.queryForObject("select snapshot_json->'event'->>'admission' from subculture_catalog_publication where event_id=?",String.class,eventId)).isEqualTo("무료");
 }
 @Test void existingConflictingOrUnknownEditionBannersAreNotBulkApproved() {
  String page="https://example.com/official",wrong="https://example.com/2025.png",right="https://example.com/2026.png";
  Map<String,Object> payload=json.readValue(db.queryForObject("select payload_json::text from subculture_event_candidate where id=?",String.class,eventId),Map.class);
  payload.put("banners",List.of(new Banner(wrong,page,"UNKNOWN",null,false),new Banner(right,page,"UNKNOWN",null,true)));
  db.update("update subculture_event_candidate set payload_json=cast(? as jsonb),review_state='PENDING' where id=?",json.writeValueAsString(payload),eventId);
  for(String url:List.of(wrong,"https://example.com/unknown.png"))db.update("insert into subculture_catalog_asset(event_id,identity_key,type,image_url,page_url,reported_rights) values(?,?,'BANNER',?,?,'UNKNOWN')",eventId,CollectionRules.sha(UUID.randomUUID().toString()),url,page);
  approvals.approve(eventId);
  assertThat(db.queryForObject("select rights_state from subculture_catalog_asset where event_id=? and image_url=?",String.class,eventId,wrong)).isEqualTo("PENDING");
  assertThat(db.queryForObject("select rights_state from subculture_catalog_asset where event_id=? and image_url='https://example.com/unknown.png'",String.class,eventId)).isEqualTo("PENDING");
  assertThat(db.queryForObject("select rights_state from subculture_catalog_asset where event_id=? and image_url=?",String.class,eventId,right)).isEqualTo("APPROVED");
  assertThat(approvals.pending(200,0)).doesNotContain(eventId);
 }
}
