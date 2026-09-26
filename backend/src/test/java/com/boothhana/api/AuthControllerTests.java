package com.boothhana.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.security.web.csrf.DefaultCsrfToken;

class AuthControllerTests {
    private final AuthController controller = new AuthController();

    @Test
    void loginRedirectsDirectlyToKakao() {
        var result = controller.login();

        assertThat(result.getStatusCode().value()).isEqualTo(302);
        assertThat(result.getHeaders().getLocation().toString()).isEqualTo("/oauth2/authorization/kakao");
        assertThat(result.getHeaders().get(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void csrfReturnsTokenForCrossOriginFrontend() {
        var token = new DefaultCsrfToken("X-XSRF-TOKEN", "_csrf", "test-token");

        Map<String, String> result = controller.csrf(token);

        assertThat(result).containsEntry("token", "test-token");
    }
}
