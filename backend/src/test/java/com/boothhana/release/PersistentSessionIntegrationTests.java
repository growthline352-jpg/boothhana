package com.boothhana.release;

import com.boothhana.security.LoginSessionPolicy;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.session.SessionRepository;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={"server.servlet.session.cookie.secure=true", "server.servlet.session.cookie.same-site=none"})
@EnabledIfEnvironmentVariable(named="BOOTH_FULL_TEST_URL",matches="jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]{1,5}/boothhana_release_test")
@SuppressWarnings({"rawtypes", "unchecked"})
class PersistentSessionIntegrationTests {
    @DynamicPropertySource static void settings(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->System.getenv("BOOTH_FULL_TEST_URL"));
        p.add("spring.datasource.username",()->System.getenv("BOOTH_FULL_TEST_USER"));
        p.add("spring.datasource.password",()->System.getenv("BOOTH_FULL_TEST_PASSWORD"));
        p.add("app.support.rate-secret",()->"isolated-session-release-test-secret");
        p.add("app.gcs.project-id",()->"");p.add("app.gcs.public-bucket",()->"");
    }
    @Autowired SessionRepository sessions;
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager tx;
    @Autowired tools.jackson.databind.json.JsonMapper json;
    @LocalServerPort int port;
    final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    String sessionId,subject;

    @BeforeEach void setup() {
        assertThat(db.queryForObject("select current_database()",String.class)).isEqualTo("boothhana_release_test");
        subject="session-test-"+UUID.randomUUID();
        db.update("insert into app_user(kakao_subject,display_name) values(?,'[TEST] persistent member')",subject);
        var session=sessions.createSession();
        session.setMaxInactiveInterval(Duration.ofDays(30));
        session.setAttribute(LoginSessionPolicy.PERSISTENT_KAKAO,Boolean.TRUE);
        var roles=List.of(new SimpleGrantedAuthority("ROLE_FAN"),new SimpleGrantedAuthority("ROLE_CREATOR"));
        var context=SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new OAuth2AuthenticationToken(new DefaultOAuth2User(roles,Map.of("id",subject,"properties",Map.of("nickname","TEST")),"id"),roles,"kakao"));
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,context);
        sessions.save(session);sessionId=session.getId();
    }
    @AfterEach void cleanup(){sessions.deleteById(sessionId);db.update("delete from app_user where kakao_subject=?",subject);}
    String cookie(){return "SESSION="+Base64.getEncoder().encodeToString(sessionId.getBytes(StandardCharsets.UTF_8));}
    HttpRequest.Builder request(String path){return HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(10)).header("Cookie",cookie());}

    @Test void storedKakaoSessionSurvivesRepositoryRecreationAndRenewsOnUse() throws Exception {
        // New repository has no original in-memory identity or session cache.
        var jdbcRepository=new JdbcIndexedSessionRepository(db,new TransactionTemplate(tx));jdbcRepository.setTableName("booth_session");
        SessionRepository restarted=jdbcRepository;
        var restored=restarted.findById(sessionId);assertThat(restored).isNotNull();
        assertThat(restored.getMaxInactiveInterval()).isEqualTo(Duration.ofDays(30));
        var oldAccess=Instant.now().minus(Duration.ofDays(2));restored.setLastAccessedTime(oldAccess);restarted.save(restored);
        var response=http.send(request("/api/me").GET().build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("[TEST] persistent member");
        assertThat(response.headers().allValues("set-cookie")).anySatisfy(value->assertThat(value).contains("SESSION=","Max-Age=2592000","Secure","HttpOnly"));
        assertThat(restarted.findById(sessionId).getLastAccessedTime()).isAfter(oldAccess.plus(Duration.ofDays(1)));
    }

    @Test void expiredSessionCannotBeRestoredOrRenewed() throws Exception {
        var expired=sessions.findById(sessionId);expired.setLastAccessedTime(Instant.now().minus(Duration.ofDays(31)));sessions.save(expired);
        var response=http.send(request("/api/me").GET().build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().allValues("set-cookie")).noneSatisfy(value->assertThat(value).contains("Max-Age=2592000"));
        assertThat(sessions.findById(sessionId)).isNull();
    }

    @Test void logoutRequiresCsrfAndPermanentlyRevokesStoredSession() throws Exception {
        assertThat(http.send(request("/api/logout").POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);
        assertThat(sessions.findById(sessionId)).isNotNull();
        var csrf=http.send(request("/api/auth/csrf").GET().build(),HttpResponse.BodyHandlers.ofString());
        String token=json.readTree(csrf.body()).get("token").asText();
        String xsrf=csrf.headers().allValues("set-cookie").stream().filter(v->v.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow().split(";",2)[0];
        var logout=request("/api/logout").setHeader("Cookie",cookie()+"; "+xsrf).header("X-XSRF-TOKEN",token).POST(HttpRequest.BodyPublishers.noBody()).build();
        var response=http.send(logout,HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.headers().allValues("set-cookie")).anySatisfy(value->assertThat(value).contains("SESSION=","Max-Age=0"));
        assertThat(sessions.findById(sessionId)).isNull();
        assertThat(http.send(request("/api/me").GET().build(),HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(401);
    }

    @Test void sessionTablesArePrivateAndAnonymousLoginIsShortLived() throws Exception {
        for(String table:List.of("booth_session","booth_session_attributes")) {
            assertThat(db.queryForObject("select relrowsecurity from pg_class where oid=?::regclass",Boolean.class,table)).isTrue();
            for(String role:List.of("anon","authenticated"))assertThat(db.queryForObject("select has_table_privilege(?,?,'select,insert,update,delete')",Boolean.class,role,table)).isFalse();
        }
        var response=http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/auth/login")).GET().build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(302);
        String header=response.headers().allValues("set-cookie").stream().filter(v->v.startsWith("SESSION=")).findFirst().orElseThrow();
        assertThat(header).contains("HttpOnly","Secure").doesNotContain("Max-Age=");
        String id=new String(Base64.getDecoder().decode(header.split(";",2)[0].substring("SESSION=".length())),StandardCharsets.UTF_8);
        assertThat(sessions.findById(id).getMaxInactiveInterval()).isEqualTo(Duration.ofMinutes(30));sessions.deleteById(id);
    }
}
