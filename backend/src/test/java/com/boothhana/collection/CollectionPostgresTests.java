package com.boothhana.collection;

import static com.boothhana.collection.CollectionModels.*;
import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;

/** Opt-in REAL PostgreSQL tests. Dedicated localhost database only; never accepts a cloud DB URL. */
@EnabledIfEnvironmentVariable(named="BOOTH_COLLECTION_TEST_URL",matches=".+")
class CollectionPostgresTests {
    JdbcTemplate jdbc; CollectionService service; TransactionTemplate tx;
    @BeforeEach void setup() throws Exception {
        String url=System.getenv("BOOTH_COLLECTION_TEST_URL");
        if(!url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1)(?::[0-9]{1,5})?/boothhana_collection_test"))
            throw new IllegalArgumentException("Only dedicated localhost boothhana_collection_test database is allowed");
        var ds=new DriverManagerDataSource(url,System.getenv("BOOTH_COLLECTION_TEST_USER"),System.getenv("BOOTH_COLLECTION_TEST_PASSWORD"));
        jdbc=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("drop table if exists subculture_collection_observation,subculture_event_candidate,subculture_collection_run cascade");
        jdbc.execute(Files.readString(Path.of("../database/005_subculture_collection.sql")));
        jdbc.execute("alter table subculture_event_candidate add column if not exists overrides_json jsonb not null default '{}'");
        service=new CollectionService(jdbc,JsonMapper.builder().build());
    }
    private Batch fixture() throws Exception {
        var result=JsonMapper.builder().build().readValue(Files.readString(Path.of("../collector/examples/sample.json")),SearchResult.class);
        return new Batch("1",UUID.randomUUID().toString(),"2026-09-16T01:00:00Z","2026-09-16T01:01:00Z","MANUAL_IMPORT",false,
            new Scope("SEOUL","Asia/Seoul","2026-10-01","2026-10-31"),result);
    }
    private Receipt ingest(Batch b) { return tx.execute(s->service.ingest(b)); }
    @Test void sameBatchRetryDoesNotDuplicate() throws Exception {
        Batch b=fixture();assertThat(ingest(b)).isEqualTo(ingest(b));
        assertThat(jdbc.queryForObject("select count(*) from subculture_collection_run",Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from subculture_event_candidate",Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from subculture_collection_observation",Long.class)).isEqualTo(1L);
    }
    @Test void repeatedObservationKeepsCandidateButAddsRun() throws Exception {
        Batch b=fixture();ingest(b);Receipt second=ingest(fixture());assertThat(second.unchanged()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from subculture_event_candidate",Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from subculture_collection_run",Long.class)).isEqualTo(2L);
    }
    @Test void sameRunDifferentContentsConflicts() throws Exception {
        Batch b=fixture();ingest(b);Batch other=new Batch("1",b.runId(),b.startedAt(),b.finishedAt(),"MANUAL_IMPORT",false,b.scope(),new SearchResult("1","COMPLETE","changed",List.of("changed query"),b.result().events()));
        assertThatThrownBy(()->ingest(other)).hasMessageContaining("runId");
    }
    @Test void concurrentSameRunIsAtomic() throws Exception {
        Batch b=fixture();try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);
            Callable<Receipt> action=()->{gate.await();return ingest(b);};var a=pool.submit(action);var c=pool.submit(action);gate.countDown();
            assertThat(a.get(15,TimeUnit.SECONDS)).isEqualTo(c.get(15,TimeUnit.SECONDS));
        }
        assertThat(jdbc.queryForObject("select count(*) from subculture_collection_run",Long.class)).isEqualTo(1L);
    }
    @Test void reviewUsesRevisionAndDoesNotPublish() throws Exception {
        ingest(fixture());long id=jdbc.queryForObject("select id from subculture_event_candidate",Long.class);
        CandidateDetail d=service.detail(id);tx.execute(s->service.review(id,new ReviewInput(d.revision(),"REVIEWED","checked")));
        assertThat(service.detail(id).reviewedEvent()).isNotNull();assertThat(service.detail(id).reviewState()).isEqualTo("REVIEWED");
        assertThatThrownBy(()->tx.execute(s->service.review(id,new ReviewInput(d.revision(),"EXCLUDED","old screen")))).hasMessageContaining("변경");
    }
}
