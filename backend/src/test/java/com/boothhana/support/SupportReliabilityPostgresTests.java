package com.boothhana.support;

import com.boothhana.api.ApiException;
import com.boothhana.collection.*;
import com.boothhana.floorplan.FloorplanService;
import com.boothhana.service.PlatformService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.io.ByteArrayInputStream;
import java.nio.file.*;
import java.util.*;
import static com.boothhana.support.SupportModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real PostgreSQL + real Spring transaction proxies + actual support/publication methods.
 * R2 and catalogue editing are explicit test boundaries. No OAuth/HTTP/full-app assertion.
 * Uses a randomly named private schema ONLY in localhost boothhana_support_test.
 * Never use a port forwarding to production. Release gate rejects skipped tests.
 */
@EnabledIfEnvironmentVariable(named="BOOTH_SUPPORT_TEST_URL", matches=".+")
class SupportReliabilityPostgresTests {
    private static final Principal OWNER=new Principal(1L,false,false),ADMIN=new Principal(9L,true,false);
    private static final Target EVENT=new Target("CATALOG","EVENT",10,10L,null,null,null,null);
    private JdbcTemplate adminDb,db;
    private String schema;
    private JsonMapper json;
    private JdbcTransactionManager tx;
    private SupportService support;
    private SupportTargets targets;
    private SupportResolutionService resolution;
    private CatalogPublicationService publication;
    private FloorplanService floorplans;

    @BeforeEach void setup() {
        String url=System.getenv("BOOTH_SUPPORT_TEST_URL");
        if(url==null||!url.matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_support_test"))
            throw new IllegalStateException("Only an explicit localhost boothhana_support_test URL is allowed; no URL query or forwarding");
        String user=Objects.requireNonNull(System.getenv("BOOTH_SUPPORT_TEST_USER"),"Set test user");
        String pass=Objects.requireNonNull(System.getenv("BOOTH_SUPPORT_TEST_PASSWORD"),"Set test password");
        DriverManagerDataSource adminDs=new DriverManagerDataSource(url,user,pass);adminDb=new JdbcTemplate(adminDs);
        if(!"boothhana_support_test".equals(adminDb.queryForObject("select current_database()",String.class)))
            throw new IllegalStateException("Unexpected test database");
        schema="support_v13_"+UUID.randomUUID().toString().replace("-","");adminDb.execute("create schema "+schema);
        DriverManagerDataSource ds=new DriverManagerDataSource(url,user,pass);
        Properties settings=new Properties();settings.setProperty("currentSchema",schema);settings.setProperty("options","-c statement_timeout=10000 -c lock_timeout=3000");ds.setConnectionProperties(settings);
        db=new JdbcTemplate(ds);tx=new JdbcTransactionManager(ds);json=JsonMapper.builder().build();
        for(String ddl:fixtureDdl())db.execute(ddl);
        applyMigration(); // Applies the actual 013 only after schema-qualified replacement into the disposable schema.
        CatalogMediaService media=mock(CatalogMediaService.class);
        when(media.assets(anyLong(),isNull())).thenReturn(List.of());when(media.publicBanners(anyList())).thenReturn(Map.of());
        publication=proxy(new CatalogPublicationService(db,json,media));
        floorplans=mock(FloorplanService.class);
        targets=new SupportTargets(publication,floorplans,mock(PlatformService.class),db,json);
        SupportRateLimiter limiter=mock(SupportRateLimiter.class);when(limiter.hit(anyString())).thenReturn(1);
        support=proxy(new SupportService(db,json,targets,limiter,false,""));
        assertThat(support.database()).isSameAs(db);assertThat(support.mapper()).isSameAs(json);assertThat(support.targetResolver()).isSameAs(targets);
        CatalogService catalog=mock(CatalogService.class);
        doAnswer(inv->{db.update("update subculture_event_candidate set review_state='EXCLUDED',revision=revision+1 where id=?",inv.getArgument(0,Long.class));return null;}).when(catalog).editEvent(anyLong(),any());
        resolution=proxy(new SupportResolutionService(support,catalog,publication,media,floorplans));
        db.update("insert into subculture_event_candidate(id,revision,review_state) values(10,0,'REVIEWED')");
        db.update("insert into subculture_catalog_publication(event_id,snapshot_json) values(10,cast(? as jsonb))",json.writeValueAsString(Map.of("event",Map.of("name","[TEST] 행사"),"participants",List.of(),"publishedAt","2026-09-17T00:00:00Z")));
    }
    @AfterEach void cleanup(){if(adminDb!=null&&schema!=null&&schema.matches("support_v13_[a-f0-9]{32}"))adminDb.execute("drop schema "+schema+" cascade");}
    @SuppressWarnings("unchecked") private <T>T proxy(T target){
        TransactionInterceptor interceptor=new TransactionInterceptor();interceptor.setTransactionManager(tx);interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        ProxyFactory factory=new ProxyFactory(target);factory.setProxyTargetClass(true);factory.addAdvice(interceptor);return (T)factory.getProxy();
    }
    private void applyMigration(){try{
        Path path=Path.of("../database/013_support_reliability.sql");String sql=Files.readString(path)
            .replace("public.support_message",schema+".support_message")
            .replace("set local search_path=public,pg_catalog;","set local search_path="+schema+",pg_catalog;");
        db.execute(sql);
    }catch(java.io.IOException e){throw new IllegalStateException(e);}}
    private UUID create(String kind,Target target){UUID id=UUID.randomUUID();support.create(new Create(id,kind,"INQUIRY".equals(kind)?"SERVICE":"OTHER","[TEST] 제목","문의 본문",List.of(),target,Map.of(),null),OWNER);return id;}
    private long revision(UUID id){return db.queryForObject("select revision from support_ticket where id=?",Long.class,id);}
    private void fillDialogues(UUID id){db.update("insert into support_message(id,ticket_id,actor_id,actor_kind,visibility,body,evidence_json,request_hash) select md5(? || i::text)::uuid,?,1,'USER','PUBLIC','[TEST] 추가','[]','hash' from generate_series(1,199) i",id.toString(),id);}

    @Test void eventHideAndReportResolutionCommitTogether(){
        UUID id=create("REPORT",EVENT);String before=targets.current(EVENT,1L).fingerprint();
        var result=resolution.hide(id,new Action(0,"HIDE","잘못된 안내를 공개 중지했습니다.",null,before),ADMIN);
        assertThat(result.get("resolution")).isEqualTo("HIDDEN");
        assertThat(db.queryForObject("select review_state from subculture_event_candidate where id=10",String.class)).isEqualTo("EXCLUDED");
        assertThat(db.queryForObject("select status from support_ticket where id=?",String.class,id)).isEqualTo("RESOLVED");
    }
    @Test void alreadyHiddenReportDetailIsReadable(){UUID id=create("REPORT",EVENT);db.update("update subculture_event_candidate set review_state='EXCLUDED' where id=10");assertThat(((Resolved)support.detail(id,ADMIN).get("currentTarget")).visible()).isFalse();}
    @Test void absenceDoesNotMarkOuterTransactionRollbackOnly(){
        new TransactionTemplate(tx).execute(status->{db.update("update subculture_event_candidate set revision=1 where id=10");assertThat(publication.findPublicDetail(999)).isEmpty();assertThat(status.isRollbackOnly()).isFalse();return null;});
        assertThat(db.queryForObject("select revision from subculture_event_candidate where id=10",Long.class)).isEqualTo(1);
    }
    @Test void genuineDatabaseFailureRollsBackHideAndTicket(){
        UUID id=create("REPORT",EVENT);String before=targets.current(EVENT,1L).fingerprint();
        db.execute("alter table support_action add constraint reject_hidden_audit check(action<>'HIDDEN')");
        assertThatThrownBy(()->resolution.hide(id,new Action(0,"HIDE","숨김 시도",null,before),ADMIN)).isInstanceOf(RuntimeException.class);
        assertThat(db.queryForObject("select review_state from subculture_event_candidate where id=10",String.class)).isEqualTo("REVIEWED");
        assertThat(db.queryForObject("select status from support_ticket where id=?",String.class,id)).isEqualTo("OPEN");
        assertThat(revision(id)).isZero();
    }
    @Test void systemNoticesRemainPossibleAtDialogueLimit(){
        UUID id=create("INQUIRY",null);fillDialogues(id);
        support.action(id,new Action(0,"WAIT","사진을 보내주세요",null,null),ADMIN);
        assertThat(db.queryForObject("select count(*) from support_message where ticket_id=? and message_kind='SYSTEM'",Long.class,id)).isEqualTo(1);
        assertThatThrownBy(()->support.message(id,new Message(UUID.randomUUID(),1,"일반 답변",List.of(),false),OWNER)).isInstanceOf(ApiException.class);
        assertThat(db.queryForObject("select status from support_ticket where id=?",String.class,id)).isEqualTo("WAITING_USER");
    }
    @Test void managementRevocationCommitsEvenAtDialogueLimit(){
        UUID id=create("INQUIRY",null);fillDialogues(id);
        db.update("update support_ticket set kind='CLAIM',exhibitor_id=99,status='RESOLVED',resolution='APPROVED' where id=?",id);
        db.update("insert into exhibitor_manager(exhibitor_id,user_id,claim_ticket_id,state,revision) values(99,1,?,'ACTIVE',0)",id);
        proxy(new ExhibitorClaimsService(support)).revoke(99,1,new Revoke(0,"공식 운영 관계 종료"),ADMIN);
        assertThat(db.queryForObject("select state from exhibitor_manager where exhibitor_id=99 and user_id=1",String.class)).isEqualTo("REVOKED");
        assertThat(db.queryForObject("select count(*) from support_message where ticket_id=? and message_kind='SYSTEM'",Long.class,id)).isEqualTo(1);
    }
    @Test void imageOnlySupplementReopensAndReplayIsIdempotent()throws Exception{
        UUID id=create("INQUIRY",null);support.action(id,new Action(0,"WAIT","사진을 보내주세요",null,null),ADMIN);
        PrivateSupportStorage store=mock(PrivateSupportStorage.class);when(store.available()).thenReturn(true);
        doAnswer(inv -> {assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();return null;}).when(store).put(anyString(),anyString(),any(),anyString());
        SupportAttachments files=proxy(new SupportAttachments(proxy(new SupportAttachmentTransactions(support)),store,proxy(new SupportRateLimiter(db)),4));byte[] png={(byte)137,80,78,71,13,10,26,10};
        String hash=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(png));AttachmentInput input=new AttachmentInput(UUID.randomUUID(),"image/png",png.length,hash);
        files.upload(id,input,OWNER,new ByteArrayInputStream(png));assertThat(db.queryForObject("select status from support_ticket where id=?",String.class,id)).isEqualTo("OPEN");
        long after=revision(id);files.upload(id,input,OWNER,new ByteArrayInputStream(png));assertThat(revision(id)).isEqualTo(after);verify(store,times(1)).put(anyString(),anyString(),any(),anyString());
    }
    @Test void receiptDoesNotRevealAnotherUserAndMigrationCanRepeat(){
        UUID id=create("INQUIRY",null);assertThat(support.receipt(id,OWNER).get("found")).isEqualTo(true);assertThat(support.receipt(id,new Principal(2L,false,false))).containsExactlyInAnyOrderEntriesOf(Map.of("found",false));
        applyMigration();assertThat(db.queryForObject("select count(*) from support_message where ticket_id=?",Long.class,id)).isEqualTo(1);
        assertThatThrownBy(()->db.update("insert into support_message(id,ticket_id,actor_id,actor_kind,visibility,body,evidence_json,request_hash,message_kind) values(?,?,1,'USER','PUBLIC','forged','[]','hash','SYSTEM')",UUID.randomUUID(),id)).isInstanceOf(RuntimeException.class);
    }

    private List<String> fixtureDdl(){return List.of(
        "create table subculture_event_candidate(id bigint primary key,revision bigint,review_state text)",
        "create table subculture_catalog_publication(event_id bigint primary key,snapshot_json jsonb)",
        "create table subculture_participant(id bigint,event_id bigint,review_state text)",
        "create table subculture_sales(participant_id bigint,review_state text,overrides_json jsonb default '{}')",
        "create table catalog_operating_group(root_event_id bigint primary key,name text)",
        "create table catalog_operating_group_member(event_id bigint primary key,root_event_id bigint,position integer)",
        "create table support_ticket(id uuid primary key,requester_id bigint,subject_key text,request_hash text,guest_secret_hash text,guest_expires_at timestamptz,kind text,category text,title text,target_json jsonb,received_snapshot_json jsonb,received_fingerprint text,client_context_json jsonb,exhibitor_id bigint,status text default 'OPEN',assigned_to bigint,resolution text,verified_result_json jsonb,revision bigint default 0,created_at timestamptz default now(),updated_at timestamptz default now(),resolved_at timestamptz)",
        "create table support_message(id uuid primary key,ticket_id uuid,actor_id bigint,actor_kind text,visibility text,body text,evidence_json jsonb,request_hash text,created_at timestamptz default now())",
        "create table support_action(id bigserial primary key,ticket_id uuid,actor_id bigint,action text,details_json jsonb,created_at timestamptz default now())",
        "create table support_rate_limit(rate_key text,window_start timestamptz,hits integer,primary key(rate_key,window_start))",
        "create table support_attachment(id uuid primary key,ticket_id uuid,owner_id bigint,content_type text,byte_size bigint,sha256 text,object_key text,state text,created_at timestamptz default now())",
        "create table exhibitor_manager(exhibitor_id bigint,user_id bigint,claim_ticket_id uuid,state text,revision bigint,revoked_by bigint,revoked_at timestamptz,reason text)"
    );}
}
