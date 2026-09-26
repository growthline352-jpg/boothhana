package com.boothhana.service;

import com.boothhana.api.ApiModels.*;
import com.boothhana.api.ApiException;
import com.boothhana.domain.UserAccount;
import com.boothhana.domain.DomainEnums.ReservationStatus;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/**
 * Opt-in destructive fixture tests against a DEDICATED LOCAL test database.
 * Apply database/001,002,003,004 there first. No production/Supabase URL is accepted.
 * Skipped unless BOOTH_TEST_DATABASE_URL matches the exact localhost test name.
 */
@SpringBootTest(properties = {"spring.jpa.hibernate.ddl-auto=validate"})
@EnabledIfEnvironmentVariable(named = "BOOTH_TEST_DATABASE_URL",
    matches = "jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/boothhana_patch_test")
class PostgresConcurrencyTests {
    @Autowired PlatformService service;
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactions;
    private UserAccount owner;
    private ReservationInput request;

    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("BOOTH_TEST_DATABASE_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("BOOTH_TEST_DATABASE_USERNAME", "postgres"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("BOOTH_TEST_DATABASE_PASSWORD", "postgres"));
    }
    @BeforeEach void seed() {
        String url = System.getenv("BOOTH_TEST_DATABASE_URL");
        if (url == null || !url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/boothhana_patch_test"))
            throw new IllegalStateException("Refusing to reset a non-local or non-dedicated database");
        db.execute("TRUNCATE TABLE pos_sale_item, pos_sale, reservation_item, reservation, booth_notice, event_product, product, event_booth, booth, event, app_user RESTART IDENTITY CASCADE");
        db.update("INSERT INTO app_user(id,kakao_subject,display_name) VALUES (1,'test-owner','Test owner')");
        db.update("INSERT INTO event(id,name,start_at,end_at,venue,status) VALUES (1,'Test event',now(),now()+interval '1 day','Test','PUBLISHED')");
        db.update("INSERT INTO booth(id,owner_user_id,name) VALUES (1,1,'Test booth')");
        db.update("INSERT INTO event_booth(id,event_id,booth_id,status,is_public) VALUES (1,1,1,'APPROVED',true)");
        db.update("INSERT INTO product(id,booth_id,name) VALUES (1,1,'Test product')");
        db.update("INSERT INTO event_product(id,event_booth_id,product_id,price,stock_mode,stock_quantity) VALUES (1,1,1,1000,'FINITE',1)");
        owner = new UserAccount(); owner.id = 1L;
        request = new ReservationInput(1L, List.of(new LineInput(1L, 1)));
    }
    @Test void concurrentReservationsCannotSellTheLastItemTwice() throws Exception {
        var held = new CountDownLatch(1); var release = new CountDownLatch(1);
        var started = new CountDownLatch(1); var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = service.createReservation(owner, request); held.countDown(); await(release); return result;
            }));
            assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> { started.countDown(); return service.createReservation(owner, request); });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(100);
            assertThat(second.isDone()).isFalse();
            release.countDown(); first.get(5, TimeUnit.SECONDS);
            assertThatThrownBy(() -> second.get(5, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class).hasCauseInstanceOf(ApiException.class);
            assertThat(db.queryForObject("SELECT stock_quantity FROM event_product WHERE id=1", Integer.class)).isZero();
            assertThat(db.queryForObject("SELECT count(*) FROM reservation", Long.class)).isEqualTo(1);
        } finally { release.countDown(); executor.shutdownNow(); executor.awaitTermination(5, TimeUnit.SECONDS); }
    }
    @Test void cancellationAndPickupCannotBothWin() throws Exception {
        var reservation = service.createReservation(owner, request);
        var held = new CountDownLatch(1); var release = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = service.cancelReservation(owner, reservation.id()); held.countDown(); await(release); return result;
            }));
            assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();
            var pickup = executor.submit(() -> service.pickup(owner, reservation.id()));
            Thread.sleep(100); assertThat(pickup.isDone()).isFalse();
            release.countDown(); first.get(5, TimeUnit.SECONDS);
            assertThat(pickup.get(5, TimeUnit.SECONDS).status()).isEqualTo(ReservationStatus.CANCELED);
            assertThat(db.queryForObject("SELECT stock_quantity FROM event_product WHERE id=1", Integer.class)).isEqualTo(1);
            assertThat(db.queryForObject("SELECT count(*) FROM reservation WHERE picked_up_at IS NOT NULL", Long.class)).isZero();
        } finally { release.countDown(); executor.shutdownNow(); executor.awaitTermination(5, TimeUnit.SECONDS); }
    }
    @Test void metadataOnlyEditAdvancesBaseProductVersionAndRejectsOtherStaleForm() {
        var before=service.creatorProducts(owner,1L).getFirst();
        var input=new ProductInput("새 상품명","",null,1000,com.boothhana.domain.DomainEnums.StockMode.FINITE,
            1,false,true,true,before.version(),before.productVersion());
        var updated=service.updateProduct(owner,1L,input);
        assertThat(updated.productVersion()).isGreaterThan(before.productVersion());
        assertThatThrownBy(()->service.updateProduct(owner,1L,input)).isInstanceOf(ApiException.class);
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting for test transaction"); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
    }
}
