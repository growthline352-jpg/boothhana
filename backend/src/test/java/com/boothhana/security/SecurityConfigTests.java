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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.when;

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
    @MockitoBean
    AdminPasswordLoginService adminLogin;
    @MockitoBean
    com.boothhana.support.SupportRateLimiter rateLimiter;

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

    @Test
    void adminPasswordLoginRequiresCsrfAndPersistsAnAdminSession() throws Exception {
        var admin = new com.boothhana.domain.UserAccount();
        admin.id = 17L; admin.kakaoSubject = "local-admin:operator"; admin.displayName = "관리자";
        when(rateLimiter.hit(org.mockito.ArgumentMatchers.anyString())).thenReturn(1);
        when(adminLogin.authenticate("operator", "correct password")).thenReturn(admin);

        mockMvc.perform(post("/api/auth/admin/login")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"username\":\"operator\",\"password\":\"correct password\"}"))
            .andExpect(status().isForbidden());

        var csrfResponse = mockMvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn().getResponse();
        String token = new com.fasterxml.jackson.databind.ObjectMapper().readTree(csrfResponse.getContentAsString()).get("token").asText();
        var csrfCookie = csrfResponse.getCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();

        var priorMemberSession = new org.springframework.mock.web.MockHttpSession();
        LoginSessionPolicy.kakao(priorMemberSession);
        mockMvc.perform(post("/api/auth/admin/login")
                .session(priorMemberSession)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", token)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"username\":\"operator\",\"password\":\"correct password\"}"))
            .andExpect(status().isNoContent())
            .andDo(result -> {
                assertThat(result.getRequest().getSession().getMaxInactiveInterval()).isEqualTo(1800);
                assertThat(result.getRequest().getSession().getAttribute(LoginSessionPolicy.PERSISTENT_KAKAO)).isNull();
            })
            .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
            .andExpect(request().sessionAttribute(
                org.springframework.security.web.context.HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
                org.hamcrest.Matchers.notNullValue()));
    }
}
