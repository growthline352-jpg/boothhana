package com.boothhana.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.web.cors.*;
import java.util.*;

@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain security(HttpSecurity http, KakaoOAuthUserService oauthUsers,
            @Qualifier("cors") CorsConfigurationSource corsSource,
            @Value("${app.frontend-url}") String frontendUrl,
            @Value("${server.servlet.session.cookie.secure:false}") boolean cookieSecure,
            @Value("${server.servlet.session.cookie.same-site:lax}") String cookieSameSite) throws Exception {
        CookieCsrfTokenRepository csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookiePath("/");
        csrf.setCookieCustomizer(cookie -> cookie.secure(cookieSecure).sameSite(cookieSameSite));
        http.addFilterBefore(new com.boothhana.library.LibraryRequestFilter(),org.springframework.security.web.csrf.CsrfFilter.class).addFilterBefore(new com.boothhana.support.SupportRequestFilter(),org.springframework.security.web.csrf.CsrfFilter.class).cors(cors -> cors.configurationSource(corsSource)).csrf(config -> config.csrfTokenRepository(csrf))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/public/**", "/api/auth/**", "/error").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/creator/**").hasRole("CREATOR")
                .requestMatchers("/api/me/**", "/api/me").authenticated()
                .requestMatchers("/api/**").denyAll().anyRequest().permitAll())
            .exceptionHandling(errors -> errors
                .defaultAuthenticationEntryPointFor((request, response, cause) -> {
                    response.setStatus(401);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"status\":401,\"code\":\"UNAUTHORIZED\",\"message\":\"로그인이 필요합니다.\"}");
                }, request -> request.getRequestURI().startsWith("/api/"))
                .accessDeniedHandler((request, response, cause) -> {
                    response.setStatus(403);
                    response.setContentType("application/json;charset=UTF-8");
                    boolean invalidCsrf = cause instanceof org.springframework.security.web.csrf.CsrfException;
                    response.getWriter().write(invalidCsrf
                        ? "{\"status\":403,\"code\":\"CSRF_INVALID\",\"message\":\"보안 토큰을 갱신해 주세요.\"}"
                        : "{\"status\":403,\"code\":\"FORBIDDEN\",\"message\":\"접근 권한이 없습니다.\"}");
                }))
            .oauth2Login(oauth -> oauth.userInfoEndpoint(info -> info.userService(oauthUsers))
                .successHandler((request, response, authentication) -> {
                    String path="/";var session=request.getSession(false);
                    if(session!=null){Object until=session.getAttribute("BOOTH_RETURN_UNTIL"),value=session.getAttribute("BOOTH_RETURN_PATH");
                        if(until instanceof Long expiry&&expiry>=System.currentTimeMillis()&&value instanceof String p)path=LoginReturnPath.safe(p);
                        session.removeAttribute("BOOTH_RETURN_UNTIL");session.removeAttribute("BOOTH_RETURN_PATH");}
                    response.sendRedirect(frontendUrl.replaceAll("/$","")+path);
                }))
            .logout(logout -> logout.logoutUrl("/api/logout").logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)));
        return http.build();
    }

    @Bean
    CorsConfigurationSource cors(@Value("${app.allowed-origins}") String origins) {
        CorsConfiguration value = new CorsConfiguration();
        value.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).filter(item -> !item.isBlank()).toList());
        value.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        value.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN"));
        value.setExposedHeaders(List.of("X-Request-ID"));
        value.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/**", value); return source;
    }
}
