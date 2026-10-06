package com.boothhana.collection;

import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;
import com.boothhana.upload.VerifiedImageStorage;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** OPT-IN: destroys the public schema of a dedicated localhost boothhana_catalog_test DB ONLY.
 * Tests actual PostgreSQL transactions, not Spring HTTP/security or real external storage.
 */
@EnabledIfEnvironmentVariable(named="BOOTH_CATALOG_TEST_URL",matches=".+")
class CatalogPostgresTests {
    JdbcTemplate db; TransactionTemplate tx; JsonMapper json; CollectionService discovery;
    CatalogService service; CatalogMediaService media; CatalogPublicationService publications;
    String pipeline; long eventId;
    Scope scope=new Scope("SEOUL","Asia/Seoul","2026-10-01","2026-10-31");
    @BeforeEach void setup() throws Exception {
        String url=System.getenv("BOOTH_CATALOG_TEST_URL");
        if(!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1)(?::[0-9]{1,5})?/boothhana_catalog_test"))
            throw new IllegalArgumentException("Only dedicated local boothhana_catalog_test database is allowed");
        var ds=new DriverManagerDataSource(url,System.getenv("BOOTH_CATALOG_TEST_USER"),System.getenv("BOOTH_CATALOG_TEST_PASSWORD"));
        db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));json=JsonMapper.builder().build();
        db.execute("drop schema public cascade;create schema public");
        db.execute(Files.readString(Path.of("../database/005_subculture_collection.sql")));
        db.execute(Files.readString(Path.of("../database/006_subculture_catalog.sql")));
        db.execute(Files.readString(Path.of("../database/007_catalog_review_fixes.sql")));
        db.execute(Files.readString(Path.of("../database/008_catalog_presentation.sql")));
        db.execute(Files.readString(Path.of("../database/009_floorplan_automation.sql")));
        db.execute(Files.readString(Path.of("../database/027_discovery_observations.sql")));
        db.execute(Files.readString(Path.of("../database/030_catalog_publication_withdrawal.sql")));
        // Later catalog fields; commerce/account modules remain empty in this
        // catalog-only fixture. Match their lookup keys without seeding real users.
        db.execute("alter table subculture_catalog_asset add column offline_allowed boolean not null default false");
        db.execute("alter table subculture_catalog_review_history add column actor_id bigint");
        db.execute("create table catalog_creator_booth(participant_id bigint primary key references subculture_participant(id),event_id bigint not null references subculture_event_candidate(id),user_id bigint not null,base_booth_id bigint not null,unique(event_id,user_id))");
        db.execute("create table support_ticket(id uuid primary key,kind varchar(24),category varchar(40),status varchar(24),client_context_json jsonb)");
        db.execute("create table catalog_operating_group(root_event_id bigint primary key,name text)");
        db.execute("create table catalog_operating_group_member(event_id bigint primary key,root_event_id bigint,position integer)");
        db.execute("create table event(id bigint primary key,name text);insert into event values(1,'unchanged commerce sentinel')");
        media=new CatalogMediaService(db,mock(VerifiedImageStorage.class),"https://images.example.com");
        service=new CatalogService(db,json,media);publications=new CatalogPublicationService(db,json,media);discovery=new CollectionService(db,json);
        tx.execute(s->discovery.ingest(eventBatch()));
        eventId=db.queryForObject("select id from subculture_event_candidate",Long.class);
        pipeline=UUID.randomUUID().toString();tx.execute(s->service.start(new PipelineInput(pipeline,"2026-09-13",scope)));
    }
    Batch eventBatch() {
        try {var result=json.readValue(Files.readString(Path.of("../collector/examples/v4/events.json")),SearchResult.class);
            return new Batch("1",UUID.randomUUID().toString(),"2026-09-16T00:00:00Z","2026-09-16T00:01:00Z","MANUAL_IMPORT",false,scope,result);
        } catch(Exception e) {throw new IllegalStateException(e);}
    }
    StageBatch stage(String name,Long participant) {
        try {var result=json.readValue(Files.readString(Path.of("../collector/examples/v4/"+(name.equals("PARTICIPANTS")?"participants":"sales")+".json")),StageResult.class);
            long rev=participant==null?((Number)service.eventDetail(eventId).get("revision")).longValue():service.participant(participant).revision();
            return new StageBatch("4",UUID.randomUUID().toString(),pipeline,name,eventId,participant,rev,"2026-09-16T00:00:00Z","2026-09-16T00:01:00Z",true,result);
        } catch(Exception e) {throw new IllegalStateException(e);}
    }
    StageReceipt ingest(StageBatch b) {return tx.execute(s->service.ingest(b));}
    long participant() {return ingest(stage("PARTICIPANTS",null)).participantIds().getFirst();}
    void reviewEvent() {long revision=((Number)service.eventDetail(eventId).get("revision")).longValue();tx.execute(s->service.editEvent(eventId,new EditInput(revision,"REVIEWED","test checked",Map.of())));}
    void reviewParticipant(long id) {var row=service.participant(id);tx.execute(s->service.editParticipant(id,new EditInput(row.revision(),"REVIEWED","test checked",Map.of())));}
    CatalogAutoApproval enableAutomaticIntake() {
        media=new CatalogMediaService(db,mock(VerifiedImageStorage.class),"https://images.example.com",true);
        publications=new CatalogPublicationService(db,json,media);
        var policy=new CatalogAutoApproval(db,json,publications,media,true);
        discovery=new CollectionService(db,json,policy);service=new CatalogService(db,json,media,policy);
        return policy;
    }
    @Test void automaticIntakePublishesEventsBoothsSalesAndApprovesImagesWithoutManualReview() {
        var policy=enableAutomaticIntake();tx.execute(s->discovery.ingest(eventBatch()));
        assertThat(service.eventDetail(eventId).get("reviewState")).isEqualTo("REVIEWED");
        assertThat(publications.detail(eventId).get("mode")).isEqualTo("INFO_ONLY");
        var publishedAt=db.queryForObject("select published_at::text from subculture_catalog_publication where event_id=?",String.class,eventId);
        tx.execute(s->discovery.ingest(eventBatch()));
        assertThat(db.queryForObject("select published_at::text from subculture_catalog_publication where event_id=?",String.class,eventId)).isEqualTo(publishedAt);
        long booth=participant();ingest(stage("SALES",booth));
        assertThat(service.participant(booth).reviewState()).isEqualTo("REVIEWED");
        assertThat(service.participant(booth).sales().reviewState()).isEqualTo("REVIEWED");
        assertThat((List<?>)publications.detail(eventId).get("participants")).hasSize(1);
        AssetView image=tx.execute(s->media.registerValidated(eventId,new AssetRegistrationInput(null,null,new Image("BANNER","https://example.com/new-poster.png","https://example.com/event","official poster","poster"))));
        assertThat(image.rightsState()).isEqualTo("APPROVED");
        tx.execute(s->media.rights(image.id(),new RightsInput(image.revision(),"REJECTED","explicit exclusion","")));
        tx.execute(s->policy.approve(eventId));
        assertThat(media.detail(image.id()).rightsState()).isEqualTo("REJECTED");
        assertThat(db.queryForObject("select count(*) from event",Long.class)).isEqualTo(1);
    }
    @Test void automaticBackfillKeepsOverridesAndExplicitlyExcludedBooths() {
        long included=participant();var row=service.participant(included);
        tx.execute(s->service.editParticipant(included,new EditInput(row.revision(),"EXCLUDED","explicit exclusion",Map.of())));
        long revision=((Number)service.eventDetail(eventId).get("revision")).longValue();
        tx.execute(s->service.editEvent(eventId,new EditInput(revision,"PENDING","manual correction",Map.of("name","[TEST] Corrected event"))));
        var policy=enableAutomaticIntake();
        assertThat(policy.pending(200,0)).contains(eventId);
        tx.execute(s->policy.approve(eventId));
        assertThat(service.event(eventId).name()).isEqualTo("[TEST] Corrected event");
        assertThat(service.participant(included).reviewState()).isEqualTo("EXCLUDED");
        assertThat((List<?>)publications.detail(eventId).get("participants")).isEmpty();
        assertThat(policy.pending(200,0)).doesNotContain(eventId);
    }
    @Test void assetSyncContinuesPastLegacyRecordsWithoutBannerArrays() {
        long missing=copyRepairEvent("PENDING",false),explicitNull=copyRepairEvent("PENDING",false);
        db.update("update subculture_event_candidate set payload_json=payload_json-'banners'-'discoveryLinks' where id=?",missing);
        db.update("update subculture_event_candidate set payload_json=jsonb_set(payload_json,'{banners}','null'::jsonb) where id=?",explicitNull);
        var banner=new Banner("https://example.com/current.jpg","https://example.com/event","UNKNOWN",null,true);
        db.update("update subculture_event_candidate set payload_json=jsonb_set(payload_json,'{banners}',cast(? as jsonb)) where id=?",json.writeValueAsString(List.of(banner)),eventId);
        var result=tx.execute(s->service.syncEventAssets(pipeline));
        assertThat(result.get("registeredCandidates")).isEqualTo(1);
        assertThat(db.queryForObject("select count(*) from subculture_catalog_asset where event_id=? and type='BANNER' and rights_state='PENDING'",Long.class,eventId)).isEqualTo(1);
        assertThat(db.queryForObject("select count(*) from subculture_catalog_asset where event_id in (?,?)",Long.class,missing,explicitNull)).isZero();
        assertThat(db.queryForObject("select count(*) from subculture_catalog_publication",Long.class)).isZero();
    }
    @Test void reviewedOperationStatusSurvivesPublicationAndDatabaseRead() {
        for(String state:List.of("CANCELED","POSTPONED","RESCHEDULED","SCHEDULED")) {
            long revision=((Number)service.eventDetail(eventId).get("revision")).longValue();
            var notice=new OperationStatus(state,"[TEST] official notice", "https://example.com/status", "2026-09-17");
            tx.execute(s->service.editEvent(eventId,new EditInput(revision,"REVIEWED","checked official source",Map.of("operationStatus",notice))));
            long reviewed=((Number)service.eventDetail(eventId).get("revision")).longValue();
            tx.execute(s->publications.publish(eventId,new PublishInput(reviewed)));
            assertThat(db.queryForObject("select snapshot_json->'event'->'operationStatus'->>'state' from subculture_catalog_publication where event_id=?",String.class,eventId)).isEqualTo(state);
            assertThat(db.queryForObject("select snapshot_json->'event'->'operationStatus'->>'note' from subculture_catalog_publication where event_id=?",String.class,eventId)).isEqualTo(notice.note());
        }
    }
    @Test void sameStageReplayIsIdempotent() {
        var request=stage("PARTICIPANTS",null);assertThat(ingest(request)).isEqualTo(ingest(request));
        assertThat(db.queryForObject("select count(*) from subculture_stage_run",Long.class)).isEqualTo(1);
        assertThat(db.queryForObject("select count(*) from subculture_participant",Long.class)).isEqualTo(1);
    }
    @Test void concurrentStageReplayHasOneReceipt() throws Exception {
        var request=stage("PARTICIPANTS",null);
        try(var pool=Executors.newFixedThreadPool(2)) {var gate=new CountDownLatch(1);Callable<StageReceipt> job=()->{gate.await();return ingest(request);};var a=pool.submit(job);var b=pool.submit(job);gate.countDown();assertThat(a.get(15,TimeUnit.SECONDS)).isEqualTo(b.get(15,TimeUnit.SECONDS));}
        assertThat(db.queryForObject("select count(*) from subculture_stage_run",Long.class)).isEqualTo(1);
    }
    @Test void staleParentRevisionRejected() {
        StageBatch stale=stage("PARTICIPANTS",null);reviewEvent();assertThatThrownBy(()->ingest(stale)).hasMessageContaining("변경");
    }
    @Test void correctedEventLookupSurvivesDiscoveryChange() {
        long revision=((Number)service.eventDetail(eventId).get("revision")).longValue();
        tx.execute(s->service.editEvent(eventId,new EditInput(revision,"REVIEWED","correction",Map.of("name","[TEST] Corrected event"))));
        Batch original=eventBatch();EventData e=original.result().events().getFirst();
        EventData changed=new EventData(e.name(),e.subcategory(),e.organizer(),e.edition(),e.region(),e.venueName(),e.address(),"new source description",e.admission(),e.subjects(),e.occurrences(),e.sources(),e.banners(),e.warnings(),e.eventFormat(),e.discoveryLinks());
        Batch update=new Batch("1",UUID.randomUUID().toString(),original.startedAt(),original.finishedAt(),original.executionMode(),false,scope,new SearchResult("1","COMPLETE","updated",List.of("test"),List.of(changed)));
        tx.execute(s->discovery.ingest(update));assertThat(service.event(eventId).name()).isEqualTo("[TEST] Corrected event");
        assertThat(db.queryForObject("select name from subculture_event_candidate where id=?",String.class,eventId)).isEqualTo("[TEST] Corrected event");
        assertThat(service.eventDetail(eventId).get("reviewState")).isEqualTo("PENDING");
    }
    @Test void correctedBoothCodeIsSearchableAndRegistrationNotDuplicated() {
        long id=participant();var row=service.participant(id);
        var location=new Location("Z-99","ASSIGNED",null,null,null,null,null);
        tx.execute(s->service.editParticipant(id,new EditInput(row.revision(),"REVIEWED","corrected",Map.of("registrationName","Corrected joint booth","locations",List.of(location)))));
        assertThat(service.participants(eventId,0,20,"Z-99").total()).isEqualTo(1);
        ingest(stage("PARTICIPANTS",null));assertThat(service.participant(id).data().registrationName()).isEqualTo("Corrected joint booth");
        assertThat(db.queryForObject("select count(*) from subculture_participant",Long.class)).isEqualTo(1);
    }
    @Test void publicationNeedsReviewAndNeverCreatesCommerce() {
        long revision=((Number)service.eventDetail(eventId).get("revision")).longValue();
        assertThatThrownBy(()->tx.execute(s->publications.publish(eventId,new PublishInput(revision)))).hasMessageContaining("검토");
        long id=participant();reviewEvent();reviewParticipant(id);
        long checked=((Number)service.eventDetail(eventId).get("revision")).longValue();
        tx.execute(s->publications.publish(eventId,new PublishInput(checked)));
        assertThat(publications.detail(eventId).get("mode")).isEqualTo("INFO_ONLY");
        assertThat(db.queryForObject("select count(*) from event",Long.class)).isEqualTo(1);
        assertThat(db.queryForObject("select name from event where id=1",String.class)).isEqualTo("unchanged commerce sentinel");
        var row=service.participant(id);tx.execute(s->service.editParticipant(id,new EditInput(row.revision(),"EXCLUDED","remove public record",Map.of())));
        assertThat((List<?>)publications.detail(eventId).get("participants")).isEmpty();
    }
    @Test void salesAreSeparatedAndPrivateImageNotesAreNotPublic() {
        long id=participant();ingest(stage("SALES",id));reviewEvent();reviewParticipant(id);var sales=service.participant(id).sales();
        tx.execute(s->service.editSales(id,new EditInput(sales.revision(),"REVIEWED","private sales note",Map.of())));
        tx.execute(s->{media.register(eventId,id,null,new Image("SALES_SHEET","https://example.com/sheet.png","https://example.com/source",null,"sheet"));return null;});
        AssetView a=media.assets(eventId,id).stream().filter(x->x.type().equals("SALES_SHEET")).findFirst().orElseThrow();
        tx.execute(s->media.rights(a.id(),new RightsInput(a.revision(),"APPROVED","private permission note","Public credit")));
        db.update("update subculture_catalog_asset set storage_state='STORED',object_key='verified/catalog/test.png' where id=?",a.id());
        long revision=((Number)service.eventDetail(eventId).get("revision")).longValue();tx.execute(s->publications.publish(eventId,new PublishInput(revision)));
        String publicJson=json.writeValueAsString(publications.detail(eventId));assertThat(publicJson).contains("Public credit").doesNotContain("private permission note","private sales note");
        AssetView approved=media.detail(a.id());tx.execute(s->media.rights(a.id(),new RightsInput(approved.revision(),"REJECTED","revoked","")));
        assertThat(json.writeValueAsString(publications.detail(eventId))).doesNotContain("verified/catalog/test.png");
    }
    @Test void manualAssetRegistrationValidatesParentsAndIsIdempotent() {
        long id=participant();ingest(stage("SALES",id));
        long product=service.participant(id).sales().productRows().getFirst().id();
        var image=new Image("PRODUCT","https://example.com/product.png","https://example.com/product",null,"product");
        var input=new AssetRegistrationInput(id,product,image);
        AssetView first=tx.execute(s->media.registerValidated(eventId,input));
        AssetView replay=tx.execute(s->media.registerValidated(eventId,input));
        assertThat(replay.id()).isEqualTo(first.id());
        assertThat(db.queryForObject("select count(*) from subculture_catalog_asset where identity_key=(select identity_key from subculture_catalog_asset where id=?)",Long.class,first.id())).isEqualTo(1);
        assertThatThrownBy(()->tx.execute(s->media.registerValidated(eventId,new AssetRegistrationInput(id+999,product,image)))).hasMessageContaining("참가자");
        assertThatThrownBy(()->tx.execute(s->media.registerValidated(eventId,new AssetRegistrationInput(null,product,image)))).hasMessageContaining("참가자 연결");
    }
    @Test void differentRunningPipelineIsBlockedAndFinishedPipelineCanReleaseLease() {
        assertThatThrownBy(()->tx.execute(s->service.start(new PipelineInput(UUID.randomUUID().toString(),"2026-09-13",scope)))).hasMessageContaining("다른");
        tx.execute(s->service.finish(pipeline,new PipelineFinish("SUCCESS",Map.of("test",true))));
        String next=UUID.randomUUID().toString();assertThat(tx.execute(s->service.start(new PipelineInput(next,"2026-09-20",scope))).get("state")).isEqualTo("RUNNING");
    }

    // v5 review regressions below require the same explicit throwaway PostgreSQL database.
    @SuppressWarnings("unchecked") static <T>T with(T record,String field,Object value) {
        try {var parts=record.getClass().getRecordComponents();Class<?>[] types=new Class<?>[parts.length];Object[] args=new Object[parts.length];
            for(int i=0;i<parts.length;i++){types[i]=parts[i].getType();args[i]=parts[i].getName().equals(field)?value:parts[i].getAccessor().invoke(record);}
            return (T)record.getClass().getDeclaredConstructor(types).newInstance(args);
        }catch(Exception e){throw new IllegalStateException(e);}
    }
    StageBatch payload(String kind,Long id,StageResult data) {return with(stage(kind,id),"result",data);}
    void nextWeek() {
        tx.execute(s->service.finish(pipeline,new PipelineFinish("PARTIAL",Map.of("test",true))));
        pipeline=UUID.randomUUID().toString();tx.execute(s->service.start(new PipelineInput(pipeline,"2026-09-20",scope)));
    }
    @Test void statusOnlyReviewFollowsNewCollectedLocation() {
        long id=participant();reviewParticipant(id);
        assertThat(service.participant(id).overrides()).isEmpty();
        var b=stage("PARTICIPANTS",null);var p=b.result().participants().getFirst();
        var revised=with(p,"locations",List.of(new Location("Z-99","ASSIGNED",null,null,null,null,null)));
        ingest(with(b,"result",with(b.result(),"participants",List.of(revised))));
        assertThat(service.participant(id).data().locations().getFirst().code()).isEqualTo("Z-99");
        assertThat(service.participant(id).reviewState()).isEqualTo("PENDING");
    }
    @Test void clearOverrideRestoresNewestSourceNotNull() {
        long id=participant();var first=service.participant(id);
        tx.execute(s->service.editParticipant(id,new EditInput(first.revision(),"REVIEWED","custom",Map.of("registrationName","Pinned name"))));
        var row=service.participant(id);
        tx.execute(s->service.editParticipant(id,new EditInput(row.revision(),"PENDING","restore",Map.of(),List.of("registrationName"))));
        assertThat(service.participant(id).overrides()).isEmpty();assertThat(service.participant(id).data().registrationName()).isEqualTo(first.collectedData().registrationName());
    }
    @Test void evidenceOrderAndAdditionalPageKeepSameParticipantId() {
        long id=participant();var b=stage("PARTICIPANTS",null);var p=b.result().participants().getFirst();
        var sources=new ArrayList<>(p.sources());sources.add(new Source("https://example.com/second-page","OFFICIAL","ORIGINAL","[TEST] source"));Collections.reverse(sources);
        var revised=with(p,"sources",sources);var receipt=ingest(with(b,"result",with(b.result(),"participants",List.of(revised))));
        assertThat(receipt.participantIds()).containsExactly(id);assertThat(db.queryForObject("select count(*) from subculture_participant",Long.class)).isEqualTo(1);
    }
    @Test void preexistingAmbiguousDuplicatesArePreservedNotMerged() {
        long id=participant();var raw=db.queryForMap("select * from subculture_participant where id=?",id);
        db.update("insert into subculture_participant(event_id,identity_key,registration_name,payload_json,payload_hash) values(?,?,?,cast(? as jsonb),?)",eventId,"f".repeat(64),raw.get("registration_name"),raw.get("payload_json").toString(),raw.get("payload_hash"));
        var receipt=ingest(stage("PARTICIPANTS",null));assertThat(receipt.rejected()).isEqualTo(1);assertThat(receipt.status()).isEqualTo("PARTIAL");
        assertThat(db.queryForObject("select count(*) from subculture_participant",Long.class)).isEqualTo(2);
    }
    @Test void noResultFirstHundredDoesNotStarveUnattemptedSecondHundred() {
        var template=stage("PARTICIPANTS",null);var p=template.result().participants().getFirst();
        var participants=new ArrayList<Participant>();for(int i=0;i<200;i++)participants.add(with(with(p,"sourceEntryId","entry-"+i),"registrationName","[TEST] booth "+i));
        // Stage upper bound is 100; build the larger queue in two independent accepted pages.
        ingest(with(template,"result",with(template.result(),"participants",participants.subList(0,100))));
        ingest(with(with(template,"runId",UUID.randomUUID().toString()),"result",with(template.result(),"participants",participants.subList(100,200))));
        var first=service.salesTargets(pipeline,100);assertThat(first).hasSize(100);
        for(var target:first){long id=((Number)target.get("id")).longValue();var b=stage("SALES",id);ingest(with(b,"result",with(b.result(),"sales",null)));}
        var second=service.salesTargets(pipeline,100);assertThat(second).hasSize(100);
        assertThat(second.stream().map(t->t.get("id")).toList()).doesNotContainAnyElementsOf(first.stream().map(t->t.get("id")).toList());
        assertThat(db.queryForObject("select count(*) from subculture_participant where sales_attempt_status='NO_RESULTS'",Long.class)).isEqualTo(100);
    }
    @Test void failedAttemptGetsCooldownButKeepsSuccessfulSales() {
        long id=participant();ingest(stage("SALES",id));
        tx.execute(s->service.salesAttempt(pipeline,id,new SalesAttemptInput("STARTED","")));
        tx.execute(s->service.salesAttempt(pipeline,id,new SalesAttemptInput("FAILED","test")));
        assertThat(service.participant(id).sales()).isNotNull();assertThat(service.salesTargets(pipeline,100)).isEmpty();
        assertThat(db.queryForObject("select sales_failure_count from subculture_participant where id=?",Integer.class,id)).isEqualTo(1);
    }
    @Test void partialTwoProductsRetainsTwentyAndPublicationFreshnessIsFrozen() {
        long id=participant();var b=stage("SALES",id);var product=b.result().sales().products().getFirst();
        var products=new ArrayList<ProductData>();for(int i=0;i<20;i++)products.add(with(with(product,"sourceEntryId","product-"+i),"productUrl","https://example.com/product/"+i));
        var twenty=with(b.result().sales(),"products",products);ingest(with(b,"result",with(b.result(),"sales",twenty)));
        var second=stage("SALES",id);var partial=with(with(second.result(),"sales",with(twenty,"products",products.subList(0,2))),"searchStatus","PARTIAL");
        ingest(with(second,"result",partial));var sales=service.participant(id).sales();assertThat(sales.data().products()).hasSize(20);assertThat(sales.collectedData().products()).hasSize(2);
        assertThat(sales.productRows().stream().filter(p->"NOT_RECONFIRMED".equals(p.verification().state())).count()).isEqualTo(18);
        reviewEvent();reviewParticipant(id);tx.execute(s->service.editSales(id,new EditInput(sales.revision(),"REVIEWED","checked",Map.of())));
        long rev=((Number)service.eventDetail(eventId).get("revision")).longValue();tx.execute(s->publications.publish(eventId,new PublishInput(rev)));
        String published=json.writeValueAsString(publications.detail(eventId));assertThat(published).contains("NOT_RECONFIRMED");
        ingest(stage("SALES",id));assertThat(json.writeValueAsString(publications.detail(eventId))).isEqualTo(published);
    }
    @Test void nullSalesPreservesAccumulatedProductsAndLastSuccessTime() {
        long id=participant();ingest(stage("SALES",id));var before=service.participant(id).sales();var b=stage("SALES",id);
        ingest(with(b,"result",with(b.result(),"sales",null)));var after=service.participant(id).sales();
        assertThat(after.data().products()).hasSameSizeAs(before.data().products());assertThat(after.collectedData()).isNull();
        assertThat(after.collectedAt()).isEqualTo(before.collectedAt());assertThat(after.productRows()).allMatch(p->"NOT_RECONFIRMED".equals(p.verification().state()));
    }
    @Test void realParticipantLinkCreatesSourceScopedCursorAndResumeIsAtomic() {
        var cursors=tx.execute(s->service.participantCursors(pipeline,eventId));assertThat(cursors).hasSize(1);var c=cursors.getFirst();
        assertThat(c.get("rootUrl")).isEqualTo("https://example.com/test/participants");
        var ref=new CursorRef(c.get("sourceKey").toString(),((Number)c.get("passNo")).longValue(),((Number)c.get("pageIndex")).intValue(),(String)c.get("requestedUrl"),((Number)c.get("revision")).longValue());
        var b=with(with(stage("PARTICIPANTS",null),"schemaVersion","5"),"cursor",ref);
        var result=with(with(b.result(),"searchStatus","PARTIAL"),"coverage",new Coverage("PARTIAL",100,"REGISTERED_BOOTHS",List.of(ref.requestedUrl()),"https://example.com/test/participants?page=2",List.of()));
        b=with(b,"result",result);var receipt=ingest(b);assertThat(ingest(b)).isEqualTo(receipt);
        var next=tx.execute(s->service.participantCursors(pipeline,eventId)).getFirst();assertThat(((Number)next.get("pageIndex")).intValue()).isEqualTo(1);
        nextWeek();var resumed=tx.execute(s->service.participantCursors(pipeline,eventId)).getFirst();assertThat(resumed.get("requestedUrl")).isEqualTo(next.get("requestedUrl"));assertThat(resumed.get("passNo")).isEqualTo(next.get("passNo"));
    }
    @Test void cursorRefusedAfterAnotherAcceptedPageWithoutDroppingPriorRows() {
        var c=tx.execute(s->service.participantCursors(pipeline,eventId)).getFirst();
        var ref=new CursorRef(c.get("sourceKey").toString(),1,0,(String)c.get("requestedUrl"),1);
        var b=with(with(stage("PARTICIPANTS",null),"schemaVersion","5"),"cursor",ref);ingest(b);
        assertThatThrownBy(()->ingest(with(b,"runId",UUID.randomUUID().toString()))).hasMessageContaining("진행 지점");
        assertThat(db.queryForObject("select count(*) from subculture_participant",Long.class)).isEqualTo(1);
    }
    @Test void rerunningMigrationDoesNotOverwriteNullLatestObservation() throws Exception {
        long id=participant();ingest(stage("SALES",id));var b=stage("SALES",id);ingest(with(b,"result",with(b.result(),"sales",null)));
        db.execute(Files.readString(Path.of("../database/007_catalog_review_fixes.sql")));
        assertThat(service.participant(id).sales().collectedData()).isNull();
    }
    // v6: opt-in PostgreSQL checks for public category navigation/filtering. Same throwaway DB guard.
    void publishForBrowse() {
        reviewEvent();long revision=((Number)service.eventDetail(eventId).get("revision")).longValue();
        tx.execute(status->publications.publish(eventId,new PublishInput(revision)));
    }
    CatalogBrowseQuery browse(String category,String q,String subtype,String from,String to) {
        return new CatalogBrowseQuery(0,20,category,q,subtype,from,to,"DATE_ASC");
    }
    @Test void unconnectedCategoriesNeverAliasSubculture() {
        publishForBrowse();assertThat(publications.list(0,20).total()).isEqualTo(1);
        assertThat(publications.list(browse("EXHIBITION","","","","")).items()).isEmpty();
        assertThat(publications.list(browse("FESTIVAL","","","","")).total()).isZero();
    }
    @Test void browseChecksOneOccurrenceSoClosedDaysAreNotIncluded() {
        publishForBrowse();
        var days=List.of(new Occurrence("2026-10-10","2026-10-11",null,null),new Occurrence("2026-10-13","2026-10-13",null,null));
        db.update("update subculture_catalog_publication set snapshot_json=jsonb_set(snapshot_json,'{event,occurrences}',cast(? as jsonb)) where event_id=?",json.writeValueAsString(days),eventId);
        assertThat(publications.list(browse("SUBCULTURE","","","2026-10-12","2026-10-12")).total()).isZero();
        assertThat(publications.list(browse("SUBCULTURE","","","2026-10-13","2026-10-13")).total()).isEqualTo(1);
    }
    @Test void browseFiltersSnapshotNotUnpublishedCandidateAndEscapesWildcards() {
        publishForBrowse();
        db.update("update subculture_catalog_publication set snapshot_json=jsonb_set(snapshot_json,'{event,name}',to_jsonb(cast(? as text))) where event_id=?","[TEST] 100%_Doll",eventId);
        db.update("update subculture_event_candidate set name=? where id=?","UNPUBLISHED PRIVATE TITLE",eventId);
        assertThat(publications.list(browse("SUBCULTURE","100%_","","","")).total()).isEqualTo(1);
        assertThat(publications.list(browse("SUBCULTURE","100XX","","","")).total()).isZero();
        assertThat(publications.list(browse("SUBCULTURE","UNPUBLISHED PRIVATE TITLE","","","")).total()).isZero();
    }
    @Test void listOnlyExposesApprovedStoredBannerAndRevocationTakesEffect() {
        publishForBrowse();
        tx.execute(status->{media.register(eventId,null,null,new Image("BANNER","https://example.com/v6.png","https://example.com/v6-source",null,"test"));return null;});
        var a=media.assets(eventId,null).stream().filter(x->x.imageUrl().equals("https://example.com/v6.png")).findFirst().orElseThrow();
        assertThat(publications.list(0,20).items().getFirst().get("banner")).isNull();
        tx.execute(status->media.rights(a.id(),new RightsInput(a.revision(),"APPROVED","DO NOT EXPOSE private rights note","Public image credit")));
        db.update("update subculture_catalog_asset set storage_state='STORED',object_key='verified/catalog/v6.png' where id=?",a.id());
        String publicJson=json.writeValueAsString(publications.list(0,20));
        assertThat(publicJson).contains("Public image credit","verified/catalog/v6.png").doesNotContain("DO NOT EXPOSE");
        var approved=media.detail(a.id());tx.execute(status->media.rights(a.id(),new RightsInput(approved.revision(),"REJECTED","withdrawn","")));
        assertThat(publications.list(0,20).items().getFirst().get("banner")).isNull();
    }
    @Test void unknownPublicCategoryAndFiltersAreRejected() {
        assertThatThrownBy(()->browse("UNKNOWN","","","","")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->browse("SUBCULTURE","","UNRECOGNIZED","","")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->browse("SUBCULTURE","","","2026-02-29","")).isInstanceOf(IllegalArgumentException.class);
    }

    // v7: opt-in real PostgreSQL cases. Same dedicated, destructive-test DB guard as above.
    AssetView readyBanner(String suffix) {
        tx.execute(status->{media.register(eventId,null,null,new Image("BANNER","https://example.com/"+suffix+".png","https://example.com/"+suffix,null,suffix));return null;});
        AssetView a=media.assets(eventId,null).stream().filter(x->suffix.equals(x.caption())).findFirst().orElseThrow();
        tx.execute(status->media.rights(a.id(),new RightsInput(a.revision(),"APPROVED","test permission","Public credit")));
        db.update("update subculture_catalog_asset set storage_state='STORED',object_key=? where id=?","verified/catalog/"+suffix+".png",a.id());
        return media.detail(a.id());
    }
    @Test void imageRepairUsesPublishedSnapshotAndOnlyEventBannerAssetsWithoutWriting() {
        long participantId=participant();reviewParticipant(participantId);publishForBrowse();
        String publishedName=service.event(eventId).name();
        long publishedRevision=db.queryForObject("select event_revision from subculture_catalog_publication where event_id=?",Long.class,eventId);
        var banner=readyBanner("repair-poster");
        db.update("update subculture_catalog_asset set sha256=? where id=?","a".repeat(64),banner.id());
        tx.execute(s->media.register(eventId,participantId,null,new Image("BANNER","https://example.com/participant.png","https://example.com/source",null,"participant banner")));
        tx.execute(s->media.register(eventId,null,null,new Image("FLOOR_PLAN","https://example.com/map.png","https://example.com/source",null,"map")));
        tx.execute(s->service.editEvent(eventId,new EditInput(publishedRevision,"PENDING","draft correction",Map.of("name","[TEST] private new name"))));
        long before=db.queryForObject("select revision from subculture_event_candidate where id=?",Long.class,eventId);
        var row=service.imageRepairTargets(100,0).getFirst();
        assertThat(row.get("event")).isInstanceOf(EventData.class);
        assertThat(((EventData)row.get("event")).name()).isEqualTo(publishedName);
        assertThat(row.get("revision")).isEqualTo(publishedRevision);
        assertThat((List<?>)row.get("assets")).hasSize(1);
        assertThat(((AssetView)((List<?>)row.get("assets")).getFirst()).id()).isEqualTo(banner.id());
        assertThat(row.get("storedHashes")).isEqualTo(Map.of(banner.id(),"a".repeat(64)));
        assertThat(((AssetView)row.get("banner")).id()).isEqualTo(banner.id());
        assertThat(db.queryForObject("select revision from subculture_event_candidate where id=?",Long.class,eventId)).isEqualTo(before);
        assertThat(db.queryForObject("select count(*) from subculture_catalog_asset",Long.class)).isEqualTo(4);
        tx.execute(s->media.rights(banner.id(),new RightsInput(banner.revision(),"REJECTED","withdrawn","")));
        assertThat(service.imageRepairTargets(100,0).getFirst().get("banner")).isNull();
        assertThat((List<?>)service.imageRepairTargets(100,0).getFirst().get("assets")).hasSize(1);
    }
    long copyRepairEvent(String state,boolean published) {
        long id=db.queryForObject("""
            insert into subculture_event_candidate(identity_key,match_key,name,subcategory,venue_name,starts_on,ends_on,payload_json,payload_hash,warnings_json,review_state)
            select ?,match_key,name,subcategory,venue_name,starts_on,ends_on,payload_json,payload_hash,warnings_json,?
            from subculture_event_candidate where id=? returning id
            """,Long.class,CollectionRules.sha(UUID.randomUUID().toString()),state,eventId);
        if(published) db.update("insert into subculture_catalog_publication(event_id,event_revision,snapshot_json) select ?,event_revision,snapshot_json from subculture_catalog_publication where event_id=?",id,eventId);
        return id;
    }
    @Test void imageRepairKeysetSkipsUnpublishedAndExcludedEventsAndHonorsSelection() {
        publishForBrowse();long draft=copyRepairEvent("PENDING",false),excluded=copyRepairEvent("EXCLUDED",true),second=copyRepairEvent("REVIEWED",true);
        assertThat(service.imageRepairTargets(1,0).stream().map(r->r.get("id"))).containsExactly(eventId);
        assertThat(service.imageRepairTargets(1,eventId).stream().map(r->r.get("id"))).containsExactly(second);
        assertThat(service.imageRepairTargets(100,second)).isEmpty();
        assertThat(service.imageRepairTargets(100,0).stream().map(r->r.get("id"))).doesNotContain(draft,excluded);
        readyBanner("first");var selected=readyBanner("selected");
        tx.execute(s->media.selectBanner(eventId,new BannerInput(selected.id(),0,selected.revision())));
        var row=service.imageRepairTargets(100,0).getFirst();
        assertThat(row.get("selectedBannerAssetId")).isEqualTo(selected.id());
        assertThat(((AssetView)row.get("banner")).id()).isEqualTo(selected.id());
        assertThat(((List<?>)row.get("assets"))).hasSize(2);
        assertThatThrownBy(()->service.imageRepairTargets(101,0)).hasMessageContaining("조회 범위");
        assertThatThrownBy(()->service.imageRepairTargets(1,-1)).hasMessageContaining("조회 범위");
    }
    @Test void explicitBannerAgreesOnListAndDetailAndKeepsOtherImageRights() {
        publishForBrowse();var first=readyBanner("original");var corrected=readyBanner("corrected");
        assertThat(media.publicBanners(List.of(eventId)).get(eventId).id()).isEqualTo(first.id());
        var selection=tx.execute(s->media.selectBanner(eventId,new BannerInput(corrected.id(),0,corrected.revision())));
        assertThat(selection.assetId()).isEqualTo(corrected.id());assertThat(selection.revision()).isEqualTo(1);
        assertThat(((Map<?,?>)publications.list(0,20).items().getFirst().get("banner")).get("id")).isEqualTo(corrected.id());
        assertThat(((Map<?,?>)publications.detail(eventId).get("banner")).get("id")).isEqualTo(corrected.id());
        assertThat(media.detail(first.id()).rightsState()).isEqualTo("APPROVED");
    }
    @Test void revokedExplicitBannerDoesNotSilentlyFallBackAndClearRestoresAuto() {
        publishForBrowse();var first=readyBanner("original");var next=readyBanner("selected");
        var selected=tx.execute(s->media.selectBanner(eventId,new BannerInput(next.id(),0,next.revision())));
        tx.execute(s->media.rights(next.id(),new RightsInput(next.revision(),"REJECTED","withdrawn","")));
        assertThat(publications.list(0,20).items().getFirst().get("banner")).isNull();
        assertThat(publications.detail(eventId).get("banner")).isNull();
        assertThat(media.bannerSelection(eventId).assetId()).isEqualTo(next.id());
        tx.execute(s->media.selectBanner(eventId,new BannerInput(null,selected.revision(),null)));
        assertThat(media.publicBanners(List.of(eventId)).get(eventId).id()).isEqualTo(first.id());
    }
    @Test void missingOrFailedExplicitBannerIsNotReplacedWithAnUnchosenPoster() {
        var first=readyBanner("original");var next=readyBanner("selected");
        tx.execute(s->media.selectBanner(eventId,new BannerInput(next.id(),0,next.revision())));
        db.update("update subculture_catalog_asset set storage_state='FAILED' where id=?",next.id());
        assertThat(media.publicBanners(List.of(eventId))).isEmpty();assertThat(media.detail(first.id()).storageState()).isEqualTo("STORED");
    }
    @Test void staleSelectionAndStaleAssetRevisionsAreRejectedWithoutChangingChoice() {
        var a=readyBanner("original");var b=readyBanner("next");
        tx.execute(s->media.selectBanner(eventId,new BannerInput(a.id(),0,a.revision())));
        assertThatThrownBy(()->tx.execute(s->media.selectBanner(eventId,new BannerInput(b.id(),0,b.revision())))).hasMessageContaining("선택이 변경");
        assertThatThrownBy(()->tx.execute(s->media.selectBanner(eventId,new BannerInput(b.id(),1,b.revision()-1)))).hasMessageContaining("이미지 상태");
        assertThat(media.bannerSelection(eventId).assetId()).isEqualTo(a.id());
    }
    @Test void onlyEligibleEventLevelBannerCanBeSelected() {
        var a=readyBanner("not-map");
        db.update("update subculture_catalog_asset set type='FLOOR_PLAN' where id=?",a.id());
        assertThatThrownBy(()->tx.execute(s->media.selectBanner(eventId,new BannerInput(a.id(),0,a.revision())))).hasMessageContaining("배너 이미지");
        db.update("update subculture_catalog_asset set type='BANNER',rights_state='PENDING' where id=?",a.id());
        assertThatThrownBy(()->tx.execute(s->media.selectBanner(eventId,new BannerInput(a.id(),0,a.revision())))).hasMessageContaining("사용 승인");
        assertThat(media.bannerSelection(eventId).revision()).isZero();
    }
    @Test void wrongEventCannotSelectAnotherEventsPoster() {
        var a=readyBanner("first");var b=eventBatch();var other=with(b.result().events().getFirst(),"name","[TEST] distinct other event");
        tx.execute(s->discovery.ingest(with(b,"result",with(b.result(),"events",List.of(other)))));
        long otherId=db.queryForObject("select id from subculture_event_candidate where id<>?",Long.class,eventId);
        assertThatThrownBy(()->tx.execute(s->media.selectBanner(otherId,new BannerInput(a.id(),0,a.revision())))).hasMessageContaining("이 행사의");
        assertThat(media.bannerSelection(otherId).revision()).isZero();
    }
    @Test void concurrentBannerSelectionHasOneWinnerAndOneStaleConflict() throws Exception {
        var a=readyBanner("first");var b=readyBanner("next");var gate=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            java.util.function.Function<AssetView,Callable<String>> job=asset->()->{gate.await();try{tx.execute(s->media.selectBanner(eventId,new BannerInput(asset.id(),0,asset.revision())));return "saved";}
                catch(com.boothhana.api.ApiException ex){return ex.code;}};
            var one=pool.submit(job.apply(a));var two=pool.submit(job.apply(b));gate.countDown();
            assertThat(List.of(one.get(15,TimeUnit.SECONDS),two.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("saved","CONFLICT");
        }
        assertThat(media.bannerSelection(eventId).revision()).isEqualTo(1);
    }
    @Test void presentationMigrationCanRerunWithoutResettingChoice() throws Exception {
        var a=readyBanner("chosen");tx.execute(s->media.selectBanner(eventId,new BannerInput(a.id(),0,a.revision())));
        db.execute(Files.readString(Path.of("../database/008_catalog_presentation.sql")));
        assertThat(media.bannerSelection(eventId).assetId()).isEqualTo(a.id());
        assertThat(media.bannerSelection(eventId).revision()).isEqualTo(1);
    }

    Map<String,Object> adminBannerRow() {return service.events(0,20,new CatalogAdminQuery("","","","")).items().getFirst();}
    long imageFilterCount(String filter) {return service.events(0,20,new CatalogAdminQuery("","","","",filter)).total();}
    @Test void adminPosterHealthDoesNotCountBoothOrProductImagesAsRepresentative() {
        long booth=participant();var a=readyBanner("booth-image");
        db.update("update subculture_catalog_asset set participant_id=? where id=?",booth,a.id());
        assertThat(adminBannerRow().get("storedImageCount")).isEqualTo(1L);
        assertThat(adminBannerRow().get("bannerState")).isEqualTo("MISSING");
        assertThat(imageFilterCount("MISSING")).isEqualTo(1);assertThat(imageFilterCount("READY")).isZero();
    }
    @Test void adminPosterHealthTracksReviewStorageFailureAndRevokedExplicitSelection() {
        tx.execute(s->{media.register(eventId,null,null,new Image("BANNER","https://example.com/current.png","https://example.com/current",null,"current"));return null;});
        var a=media.assets(eventId,null).getFirst();
        assertThat(adminBannerRow().get("bannerState")).isEqualTo("WAITING_REVIEW");
        assertThat(imageFilterCount("WAITING_REVIEW")).isEqualTo(1);
        tx.execute(s->media.rights(a.id(),new RightsInput(a.revision(),"APPROVED","test approval","test credit")));
        assertThat(adminBannerRow().get("bannerState")).isEqualTo("WAITING_STORAGE");
        assertThat(imageFilterCount("WAITING_STORAGE")).isEqualTo(1);
        tx.execute(s->media.failed(a.id(),new AssetFailure(media.detail(a.id()).revision(),"failed test source")));
        assertThat(adminBannerRow().get("bannerState")).isEqualTo("STORAGE_FAILED");
        assertThat(imageFilterCount("STORAGE_FAILED")).isEqualTo(1);
        db.update("update subculture_catalog_asset set storage_state='STORED',object_key='verified/catalog/current.png' where id=?",a.id());
        var stored=media.detail(a.id());tx.execute(s->media.selectBanner(eventId,new BannerInput(stored.id(),0,stored.revision())));
        readyBanner("alternate");
        var chosen=media.detail(a.id());tx.execute(s->media.rights(chosen.id(),new RightsInput(chosen.revision(),"REJECTED","test revocation","")));
        assertThat(adminBannerRow().get("bannerState")).isEqualTo("SELECTION_BLOCKED");
        assertThat(imageFilterCount("SELECTION_BLOCKED")).isEqualTo(1);assertThat(imageFilterCount("MISSING")).isEqualTo(1);
        assertThat(imageFilterCount("READY")).isZero();assertThat(media.publicBanners(List.of(eventId))).isEmpty();
        assertThatThrownBy(()->new CatalogAdminQuery("","","","","x' or true --")).hasMessageContaining("이미지 검색");
    }

}
