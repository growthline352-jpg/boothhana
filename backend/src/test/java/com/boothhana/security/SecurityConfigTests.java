package com.boothhana.security;

import com.boothhana.api.AuthController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(
    controllers = AuthController.class,
    properties = {
        "app.frontend-url=http://localhost:5173",
        "app.allowed-origins=http://localhost:5173",
        "server.servlet.session.cookie.secure=true",
        "server.servlet.session.cookie.same-site=none"
    }
)
@Import(SecurityConfig.class)
class SecurityConfigTests {
    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    KakaoOAuthUserService oauthUsers;

    @Test
    void allowsFrontendPreflightForCurrentUserRequest() throws Exception {
        mockMvc.perform(options("/api/me")
                .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
            .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
    }

    @Test
    void csrfCookieSupportsCrossSiteFrontend() throws Exception {
        var response = mockMvc.perform(get("/api/auth/csrf"))
            .andExpect(status().isOk())
            .andReturn().getResponse();

        var cookie = response.getCookie("XSRF-TOKEN");
        assertThat(cookie).isNotNull();
        assertThat(cookie.getSecure()).isTrue();
        assertThat(cookie.getAttribute("SameSite")).isEqualTo("none");
    }
}
