package com.boothhana.collection;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class CollectionSecurity {
    @Bean @Order(1)
    SecurityFilterChain collectionChain(HttpSecurity http,@Value("${app.collector.token:}") String token) throws Exception {
        return http.securityMatcher("/api/internal/subculture/**")
            .csrf(csrf->csrf.disable()).cors(cors->cors.disable())
            .sessionManagement(session->session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(cache->cache.disable())
            .authorizeHttpRequests(auth->auth.requestMatchers(HttpMethod.POST,"/api/internal/subculture/batches").hasAuthority("COLLECTOR_WRITE")
                .requestMatchers(HttpMethod.GET,"/api/internal/subculture/v4/**").hasAuthority("COLLECTOR_WRITE")
                .requestMatchers(HttpMethod.POST,"/api/internal/subculture/v4/**").hasAuthority("COLLECTOR_WRITE").anyRequest().denyAll())
            .exceptionHandling(errors->errors.authenticationEntryPoint((req,res,ex)->CollectorTokenFilter.error(res,401,"UNAUTHORIZED"))
                .accessDeniedHandler((req,res,ex)->CollectorTokenFilter.error(res,403,"FORBIDDEN")))
            .addFilterBefore(new CollectorTokenFilter(token),UsernamePasswordAuthenticationFilter.class).build();
    }
}
