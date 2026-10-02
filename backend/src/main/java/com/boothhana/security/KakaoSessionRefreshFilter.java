package com.boothhana.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.web.filter.OncePerRequestFilter;

/** Renew the browser deadline together with JDBC's last-accessed session deadline. */
final class KakaoSessionRefreshFilter extends OncePerRequestFilter {
    private final CookieSerializer cookies;
    KakaoSessionRefreshFilter(CookieSerializer cookies) { this.cookies = cookies; }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        var session = request.getSession(false);
        if (auth instanceof OAuth2AuthenticationToken oauth && auth.isAuthenticated()
                && "kakao".equals(oauth.getAuthorizedClientRegistrationId())
                && session != null && Boolean.TRUE.equals(session.getAttribute(LoginSessionPolicy.PERSISTENT_KAKAO))
                && !"/api/logout".equals(request.getRequestURI())
                && !"/api/auth/admin/login".equals(request.getRequestURI())) {
            cookies.writeCookieValue(new CookieSerializer.CookieValue(request, response, session.getId()));
        }
        chain.doFilter(request, response);
    }
}
