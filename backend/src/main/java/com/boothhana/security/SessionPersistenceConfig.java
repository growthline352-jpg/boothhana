package com.boothhana.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

@Configuration
public class SessionPersistenceConfig {
    @Bean
    CookieSerializer cookieSerializer(
            @Value("${server.servlet.session.cookie.secure:false}") boolean secure,
            @Value("${server.servlet.session.cookie.same-site:lax}") String sameSite) {
        var delegate = new DefaultCookieSerializer();
        delegate.setCookieName("SESSION");
        delegate.setCookiePath("/");
        delegate.setUseHttpOnlyCookie(true);
        delegate.setUseSecureCookie(secure);
        delegate.setSameSite(sameSite);
        // Host-only API cookie: all frontends use api.boothana.kr with credentials.
        return new CookieSerializer() {
            @Override public List<String> readCookieValues(HttpServletRequest request) {
                return delegate.readCookieValues(request);
            }
            @Override public void writeCookieValue(CookieValue value) {
                if (!value.getCookieValue().isEmpty()) {
                    var session = value.getRequest().getSession(false);
                    if (session != null && Boolean.TRUE.equals(session.getAttribute(LoginSessionPolicy.PERSISTENT_KAKAO))) {
                        value.setCookieMaxAge(session.getMaxInactiveInterval());
                    }
                }
                delegate.writeCookieValue(value);
            }
        };
    }
}
