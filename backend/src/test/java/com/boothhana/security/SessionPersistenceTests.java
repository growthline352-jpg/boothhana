package com.boothhana.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.session.web.http.CookieSerializer;
import static org.assertj.core.api.Assertions.assertThat;

class SessionPersistenceTests {
    @Test void kakaoCookiesPersistButAdminAndAnonymousCookiesDoNot() {
        var cookies = new SessionPersistenceConfig().cookieSerializer(true, "none");
        var request = new MockHttpServletRequest();
        var session = request.getSession();
        LoginSessionPolicy.kakao(session);
        var member = new MockHttpServletResponse();
        cookies.writeCookieValue(new CookieSerializer.CookieValue(request, member, session.getId()));
        assertThat(member.getHeader("Set-Cookie")).contains("Max-Age=2592000", "HttpOnly", "Secure", "SameSite=none").doesNotContain("Domain=");
        assertThat(session.getMaxInactiveInterval()).isEqualTo(2592000);

        LoginSessionPolicy.admin(session);
        var admin = new MockHttpServletResponse();
        cookies.writeCookieValue(new CookieSerializer.CookieValue(request, admin, session.getId()));
        assertThat(session.getMaxInactiveInterval()).isEqualTo(1800);
        assertThat(admin.getHeader("Set-Cookie")).doesNotContain("Max-Age=", "Expires=");
        var anonymous = new MockHttpServletResponse();
        cookies.writeCookieValue(new CookieSerializer.CookieValue(new MockHttpServletRequest(), anonymous, "new-session"));
        assertThat(anonymous.getHeader("Set-Cookie")).doesNotContain("Max-Age=");
    }

    @Test void deletionCookieIsNotRenewedEvenWithPersistentSession() {
        var cookies = new SessionPersistenceConfig().cookieSerializer(true, "none");
        var request = new MockHttpServletRequest();
        LoginSessionPolicy.kakao(request.getSession());
        var response = new MockHttpServletResponse();
        cookies.writeCookieValue(new CookieSerializer.CookieValue(request, response, ""));
        assertThat(response.getHeader("Set-Cookie")).contains("Max-Age=0").doesNotContain("Max-Age=2592000");
    }
}
