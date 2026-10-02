package com.boothhana.collection;
import com.boothhana.floorplan.*;
import static com.boothhana.floorplan.FloorplanModels.*;
import static com.boothhana.collection.CollectionModels.*;
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
import java.nio.file.*;import java.util.*;import java.io.*;
/** OPT-IN actual PostgreSQL service integration; temporary isolated schema, never drops public.
 * Requires CREATE SCHEMA on dedicated localhost boothhana_floorplan_test. No real CLI or GCS.
 */
@EnabledIfEnvironmentVariable(named="BOOTH_FLOORPLAN_TEST_URL",matches=".+")
class FloorplanPostgresTests {
 JdbcTemplate db,root;TransactionTemplate tx;JsonMapper json;FloorplanService service;CatalogMediaService media;CatalogService catalog;CatalogPublicationService publications;
 long event;String lease,day,schema;byte[] image;
 @BeforeEach void setup() throws Exception {
  String url=System.getenv("BOOTH_FLOORPLAN_TEST_URL");if(!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1)(?::[0-9]{1,5})?/boothhana_floorplan_test"))throw new IllegalArgumentException("Dedicated local DB only");
  String user=System.getenv("BOOTH_FLOORPLAN_TEST_USER"),password=System.getenv("BOOTH_FLOORPLAN_TEST_PASSWORD");root=new JdbcTemplate(new DriverManagerDataSource(url,user,password));schema="floorplan_test_"+UUID.randomUUID().toString().replace("-","");root.execute("create schema "+schema);
  var ds=new DriverManagerDataSource(url+"?currentSchema="+schema,user,password);db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));json=JsonMapper.builder().build();
  for(String sql:List.of("005_subculture_collection.sql","006_subculture_catalog.sql","007_catalog_review_fixes.sql","008_catalog_presentation.sql","009_floorplan_automation.sql"))db.execute(Files.readString(Path.of("../database/"+sql)));
  db.execute("create table catalog_operating_group(root_event_id bigint primary key,name text)");
  db.execute("create table catalog_operating_group_member(event_id bigint primary key,root_event_id bigint,position integer)");
  var data=json.readValue(Files.readString(Path.of("../collector/examples/v4/events.json")),SearchResult.class);
  var discovery=new CollectionService(db,json);tx.execute(s->discovery.ingest(new Batch("1",UUID.randomUUID().toString(),"2026-09-16T00:00:00Z","2026-09-16T00:01:00Z","MANUAL_IMPORT",false,new Scope("SEOUL","Asia/Seoul","2026-10-01","2026-10-31"),data)));
  event=db.queryForObject("select id from subculture_event_candidate",Long.class);day=data.events().getFirst().occurrences().getFirst().startDate();lease=UUID.randomUUID().toString();
  var store=mock(VerifiedImageStorage.class);media=new CatalogMediaService(db,store,"https://images.example.com");catalog=new CatalogService(db,json,media);publications=new CatalogPublicationService(db,json,media);service=new FloorplanService(db,json,media,store,"https://images.example.com");
  tx.execute(s->service.claim(event,new Claim(lease)));image=Files.readAllBytes(Path.of("../collector/examples/floorplan-v8/map.png"));
 }
 @AfterEach void cleanup(){if(root!=null&&schema!=null&&schema.matches("floorplan_test_[a-f0-9]{32}"))root.execute("drop schema if exists "+schema+" cascade");}
 Observation discovery(){return new Observation(UUID.randomUUID().toString(),lease,true,new Discovery("FOUND",null,List.of(new PlanSource("https://example.com/map.png","https://example.com/event/map",new PlanScope(null,null,List.of(day),"[TEST] map"),"test source")),List.of("https://example.com/event/map"),List.of()));}
 long source(){tx.execute(s->service.observe(event,discovery()));return db.queryForObject("select asset_id from subculture_floorplan_source",Long.class);}
 void permit(long asset){var a=media.detail(asset);long revision=db.queryForObject("select revision from subculture_floorplan_source where asset_id=?",Long.class,asset);tx.execute(s->service.permit(event,asset,new Permission(a.revision(),revision,true,"Explicit test permission","TEST credit")));}
 UUID begin(long asset){long revision=db.queryForObject("select revision from subculture_floorplan_source where asset_id=?",Long.class,asset);String hash=digest();return UUID.fromString(tx.execute(s->service.begin(event,new Begin(lease,asset,revision,hash,1000,700,image.length,"image/png"))).get("id").toString());}
 long rev(UUID id){return ((Number)service.version(id).get("revision")).longValue();}
 UUID draft(){long asset=source();permit(asset);UUID id=begin(asset);tx.execute(s->{try{return service.content(id,lease,new ByteArrayInputStream(image));}catch(IOException e){throw new RuntimeException(e);}});var g=new Geometry("test",true,List.of(new Shape("b1","B1",List.of(new Point(.1,.1),new Point(.2,.1),new Point(.2,.2),new Point(.1,.2)),"READABLE",true)),List.of());tx.execute(s->service.analysis(id,new Analysis(lease,rev(id),digest(),g)));return id;}
 String digest(){try{return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(image));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 void publishEvent(){long revision=((Number)catalog.eventDetail(event).get("revision")).longValue();tx.execute(s->catalog.editEvent(event,new CatalogModels.EditInput(revision,"REVIEWED","test checked",Map.of())));long current=((Number)catalog.eventDetail(event).get("revision")).longValue();tx.execute(s->publications.publish(event,new CatalogModels.PublishInput(current)));}
 @Test void discoveryReplayHasOneSourceAndReceipt(){Observation o=discovery();Map<String,Object> first=tx.execute(s->service.observe(event,o));Map<String,Object> second=tx.execute(s->service.observe(event,o));assertThat(first).isEqualTo(second);assertThat(db.queryForObject("select count(*) from subculture_floorplan_source",Long.class)).isEqualTo(1);assertThat(db.queryForObject("select count(*) from subculture_floorplan_receipt",Long.class)).isEqualTo(1);}
 @Test void noResultDoesNotRemoveExistingSource(){source();tx.execute(s->service.observe(event,new Observation(UUID.randomUUID().toString(),lease,true,new Discovery("NOT_FOUND",null,List.of(),List.of("https://example.com/event"),List.of()))));assertThat(db.queryForObject("select count(*) from subculture_floorplan_source",Long.class)).isEqualTo(1);}
 @Test void secondLeaseRejected(){assertThatThrownBy(()->tx.execute(s->service.claim(event,new Claim(UUID.randomUUID().toString())))).hasMessageContaining("다른");}
 @Test void unapprovedSourceCannotStartImage(){long asset=source();assertThatThrownBy(()->begin(asset)).hasMessageContaining("허용");}
 @Test void identicalContentUsesOneVersion(){long asset=source();permit(asset);assertThat(begin(asset)).isEqualTo(begin(asset));assertThat(db.queryForObject("select count(*) from subculture_floorplan_version",Long.class)).isEqualTo(1);}
 @Test void invalidImageIsNotConfirmed(){long asset=source();permit(asset);UUID id=begin(asset);assertThatThrownBy(()->tx.execute(s->{try{return service.content(id,lease,new ByteArrayInputStream(new byte[10]));}catch(IOException e){throw new RuntimeException(e);}})).isInstanceOf(RuntimeException.class);assertThat(service.version(id).get("state")).isEqualTo("AWAITING_IMAGE");}
 @Test void partialLinksNeedExplicitAcceptance(){UUID id=draft();assertThatThrownBy(()->tx.execute(s->service.publish(id,new Publish(rev(id),false,"checked")))).hasMessageContaining("부분");}
 @Test void approvedVersionHasAtomicSnapshot(){UUID id=draft();publishEvent();tx.execute(s->service.publish(id,new Publish(rev(id),true,"checked partial")));var plans=(List<?>)service.publicPlans(event).get("plans");assertThat(plans).hasSize(1);assertThat(((Map<?,?>)plans.getFirst()).get("state")).isEqualTo("READY");assertThat(((Map<?,?>)plans.getFirst()).get("imageUrl")).isNotNull();}
 @Test void withdrawnVersionDoesNotLeakPolygons(){UUID id=draft();publishEvent();tx.execute(s->service.publish(id,new Publish(rev(id),true,"checked")));tx.executeWithoutResult(s->service.withdraw(id,new Publish(rev(id),true,"withdraw test")));var p=(Map<?,?>)((List<?>)service.publicPlans(event).get("plans")).getFirst();assertThat(p.get("state")).isEqualTo("UNAVAILABLE");assertThat((List<?>)p.get("shapes")).isEmpty();}
 @Test void migrationReplayPreservesPermission() throws Exception{long asset=source();permit(asset);db.execute(Files.readString(Path.of("../database/009_floorplan_automation.sql")));assertThat(db.queryForObject("select can_transform from subculture_floorplan_source where asset_id=?",Boolean.class,asset)).isTrue();}
}
